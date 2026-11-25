const express = require('express');
const path = require('path');
const multer = require('multer');
const { db, getDefaultRunningFields, UPLOADS_DIR } = require('../db');
const { requireAdminAuth } = require('../middleware/auth');
const {
  getMasterDatabaseConfig,
  syncSheetHeaders,
  testSheetConnection,
  getCredentialsStatus,
  sanitizeSheetTabName,
} = require('../services/googleSheets');
const { computeEventRegistrationState } = require('../services/eventStatus');
const { generateEnglishEventName } = require('../services/raceNameTranslator');
const {
  syncEventToCloud,
  deleteEventFromCloud,
  getCloudSyncStatus,
} = require('../services/cloudStore');

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
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('僅支援上傳 JPG、PNG、WebP 或 GIF 格式的圖片檔案。'));
    }
  },
});

/**
 * 查詢目前登入者的最新角色（確保最高權限異動即時生效）
 */
function getLiveAdmin(req) {
  const row = db
    .prepare('SELECT id, username, display_name, role FROM admins WHERE id = ?')
    .get(req.admin.id);
  if (!row) {
    return {
      id: req.admin.id,
      username: req.admin.username,
      displayName: req.admin.displayName,
      role: req.admin.role || 'organizer',
    };
  }
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role || 'organizer',
  };
}

/**
 * 嚴格驗證活動存取權限：
 * - 一般承辦人：僅能檢視與修改自己建立的活動報名表
 * - 最高權限承辦人（super_admin）：可檢視與修改所有承辦人的活動資料
 */
function getOwnedEventOrDeny(req, res, eventId) {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(Number(eventId));
  if (!row) {
    res.status(404).json({ error: '找不到指定的路跑活動。' });
    return null;
  }
  const liveAdmin = getLiveAdmin(req);
  if (liveAdmin.role === 'super_admin') {
    return row;
  }

  const isOwner =
    Number(row.owner_admin_id) === Number(liveAdmin.id) ||
    (row.owner_username && row.owner_username.toLowerCase() === String(liveAdmin.username || '').toLowerCase());

  if (!isOwner) {
    res.status(403).json({
      error: '權限不足：此活動報名表由其他承辦人建立，僅建立者本人或最高權限管理者可進入管理。',
      code: 'FORBIDDEN_NOT_OWNER',
    });
    return null;
  }
  return row;
}

function sanitizeCredsForRole(role) {
  const raw = getCredentialsStatus();
  const isSuper = role === 'super_admin';
  return {
    configured: raw.configured,
    unifiedDbConfigured: raw.unifiedDbConfigured,
    unifiedDbMode: raw.unifiedDbMode,
    masterSheetConfigured: raw.masterSheetConfigured,
    masterGasConfigured: raw.masterGasConfigured,
    isVercel: raw.isVercel,
    serviceAccountEmail: isSuper ? raw.serviceAccountEmail : '',
    masterSheetId: isSuper ? raw.masterSheetId : '',
    masterSheetUrl: isSuper && raw.masterSheetId
      ? `https://docs.google.com/spreadsheets/d/${raw.masterSheetId}/edit`
      : '',
  };
}

function formatEventRow(row, role = 'organizer') {
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
        SUM(CASE WHEN payment_status = '待繳費' THEN 1 ELSE 0 END) as unpaid_count,
        SUM(CASE WHEN payment_status = '已繳費' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN sheet_sync_status = 'error' THEN 1 ELSE 0 END) as sync_error_count
      FROM registrations WHERE event_id = ?`
    )
    .get(row.id);

  const regCount = stats?.registration_count || 0;
  const regState = computeEventRegistrationState(row, regCount);
  const master = getMasterDatabaseConfig();
  const isSuper = role === 'super_admin';

  return {
    ...row,
    is_active: Boolean(row.is_active),
    event_status: row.event_status || 'auto',
    sheet_sync_mode: master.configured ? master.mode : row.sheet_sync_mode || 'local',
    // 一般承辦人隱藏母試算表編輯連結，防止誤觸他人分頁；系統總管可檢視
    sheet_id: isSuper ? (master.sheetId || row.sheet_id || '') : '',
    sheet_url: isSuper ? (master.sheetUrl || row.sheet_url || '') : '',
    gas_webhook_url: isSuper ? (master.gasUrl || row.gas_webhook_url || '') : '',
    fields,
    registration_count: regCount,
    unpaid_count: stats?.unpaid_count || 0,
    paid_count: stats?.paid_count || 0,
    total_revenue: stats?.total_revenue || 0,
    sync_error_count: stats?.sync_error_count || 0,
    regState,
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

function buildUniqueTabName(rawName, eventId = null) {
  const base = sanitizeSheetTabName(rawName || '活動報名');
  const exists = db
    .prepare('SELECT id FROM events WHERE sheet_tab_name = ? AND id != ?')
    .get(base, Number(eventId || -1));
  if (!exists) return base;
  const suffix = `-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  return sanitizeSheetTabName(`${base.slice(0, 72)}${suffix}`);
}

// GET /api/admin/events/default-fields
router.get('/default-fields', (req, res) => {
  return res.json({
    fields: getDefaultRunningFields(),
    googleCredentials: sanitizeCredsForRole(req.admin.role),
    cloudSync: getCloudSyncStatus(),
  });
});

// GET /api/admin/events — 一般承辦人只列自己的活動；最高權限承辦人可檢視與管理全部活動
router.get('/', (req, res) => {
  const liveAdmin = getLiveAdmin(req);
  const rows =
    liveAdmin.role === 'super_admin'
      ? db.prepare('SELECT * FROM events ORDER BY created_at DESC, id DESC').all()
      : db
          .prepare(
            `SELECT * FROM events
             WHERE owner_admin_id = ? OR lower(owner_username) = lower(?)
             ORDER BY created_at DESC, id DESC`
          )
          .all(liveAdmin.id, liveAdmin.username || '');

  return res.json({
    events: rows.map((r) => formatEventRow(r, liveAdmin.role)),
    googleCredentials: sanitizeCredsForRole(liveAdmin.role),
    cloudSync: getCloudSyncStatus(),
    currentAdmin: liveAdmin,
  });
});

// GET /api/admin/events/:id
router.get('/:id', (req, res) => {
  const row = getOwnedEventOrDeny(req, res, req.params.id);
  if (!row) return;
  const liveAdmin = getLiveAdmin(req);
  const organizers =
    liveAdmin.role === 'super_admin'
      ? db.prepare('SELECT id, username, display_name, role FROM admins ORDER BY id ASC').all()
      : undefined;
  return res.json({
    event: formatEventRow(row, liveAdmin.role),
    googleCredentials: sanitizeCredsForRole(liveAdmin.role),
    cloudSync: getCloudSyncStatus(),
    currentAdmin: liveAdmin,
    organizers,
  });
});

// POST /api/admin/events — 建立活動報名表，自動指向平台統一資料庫，無需貼任何連結
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
  const formatLocalISO = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const defaultStart = formatLocalISO(now);
  const defaultEnd = formatLocalISO(new Date(now.getTime() + 30 * 86400000));
  const defaultEventDate = new Date(now.getTime() + 60 * 86400000).toISOString().slice(0, 10);

  const fields =
    Array.isArray(body.fields) && body.fields.length > 0
      ? body.fields
      : getDefaultRunningFields();

  // 自動指向平台統一單一 Google 試算表資料庫，無需每個活動輸入連結
  const master = getMasterDatabaseConfig();
  const sheetSyncMode = master.configured ? master.mode : 'local';
  const sheetId = master.sheetId || '';
  const sheetUrl = master.sheetUrl || '';
  const gasWebhookUrl = master.gasUrl || '';
  const sheetTabName = buildUniqueTabName(body.sheet_tab_name || name);

  const eventStatus = ['auto', 'preparing', 'open', 'closed'].includes(body.event_status)
    ? body.event_status
    : 'auto';
  const isActive = eventStatus === 'closed' ? 0 : body.is_active === false ? 0 : 1;

  const eventType = ['distance', 'lap_timed'].includes(body.event_type)
    ? body.event_type
    : 'distance';
  const timingEventId = String(body.timing_event_id || slug).trim();
  const timingPortalUrl = String(body.timing_portal_url || 'https://runchip-timing.vercel.app/').trim();
  const timingGasUrl = String(body.timing_gas_url || '').trim();

  const ownerRow = db.prepare('SELECT id, username, display_name FROM admins WHERE id = ?').get(req.admin.id);
  const ownerId = ownerRow?.id || req.admin.id;
  const ownerUsername = ownerRow?.username || req.admin.username;
  const ownerDisplayName = ownerRow?.display_name || req.admin.displayName || ownerUsername;

  const stmt = db.prepare(`
    INSERT INTO events (
      owner_admin_id, owner_username, owner_display_name,
      slug, name, english_name, event_type, timing_event_id, timing_portal_url, timing_gas_url,
      event_date, location, reg_start_at, reg_end_at,
      max_participants, is_active, event_status, banner_title, banner_subtitle,
      banner_image_url, description, payment_info,
      sheet_sync_mode, sheet_id, sheet_url, sheet_tab_name, gas_webhook_url, fields_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const englishName = String(body.english_name || '').trim() || generateEnglishEventName(name);

  const info = stmt.run(
    ownerId,
    ownerUsername,
    ownerDisplayName,
    slug,
    name,
    englishName,
    eventType,
    timingEventId,
    timingPortalUrl,
    timingGasUrl,
    String(body.event_date || defaultEventDate),
    String(body.location || ''),
    String(body.reg_start_at || defaultStart),
    String(body.reg_end_at || defaultEnd),
    Math.max(0, Number(body.max_participants || 0)),
    isActive,
    eventStatus,
    String(body.banner_title || name),
    String(body.banner_subtitle || '熱血開跑・歡迎報名參與'),
    String(
      body.banner_image_url ||
        'https://images.unsplash.com/photo-1513593771513-7b58b6c4af38?auto=format&fit=crop&w=1600&q=80'
    ),
    String(body.description || ''),
    String(body.payment_info || '報名完成後請依指定帳戶完成繳費，並保留報名序號以便核對與分配參賽編號。'),
    sheetSyncMode,
    sheetId,
    sheetUrl,
    sheetTabName,
    gasWebhookUrl,
    JSON.stringify(fields)
  );

  const created = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
  let sheetNotice = '';

  // 1. 立即同步活動結構至統一雲端資料庫 _DB_Events
  try {
    await syncEventToCloud(created);
  } catch (err) {
    db.prepare('DELETE FROM events WHERE id = ?').run(created.id);
    return res.status(503).json({ error: `無法寫入平台統一雲端資料庫：${err.message}` });
  }

  // 2. 若已設定統一 Google 試算表，自動在同份試算表建立該活動的專屬名單分頁與表頭
  if (master.configured) {
    try {
      await syncSheetHeaders(created, fields);
      db.prepare("UPDATE events SET last_sheet_sync_at = datetime('now', 'localtime') WHERE id = ?").run(created.id);
      const refreshed = db.prepare('SELECT * FROM events WHERE id = ?').get(created.id);
      await syncEventToCloud(refreshed).catch(() => {});
      sheetNotice = `並已自動於統一資料庫建立專屬分頁「${sheetTabName}」。`;
    } catch (err) {
      sheetNotice = `活動已建立，但專屬分頁表頭初始化提醒：${err.message}`;
    }
  }

  const latest = db.prepare('SELECT * FROM events WHERE id = ?').get(created.id);
  return res.status(201).json({
    event: formatEventRow(latest, req.admin.role),
    message: `活動「${name}」報名表建立成功！${sheetNotice}`,
  });
});

// PUT /api/admin/events/:id
router.put('/:id', async (req, res) => {
  const existing = getOwnedEventOrDeny(req, res, req.params.id);
  if (!existing) return;
  const id = existing.id;

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

  // 統一指向平台母資料庫；不接受外部更改分頁名稱，固定沿用建立時之分頁名稱
  const master = getMasterDatabaseConfig();
  const sheetSyncMode = master.configured ? master.mode : existing.sheet_sync_mode || 'local';
  const sheetId = master.configured ? master.sheetId : existing.sheet_id;
  const sheetUrl = master.configured ? master.sheetUrl : existing.sheet_url;
  const gasWebhookUrl = master.configured ? master.gasUrl : existing.gas_webhook_url;
  const sheetTabName = existing.sheet_tab_name || sanitizeSheetTabName(existing.name || name);

  const nextEventStatus = ['auto', 'preparing', 'open', 'closed'].includes(body.event_status)
    ? body.event_status
    : existing.event_status || 'auto';
  const nextIsActive =
    nextEventStatus === 'closed'
      ? 0
      : body.is_active !== undefined
      ? body.is_active
        ? 1
        : 0
      : 1;

  const nextEventType = ['distance', 'lap_timed'].includes(body.event_type)
    ? body.event_type
    : existing.event_type || 'distance';

  // 若為最高權限承辦人，允許變更此活動所屬的承辦人帳號
  const liveAdmin = getLiveAdmin(req);
  let nextOwnerId = existing.owner_admin_id;
  let nextOwnerUsername = existing.owner_username;
  let nextOwnerDisplayName = existing.owner_display_name;
  if (liveAdmin.role === 'super_admin' && body.owner_admin_id !== undefined) {
    const newOwner = db
      .prepare('SELECT id, username, display_name FROM admins WHERE id = ?')
      .get(Number(body.owner_admin_id));
    if (newOwner) {
      nextOwnerId = newOwner.id;
      nextOwnerUsername = newOwner.username;
      nextOwnerDisplayName = newOwner.display_name;
    }
  }

  db.prepare(`
    UPDATE events SET
      owner_admin_id = ?,
      owner_username = ?,
      owner_display_name = ?,
      slug = ?,
      name = ?,
      english_name = ?,
      event_type = ?,
      timing_event_id = ?,
      timing_portal_url = ?,
      timing_gas_url = ?,
      event_date = ?,
      location = ?,
      reg_start_at = ?,
      reg_end_at = ?,
      max_participants = ?,
      is_active = ?,
      event_status = ?,
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
    nextOwnerId,
    nextOwnerUsername,
    nextOwnerDisplayName,
    slug,
    name,
    body.english_name !== undefined ? String(body.english_name).trim() : existing.english_name || '',
    nextEventType,
    // 晶片系統活動代碼與前台網址鎖定唯讀不可修改；僅保留 GAS 同步網址可修改供未來運用
    existing.timing_event_id || slug,
    existing.timing_portal_url || 'https://runchip-timing.vercel.app/',
    body.timing_gas_url !== undefined ? String(body.timing_gas_url).trim() : existing.timing_gas_url || '',
    body.event_date !== undefined ? String(body.event_date) : existing.event_date,
    body.location !== undefined ? String(body.location) : existing.location,
    body.reg_start_at !== undefined ? String(body.reg_start_at) : existing.reg_start_at,
    body.reg_end_at !== undefined ? String(body.reg_end_at) : existing.reg_end_at,
    body.max_participants !== undefined ? Math.max(0, Number(body.max_participants || 0)) : existing.max_participants,
    nextIsActive,
    nextEventStatus,
    body.banner_title !== undefined ? String(body.banner_title) : existing.banner_title,
    body.banner_subtitle !== undefined ? String(body.banner_subtitle) : existing.banner_subtitle,
    body.banner_image_url !== undefined ? String(body.banner_image_url) : existing.banner_image_url,
    body.description !== undefined ? String(body.description) : existing.description,
    body.payment_info !== undefined ? String(body.payment_info) : existing.payment_info,
    sheetSyncMode,
    sheetId,
    sheetUrl,
    sheetTabName,
    gasWebhookUrl,
    JSON.stringify(fields),
    id
  );

  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  let headerSyncResult = { synced: false, skipped: true };
  let headerSyncWarning = '';

  // 同步活動設定至統一雲端資料庫 _DB_Events
  try {
    await syncEventToCloud(updated);
  } catch (err) {
    return res.status(503).json({ error: `同步活動設定至統一雲端資料庫失敗：${err.message}` });
  }

  // 若有修改欄位或要求同步表頭，自動對齊更新專屬分頁第一列
  if (master.configured && (body.fields !== undefined || body.syncHeaders === true)) {
    try {
      headerSyncResult = await syncSheetHeaders(updated, fields);
      db.prepare("UPDATE events SET last_sheet_sync_at = datetime('now', 'localtime') WHERE id = ?").run(id);
      const refreshed = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
      await syncEventToCloud(refreshed).catch(() => {});
    } catch (err) {
      headerSyncWarning = err.message;
    }
  }

  const latest = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  return res.json({
    event: formatEventRow(latest, req.admin.role),
    headerSync: headerSyncResult,
    warning: headerSyncWarning || undefined,
    message: headerSyncWarning
      ? `活動設定已儲存，但試算表分頁表頭同步提醒：${headerSyncWarning}`
      : '活動設定已儲存至統一雲端資料庫！' + (headerSyncResult.synced ? '（已同步更新專屬分頁表頭）' : ''),
  });
});

// PATCH /api/admin/events/:id/status — 一鍵切換活動狀態（auto / preparing / open / closed）
router.patch('/:id/status', async (req, res) => {
  const existing = getOwnedEventOrDeny(req, res, req.params.id);
  if (!existing) return;

  const nextStatus = String(req.body?.event_status || '').trim().toLowerCase();
  if (!['auto', 'preparing', 'open', 'closed'].includes(nextStatus)) {
    return res.status(400).json({ error: '無效的活動狀態，僅支援：auto、preparing、open、closed。' });
  }

  const nextActive = nextStatus === 'closed' ? 0 : 1;
  db.prepare(
    "UPDATE events SET event_status = ?, is_active = ?, updated_at = datetime('now', 'localtime') WHERE id = ?"
  ).run(nextStatus, nextActive, existing.id);

  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(existing.id);
  await syncEventToCloud(updated).catch(() => {});

  const labels = {
    auto: '自動（依報名起訖日期判斷）',
    preparing: '籌備中',
    open: '開放中',
    closed: '已結案',
  };

  return res.json({
    event: formatEventRow(updated, req.admin.role),
    message: `活動狀態已切換為「${labels[nextStatus]}」。`,
  });
});

// PATCH /api/admin/events/:id/toggle — 向下相容快速開關（切換 開放中 <-> 已結案）
router.patch('/:id/toggle', async (req, res) => {
  const existing = getOwnedEventOrDeny(req, res, req.params.id);
  if (!existing) return;

  const isCurrentlyClosed = !existing.is_active || existing.event_status === 'closed';
  const nextActive = isCurrentlyClosed ? 1 : 0;
  const nextStatus = isCurrentlyClosed ? 'auto' : 'closed';

  db.prepare(
    "UPDATE events SET is_active = ?, event_status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?"
  ).run(nextActive, nextStatus, existing.id);

  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(existing.id);
  await syncEventToCloud(updated).catch(() => {});

  return res.json({
    event: formatEventRow(updated, req.admin.role),
    message: nextActive ? '活動已恢復啟用（依報名日期自動開放）。' : '活動已切換為「已結案」。',
  });
});

// DELETE /api/admin/events/:id
router.delete('/:id', async (req, res) => {
  const existing = getOwnedEventOrDeny(req, res, req.params.id);
  if (!existing) return;

  db.prepare('DELETE FROM events WHERE id = ?').run(existing.id);
  await deleteEventFromCloud(existing.id);
  return res.json({ message: `活動「${existing.name}」已刪除。` });
});

// POST /api/admin/events/:id/upload-banner
router.post('/:id/upload-banner', (req, res) => {
  const existing = getOwnedEventOrDeny(req, res, req.params.id);
  if (!existing) return;

  upload.single('banner')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || '圖片上傳失敗。' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '請選擇要上傳的橫幅圖片檔案。' });
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    db.prepare("UPDATE events SET banner_image_url = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(
      imageUrl,
      existing.id
    );
    const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(existing.id);
    await syncEventToCloud(updated).catch(() => {});

    return res.json({
      banner_image_url: imageUrl,
      message: process.env.VERCEL
        ? '橫幅已套用（提醒：雲端網路版建議使用公開圖片網址或內建精選橫幅，以確保圖片長期顯示不失效）。'
        : '橫幅圖片上傳成功！',
    });
  });
});

// POST /api/admin/events/:id/sheets/test — 測試平台統一雲端試算表連線
router.post('/:id/sheets/test', async (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.id);
  if (!event) return;

  try {
    const testTarget = {
      ...event,
      sheet_tab_name: req.body?.sheet_tab_name || event.sheet_tab_name || event.name,
    };
    const result = await testSheetConnection(testTarget);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// POST /api/admin/events/:id/sheets/sync-headers — 在統一試算表初始化或對齊此活動的專屬分頁表頭
router.post('/:id/sheets/sync-headers', async (req, res) => {
  const event = getOwnedEventOrDeny(req, res, req.params.id);
  if (!event) return;

  const fields = JSON.parse(event.fields_json || '[]');
  try {
    const result = await syncSheetHeaders(event, fields);
    db.prepare("UPDATE events SET last_sheet_sync_at = datetime('now', 'localtime') WHERE id = ?").run(event.id);
    const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(event.id);
    await syncEventToCloud(updated).catch(() => {});
    return res.json({
      ...result,
      message: `已成功於平台統一試算表同步專屬分頁「${event.sheet_tab_name}」表頭！`,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
