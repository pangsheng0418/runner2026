const { google } = require('googleapis');
const { db } = require('../db');
const {
  getServiceAccountAuth,
  getMasterDatabaseConfig,
  ensureWorksheetTab,
  colNumberToLetter,
  callGasWebhook,
  formatGoogleError,
} = require('./googleSheets');

const TAB_ADMINS = '_DB_Admins';
const TAB_EVENTS = '_DB_Events';
const TAB_REGISTRATIONS = '_DB_Registrations';

const ADMIN_COLS = ['id', 'username', 'password_hash', 'display_name', 'role', 'created_at'];

const EVENT_COLS = [
  'id',
  'owner_admin_id',
  'owner_username',
  'owner_display_name',
  'slug',
  'name',
  'english_name',
  'event_type',
  'timing_event_id',
  'timing_portal_url',
  'timing_gas_url',
  'event_date',
  'location',
  'reg_start_at',
  'reg_end_at',
  'max_participants',
  'is_active',
  'event_status',
  'banner_title',
  'banner_subtitle',
  'banner_image_url',
  'description',
  'payment_info',
  'sheet_sync_mode',
  'sheet_id',
  'sheet_url',
  'sheet_tab_name',
  'gas_webhook_url',
  'fields_json',
  'last_sheet_sync_at',
  'created_at',
  'updated_at',
];

const REG_COLS = [
  'id',
  'event_id',
  'reg_code',
  'bib_number',
  'category_code',
  'runner_name',
  'runner_id_number',
  'runner_email',
  'runner_phone',
  'answers_json',
  'price_breakdown_json',
  'total_amount',
  'payment_status',
  'remittance_last5',
  'reg_type',
  'group_name',
  'group_code',
  'payment_mode',
  'sheet_sync_status',
  'sheet_sync_error',
  'sheet_row_number',
  'created_at',
  'group_role',
  'bundle_code',
];

const SYNC_TTL_MS = Number(process.env.CLOUD_SYNC_TTL_MS || 8000);

let lastCloudSyncAt = 0;
let lastCloudSyncError = '';
let inflightSyncPromise = null;

function rowObjToArray(cols, obj) {
  return cols.map((col) => {
    const val = obj?.[col];
    if (val === undefined || val === null) return '';
    if (typeof val === 'boolean') return val ? '1' : '0';
    return String(val);
  });
}

function sheetValuesToObjects(cols, values) {
  if (!Array.isArray(values) || values.length < 2) return [];
  const headerRow = values[0].map((v) => String(v || '').trim());
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    const obj = {};
    let hasAnyValue = false;
    headerRow.forEach((h, idx) => {
      const cell = row[idx] !== undefined && row[idx] !== null ? String(row[idx]) : '';
      if (cell !== '') hasAnyValue = true;
      obj[h] = cell;
    });
    if (!hasAnyValue) continue;
    // 確保所有預期欄位皆有鍵值
    for (const c of cols) {
      if (obj[c] === undefined) obj[c] = '';
    }
    out.push(obj);
  }
  return out;
}

/**
 * 確保統一 Google 試算表的三個核心資料庫分頁與表頭存在（API 模式）
 */
async function ensureSystemTabsApi(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTitles = new Set((meta.data.sheets || []).map((s) => s.properties?.title));
  const needed = [
    { title: TAB_ADMINS, cols: ADMIN_COLS },
    { title: TAB_EVENTS, cols: EVENT_COLS },
    { title: TAB_REGISTRATIONS, cols: REG_COLS },
  ];

  const addRequests = [];
  for (const item of needed) {
    if (!existingTitles.has(item.title)) {
      addRequests.push({
        addSheet: {
          properties: {
            title: item.title,
            gridProperties: { frozenRowCount: 1 },
          },
        },
      });
    }
  }

  if (addRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: addRequests },
    });
  }

  // 確保表頭完整
  const ranges = needed.map((n) => `'${n.title}'!1:1`);
  const headerBatch = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges });
  const valueRanges = headerBatch.data.valueRanges || [];
  const updates = [];

  needed.forEach((item, idx) => {
    const existingHeader = valueRanges[idx]?.values?.[0] || [];
    if (existingHeader.length < item.cols.length) {
      updates.push({
        range: `'${item.title}'!A1:${colNumberToLetter(item.cols.length)}1`,
        values: [item.cols],
      });
    }
  });

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: updates,
      },
    });
  }
}

/**
 * 從統一 Google 試算表讀取三張核心表
 */
async function fetchAllTablesFromCloud(master) {
  if (master.mode === 'webhook') {
    const res = await callGasWebhook(master.gasUrl, {
      action: 'db_pull_all',
      tables: {
        admins: { tabName: TAB_ADMINS, headers: ADMIN_COLS },
        events: { tabName: TAB_EVENTS, headers: EVENT_COLS },
        registrations: { tabName: TAB_REGISTRATIONS, headers: REG_COLS },
      },
    });
    return {
      admins: Array.isArray(res.admins) ? res.admins : [],
      events: Array.isArray(res.events) ? res.events : [],
      registrations: Array.isArray(res.registrations) ? res.registrations : [],
    };
  }

  const auth = getServiceAccountAuth();
  if (!auth || !master.sheetId) {
    throw new Error('缺少統一 Google 試算表憑證或試算表 ID。');
  }
  const sheets = google.sheets({ version: 'v4', auth });
  await ensureSystemTabsApi(sheets, master.sheetId);

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: master.sheetId,
    ranges: [`'${TAB_ADMINS}'!A:Z`, `'${TAB_EVENTS}'!A:AZ`, `'${TAB_REGISTRATIONS}'!A:AZ`],
  });

  const valueRanges = res.data.valueRanges || [];
  return {
    admins: sheetValuesToObjects(ADMIN_COLS, valueRanges[0]?.values || []),
    events: sheetValuesToObjects(EVENT_COLS, valueRanges[1]?.values || []),
    registrations: sheetValuesToObjects(REG_COLS, valueRanges[2]?.values || []),
  };
}

/**
 * 首次初始化統一雲端試算表：將本地種子資料推送至雲端
 */
async function seedLocalTablesToCloud(master) {
  const admins = db.prepare('SELECT * FROM admins ORDER BY id ASC').all();
  const events = db.prepare('SELECT * FROM events ORDER BY id ASC').all();
  const registrations = db.prepare('SELECT * FROM registrations ORDER BY id ASC').all();

  if (master.mode === 'webhook') {
    await callGasWebhook(master.gasUrl, {
      action: 'db_replace_all',
      tables: {
        admins: { tabName: TAB_ADMINS, headers: ADMIN_COLS, rows: admins.map((r) => rowObjToArray(ADMIN_COLS, r)) },
        events: { tabName: TAB_EVENTS, headers: EVENT_COLS, rows: events.map((r) => rowObjToArray(EVENT_COLS, r)) },
        registrations: {
          tabName: TAB_REGISTRATIONS,
          headers: REG_COLS,
          rows: registrations.map((r) => rowObjToArray(REG_COLS, r)),
        },
      },
    });
    return;
  }

  const auth = getServiceAccountAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  await ensureSystemTabsApi(sheets, master.sheetId);

  const data = [
    {
      range: `'${TAB_ADMINS}'!A1:${colNumberToLetter(ADMIN_COLS.length)}${admins.length + 1}`,
      values: [ADMIN_COLS, ...admins.map((r) => rowObjToArray(ADMIN_COLS, r))],
    },
    {
      range: `'${TAB_EVENTS}'!A1:${colNumberToLetter(EVENT_COLS.length)}${events.length + 1}`,
      values: [EVENT_COLS, ...events.map((r) => rowObjToArray(EVENT_COLS, r))],
    },
    {
      range: `'${TAB_REGISTRATIONS}'!A1:${colNumberToLetter(REG_COLS.length)}${registrations.length + 1}`,
      values: [REG_COLS, ...registrations.map((r) => rowObjToArray(REG_COLS, r))],
    },
  ];

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: master.sheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data,
    },
  });
}

/**
 * 將從雲端拉回來的資料同步至本地 SQLite 快取
 */
function hydrateLocalSqliteFromCloud({ admins, events, registrations }, master) {
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN TRANSACTION;');
  try {
    db.exec('DELETE FROM registrations;');
    db.exec('DELETE FROM events;');
    db.exec('DELETE FROM admins;');

    const insertAdmin = db.prepare(`
      INSERT INTO admins (id, username, password_hash, display_name, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const a of admins) {
      const id = Number(a.id);
      if (!id || !a.username) continue;
      insertAdmin.run(
        id,
        String(a.username),
        String(a.password_hash || ''),
        String(a.display_name || a.username),
        String(a.role || 'organizer'),
        String(a.created_at || new Date().toISOString())
      );
    }

    const insertEvent = db.prepare(`
      INSERT INTO events (
        id, owner_admin_id, owner_username, owner_display_name,
        slug, name, english_name, event_type, timing_event_id, timing_portal_url, timing_gas_url,
        event_date, location, reg_start_at, reg_end_at,
        max_participants, is_active, event_status, banner_title, banner_subtitle,
        banner_image_url, description, payment_info,
        sheet_sync_mode, sheet_id, sheet_url, sheet_tab_name, gas_webhook_url,
        fields_json, last_sheet_sync_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const ev of events) {
      const id = Number(ev.id);
      if (!id || !ev.slug) continue;
      insertEvent.run(
        id,
        Number(ev.owner_admin_id || 1),
        String(ev.owner_username || 'admin'),
        String(ev.owner_display_name || ''),
        String(ev.slug),
        String(ev.name || ''),
        String(ev.english_name || ''),
        String(ev.event_type || 'distance'),
        String(ev.timing_event_id || ev.slug),
        String(ev.timing_portal_url || 'https://runchip-timing.vercel.app/'),
        String(ev.timing_gas_url || ''),
        String(ev.event_date || ''),
        String(ev.location || ''),
        String(ev.reg_start_at || ''),
        String(ev.reg_end_at || ''),
        Number(ev.max_participants || 0),
        ev.is_active === '0' || ev.is_active === 'false' ? 0 : 1,
        String(ev.event_status || 'auto'),
        String(ev.banner_title || ev.name || ''),
        String(ev.banner_subtitle || ''),
        String(ev.banner_image_url || ''),
        String(ev.description || ''),
        String(ev.payment_info || ''),
        master.mode,
        master.sheetId || String(ev.sheet_id || ''),
        master.sheetUrl || String(ev.sheet_url || ''),
        String(ev.sheet_tab_name || ev.name || '報名資料'),
        master.gasUrl || String(ev.gas_webhook_url || ''),
        String(ev.fields_json || '[]'),
        ev.last_sheet_sync_at || null,
        String(ev.created_at || new Date().toISOString()),
        String(ev.updated_at || new Date().toISOString())
      );
    }

    const insertReg = db.prepare(`
      INSERT INTO registrations (
        id, event_id, reg_code, bib_number, category_code,
        runner_name, runner_id_number, runner_email, runner_phone,
        answers_json, price_breakdown_json, total_amount, payment_status, remittance_last5,
        reg_type, group_name, group_code, group_role, bundle_code, payment_mode,
        sheet_sync_status, sheet_sync_error, sheet_row_number, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const r of registrations) {
      const id = Number(r.id);
      const eventId = Number(r.event_id);
      if (!id || !eventId || !r.reg_code) continue;
      insertReg.run(
        id,
        eventId,
        String(r.reg_code),
        String(r.bib_number || ''),
        String(r.category_code || ''),
        String(r.runner_name || ''),
        String(r.runner_id_number || ''),
        String(r.runner_email || ''),
        String(r.runner_phone || ''),
        String(r.answers_json || '{}'),
        String(r.price_breakdown_json || '[]'),
        Number(r.total_amount || 0),
        String(r.payment_status || '待繳費'),
        String(r.remittance_last5 || ''),
        String(r.reg_type || 'individual'),
        String(r.group_name || ''),
        String(r.group_code || ''),
        String(r.group_role || ''),
        String(r.bundle_code || ''),
        String(r.payment_mode || 'individual'),
        String(r.sheet_sync_status || 'synced'),
        String(r.sheet_sync_error || ''),
        r.sheet_row_number ? Number(r.sheet_row_number) : null,
        String(r.created_at || new Date().toISOString())
      );
    }

    // 同步 SQLite 自增序號，避免新增時 ID 衝突
    const tables = [
      { name: 'admins', rows: admins },
      { name: 'events', rows: events },
      { name: 'registrations', rows: registrations },
    ];
    for (const t of tables) {
      const maxId = t.rows.reduce((acc, item) => Math.max(acc, Number(item.id || 0)), 0);
      if (maxId > 0) {
        const existsSeq = db.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(t.name);
        if (existsSeq) {
          db.prepare('UPDATE sqlite_sequence SET seq = ? WHERE name = ?').run(maxId, t.name);
        } else {
          db.prepare('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)').run(t.name, maxId);
        }
      }
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

/**
 * 確保本地 SQLite 與統一雲端 Google 試算表保持最新同步（附帶 TTL 防抖）
 */
async function ensureCloudSynced({ force = false } = {}) {
  const master = getMasterDatabaseConfig();
  if (!master.configured) {
    return { synced: false, mode: 'local' };
  }

  const now = Date.now();
  if (!force && lastCloudSyncAt > 0 && now - lastCloudSyncAt < SYNC_TTL_MS) {
    return { synced: true, cached: true, mode: master.mode };
  }

  if (inflightSyncPromise) {
    return inflightSyncPromise;
  }

  inflightSyncPromise = (async () => {
    try {
      const cloudData = await fetchAllTablesFromCloud(master);
      const isCloudEmpty = cloudData.admins.length === 0 && cloudData.events.length === 0;
      if (isCloudEmpty) {
        await seedLocalTablesToCloud(master);
      } else {
        hydrateLocalSqliteFromCloud(cloudData, master);
      }
      lastCloudSyncAt = Date.now();
      lastCloudSyncError = '';
      return { synced: true, mode: master.mode };
    } catch (err) {
      lastCloudSyncError = err.message || String(err);
      console.error('[CloudStore] 從統一 Google 試算表同步失敗：', lastCloudSyncError);
      return { synced: false, mode: master.mode, error: lastCloudSyncError };
    } finally {
      inflightSyncPromise = null;
    }
  })();

  return inflightSyncPromise;
}

/**
 * 將單筆紀錄寫入（Upsert）統一 Google 試算表指定系統表
 */
async function upsertRowInCloudTable(tabName, cols, rowObj, keyField = 'id') {
  const master = getMasterDatabaseConfig();
  if (!master.configured) return { skipped: true };

  const rowValues = rowObjToArray(cols, rowObj);
  const keyVal = String(rowObj[keyField] ?? '');

  if (master.mode === 'webhook') {
    await callGasWebhook(master.gasUrl, {
      action: 'db_upsert_row',
      tabName,
      headers: cols,
      keyField,
      keyValue: keyVal,
      rowValues,
    });
    lastCloudSyncAt = Date.now();
    return { synced: true };
  }

  const auth = getServiceAccountAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  await ensureWorksheetTab(sheets, master.sheetId, tabName);

  const keyColIdx = cols.indexOf(keyField);
  const keyColLetter = colNumberToLetter(keyColIdx + 1);
  const existingColRes = await sheets.spreadsheets.values.get({
    spreadsheetId: master.sheetId,
    range: `'${tabName}'!${keyColLetter}:${keyColLetter}`,
  });

  const colVals = existingColRes.data.values || [];
  if (colVals.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: master.sheetId,
      range: `'${tabName}'!A1:${colNumberToLetter(cols.length)}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [cols] },
    });
  }

  const foundRowIdx = colVals.findIndex((r, idx) => idx > 0 && String(r[0] || '') === keyVal);
  if (foundRowIdx !== -1) {
    const rowNumber = foundRowIdx + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId: master.sheetId,
      range: `'${tabName}'!A${rowNumber}:${colNumberToLetter(cols.length)}${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [rowValues] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: master.sheetId,
      range: `'${tabName}'!A:${colNumberToLetter(cols.length)}`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });
  }

  lastCloudSyncAt = Date.now();
  return { synced: true };
}

/**
 * 刪除統一 Google 試算表指定系統表的對應列（以 keyField 比對，支援多列刪除如 event_id）
 */
async function deleteRowsFromCloudTable(tabName, cols, keyField, keyValue) {
  const master = getMasterDatabaseConfig();
  if (!master.configured) return { skipped: true };

  const keyVal = String(keyValue ?? '');
  if (master.mode === 'webhook') {
    await callGasWebhook(master.gasUrl, {
      action: 'db_delete_rows',
      tabName,
      keyField,
      keyValue: keyVal,
    });
    lastCloudSyncAt = Date.now();
    return { synced: true };
  }

  const auth = getServiceAccountAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: master.sheetId });
  const sheetObj = (meta.data.sheets || []).find((s) => s.properties?.title === tabName);
  if (!sheetObj) return { skipped: true };
  const sheetGid = sheetObj.properties.sheetId;

  const keyColIdx = cols.indexOf(keyField);
  const keyColLetter = colNumberToLetter(keyColIdx + 1);
  const colRes = await sheets.spreadsheets.values.get({
    spreadsheetId: master.sheetId,
    range: `'${tabName}'!${keyColLetter}:${keyColLetter}`,
  });

  const colVals = colRes.data.values || [];
  const matchingIndices = [];
  for (let i = 1; i < colVals.length; i++) {
    if (String(colVals[i]?.[0] || '') === keyVal) {
      matchingIndices.push(i);
    }
  }
  if (matchingIndices.length === 0) return { synced: true, deleted: 0 };

  // 由下往上刪，避免索引位移
  const requests = matchingIndices
    .sort((a, b) => b - a)
    .map((idx) => ({
      deleteDimension: {
        range: {
          sheetId: sheetGid,
          dimension: 'ROWS',
          startIndex: idx,
          endIndex: idx + 1,
        },
      },
    }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: master.sheetId,
    requestBody: { requests },
  });

  lastCloudSyncAt = Date.now();
  return { synced: true, deleted: matchingIndices.length };
}

/**
 * 將單一系統表整張重寫至雲端（用於批次配號或批次拉取後同步）
 */
async function flushTableToCloud(tabName, cols, rows) {
  const master = getMasterDatabaseConfig();
  if (!master.configured) return { skipped: true };

  const matrix = rows.map((r) => rowObjToArray(cols, r));
  if (master.mode === 'webhook') {
    await callGasWebhook(master.gasUrl, {
      action: 'db_replace_table',
      tabName,
      headers: cols,
      rows: matrix,
    });
    lastCloudSyncAt = Date.now();
    return { synced: true };
  }

  const auth = getServiceAccountAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  await ensureWorksheetTab(sheets, master.sheetId, tabName);
  await sheets.spreadsheets.values.clear({
    spreadsheetId: master.sheetId,
    range: `'${tabName}'!A:AZ`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: master.sheetId,
    range: `'${tabName}'!A1:${colNumberToLetter(cols.length)}${matrix.length + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: [cols, ...matrix] },
  });
  lastCloudSyncAt = Date.now();
  return { synced: true };
}

async function syncAdminToCloud(adminRow) {
  try {
    return await upsertRowInCloudTable(TAB_ADMINS, ADMIN_COLS, adminRow, 'id');
  } catch (err) {
    console.error('[CloudStore] 寫入承辦人資料至雲端失敗：', err.message);
    throw new Error(formatGoogleError(err));
  }
}

async function deleteAdminFromCloud(adminId) {
  try {
    return await deleteRowsFromCloudTable(TAB_ADMINS, ADMIN_COLS, 'id', adminId);
  } catch (err) {
    console.error('[CloudStore] 刪除雲端承辦人資料失敗：', err.message);
    return { synced: false, error: err.message };
  }
}

async function syncEventToCloud(eventRow) {
  try {
    return await upsertRowInCloudTable(TAB_EVENTS, EVENT_COLS, eventRow, 'id');
  } catch (err) {
    console.error('[CloudStore] 寫入活動資料至雲端失敗：', err.message);
    throw new Error(formatGoogleError(err));
  }
}

async function deleteEventFromCloud(eventId) {
  try {
    await deleteRowsFromCloudTable(TAB_EVENTS, EVENT_COLS, 'id', eventId);
    await deleteRowsFromCloudTable(TAB_REGISTRATIONS, REG_COLS, 'event_id', eventId);
    return { synced: true };
  } catch (err) {
    console.error('[CloudStore] 刪除雲端活動資料失敗：', err.message);
    return { synced: false, error: err.message };
  }
}

async function syncRegistrationToCloud(regRow) {
  try {
    return await upsertRowInCloudTable(TAB_REGISTRATIONS, REG_COLS, regRow, 'id');
  } catch (err) {
    console.error('[CloudStore] 寫入報名資料至雲端失敗：', err.message);
    return { synced: false, error: err.message };
  }
}

async function syncAllRegistrationsToCloud() {
  try {
    const allRegs = db.prepare('SELECT * FROM registrations ORDER BY id ASC').all();
    return await flushTableToCloud(TAB_REGISTRATIONS, REG_COLS, allRegs);
  } catch (err) {
    console.error('[CloudStore] 批次寫入報名資料至雲端失敗：', err.message);
    return { synced: false, error: err.message };
  }
}

async function syncAllTablesToCloud() {
  const master = getMasterDatabaseConfig();
  if (!master.configured) return { skipped: true };
  try {
    await seedLocalTablesToCloud(master);
    lastCloudSyncAt = Date.now();
    lastCloudSyncError = '';
    return { synced: true };
  } catch (err) {
    lastCloudSyncError = err.message || String(err);
    console.error('[CloudStore] 同步全表至雲端失敗：', lastCloudSyncError);
    return { synced: false, error: lastCloudSyncError };
  }
}

function getCloudSyncStatus() {
  const master = getMasterDatabaseConfig();
  return {
    configured: master.configured,
    mode: master.mode,
    lastSyncAt: lastCloudSyncAt ? new Date(lastCloudSyncAt).toISOString() : null,
    lastError: lastCloudSyncError || null,
  };
}

module.exports = {
  TAB_ADMINS,
  TAB_EVENTS,
  TAB_REGISTRATIONS,
  ensureCloudSynced,
  syncAdminToCloud,
  deleteAdminFromCloud,
  syncEventToCloud,
  deleteEventFromCloud,
  syncRegistrationToCloud,
  syncAllRegistrationsToCloud,
  syncAllTablesToCloud,
  getCloudSyncStatus,
};
