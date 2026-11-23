const express = require('express');
const { db } = require('../db');
const { requireAdminAuth } = require('../middleware/auth');
const {
  appendRegistrationToSheet,
  pullRowsFromSheet,
  updatePaymentStatusInSheet,
  buildExpectedHeaders,
} = require('../services/googleSheets');
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
  const eventId = Number(req.params.eventId);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) {
    return res.status(404).json({ error: '找不到指定的活動。' });
  }

  const rows = db
    .prepare('SELECT * FROM registrations WHERE event_id = ? ORDER BY created_at DESC, id DESC')
    .all(eventId);

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

  db.prepare('UPDATE registrations SET payment_status = ? WHERE id = ?').run(status, id);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(reg.event_id);

  // 雙向同步：同步回寫繳費狀態到 Google 試算表
  let sheetUpdate = { skipped: true };
  if (event && event.sheet_sync_mode !== 'local') {
    sheetUpdate = await updatePaymentStatusInSheet(event, reg.reg_code, status);
  }

  const updated = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
  return res.json({
    registration: formatRegistrationRow(updated),
    sheetUpdate,
    message: `已更新繳費狀態為「${status}」${sheetUpdate.synced ? '（已同步至試算表）' : ''}`,
  });
});

// POST /api/admin/events/:eventId/registrations/retry-sync
// 將所有尚未同步或同步失敗的報名資料補寫回 Google 試算表
router.post('/events/:eventId/registrations/retry-sync', async (req, res) => {
  const eventId = Number(req.params.eventId);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) {
    return res.status(404).json({ error: '找不到指定的活動。' });
  }
  if (event.sheet_sync_mode === 'local') {
    return res.status(400).json({ error: '目前為本地展示模式，請先設定並儲存 Google 試算表同步模式。' });
  }

  const fields = JSON.parse(event.fields_json || '[]');
  const pendingRows = db
    .prepare("SELECT * FROM registrations WHERE event_id = ? AND sheet_sync_status != 'synced' ORDER BY id ASC")
    .all(eventId);

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
    db.prepare("UPDATE events SET last_sheet_sync_at = datetime('now', 'localtime') WHERE id = ?").run(eventId);
  }

  return res.json({
    attempted: pendingRows.length,
    successCount,
    failCount,
    lastError: lastError || undefined,
    message:
      pendingRows.length === 0
        ? '所有報名資料均已同步完成，無待補送項目。'
        : `補送完成：成功 ${successCount} 筆，失敗 ${failCount} 筆。${lastError ? `（錯誤：${lastError}）` : ''}`,
  });
});

// POST /api/admin/events/:eventId/registrations/pull-from-sheet
// 雙向同步：從 Google 試算表拉取最新修改（例如工作人員直接在試算表將繳費狀態改成「已繳費」，或手動加報）
router.post('/events/:eventId/registrations/pull-from-sheet', async (req, res) => {
  const eventId = Number(req.params.eventId);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) {
    return res.status(404).json({ error: '找不到指定的活動。' });
  }

  const fields = JSON.parse(event.fields_json || '[]');
  try {
    const pulled = await pullRowsFromSheet(event);
    let updatedCount = 0;
    let importedCount = 0;

    for (const item of pulled.rows) {
      const data = item.data || {};
      const regCode = String(data['報名序號'] || '').trim();
      const paymentStatus = String(data['繳費狀態'] || '').trim();
      const totalAmount = Number(String(data['應繳總金額'] || '0').replace(/[^\d.-]/g, '')) || 0;

      // 將表頭對應回欄位 ID
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
          .get(eventId, regCode);
        if (existing) {
          const nextStatus = paymentStatus || existing.payment_status;
          db.prepare(
            "UPDATE registrations SET payment_status = ?, sheet_sync_status = 'synced', sheet_row_number = ? WHERE id = ?"
          ).run(nextStatus, item.rowNumber, existing.id);
          updatedCount += 1;
          continue;
        }
      }

      // 若試算表中有手動新增的列，一併匯入本地資料庫
      const summary = extractRunnerSummary(fields, answers);
      if (!summary.runnerName && !regCode) continue;

      const generatedCode =
        regCode || `SHEET-${eventId}-${item.rowNumber}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

      db.prepare(`
        INSERT INTO registrations (
          event_id, reg_code, runner_name, runner_id_number, runner_email, runner_phone,
          answers_json, price_breakdown_json, total_amount, payment_status,
          sheet_sync_status, sheet_row_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)
      `).run(
        eventId,
        generatedCode,
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

    db.prepare("UPDATE events SET last_sheet_sync_at = datetime('now', 'localtime') WHERE id = ?").run(eventId);

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
  const eventId = Number(req.params.eventId);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) {
    return res.status(404).json({ error: '找不到指定的活動。' });
  }

  const fields = JSON.parse(event.fields_json || '[]');
  const headers = buildExpectedHeaders(fields);
  const rows = db
    .prepare('SELECT * FROM registrations WHERE event_id = ? ORDER BY id ASC')
    .all(eventId);

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
      '參賽編號': reg.bib_number || '',
      '分組代碼': reg.category_code || '',
      '報名時間': reg.created_at,
      '應繳總金額': reg.total_amount,
      '繳費狀態': reg.payment_status,
    };
    for (const f of fields) {
      if (f.type === 'calculated') continue;
      const val = answers[f.id];
      rowMap[String(f.label || f.id).trim()] = Array.isArray(val) ? val.join('、') : (val ?? '');
    }
    lines.push(headers.map((h) => escapeCsv(rowMap[h])).join(','));
  }

  // 加入 UTF-8 BOM 確保 Excel 直接開啟中文不亂碼
  const csvContent = '\uFEFF' + lines.join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(`${event.name}-報名名單.csv`)}`
  );
  return res.send(csvContent);
});

// PATCH /api/admin/registrations/:id/bib — 手動修改參賽編號（號碼布）與晶片分組代碼
router.patch('/registrations/:id/bib', (req, res) => {
  const id = Number(req.params.id);
  const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
  if (!reg) {
    return res.status(404).json({ error: '找不到該筆報名紀錄。' });
  }
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
  return res.json({
    registration: formatRegistrationRow(updated),
    message: bib ? `已更新參賽編號為 ${bib}` : '已清除參賽編號',
  });
});

// POST /api/admin/events/:eventId/registrations/auto-assign-bibs — 依報名組別一鍵自動配號
router.post('/events/:eventId/registrations/auto-assign-bibs', (req, res) => {
  const eventId = Number(req.params.eventId);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) {
    return res.status(404).json({ error: '找不到指定的活動。' });
  }
  const fields = JSON.parse(event.fields_json || '[]');
  const paidOnly = Boolean(req.body?.paidOnly);
  const overwrite = Boolean(req.body?.overwrite);

  const result = autoAssignBibNumbers(db, event, fields, { paidOnly, overwrite });
  const rows = db
    .prepare('SELECT * FROM registrations WHERE event_id = ? ORDER BY created_at DESC, id DESC')
    .all(eventId);

  return res.json({
    ...result,
    registrations: rows.map(formatRegistrationRow),
    message:
      result.assignedCount > 0
        ? `自動配號完成！本次共為 ${result.assignedCount} 位跑者分配專屬參賽編號（Bib）。`
        : '所有符合條件的跑者皆已有參賽編號，無需重複分配。',
  });
});

// GET /api/admin/events/:eventId/registrations/export-chip-csv — 匯出 TUR 晶片系統專用名單 CSV
router.get('/events/:eventId/registrations/export-chip-csv', (req, res) => {
  const eventId = Number(req.params.eventId);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) {
    return res.status(404).json({ error: '找不到指定的活動。' });
  }
  const paidOnly = String(req.query.paidOnly || '').toLowerCase() === 'true';
  const fields = JSON.parse(event.fields_json || '[]');
  const sql = paidOnly
    ? "SELECT * FROM registrations WHERE event_id = ? AND payment_status = '已繳費' ORDER BY id ASC"
    : 'SELECT * FROM registrations WHERE event_id = ? ORDER BY id ASC';
  const rows = db.prepare(sql).all(eventId);

  const csvContent = buildChipImportCsv(event, fields, rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(`${event.timing_event_id || event.slug}-TUR晶片系統匯入名單.csv`)}`
  );
  return res.send(csvContent);
});

// GET /api/admin/events/:eventId/registrations/chip-preview — 預覽 TUR 晶片系統標準 JSON 格式
router.get('/events/:eventId/registrations/chip-preview', (req, res) => {
  const eventId = Number(req.params.eventId);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) {
    return res.status(404).json({ error: '找不到指定的活動。' });
  }
  const paidOnly = String(req.query.paidOnly || '').toLowerCase() === 'true';
  const fields = JSON.parse(event.fields_json || '[]');
  const sql = paidOnly
    ? "SELECT * FROM registrations WHERE event_id = ? AND payment_status = '已繳費' ORDER BY id ASC"
    : 'SELECT * FROM registrations WHERE event_id = ? ORDER BY id ASC';
  const rows = db.prepare(sql).all(eventId);

  return res.json({
    eventId: event.timing_event_id || event.slug,
    count: rows.length,
    registrations: rows.map((r) => toChipTimingRegistration(event, fields, r)),
  });
});

// POST /api/admin/events/:eventId/registrations/push-to-chip — 一鍵推送名單至獨立的 TUR 晶片計時系統
router.post('/events/:eventId/registrations/push-to-chip', async (req, res) => {
  const eventId = Number(req.params.eventId);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) {
    return res.status(404).json({ error: '找不到指定的活動。' });
  }
  const paidOnly = req.body?.paidOnly !== false;
  const fields = JSON.parse(event.fields_json || '[]');
  const sql = paidOnly
    ? "SELECT * FROM registrations WHERE event_id = ? AND payment_status = '已繳費' ORDER BY id ASC"
    : 'SELECT * FROM registrations WHERE event_id = ? ORDER BY id ASC';
  const rows = db.prepare(sql).all(eventId);

  try {
    const result = await pushRosterToChipSystem(event, fields, rows, {
      gasUrl: req.body?.timing_gas_url || event.timing_gas_url,
      username: req.body?.chip_admin_username,
      password: req.body?.chip_admin_password,
    });
    return res.json({
      ...result,
      message: `已成功將 ${result.pushedCount} 位跑者名單推送至 TUR 晶片計時系統（獨立資料庫同步完成）！`,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
