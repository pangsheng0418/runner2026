const express = require('express');
const { db } = require('../db');
const {
  validateAndCalculateRegistration,
  extractRunnerSummary,
} = require('../services/validation');
const { appendRegistrationToSheet } = require('../services/googleSheets');

const router = express.Router();

function computeEventRegistrationState(event, currentCount) {
  const now = new Date();
  const start = event.reg_start_at ? new Date(event.reg_start_at) : null;
  const end = event.reg_end_at ? new Date(event.reg_end_at) : null;
  const max = Number(event.max_participants || 0);

  if (!event.is_active) {
    return { canRegister: false, status: 'closed', reason: '本活動目前已暫停或關閉線上報名。' };
  }
  if (start && !Number.isNaN(start.getTime()) && now < start) {
    return {
      canRegister: false,
      status: 'upcoming',
      reason: `報名尚未開始，開放時間為 ${event.reg_start_at.replace('T', ' ')}。`,
    };
  }
  if (end && !Number.isNaN(end.getTime()) && now > end) {
    return {
      canRegister: false,
      status: 'ended',
      reason: '本活動線上報名時間已截止，感謝您的關注！',
    };
  }
  if (max > 0 && currentCount >= max) {
    return {
      canRegister: false,
      status: 'full',
      reason: '本活動名額已全數額滿！歡迎關注後續釋出名額或其他賽事。',
    };
  }
  return { canRegister: true, status: 'open', reason: '' };
}

function serializePublicEvent(event) {
  const countRow = db
    .prepare('SELECT COUNT(*) as cnt FROM registrations WHERE event_id = ?')
    .get(event.id);
  const currentCount = countRow?.cnt || 0;
  const regState = computeEventRegistrationState(event, currentCount);

  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    event_date: event.event_date,
    location: event.location,
    reg_start_at: event.reg_start_at,
    reg_end_at: event.reg_end_at,
    max_participants: event.max_participants,
    registration_count: currentCount,
    remaining_spots:
      event.max_participants > 0 ? Math.max(0, event.max_participants - currentCount) : null,
    is_active: Boolean(event.is_active),
    banner_title: event.banner_title,
    banner_subtitle: event.banner_subtitle,
    banner_image_url: event.banner_image_url,
    description: event.description,
    payment_info: event.payment_info,
    sheet_sync_mode: event.sheet_sync_mode,
    fields: JSON.parse(event.fields_json || '[]'),
    regState,
  };
}

// GET /api/public/events
router.get('/events', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM events WHERE is_active = 1 ORDER BY event_date ASC, id DESC')
    .all();
  return res.json({
    events: rows.map(serializePublicEvent),
  });
});

// GET /api/public/events/:slug
router.get('/events/:slug', (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const event = db.prepare('SELECT * FROM events WHERE slug = ?').get(slug);
  if (!event) {
    return res.status(404).json({ error: '找不到此路跑活動，請確認報名網址是否正確。' });
  }
  return res.json({
    event: serializePublicEvent(event),
  });
});

// POST /api/public/events/:slug/register
router.post('/events/:slug/register', async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const event = db.prepare('SELECT * FROM events WHERE slug = ?').get(slug);
  if (!event) {
    return res.status(404).json({ error: '找不到此路跑活動，無法送出報名。' });
  }

  const countRow = db
    .prepare('SELECT COUNT(*) as cnt FROM registrations WHERE event_id = ?')
    .get(event.id);
  const currentCount = countRow?.cnt || 0;
  const regState = computeEventRegistrationState(event, currentCount);

  if (!regState.canRegister) {
    return res.status(400).json({
      error: regState.reason,
      code: `EVENT_${regState.status.toUpperCase()}`,
    });
  }

  const fields = JSON.parse(event.fields_json || '[]');
  const rawAnswers = req.body?.answers || {};

  // 1. 後端防呆驗證與自動金額計算
  const result = validateAndCalculateRegistration(fields, rawAnswers);
  if (!result.valid) {
    return res.status(400).json({
      error: '部分欄位格式不正確或尚未填寫完整，請檢查紅色提示項目。',
      fieldErrors: result.errors,
    });
  }

  const summary = extractRunnerSummary(fields, result.cleanAnswers);

  // 2. 重複報名防呆檢查（同一活動 + 相同身分證字號）
  if (summary.runnerIdNumber) {
    const dup = db
      .prepare('SELECT reg_code FROM registrations WHERE event_id = ? AND runner_id_number = ?')
      .get(event.id, summary.runnerIdNumber);
    if (dup) {
      return res.status(409).json({
        error: `此證件號碼已完成報名（報名序號：${dup.reg_code}），請勿重複報名。如需修改請聯繫主辦單位。`,
        code: 'DUPLICATE_REGISTRATION',
      });
    }
  }

  // 3. 產生專屬報名序號（例：RUN26-0003）
  const yearShort = String(new Date().getFullYear()).slice(-2);
  const seqNum = String(currentCount + 1).padStart(4, '0');
  let regCode = `RUN${yearShort}-${seqNum}`;
  if (db.prepare('SELECT id FROM registrations WHERE reg_code = ?').get(regCode)) {
    regCode = `RUN${yearShort}-${seqNum}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  }

  // 4. 先寫入本地 SQLite 確保不掉單
  const insertInfo = db
    .prepare(`
      INSERT INTO registrations (
        event_id, reg_code, runner_name, runner_id_number, runner_email, runner_phone,
        answers_json, price_breakdown_json, total_amount, payment_status, sheet_sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '待繳費', ?)
    `)
    .run(
      event.id,
      regCode,
      summary.runnerName,
      summary.runnerIdNumber,
      summary.runnerEmail,
      summary.runnerPhone,
      JSON.stringify(result.cleanAnswers),
      JSON.stringify(result.priceBreakdown),
      result.totalAmount,
      event.sheet_sync_mode === 'local' ? 'local' : 'pending'
    );

  const savedReg = db
    .prepare('SELECT * FROM registrations WHERE id = ?')
    .get(insertInfo.lastInsertRowid);

  // 5. 即時寫入對應的 Google 試算表
  let sheetSyncStatus = event.sheet_sync_mode === 'local' ? 'local' : 'synced';
  let sheetSyncNotice = '';

  if (event.sheet_sync_mode !== 'local') {
    try {
      const syncRes = await appendRegistrationToSheet(event, fields, savedReg);
      db.prepare(
        "UPDATE registrations SET sheet_sync_status = 'synced', sheet_sync_error = '', sheet_row_number = ? WHERE id = ?"
      ).run(syncRes.rowNumber || null, savedReg.id);
      db.prepare("UPDATE events SET last_sheet_sync_at = datetime('now', 'localtime') WHERE id = ?").run(event.id);
      sheetSyncStatus = 'synced';
    } catch (err) {
      // Google 試算表異常時不讓跑者資料遺失，記錄失敗狀態並回傳友善提示
      sheetSyncStatus = 'error';
      sheetSyncNotice =
        '您的報名資料已安全登錄並保留名額，但雲端試算表目前連線忙碌，主辦單位將自動完成補同步，請放心留存報名序號！';
      db.prepare(
        "UPDATE registrations SET sheet_sync_status = 'error', sheet_sync_error = ? WHERE id = ?"
      ).run(err.message, savedReg.id);
      console.error(`[GoogleSheets] 報名 ${regCode} 寫入試算表失敗：`, err.message);
    }
  }

  return res.status(201).json({
    message: '報名成功！',
    registration: {
      reg_code: savedReg.reg_code,
      created_at: savedReg.created_at,
      total_amount: savedReg.total_amount,
      payment_status: savedReg.payment_status,
      answers: result.cleanAnswers,
      priceBreakdown: result.priceBreakdown,
      sheet_sync_status: sheetSyncStatus,
      sheet_sync_notice: sheetSyncNotice || undefined,
    },
    event: {
      name: event.name,
      event_date: event.event_date,
      location: event.location,
      payment_info: event.payment_info,
    },
  });
});

module.exports = router;
