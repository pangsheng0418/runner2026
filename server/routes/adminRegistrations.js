const express = require('express');
const { db } = require('../db');
const { requireAdminAuth } = require('../middleware/auth');
const {
  getMasterDatabaseConfig,
  appendRegistrationToSheet,
  pullRowsFromSheet,
  updatePaymentStatusInSheet,
  updateBibInSheet,
  buildExpectedHeaders,
} = require('../services/googleSheets');
const {
  syncRegistrationToCloud,
  syncAllRegistrationsToCloud,
  syncEventToCloud,
} = require('../services/cloudStore');
const { sendRegistrationEmail } = require('../services/emailService');
const { extractRunnerSummary } = require('../services/validation');
const {
  maskIdNumber,
  buildChipImportCsv,
  autoAssignBibNumbers,
  pushRosterToChipSystem,
  toChipTimingRegistration,
} = require('../services/chipBridge');

const router = express.Router();
router.use(requireAdminAuth);

function getOwnedEventOrDeny(req, res, eventId) {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(Number(eventId));
  if (!event) {
    res.status(404).json({ error: '找不到指定的活動。' });
    return null;
  }
  const me = db.prepare('SELECT id, username, role FROM admins WHERE id = ?').get(req.admin.id);
  if (me?.role === 'super_admin') {
    return event;
  }
  const isOwner =
    Number(event.owner_admin_id) === Number(req.admin.id) ||
    (event.owner_username && event.owner_username.toLowerCase() === String(req.admin.username || '').toLowerCase());
  if (!isOwner) {
    res.status(403).json({
      error: '權限不足：此活動報名表屬於其他承辦人，僅建立者本人或最高權限管理者可檢視或修改報名資料。',
      code: 'FORBIDDEN_NOT_OWNER',
    });
    return null;
  }
  return event;
}

function formatRegistrationRow(row) {
  return {
    ...row,
    id_masked: maskIdNumber(row.runner_id_number),
    answers: JSON.parse(row.answers_json || '{}'),
    priceBreakdown: JSON.parse(row.price_breakdown_json || '[]'),
  };
}

// GET /api/admin/events/:eventId/registrations
router.get('/events/:eventId/registrations', (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const rows = db
    .prepare('SELECT * FROM registrations WHERE event_id = ? ORDER BY created_at DESC, id DESC')
    .all(event.id);

  return res.json({
    registrations: rows.map(formatRegistrationRow),
    total: rows.length,
  });
});

// PATCH /api/admin/registrations/:id/payment-status
router.patch('/registrations/:id/payment-status', async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.payment_status || '').trim();
  if (!['待繳費', '已繳費', '已取消'].includes(status)) {
    return res.status(400).json({ error: '無效的繳費狀態。' });
  }

  const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
  if (!reg) {
    return res.status(404).json({ error: '找不到該筆報名紀錄。' });
  }

  const event = getOwnedEventOrDeny(req, res, reg.event_id);
  if (!event) return;

  db.prepare('UPDATE registrations SET payment_status = ? WHERE id = ?').run(status, id);
  const updated = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);

  // 1. 同步至統一資料庫 _DB_Registrations
  await syncRegistrationToCloud(updated);

  // 2. 同步回寫繳費狀態到活動專屬分頁
  const master = getMasterDatabaseConfig();
  let sheetUpdate = { skipped: true };
  if (master.configured || event.sheet_sync_mode !== 'local') {
    sheetUpdate = await updatePaymentStatusInSheet(event, reg.reg_code, status);
  }

  // 3. 若承辦人改為「已繳費」或「已取消」，自動發送 Email 通知選手最新對帳狀態
  let emailResult = { skipped: true };
  if (status === '已繳費' || status === '已取消') {
    const siteOrigin = `${req.protocol}://${req.get('host')}`;
    emailResult = await sendRegistrationEmail({
      type: 'payment_updated',
      event,
      registration: updated,
      answers: JSON.parse(updated.answers_json || '{}'),
      priceBreakdown: JSON.parse(updated.price_breakdown_json || '[]'),
      siteOrigin,
    });
  }

  return res.json({
    registration: formatRegistrationRow(updated),
    sheetUpdate,
    emailNotification: emailResult,
    message: `已更新繳費狀態為「${status}」${sheetUpdate.synced ? '（已同步至統一試算表）' : ''}${
      emailResult.sent ? '，並已寄出 Email 通知選手！' : ''
    }`,
  });
});

// PATCH /api/admin/events/:eventId/groups/:groupCode/payment-status — 同團一鍵批量對帳（團體匯款核對專用）
router.patch('/events/:eventId/groups/:groupCode/payment-status', async (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const groupCode = String(req.params.groupCode || '').trim().toUpperCase();
  const status = String(req.body?.payment_status || '').trim();
  if (!['待繳費', '已繳費', '已取消'].includes(status)) {
    return res.status(400).json({ error: '無效的繳費狀態。' });
  }

  const members = db
    .prepare('SELECT * FROM registrations WHERE event_id = ? AND upper(group_code) = ?')
    .all(event.id, groupCode);
  if (members.length === 0) {
    return res.status(404).json({ error: `找不到團報代碼「${groupCode}」的報名成員。` });
  }

  db.prepare(
    'UPDATE registrations SET payment_status = ? WHERE event_id = ? AND upper(group_code) = ?'
  ).run(status, event.id, groupCode);

  const updatedMembers = db
    .prepare('SELECT * FROM registrations WHERE event_id = ? AND upper(group_code) = ? ORDER BY id ASC')
    .all(event.id, groupCode);

  const master = getMasterDatabaseConfig();
  const siteOrigin = `${req.protocol}://${req.get('host')}`;
  let sentCount = 0;

  for (const m of updatedMembers) {
    if (master.configured || event.sheet_sync_mode !== 'local') {
      await updatePaymentStatusInSheet(event, m.reg_code, status).catch(() => {});
    }
    if (status === '已繳費' || status === '已取消') {
      const mailRes = await sendRegistrationEmail({
        type: 'payment_updated',
        event,
        registration: m,
        answers: JSON.parse(m.answers_json || '{}'),
        priceBreakdown: JSON.parse(m.price_breakdown_json || '[]'),
        siteOrigin,
      });
      if (mailRes.sent) sentCount += 1;
    }
  }

  await syncAllRegistrationsToCloud();

  return res.json({
    groupCode,
    updatedCount: updatedMembers.length,
    registrations: updatedMembers.map(formatRegistrationRow),
    message: `已將團體「${updatedMembers[0].group_name || groupCode}」共 ${updatedMembers.length} 位成員批次設為「${status}」${
      sentCount > 0 ? `（已寄發 ${sentCount} 封通知信）` : ''
    }！`,
  });
});

// POST /api/admin/events/:eventId/registrations/retry-sync
router.post('/events/:eventId/registrations/retry-sync', async (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const master = getMasterDatabaseConfig();
  if (!master.configured && event.sheet_sync_mode === 'local') {
    return res.status(400).json({ error: '尚未設定平台統一 Google 試算表資料庫，無法補送同步。' });
  }

  const fields = JSON.parse(event.fields_json || '[]');
  const pendingRows = db
    .prepare("SELECT * FROM registrations WHERE event_id = ? AND sheet_sync_status != 'synced' ORDER BY id ASC")
    .all(event.id);

  let successCount = 0;
  let failCount = 0;
  let lastError = '';

  for (const reg of pendingRows) {
    try {
      const result = await appendRegistrationToSheet(event, fields, reg);
      db.prepare(
        "UPDATE registrations SET sheet_sync_status = 'synced', sheet_sync_error = '', sheet_row_number = ? WHERE id = ?"
      ).run(result.rowNumber || null, reg.id);
      successCount += 1;
    } catch (err) {
      failCount += 1;
      lastError = err.message;
      db.prepare(
        "UPDATE registrations SET sheet_sync_status = 'error', sheet_sync_error = ? WHERE id = ?"
      ).run(err.message, reg.id);
    }
  }

  if (successCount > 0) {
    db.prepare("UPDATE events SET last_sheet_sync_at = datetime('now', 'localtime') WHERE id = ?").run(event.id);
    const refreshedEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(event.id);
    await syncEventToCloud(refreshedEvent).catch(() => {});
    await syncAllRegistrationsToCloud();
  }

  return res.json({
    attempted: pendingRows.length,
    successCount,
    failCount,
    lastError: lastError || undefined,
    message:
      pendingRows.length === 0
        ? '所有報名資料均已同步至統一試算表，無待補送項目。'
        : `補送完成：成功 ${successCount} 筆，失敗 ${failCount} 筆。${lastError ? `（錯誤：${lastError}）` : ''}`,
  });
});

// POST /api/admin/events/:eventId/registrations/pull-from-sheet
router.post('/events/:eventId/registrations/pull-from-sheet', async (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const fields = JSON.parse(event.fields_json || '[]');
  try {
    const pulled = await pullRowsFromSheet(event);
    let updatedCount = 0;
    let importedCount = 0;

    for (const item of pulled.rows) {
      const data = item.data || {};
      const regCode = String(data['報名序號'] || '').trim();
      const paymentStatus = String(data['繳費狀態'] || '').trim();
      const bibNumber = String(data['參賽編號'] || '').trim().toUpperCase();
      const totalAmount = Number(String(data['應繳總金額'] || '0').replace(/[^\d.-]/g, '')) || 0;

      const answers = {};
      for (const field of fields) {
        if (field.type === 'calculated') continue;
        const label = String(field.label || field.id).trim();
        if (data[label] !== undefined) {
          if (field.type === 'checkbox') {
            answers[field.id] = String(data[label])
              .split(/[、,]/)
              .map((s) => s.trim())
              .filter(Boolean);
          } else {
            answers[field.id] = data[label];
          }
        }
      }

      if (regCode) {
        const existing = db
          .prepare('SELECT * FROM registrations WHERE event_id = ? AND reg_code = ?')
          .get(event.id, regCode);
        if (existing) {
          const nextStatus = paymentStatus || existing.payment_status;
          const nextBib = bibNumber || existing.bib_number || '';
          db.prepare(
            "UPDATE registrations SET payment_status = ?, bib_number = ?, sheet_sync_status = 'synced', sheet_row_number = ? WHERE id = ?"
          ).run(nextStatus, nextBib, item.rowNumber, existing.id);
          updatedCount += 1;
          continue;
        }
      }

      const summary = extractRunnerSummary(fields, answers);
      if (!summary.runnerName && !regCode) continue;

      const generatedCode =
        regCode || `SHEET-${event.id}-${item.rowNumber}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

      db.prepare(`
        INSERT INTO registrations (
          event_id, reg_code, bib_number, runner_name, runner_id_number, runner_email, runner_phone,
          answers_json, price_breakdown_json, total_amount, payment_status,
          sheet_sync_status, sheet_row_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)
      `).run(
        event.id,
        generatedCode,
        bibNumber,
        summary.runnerName || '試算表匯入跑者',
        summary.runnerIdNumber,
        summary.runnerEmail,
        summary.runnerPhone,
        JSON.stringify(answers),
        JSON.stringify([]),
        totalAmount,
        paymentStatus || '待繳費',
        item.rowNumber
      );
      importedCount += 1;
    }

    db.prepare("UPDATE events SET last_sheet_sync_at = datetime('now', 'localtime') WHERE id = ?").run(event.id);
    const refreshedEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(event.id);
    await syncEventToCloud(refreshedEvent).catch(() => {});
    await syncAllRegistrationsToCloud();

    return res.json({
      totalSheetRows: pulled.rows.length,
      updatedCount,
      importedCount,
      message: `雙向拉取完成！共讀取 ${pulled.rows.length} 列（更新 ${updatedCount} 筆、匯入 ${importedCount} 筆新資料）。`,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/admin/events/:eventId/registrations/export-csv
router.get('/events/:eventId/registrations/export-csv', (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const fields = JSON.parse(event.fields_json || '[]');
  const headers = buildExpectedHeaders(fields);
  const rows = db
    .prepare('SELECT * FROM registrations WHERE event_id = ? ORDER BY id ASC')
    .all(event.id);

  const escapeCsv = (val) => {
    const str = val === undefined || val === null ? '' : String(val);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.map(escapeCsv).join(',')];
  for (const reg of rows) {
    const answers = JSON.parse(reg.answers_json || '{}');
    const rowMap = {
      '報名序號': reg.reg_code,
      '報名類型': reg.reg_type === 'group' ? '團體報名' : '個人報名',
      '團體名稱': reg.group_name || '',
      '團報代碼': reg.group_code || '',
      '參賽編號': reg.bib_number || '',
      '分組代碼': reg.category_code || '',
      '報名時間': reg.created_at,
      '應繳總金額': reg.total_amount,
      '匯款方式': reg.payment_mode === 'group' ? '團體匯款' : '個別匯款',
      '匯款後五碼': reg.remittance_last5 || '',
      '繳費狀態': reg.payment_status,
    };
    for (const f of fields) {
      if (f.type === 'calculated') continue;
      const val = answers[f.id];
      rowMap[String(f.label || f.id).trim()] = Array.isArray(val) ? val.join('、') : val ?? '';
    }
    lines.push(headers.map((h) => escapeCsv(rowMap[h])).join(','));
  }

  const csvContent = '\uFEFF' + lines.join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(`${event.name}-報名名單.csv`)}`
  );
  return res.send(csvContent);
});

// PATCH /api/admin/registrations/:id/bib — 手動修改參賽編號（號碼布）與晶片分組代碼
router.patch('/registrations/:id/bib', async (req, res) => {
  const id = Number(req.params.id);
  const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
  if (!reg) {
    return res.status(404).json({ error: '找不到該筆報名紀錄。' });
  }

  const event = getOwnedEventOrDeny(req, res, reg.event_id);
  if (!event) return;

  const bib = String(req.body?.bib_number ?? reg.bib_number ?? '').trim().toUpperCase();
  const cat = String(req.body?.category_code ?? reg.category_code ?? '').trim();

  if (bib) {
    const dup = db
      .prepare('SELECT id, runner_name FROM registrations WHERE event_id = ? AND bib_number = ? AND id != ?')
      .get(reg.event_id, bib, id);
    if (dup) {
      return res.status(409).json({
        error: `參賽編號「${bib}」已分配給 ${dup.runner_name}，請使用其他編號。`,
      });
    }
  }

  db.prepare('UPDATE registrations SET bib_number = ?, category_code = ? WHERE id = ?').run(bib, cat, id);
  const updated = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);

  await syncRegistrationToCloud(updated);
  await updateBibInSheet(event, updated.reg_code, bib, cat).catch(() => {});

  return res.json({
    registration: formatRegistrationRow(updated),
    message: bib ? `已更新參賽編號為 ${bib}` : '已清除參賽編號',
  });
});

// POST /api/admin/events/:eventId/registrations/auto-assign-bibs — 依報名組別一鍵自動配號
router.post('/events/:eventId/registrations/auto-assign-bibs', async (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const fields = JSON.parse(event.fields_json || '[]');
  const paidOnly = Boolean(req.body?.paidOnly);
  const overwrite = Boolean(req.body?.overwrite);

  const result = autoAssignBibNumbers(db, event, fields, { paidOnly, overwrite });
  const rows = db
    .prepare('SELECT * FROM registrations WHERE event_id = ? ORDER BY created_at DESC, id DESC')
    .all(event.id);

  if (result.assignedCount > 0) {
    await syncAllRegistrationsToCloud();
  }

  return res.json({
    ...result,
    registrations: rows.map(formatRegistrationRow),
    message:
      result.assignedCount > 0
        ? `自動配號完成！本次共為 ${result.assignedCount} 位跑者分配專屬參賽編號（Bib）。`
        : '所有符合條件的跑者皆已有參賽編號，無需重複分配。',
  });
});

// GET /api/admin/events/:eventId/registrations/export-chip-csv — 匯出晶片系統專用名單 CSV
router.get('/events/:eventId/registrations/export-chip-csv', (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const paidOnly = String(req.query.paidOnly || '').toLowerCase() === 'true';
  const fields = JSON.parse(event.fields_json || '[]');
  const sql = paidOnly
    ? "SELECT * FROM registrations WHERE event_id = ? AND payment_status = '已繳費' ORDER BY id ASC"
    : 'SELECT * FROM registrations WHERE event_id = ? ORDER BY id ASC';
  const rows = db.prepare(sql).all(event.id);

  const csvContent = buildChipImportCsv(event, fields, rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(`${event.timing_event_id || event.slug}-TUR晶片系統匯入名單.csv`)}`
  );
  return res.send(csvContent);
});

// GET /api/admin/events/:eventId/registrations/chip-preview
router.get('/events/:eventId/registrations/chip-preview', (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const paidOnly = String(req.query.paidOnly || '').toLowerCase() === 'true';
  const fields = JSON.parse(event.fields_json || '[]');
  const sql = paidOnly
    ? "SELECT * FROM registrations WHERE event_id = ? AND payment_status = '已繳費' ORDER BY id ASC"
    : 'SELECT * FROM registrations WHERE event_id = ? ORDER BY id ASC';
  const rows = db.prepare(sql).all(event.id);

  return res.json({
    eventId: event.timing_event_id || event.slug,
    count: rows.length,
    registrations: rows.map((r) => toChipTimingRegistration(event, fields, r)),
  });
});

// POST /api/admin/events/:eventId/registrations/push-to-chip
router.post('/events/:eventId/registrations/push-to-chip', async (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.eventId);
  if (!event) return;

  const paidOnly = req.body?.paidOnly !== false;
  const fields = JSON.parse(event.fields_json || '[]');
  const sql = paidOnly
    ? "SELECT * FROM registrations WHERE event_id = ? AND payment_status = '已繳費' ORDER BY id ASC"
    : 'SELECT * FROM registrations WHERE event_id = ? ORDER BY id ASC';
  const rows = db.prepare(sql).all(event.id);

  try {
    const result = await pushRosterToChipSystem(event, fields, rows, {
      gasUrl: req.body?.timing_gas_url || event.timing_gas_url,
      username: req.body?.chip_admin_username,
      password: req.body?.chip_admin_password,
    });
    return res.json({
      ...result,
      message: `已成功將 ${result.pushedCount} 位跑者名單推送至晶片計時系統！`,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
