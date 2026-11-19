const express = require('express');
const path = require('path');
const multer = require('multer');
const { db, getDefaultRunningFields, UPLOADS_DIR } = require('../db');
const { requireAdminAuth } = require('../middleware/auth');
const {
  extractSpreadsheetId,
  createSpreadsheetForEvent,
  syncSheetHeaders,
  testSheetConnection,
  getCredentialsStatus,
} = require('../services/googleSheets');

const router = express.Router();
router.use(requireAdminAuth);

// Banner 圖片上傳設定
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeName = `banner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 最大 5MB
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('僅支援上傳 JPG、PNG、WebP 或 GIF 格式的圖片檔案。'));
    }
  },
});

function formatEventRow(row) {
  if (!row) return null;
  let fields = [];
  try {
    fields = JSON.parse(row.fields_json || '[]');
  } catch {
    fields = [];
  }
  const stats = db
    .prepare(
      `SELECT
        COUNT(*) as registration_count,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        SUM(CASE WHEN sheet_sync_status = 'error' THEN 1 ELSE 0 END) as sync_error_count
      FROM registrations WHERE event_id = ?`
    )
    .get(row.id);

  return {
    ...row,
    is_active: Boolean(row.is_active),
    fields,
    registration_count: stats?.registration_count || 0,
    total_revenue: stats?.total_revenue || 0,
    sync_error_count: stats?.sync_error_count || 0,
  };
}

function normalizeSlug(raw, fallbackName) {
  const base = String(raw || fallbackName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `run-event-${Date.now()}`;
}

// GET /api/admin/events/default-fields
router.get('/default-fields', (_req, res) => {
  return res.json({
    fields: getDefaultRunningFields(),
    googleCredentials: getCredentialsStatus(),
  });
});

// GET /api/admin/events
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM events ORDER BY created_at DESC, id DESC').all();
  return res.json({
    events: rows.map(formatEventRow),
    googleCredentials: getCredentialsStatus(),
  });
});

// GET /api/admin/events/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(Number(req.params.id));
  if (!row) {
    return res.status(404).json({ error: '找不到指定的路跑活動。' });
  }
  return res.json({
    event: formatEventRow(row),
    googleCredentials: getCredentialsStatus(),
  });
});

// POST /api/admin/events
router.post('/', async (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  if (!name) {
    return res.status(400).json({ error: '請填寫活動名稱。' });
  }

  let slug = normalizeSlug(body.slug, name);
  const dup = db.prepare('SELECT id FROM events WHERE slug = ?').get(slug);
  if (dup) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const now = new Date();
  const defaultStart = now.toISOString().slice(0, 16);
  const defaultEnd = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 16);
  const defaultEventDate = new Date(now.getTime() + 60 * 86400000).toISOString().slice(0, 10);

  const fields = Array.isArray(body.fields) && body.fields.length > 0
    ? body.fields
    : getDefaultRunningFields();

  const sheetSyncMode = ['local', 'api', 'webhook'].includes(body.sheet_sync_mode)
    ? body.sheet_sync_mode
    : 'local';

  const sheetUrl = String(body.sheet_url || '').trim();
  const sheetId = extractSpreadsheetId(body.sheet_id || sheetUrl);
  const sheetTabName = String(body.sheet_tab_name || '報名資料').trim() || '報名資料';

  const stmt = db.prepare(`
    INSERT INTO events (
      slug, name, event_date, location, reg_start_at, reg_end_at,
      max_participants, is_active, banner_title, banner_subtitle,
      banner_image_url, description, payment_info,
      sheet_sync_mode, sheet_id, sheet_url, sheet_tab_name, gas_webhook_url, fields_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    slug,
    name,
    String(body.event_date || defaultEventDate),
    String(body.location || ''),
    String(body.reg_start_at || defaultStart),
    String(body.reg_end_at || defaultEnd),
    Math.max(0, Number(body.max_participants || 0)),
    body.is_active === false ? 0 : 1,
    String(body.banner_title || name),
    String(body.banner_subtitle || '熱血開跑・突破自我極限'),
    String(body.banner_image_url || 'https://images.unsplash.com/photo-1513593771513-7b58b6c4af38?auto=format&fit=crop&w=1600&q=80'),
    String(body.description || ''),
    String(body.payment_info || '報名完成後請依指定帳戶完成繳費，並保留報名序號以便核對。'),
    sheetSyncMode,
    sheetId,
    sheetUrl || (sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : ''),
    sheetTabName,
    String(body.gas_webhook_url || '').trim(),
    JSON.stringify(fields)
  );

  const created = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
  let sheetNotice = '';

  // 若新建時已綁定 Google 試算表，自動初始化表頭
  if (sheetSyncMode !== 'local') {
    try {
      await syncSheetHeaders(created, fields);
      db.prepare("UPDATE events SET last_sheet_sync_at = datetime('now', 'localtime') WHERE id = ?").run(created.id);
      sheetNotice = '並已自動同步表頭至 Google 試算表。';
    } catch (err) {
      sheetNotice = `活動已建立，但試算表表頭同步失敗：${err.message}`;
    }
  }

  const latest = db.prepare('SELECT * FROM events WHERE id = ?').get(created.id);
  return res.status(201).json({
    event: formatEventRow(latest),
    message: `活動「${name}」建立成功！${sheetNotice}`,
  });
});

// PUT /api/admin/events/:id
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: '找不到指定的路跑活動。' });
  }

  const body = req.body || {};
  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  if (!name) {
    return res.status(400).json({ error: '活動名稱不可為空。' });
  }

  let slug = existing.slug;
  if (body.slug !== undefined && String(body.slug).trim() !== existing.slug) {
    slug = normalizeSlug(body.slug, name);
    const dup = db.prepare('SELECT id FROM events WHERE slug = ? AND id != ?').get(slug, id);
    if (dup) {
      return res.status(409).json({ error: `公開網址代碼「${slug}」已被其他活動使用，請更換。` });
    }
  }

  const fields = Array.isArray(body.fields)
    ? body.fields
    : JSON.parse(existing.fields_json || '[]');

  const sheetSyncMode = ['local', 'api', 'webhook'].includes(body.sheet_sync_mode)
    ? body.sheet_sync_mode
    : existing.sheet_sync_mode;

  const rawSheetUrl = body.sheet_url !== undefined ? String(body.sheet_url).trim() : existing.sheet_url;
  const rawSheetId = body.sheet_id !== undefined ? String(body.sheet_id).trim() : existing.sheet_id;
  const sheetId = extractSpreadsheetId(rawSheetId || rawSheetUrl);
  const sheetUrl = rawSheetUrl || (sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : '');
  const sheetTabName = body.sheet_tab_name !== undefined
    ? (String(body.sheet_tab_name).trim() || '報名資料')
    : existing.sheet_tab_name;

  db.prepare(`
    UPDATE events SET
      slug = ?,
      name = ?,
      event_date = ?,
      location = ?,
      reg_start_at = ?,
      reg_end_at = ?,
      max_participants = ?,
      is_active = ?,
      banner_title = ?,
      banner_subtitle = ?,
      banner_image_url = ?,
      description = ?,
      payment_info = ?,
      sheet_sync_mode = ?,
      sheet_id = ?,
      sheet_url = ?,
      sheet_tab_name = ?,
      gas_webhook_url = ?,
      fields_json = ?,
      updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(
    slug,
    name,
    body.event_date !== undefined ? String(body.event_date) : existing.event_date,
    body.location !== undefined ? String(body.location) : existing.location,
    body.reg_start_at !== undefined ? String(body.reg_start_at) : existing.reg_start_at,
    body.reg_end_at !== undefined ? String(body.reg_end_at) : existing.reg_end_at,
    body.max_participants !== undefined ? Math.max(0, Number(body.max_participants || 0)) : existing.max_participants,
    body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active,
    body.banner_title !== undefined ? String(body.banner_title) : existing.banner_title,
    body.banner_subtitle !== undefined ? String(body.banner_subtitle) : existing.banner_subtitle,
    body.banner_image_url !== undefined ? String(body.banner_image_url) : existing.banner_image_url,
    body.description !== undefined ? String(body.description) : existing.description,
    body.payment_info !== undefined ? String(body.payment_info) : existing.payment_info,
    sheetSyncMode,
    sheetId,
    sheetUrl,
    sheetTabName,
    body.gas_webhook_url !== undefined ? String(body.gas_webhook_url).trim() : existing.gas_webhook_url,
    JSON.stringify(fields),
    id
  );

  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  let headerSyncResult = { synced: false, skipped: true };
  let headerSyncWarning = '';

  // 若有修改欄位或指定同步表頭，自動對齊更新 Google 試算表第一列
  if (sheetSyncMode !== 'local' && (body.fields !== undefined || body.syncHeaders === true)) {
    try {
      headerSyncResult = await syncSheetHeaders(updated, fields);
      db.prepare("UPDATE events SET last_sheet_sync_at = datetime('now', 'localtime') WHERE id = ?").run(id);
    } catch (err) {
      headerSyncWarning = err.message;
    }
  }

  const latest = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  return res.json({
    event: formatEventRow(latest),
    headerSync: headerSyncResult,
    warning: headerSyncWarning || undefined,
    message: headerSyncWarning
      ? `活動設定已儲存，但 Google 試算表表頭同步提醒：${headerSyncWarning}`
      : '活動設定已儲存！' + (headerSyncResult.synced ? '（已同步更新試算表第一列表頭）' : ''),
  });
});

// PATCH /api/admin/events/:id/toggle
router.patch('/:id/toggle', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: '找不到指定的路跑活動。' });
  }
  const nextActive = existing.is_active ? 0 : 1;
  db.prepare("UPDATE events SET is_active = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(nextActive, id);
  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  return res.json({
    event: formatEventRow(updated),
    message: nextActive ? '活動已啟用並開放公開頁面瀏覽。' : '活動已暫停關閉報名。',
  });
});

// DELETE /api/admin/events/:id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id, name FROM events WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: '找不到指定的路跑活動。' });
  }
  db.prepare('DELETE FROM events WHERE id = ?').run(id);
  return res.json({ message: `活動「${existing.name}」已刪除。` });
});

// POST /api/admin/events/:id/upload-banner
router.post('/:id/upload-banner', (req, res) => {
  upload.single('banner')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || '圖片上傳失敗。' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '請選擇要上傳的橫幅圖片檔案。' });
    }
    const id = Number(req.params.id);
    const imageUrl = `/uploads/${req.file.filename}`;
    db.prepare("UPDATE events SET banner_image_url = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(
      imageUrl,
      id
    );
    return res.json({
      banner_image_url: imageUrl,
      message: '橫幅圖片上傳成功！',
    });
  });
});

// POST /api/admin/events/:id/sheets/auto-create
router.post('/:id/sheets/auto-create', async (req, res) => {
  const id = Number(req.params.id);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!event) {
    return res.status(404).json({ error: '找不到指定的路跑活動。' });
  }
  const fields = JSON.parse(event.fields_json || '[]');
  try {
    const created = await createSpreadsheetForEvent(event, fields);
    db.prepare(`
      UPDATE events SET
        sheet_sync_mode = 'api',
        sheet_id = ?,
        sheet_url = ?,
        sheet_tab_name = ?,
        last_sheet_sync_at = datetime('now', 'localtime'),
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(created.sheetId, created.sheetUrl, created.tabName, id);

    const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    return res.json({
      event: formatEventRow(updated),
      created,
      message: '已成功建立獨立 Google 試算表並完成表頭初始化！',
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/admin/events/:id/sheets/test
router.post('/:id/sheets/test', async (req, res) => {
  const id = Number(req.params.id);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!event) {
    return res.status(404).json({ error: '找不到指定的路跑活動。' });
  }

  // 允許測試畫面上尚未按儲存的設定
  const testTarget = {
    ...event,
    sheet_sync_mode: req.body?.sheet_sync_mode ?? event.sheet_sync_mode,
    sheet_id: extractSpreadsheetId(req.body?.sheet_id || req.body?.sheet_url || event.sheet_id || event.sheet_url),
    sheet_url: req.body?.sheet_url ?? event.sheet_url,
    sheet_tab_name: req.body?.sheet_tab_name ?? event.sheet_tab_name,
    gas_webhook_url: req.body?.gas_webhook_url ?? event.gas_webhook_url,
  };

  try {
    const result = await testSheetConnection(testTarget);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// POST /api/admin/events/:id/sheets/sync-headers
router.post('/:id/sheets/sync-headers', async (req, res) => {
  const id = Number(req.params.id);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!event) {
    return res.status(404).json({ error: '找不到指定的路跑活動。' });
  }
  const fields = JSON.parse(event.fields_json || '[]');
  try {
    const result = await syncSheetHeaders(event, fields);
    db.prepare("UPDATE events SET last_sheet_sync_at = datetime('now', 'localtime') WHERE id = ?").run(id);
    return res.json({
      ...result,
      message: '已成功將動態欄位同步至 Google 試算表第一列表頭！',
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
