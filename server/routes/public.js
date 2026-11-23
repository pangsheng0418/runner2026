const express = require('express');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { JWT_SECRET } = require('../middleware/auth');
const {
  validateAndCalculateRegistration,
  extractRunnerSummary,
  isValidRemittanceLast5,
} = require('../services/validation');
const {
  getMasterDatabaseConfig,
  appendRegistrationToSheet,
  updateRegistrationInSheet,
} = require('../services/googleSheets');
const { computeEventRegistrationState } = require('../services/eventStatus');
const { syncRegistrationToCloud, syncAllRegistrationsToCloud, syncEventToCloud } = require('../services/cloudStore');
const { sendRegistrationEmail } = require('../services/emailService');
const { maskIdNumber, resolveCategoryMeta } = require('../services/chipBridge');

const router = express.Router();

function signRunnerEditToken(reg) {
  return jwt.sign(
    {
      purpose: 'runner_edit',
      regId: reg.id,
      eventId: reg.event_id,
      regCode: reg.reg_code,
    },
    JWT_SECRET,
    { expiresIn: '45m' }
  );
}

function verifyRunnerEditToken(token, expectedReg) {
  if (!token) return false;
  try {
    const payload = jwt.verify(String(token).trim(), JWT_SECRET);
    return (
      payload.purpose === 'runner_edit' &&
      Number(payload.regId) === Number(expectedReg.id) &&
      Number(payload.eventId) === Number(expectedReg.event_id) &&
      String(payload.regCode) === String(expectedReg.reg_code)
    );
  } catch (_) {
    return false;
  }
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
    english_name: event.english_name || '',
    organizer_name: event.owner_display_name || '主辦單位',
    event_type: event.event_type || 'distance',
    event_date: event.event_date,
    location: event.location,
    reg_start_at: event.reg_start_at,
    reg_end_at: event.reg_end_at,
    max_participants: event.max_participants,
    registration_count: currentCount,
    remaining_spots:
      event.max_participants > 0 ? Math.max(0, event.max_participants - currentCount) : null,
    is_active: Boolean(event.is_active),
    event_status: event.event_status || 'auto',
    banner_title: event.banner_title,
    banner_subtitle: event.banner_subtitle,
    banner_image_url: event.banner_image_url,
    description: event.description,
    payment_info: event.payment_info,
    fields: JSON.parse(event.fields_json || '[]'),
    regState,
  };
}

function serializeLookupRecord(event, reg) {
  const countRow = db
    .prepare('SELECT COUNT(*) as cnt FROM registrations WHERE event_id = ?')
    .get(event.id);
  const regState = computeEventRegistrationState(event, countRow?.cnt || 0);
  const isClosed = regState.status === 'closed';
  const isCancelled = reg.payment_status === '已取消';
  const isPaid = reg.payment_status === '已繳費';
  const canEdit = !isClosed && !isCancelled;

  return {
    editToken: canEdit ? signRunnerEditToken(reg) : '',
    canEdit,
    cannotEditReason: isClosed
      ? '本活動已結案，僅供查詢紀錄，無法再線上修改資料。'
      : isCancelled
      ? '此筆報名已標記為「已取消」，無法線上修改，如有疑問請聯繫主辦單位。'
      : '',
    pricingLocked: isPaid,
    pricingLockedNotice: isPaid
      ? '本筆報名已完成對帳（已繳費），為確保帳務一致，已鎖定「金額變動項目」，但仍可修改聯絡電話、緊急聯絡人、衣服尺寸與備註等個人資料。'
      : '',
    registration: {
      reg_code: reg.reg_code,
      bib_number: reg.bib_number || '',
      category_code: reg.category_code || '',
      runner_name: reg.runner_name,
      id_masked: maskIdNumber(reg.runner_id_number),
      runner_email: reg.runner_email,
      runner_phone: reg.runner_phone,
      reg_type: reg.reg_type || 'individual',
      group_name: reg.group_name || '',
      group_code: reg.group_code || '',
      payment_mode: reg.payment_mode || 'individual',
      remittance_last5: reg.remittance_last5 || '',
      total_amount: reg.total_amount,
      payment_status: reg.payment_status,
      created_at: reg.created_at,
      answers: JSON.parse(reg.answers_json || '{}'),
      priceBreakdown: JSON.parse(reg.price_breakdown_json || '[]'),
    },
    event: {
      id: event.id,
      slug: event.slug,
      name: event.name,
      english_name: event.english_name || '',
      organizer_name: event.owner_display_name || '主辦單位',
      event_date: event.event_date,
      location: event.location,
      payment_info: event.payment_info,
      fields: JSON.parse(event.fields_json || '[]'),
      regState,
    },
  };
}

// GET /api/public/events — 首頁只列出所有承辦人「開放中」的活動
router.get('/events', (_req, res) => {
  const rows = db.prepare('SELECT * FROM events ORDER BY event_date ASC, id DESC').all();
  const openEvents = rows
    .map(serializePublicEvent)
    .filter((ev) => ev.regState?.status === 'open')
    .sort((a, b) => String(a.event_date || '').localeCompare(String(b.event_date || '')));

  return res.json({
    events: openEvents,
    total: openEvents.length,
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

// POST /api/public/lookup — 跨活動反向查詢個人報名狀況（雙因子驗證：證件號碼 + 報名序號或 Email）
router.post('/lookup', (req, res) => {
  const idNumber = String(req.body?.idNumber || '').trim().toUpperCase();
  const regCode = String(req.body?.regCode || '').trim().toUpperCase();
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (!idNumber) {
    return res.status(400).json({ error: '請輸入身份證字號以驗證身分。' });
  }
  if (!regCode && !email) {
    return res.status(400).json({ error: '請輸入「報名序號」或「報名時填寫的電子信箱」其中一項進行雙重驗證。' });
  }

  let rows = [];
  if (regCode) {
    rows = db
      .prepare(
        `SELECT * FROM registrations
         WHERE upper(reg_code) = ? AND upper(runner_id_number) = ?
         ORDER BY created_at DESC, id DESC`
      )
      .all(regCode, idNumber);
  } else {
    rows = db
      .prepare(
        `SELECT * FROM registrations
         WHERE lower(runner_email) = ? AND upper(runner_id_number) = ?
         ORDER BY created_at DESC, id DESC`
      )
      .all(email, idNumber);
  }

  if (rows.length === 0) {
    return res.status(404).json({
      error: '查無符合條件的報名紀錄，請確認證件號碼與報名序號／電子信箱是否填寫正確。',
    });
  }

  const results = [];
  for (const reg of rows) {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(reg.event_id);
    if (!event) continue;
    results.push(serializeLookupRecord(event, reg));
  }

  return res.json({
    count: results.length,
    records: results,
  });
});

// POST /api/public/events/:slug/lookup — 單一活動內反向查詢報名資料（雙因子驗證）
router.post('/events/:slug/lookup', (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const event = db.prepare('SELECT * FROM events WHERE slug = ?').get(slug);
  if (!event) {
    return res.status(404).json({ error: '找不到此路跑活動。' });
  }

  const idNumber = String(req.body?.idNumber || '').trim().toUpperCase();
  const regCode = String(req.body?.regCode || '').trim().toUpperCase();
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (!idNumber) {
    return res.status(400).json({ error: '請輸入身份證字號。' });
  }
  if (!regCode && !email) {
    return res.status(400).json({ error: '請輸入「報名序號」或「電子信箱」進行雙重驗證。' });
  }

  const reg = regCode
    ? db
        .prepare(
          'SELECT * FROM registrations WHERE event_id = ? AND upper(reg_code) = ? AND upper(runner_id_number) = ?'
        )
        .get(event.id, regCode, idNumber)
    : db
        .prepare(
          'SELECT * FROM registrations WHERE event_id = ? AND lower(runner_email) = ? AND upper(runner_id_number) = ? ORDER BY id DESC LIMIT 1'
        )
        .get(event.id, email, idNumber);

  if (!reg) {
    return res.status(404).json({
      error: '在此活動中查無符合的報名資料，請確認輸入的證件號碼與報名序號／電子信箱。',
    });
  }

  return res.json(serializeLookupRecord(event, reg));
});

// PUT /api/public/events/:slug/registrations/:regCode — 選手反向修改報名資料／補填匯款後五碼
router.put('/events/:slug/registrations/:regCode', async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const regCode = String(req.params.regCode || '').trim().toUpperCase();
  const event = db.prepare('SELECT * FROM events WHERE slug = ?').get(slug);
  if (!event) {
    return res.status(404).json({ error: '找不到此路跑活動。' });
  }

  const existing = db
    .prepare('SELECT * FROM registrations WHERE event_id = ? AND upper(reg_code) = ?')
    .get(event.id, regCode);
  if (!existing) {
    return res.status(404).json({ error: '找不到該筆報名紀錄。' });
  }

  const editToken = req.body?.editToken || req.headers['x-edit-token'] || '';
  if (!verifyRunnerEditToken(editToken, existing)) {
    return res.status(401).json({
      error: '查詢驗證已過期或無效，請重新輸入證件號碼與報名序號／信箱查詢後再修改。',
      code: 'EDIT_TOKEN_INVALID',
    });
  }

  const countRow = db
    .prepare('SELECT COUNT(*) as cnt FROM registrations WHERE event_id = ?')
    .get(event.id);
  const regState = computeEventRegistrationState(event, countRow?.cnt || 0);

  if (regState.status === 'closed') {
    return res.status(400).json({ error: '本活動已結案，無法再修改報名資料。' });
  }
  if (existing.payment_status === '已取消') {
    return res.status(400).json({ error: '此筆報名已取消，無法修改資料。' });
  }

  const fields = JSON.parse(event.fields_json || '[]');
  const rawAnswers = req.body?.answers || {};

  // 驗證並計算最新金額
  const result = validateAndCalculateRegistration(fields, rawAnswers);
  if (!result.valid) {
    return res.status(400).json({
      error: '部分欄位格式不正確或尚未填寫完整，請檢查紅色提示項目。',
      fieldErrors: result.errors,
    });
  }

  // 若已由承辦人確認「已繳費」，禁止變更導致應繳金額異動
  if (existing.payment_status === '已繳費' && Number(result.totalAmount) !== Number(existing.total_amount)) {
    return res.status(400).json({
      error: `本筆報名已完成對帳（已繳費 NT$ ${Number(existing.total_amount).toLocaleString()}），不可線上更改會影響金額的組別或加購項目；如需更改組別請聯繫主辦單位。`,
      code: 'PAID_AMOUNT_LOCKED',
    });
  }

  const summary = extractRunnerSummary(fields, result.cleanAnswers);

  // 防止將證件號碼改成同一活動其他跑者已報名的證號
  if (summary.runnerIdNumber) {
    const dup = db
      .prepare('SELECT reg_code FROM registrations WHERE event_id = ? AND upper(runner_id_number) = ? AND id != ?')
      .get(event.id, summary.runnerIdNumber.toUpperCase(), existing.id);
    if (dup) {
      return res.status(409).json({
        error: `此證件號碼已被其他報名紀錄（${dup.reg_code}）使用，請重新確認。`,
      });
    }
  }

  const catMeta = resolveCategoryMeta(fields, result.cleanAnswers);
  const nextPaymentMode =
    req.body?.payment_mode === 'group'
      ? 'group'
      : req.body?.payment_mode === 'individual'
      ? 'individual'
      : existing.payment_mode || 'individual';
  const nextGroupName =
    req.body?.group_name !== undefined
      ? String(req.body.group_name || '').trim()
      : existing.group_name || '';

  db.prepare(`
    UPDATE registrations SET
      category_code = ?,
      runner_name = ?,
      runner_id_number = ?,
      runner_email = ?,
      runner_phone = ?,
      remittance_last5 = ?,
      payment_mode = ?,
      group_name = ?,
      answers_json = ?,
      price_breakdown_json = ?,
      total_amount = ?
    WHERE id = ?
  `).run(
    catMeta.categoryCode || existing.category_code || '',
    summary.runnerName,
    summary.runnerIdNumber,
    summary.runnerEmail,
    summary.runnerPhone,
    summary.remittanceLast5 || '',
    nextPaymentMode,
    nextGroupName,
    JSON.stringify(result.cleanAnswers),
    JSON.stringify(result.priceBreakdown),
    result.totalAmount,
    existing.id
  );

  const updatedReg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(existing.id);

  // 同步更新至統一 Google 試算表資料庫與活動專屬分頁
  const master = getMasterDatabaseConfig();
  if (master.configured || event.sheet_sync_mode !== 'local') {
    await updateRegistrationInSheet(event, fields, updatedReg).catch(() => {});
    await syncRegistrationToCloud(updatedReg);
  }

  // 發送「報名資料更新確認信」至跑者 Email
  const siteOrigin = `${req.protocol}://${req.get('host')}`;
  const emailNotification = await sendRegistrationEmail({
    type: 'updated',
    event,
    registration: updatedReg,
    answers: result.cleanAnswers,
    priceBreakdown: result.priceBreakdown,
    siteOrigin,
  });

  return res.json({
    message: '報名資料已修改儲存成功！',
    ...serializeLookupRecord(event, updatedReg),
    emailNotification,
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
      code: `EVENT_${String(regState.status || 'closed').toUpperCase()}`,
    });
  }

  const fields = JSON.parse(event.fields_json || '[]');
  const rawAnswers = req.body?.answers || {};
  const paymentMode = req.body?.payment_mode === 'group' ? 'group' : 'individual';
  const groupName = String(req.body?.group_name || '').trim();

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
      .prepare('SELECT reg_code FROM registrations WHERE event_id = ? AND upper(runner_id_number) = ?')
      .get(event.id, summary.runnerIdNumber.toUpperCase());
    if (dup) {
      return res.status(409).json({
        error: `此證件號碼已完成報名（報名序號：${dup.reg_code}），請勿重複報名。如需修改或補填匯款後五碼，請使用「查詢／修改報名」功能。`,
        code: 'DUPLICATE_REGISTRATION',
      });
    }
  }

  // 3. 產生專屬報名序號（例：TUR26-0003）並解析組別代碼
  const yearShort = String(new Date().getFullYear()).slice(-2);
  const seqNum = String(currentCount + 1).padStart(4, '0');
  let regCode = `TUR${yearShort}-${seqNum}`;
  if (db.prepare('SELECT id FROM registrations WHERE reg_code = ?').get(regCode)) {
    regCode = `TUR${yearShort}-${seqNum}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  }
  const catMeta = resolveCategoryMeta(fields, result.cleanAnswers);

  const master = getMasterDatabaseConfig();
  const hasCloudSheet = master.configured || event.sheet_sync_mode !== 'local';

  // 4. 先寫入本地快取資料庫（含報名類型、匯款方式與匯款帳號後五碼）
  const insertInfo = db
    .prepare(`
      INSERT INTO registrations (
        event_id, reg_code, category_code, runner_name, runner_id_number, runner_email, runner_phone,
        remittance_last5, reg_type, group_name, group_code, payment_mode,
        answers_json, price_breakdown_json, total_amount, payment_status, sheet_sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'individual', ?, '', ?, ?, ?, ?, '待繳費', ?)
    `)
    .run(
      event.id,
      regCode,
      catMeta.categoryCode || '',
      summary.runnerName,
      summary.runnerIdNumber,
      summary.runnerEmail,
      summary.runnerPhone,
      summary.remittanceLast5 || '',
      groupName,
      paymentMode,
      JSON.stringify(result.cleanAnswers),
      JSON.stringify(result.priceBreakdown),
      result.totalAmount,
      hasCloudSheet ? 'pending' : 'local'
    );

  const savedReg = db
    .prepare('SELECT * FROM registrations WHERE id = ?')
    .get(insertInfo.lastInsertRowid);

  // 5. 即時寫入平台統一 Google 試算表（活動專屬分頁 + 系統總表 _DB_Registrations）
  let sheetSyncStatus = hasCloudSheet ? 'synced' : 'local';
  let sheetSyncNotice = '';

  if (hasCloudSheet) {
    try {
      const syncRes = await appendRegistrationToSheet(event, fields, savedReg);
      db.prepare(
        "UPDATE registrations SET sheet_sync_status = 'synced', sheet_sync_error = '', sheet_row_number = ? WHERE id = ?"
      ).run(syncRes.rowNumber || null, savedReg.id);
      db.prepare("UPDATE events SET last_sheet_sync_at = datetime('now', 'localtime') WHERE id = ?").run(event.id);
      sheetSyncStatus = 'synced';
    } catch (err) {
      sheetSyncStatus = 'error';
      sheetSyncNotice =
        '您的報名資料已登錄並保留名額，雲端試算表目前連線忙碌，主辦單位將自動完成補同步，請安心留存報名序號！';
      db.prepare(
        "UPDATE registrations SET sheet_sync_status = 'error', sheet_sync_error = ? WHERE id = ?"
      ).run(err.message, savedReg.id);
      console.error(`[GoogleSheets] 報名 ${regCode} 寫入活動分頁失敗：`, err.message);
    }

    const latestReg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(savedReg.id);
    await syncRegistrationToCloud(latestReg);
    const refreshedEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(event.id);
    await syncEventToCloud(refreshedEvent).catch(() => {});
  }

  // 6. 以 Email 回覆選手個人報名狀況（含報名序號、匯款後五碼狀態與反向查詢修改連結）
  const siteOrigin = `${req.protocol}://${req.get('host')}`;
  const emailNotification = await sendRegistrationEmail({
    type: 'created',
    event,
    registration: savedReg,
    answers: result.cleanAnswers,
    priceBreakdown: result.priceBreakdown,
    siteOrigin,
  });

  return res.status(201).json({
    message: '報名成功！',
    registration: {
      reg_code: savedReg.reg_code,
      category_code: savedReg.category_code || '',
      id_masked: maskIdNumber(summary.runnerIdNumber),
      reg_type: 'individual',
      group_name: groupName,
      group_code: '',
      payment_mode: paymentMode,
      remittance_last5: savedReg.remittance_last5 || '',
      created_at: savedReg.created_at,
      total_amount: savedReg.total_amount,
      payment_status: savedReg.payment_status,
      answers: result.cleanAnswers,
      priceBreakdown: result.priceBreakdown,
      sheet_sync_status: sheetSyncStatus,
      sheet_sync_notice: sheetSyncNotice || undefined,
    },
    emailNotification,
    event: {
      slug: event.slug,
      name: event.name,
      english_name: event.english_name || '',
      organizer_name: event.owner_display_name || '主辦單位',
      event_date: event.event_date,
      location: event.location,
      payment_info: event.payment_info,
    },
  });
});

// POST /api/public/events/:slug/register-group — 團體報名（可命名團體，支援團體匯款或個別匯款記註後五碼）
router.post('/events/:slug/register-group', async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const event = db.prepare('SELECT * FROM events WHERE slug = ?').get(slug);
  if (!event) {
    return res.status(404).json({ error: '找不到此路跑活動，無法送出團體報名。' });
  }

  const countRow = db
    .prepare('SELECT COUNT(*) as cnt FROM registrations WHERE event_id = ?')
    .get(event.id);
  const currentCount = countRow?.cnt || 0;
  const regState = computeEventRegistrationState(event, currentCount);

  if (!regState.canRegister) {
    return res.status(400).json({
      error: regState.reason,
      code: `EVENT_${String(regState.status || 'closed').toUpperCase()}`,
    });
  }

  const groupName = String(req.body?.group_name || '').trim();
  if (!groupName) {
    return res.status(400).json({ error: '請為團體報名填寫「團體名稱」。' });
  }

  const paymentMode = req.body?.payment_mode === 'individual' ? 'individual' : 'group';
  const fields = JSON.parse(event.fields_json || '[]');
  const remittanceField = fields.find(
    (f) => f.id === 'remittance_last5' || f.validation === 'remittance_last5'
  );
  const groupRemittanceLast5 = String(req.body?.group_remittance_last5 || '').trim();
  if (paymentMode === 'group') {
    if (remittanceField?.required && !groupRemittanceLast5) {
      return res.status(400).json({
        error: '請填寫團體匯款帳號尾五碼（5 位純數字）。',
      });
    }
    if (groupRemittanceLast5 && !isValidRemittanceLast5(groupRemittanceLast5)) {
      return res.status(400).json({
        error: '團體匯款帳號尾五碼需為 5 位純數字。',
      });
    }
  }

  const membersInput = Array.isArray(req.body?.members) ? req.body.members : [];
  if (membersInput.length === 0) {
    return res.status(400).json({ error: '請至少新增 1 位團體成員。' });
  }
  if (membersInput.length > 50) {
    return res.status(400).json({ error: '單次團體報名最多 50 位成員，超過請分批送出。' });
  }

  const max = Number(event.max_participants || 0);
  if (max > 0 && currentCount + membersInput.length > max) {
    const left = Math.max(0, max - currentCount);
    return res.status(400).json({
      error: `本活動剩餘名額不足（目前剩餘 ${left} 名，本次團報 ${membersInput.length} 位）。`,
      code: 'CAPACITY_EXCEEDED',
    });
  }

  const memberErrors = {};
  const validatedMembers = [];
  const seenIdsInBatch = new Set();

  for (let i = 0; i < membersInput.length; i++) {
    const rawAnswers = { ...(membersInput[i]?.answers || {}) };
    if (paymentMode === 'group') {
      // 團體匯款時統一套用團體匯款後五碼
      rawAnswers.remittance_last5 = groupRemittanceLast5;
    }

    const resVal = validateAndCalculateRegistration(fields, rawAnswers);
    if (!resVal.valid) {
      memberErrors[i] = resVal.errors;
      continue;
    }

    const summary = extractRunnerSummary(fields, resVal.cleanAnswers);
    const idUpper = String(summary.runnerIdNumber || '').toUpperCase();
    if (idUpper) {
      if (seenIdsInBatch.has(idUpper)) {
        memberErrors[i] = { id_number: '與本團其他成員證件號碼重複，請確認。' };
        continue;
      }
      const dup = db
        .prepare('SELECT reg_code FROM registrations WHERE event_id = ? AND upper(runner_id_number) = ?')
        .get(event.id, idUpper);
      if (dup) {
        memberErrors[i] = {
          id_number: `此證件號碼已完成報名（序號：${dup.reg_code}），請勿重複報名。`,
        };
        continue;
      }
      seenIdsInBatch.add(idUpper);
    }

    const catMeta = resolveCategoryMeta(fields, resVal.cleanAnswers);
    validatedMembers.push({
      cleanAnswers: resVal.cleanAnswers,
      priceBreakdown: resVal.priceBreakdown,
      totalAmount: resVal.totalAmount,
      summary,
      catMeta,
      remittanceLast5: paymentMode === 'group' ? groupRemittanceLast5 : summary.remittanceLast5 || '',
    });
  }

  if (Object.keys(memberErrors).length > 0) {
    return res.status(400).json({
      error: `第 ${Object.keys(memberErrors).map((k) => Number(k) + 1).join('、')} 位團員資料有誤或未填寫完整，請檢查紅色提示項目。`,
      memberErrors,
    });
  }

  const yearShort = String(new Date().getFullYear()).slice(-2);
  let groupCode = `GRP${yearShort}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  while (db.prepare('SELECT id FROM registrations WHERE group_code = ?').get(groupCode)) {
    groupCode = `GRP${yearShort}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  const master = getMasterDatabaseConfig();
  const hasCloudSheet = master.configured || event.sheet_sync_mode !== 'local';
  const savedRows = [];

  db.exec('BEGIN TRANSACTION;');
  try {
    const insertStmt = db.prepare(`
      INSERT INTO registrations (
        event_id, reg_code, category_code, runner_name, runner_id_number, runner_email, runner_phone,
        remittance_last5, reg_type, group_name, group_code, payment_mode,
        answers_json, price_breakdown_json, total_amount, payment_status, sheet_sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'group', ?, ?, ?, ?, ?, ?, '待繳費', ?)
    `);

    for (let idx = 0; idx < validatedMembers.length; idx++) {
      const m = validatedMembers[idx];
      const seqNum = String(currentCount + idx + 1).padStart(4, '0');
      let regCode = `TUR${yearShort}-${seqNum}`;
      if (db.prepare('SELECT id FROM registrations WHERE reg_code = ?').get(regCode)) {
        regCode = `TUR${yearShort}-${seqNum}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      }

      const info = insertStmt.run(
        event.id,
        regCode,
        m.catMeta.categoryCode || '',
        m.summary.runnerName,
        m.summary.runnerIdNumber,
        m.summary.runnerEmail,
        m.summary.runnerPhone,
        m.remittanceLast5,
        groupName,
        groupCode,
        paymentMode,
        JSON.stringify(m.cleanAnswers),
        JSON.stringify(m.priceBreakdown),
        m.totalAmount,
        hasCloudSheet ? 'pending' : 'local'
      );
      const saved = db.prepare('SELECT * FROM registrations WHERE id = ?').get(info.lastInsertRowid);
      savedRows.push({ saved, meta: m });
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ error: `團體報名寫入失敗：${err.message}` });
  }

  // 同步寫入試算表活動分頁 + 統一資料庫 + 發送每位團員確認信
  const siteOrigin = `${req.protocol}://${req.get('host')}`;
  let sentEmails = 0;
  let lastEmailNotice = '';

  for (const item of savedRows) {
    if (hasCloudSheet) {
      try {
        const syncRes = await appendRegistrationToSheet(event, fields, item.saved);
        db.prepare(
          "UPDATE registrations SET sheet_sync_status = 'synced', sheet_sync_error = '', sheet_row_number = ? WHERE id = ?"
        ).run(syncRes.rowNumber || null, item.saved.id);
      } catch (err) {
        db.prepare(
          "UPDATE registrations SET sheet_sync_status = 'error', sheet_sync_error = ? WHERE id = ?"
        ).run(err.message, item.saved.id);
      }
    }

    const mailRes = await sendRegistrationEmail({
      type: 'created',
      event,
      registration: item.saved,
      answers: item.meta.cleanAnswers,
      priceBreakdown: item.meta.priceBreakdown,
      siteOrigin,
    });
    if (mailRes.sent) sentEmails += 1;
    if (mailRes.notice) lastEmailNotice = mailRes.notice;
  }

  if (hasCloudSheet) {
    db.prepare("UPDATE events SET last_sheet_sync_at = datetime('now', 'localtime') WHERE id = ?").run(event.id);
    await syncAllRegistrationsToCloud();
    const refreshedEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(event.id);
    await syncEventToCloud(refreshedEvent).catch(() => {});
  }

  const groupTotalAmount = savedRows.reduce((acc, item) => acc + Number(item.saved.total_amount || 0), 0);

  return res.status(201).json({
    message: `團體「${groupName}」共 ${savedRows.length} 位跑者報名成功！`,
    isGroup: true,
    group: {
      group_code: groupCode,
      group_name: groupName,
      payment_mode: paymentMode,
      group_remittance_last5: paymentMode === 'group' ? groupRemittanceLast5 : '',
      member_count: savedRows.length,
      total_amount: groupTotalAmount,
    },
    registrations: savedRows.map(({ saved, meta }) => ({
      reg_code: saved.reg_code,
      runner_name: saved.runner_name,
      category_code: saved.category_code || '',
      id_masked: maskIdNumber(saved.runner_id_number),
      remittance_last5: saved.remittance_last5 || '',
      payment_mode: saved.payment_mode,
      total_amount: saved.total_amount,
      payment_status: saved.payment_status,
      answers: meta.cleanAnswers,
      priceBreakdown: meta.priceBreakdown,
    })),
    emailNotification: {
      sentCount: sentEmails,
      totalMembers: savedRows.length,
      notice:
        sentEmails > 0
          ? `系統已寄送報名確認信給本團 ${sentEmails} 位跑者（含各自報名序號與反向查詢修改連結）。`
          : lastEmailNotice,
    },
    event: {
      slug: event.slug,
      name: event.name,
      english_name: event.english_name || '',
      organizer_name: event.owner_display_name || '主辦單位',
      event_date: event.event_date,
      location: event.location,
      payment_info: event.payment_info,
    },
  });
});

module.exports = router;
