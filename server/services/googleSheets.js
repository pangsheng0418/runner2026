const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SYSTEM_HEADERS = [
  '報名序號',
  '報名類型',
  '團體名稱',
  '團報代碼',
  '團報角色',
  '合併單號',
  '參賽編號',
  '分組代碼',
  '報名時間',
  '應繳總金額',
  '匯款方式',
  '匯款後五碼',
  '繳費狀態',
];

/**
 * 從完整 Google Sheets 網址或純 ID 擷取 Spreadsheet ID
 */
function extractSpreadsheetId(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/\/spreadsheets\/d\/e\//.test(raw)) {
    throw new Error(
      '您貼的是「發布到網路」連結（/d/e/...），無法寫入資料。請改貼瀏覽器最上方網址列的正式試算表網址（/spreadsheets/d/試算表ID/edit）。'
    );
  }
  const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return raw;
}

/**
 * 清理環境變數中誤貼的頭尾引號、逗號與多餘空白
 */
function stripWrappingQuotes(raw) {
  let s = String(raw || '').trim();
  if (s.endsWith(',')) s = s.slice(0, -1).trim();
  while (
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
  ) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^["']+/, '').replace(/["',]+$/, '').trim();
  return s;
}

/**
 * 清理並正規化 PEM 私鑰格式（自動處理引號、逗號、\n 與 \\n）
 */
function normalizePrivateKey(raw) {
  let key = stripWrappingQuotes(raw);
  key = key.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  return key ? `${key}\n` : '';
}

/**
 * 檢查系統是否已設定 Google Service Account 憑證
 */
function getServiceAccountAuth() {
  const keyPathEnv = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const fullJsonEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const emailEnv = stripWrappingQuotes(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKeyEnv = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);

  const scopes = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
  ];

  // 方式 0：整份 JSON 貼在環境變數 GOOGLE_SERVICE_ACCOUNT_JSON
  if (fullJsonEnv) {
    try {
      const parsed = JSON.parse(fullJsonEnv);
      if (parsed.client_email && parsed.private_key) {
        return new google.auth.JWT({
          email: stripWrappingQuotes(parsed.client_email),
          key: normalizePrivateKey(parsed.private_key),
          scopes,
        });
      }
    } catch (_) {
      // ignore invalid json
    }
  }

  // 方式 1：使用環境變數直接設定
  if (emailEnv && privateKeyEnv) {
    return new google.auth.JWT({
      email: emailEnv,
      key: privateKeyEnv,
      scopes,
    });
  }

  // 方式 2：讀取本地 JSON 金鑰檔
  if (keyPathEnv) {
    const resolved = path.isAbsolute(keyPathEnv)
      ? keyPathEnv
      : path.resolve(__dirname, '..', '..', keyPathEnv);
    if (fs.existsSync(resolved)) {
      return new google.auth.GoogleAuth({
        keyFile: resolved,
        scopes,
      });
    }
  }

  // 預設檢查 credentials/google-service-account.json
  const defaultPath = path.resolve(__dirname, '..', '..', 'credentials', 'google-service-account.json');
  if (fs.existsSync(defaultPath)) {
    return new google.auth.GoogleAuth({
      keyFile: defaultPath,
      scopes,
    });
  }

  return null;
}

function getMasterDatabaseConfig() {
  const auth = getServiceAccountAuth();
  const masterSheetRaw = stripWrappingQuotes(
    process.env.GOOGLE_MASTER_SHEET_ID || process.env.GOOGLE_MASTER_SHEET_URL
  );
  let masterSheetId = '';
  try {
    masterSheetId = extractSpreadsheetId(masterSheetRaw);
  } catch (_) {
    masterSheetId = '';
  }

  const masterGasUrl = stripWrappingQuotes(process.env.GOOGLE_MASTER_GAS_URL);

  if (auth && masterSheetId) {
    return {
      configured: true,
      mode: 'api',
      sheetId: masterSheetId,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${masterSheetId}/edit`,
      gasUrl: '',
    };
  }

  if (masterGasUrl) {
    return {
      configured: true,
      mode: 'webhook',
      sheetId: masterSheetId,
      sheetUrl: masterSheetId ? `https://docs.google.com/spreadsheets/d/${masterSheetId}/edit` : '',
      gasUrl: masterGasUrl,
    };
  }

  return {
    configured: false,
    mode: 'local',
    sheetId: masterSheetId,
    sheetUrl: masterSheetId ? `https://docs.google.com/spreadsheets/d/${masterSheetId}/edit` : '',
    gasUrl: '',
  };
}

/**
 * 將活動解析為統一母試算表設定（無需每個活動各建連結）
 */
function resolveEffectiveSheetTarget(event = {}) {
  const master = getMasterDatabaseConfig();
  if (master.configured) {
    return {
      mode: master.mode,
      sheetId: master.sheetId,
      sheetUrl: master.sheetUrl,
      gasUrl: master.gasUrl,
      tabName: sanitizeSheetTabName(event.sheet_tab_name || event.name || '報名資料'),
    };
  }

  // 若尚未設定平台統一母試算表，仍向下相容既有活動綁定
  const mode = event.sheet_sync_mode || 'local';
  let sheetId = '';
  try {
    sheetId = extractSpreadsheetId(event.sheet_id || event.sheet_url);
  } catch (_) {
    sheetId = '';
  }
  return {
    mode,
    sheetId,
    sheetUrl: event.sheet_url || (sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : ''),
    gasUrl: stripWrappingQuotes(event.gas_webhook_url),
    tabName: sanitizeSheetTabName(event.sheet_tab_name || event.name || '報名資料'),
  };
}

function getCredentialsStatus() {
  const auth = getServiceAccountAuth();
  let serviceAccountEmail = stripWrappingQuotes(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);

  if (!serviceAccountEmail && process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      serviceAccountEmail = stripWrappingQuotes(parsed.client_email);
    } catch (_) {
      // ignore
    }
  }

  if (!serviceAccountEmail) {
    const keyPathEnv = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './credentials/google-service-account.json';
    const resolved = path.isAbsolute(keyPathEnv)
      ? keyPathEnv
      : path.resolve(__dirname, '..', '..', keyPathEnv);
    if (fs.existsSync(resolved)) {
      try {
        const json = JSON.parse(fs.readFileSync(resolved, 'utf8'));
        serviceAccountEmail = stripWrappingQuotes(json.client_email);
      } catch (_) {
        // ignore parse errors
      }
    }
  }

  const master = getMasterDatabaseConfig();

  return {
    configured: Boolean(auth),
    serviceAccountEmail,
    autoShareEmail: stripWrappingQuotes(process.env.GOOGLE_AUTO_SHARE_EMAIL),
    masterSheetConfigured: Boolean(master.sheetId),
    masterSheetId: master.sheetId,
    masterGasConfigured: Boolean(master.gasUrl),
    unifiedDbConfigured: master.configured,
    unifiedDbMode: master.mode,
    isVercel: Boolean(process.env.VERCEL),
  };
}

/**
 * 將 Google API 錯誤轉為使用者友善的繁體中文診斷提示
 */
function formatGoogleError(err, context = '') {
  const status = err?.code || err?.response?.status;
  const msg = err?.response?.data?.error?.message || err?.message || String(err);

  if (/DECODER routines|ERR_OSSL|PEM|private key/i.test(msg)) {
    return 'Google 私鑰（GOOGLE_PRIVATE_KEY）格式無效：請確認已完整複製 -----BEGIN PRIVATE KEY----- 到 -----END PRIVATE KEY-----，且沒有遺漏字元。';
  }
  if (/has not been used in project|is disabled/i.test(msg)) {
    return `Google Cloud 尚未啟用對應 API：請到 GCP「API 和服務 → 程式庫」啟用 Google Sheets API 與 Google Drive API。（原始訊息：${msg}）`;
  }
  if (/storage quota|quota has been exceeded/i.test(msg) || (context === 'create' && status === 403)) {
    return 'Google 已限制免費服務帳戶直接「新建」雲端檔案（403 配額限制）。請改用「專屬工作表分頁」模式：先點上方「開啟空白試算表」→ 右上角「共用」給機器人 Email（編輯者）→ 將網址貼到下方欄位 → 再點一次「一鍵自動建立專屬工作表」即可立即完成！（或在 Vercel 設定 GOOGLE_MASTER_SHEET_ID 作為母試算表）';
  }
  if (status === 403 || /permission|forbidden|caller does not have permission/i.test(msg)) {
    return `Google 試算表權限不足（403）：請確認已將該試算表「共用（編輯者權限）」給 Service Account 的 Email，並已於 GCP 啟用 Google Sheets API。（Google 回覆：${msg}）`;
  }
  if (status === 404 || /not found/i.test(msg)) {
    return '找不到指定的 Google 試算表或工作表（404）：請確認試算表 ID / 連結是否正確、檔案為原生 Google 試算表（非 .xlsx），且已共用給機器人（編輯者）。';
  }
  if (status === 401 || /invalid_grant|unauthorized/i.test(msg)) {
    return `Google API 憑證驗證失敗（401）：請檢查 GOOGLE_SERVICE_ACCOUNT_EMAIL 與 GOOGLE_PRIVATE_KEY 是否正確。（Google 回覆：${msg}）`;
  }
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|fetch failed/i.test(msg)) {
    return '無法連線至 Google 伺服器，請檢查網路環境或稍後重試。';
  }
  return `Google 試算表同步異常：${msg}`;
}

/**
 * 依據活動的動態表單欄位產生標準表頭陣列
 */
function buildExpectedHeaders(fields) {
  const dynamicLabels = (fields || [])
    .filter((f) => f.type !== 'calculated')
    .map((f) => String(f.label || f.id).trim());
  return [...SYSTEM_HEADERS, ...dynamicLabels];
}

/**
 * 將欄位名稱轉為試算表 A1 欄字母（1 -> A, 27 -> AA）
 */
function colNumberToLetter(num) {
  let col = '';
  let n = num;
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col || 'A';
}

/**
 * 確保指定工作表分頁存在，若不存在則自動新增
 */
async function ensureWorksheetTab(sheetsApi, spreadsheetId, tabName) {
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId });
  const existing = (meta.data.sheets || []).find(
    (s) => s.properties?.title === tabName
  );
  if (existing) {
    return existing.properties.sheetId;
  }

  const addRes = await sheetsApi.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: tabName,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        },
      ],
    },
  });
  return addRes.data.replies?.[0]?.addSheet?.properties?.sheetId;
}

function sanitizeSheetTabName(rawName) {
  const cleaned = String(rawName || '')
    .replace(/[\[\]\*\?:\/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || '報名資料';
}

async function styleAndWriteHeaderRow(sheets, spreadsheetId, sheetGid, tabName, headers) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabName}'!A1:${colNumberToLetter(headers.length)}1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers] },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: sheetGid,
              startRowIndex: 0,
              endRowIndex: 1,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.06, green: 0.09, blue: 0.16 },
                textFormat: {
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                  bold: true,
                  fontSize: 10,
                },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
      ],
    },
  });
}

/**
 * 模式 A：一鍵自動建立專屬工作表分頁（母試算表 / 已貼試算表，免費個人帳號 100% 適用）
 * 或新建獨立試算表檔案（Google Workspace / 共用雲端硬碟適用）
 */
async function createSpreadsheetForEvent(event, fields, options = {}) {
  const auth = getServiceAccountAuth();
  if (!auth) {
    throw new Error(
      '尚未設定 Google Service Account 憑證。請依 docs/GOOGLE_SHEETS_SETUP.md 設定環境變數或金鑰後再試。'
    );
  }

  const sheets = google.sheets({ version: 'v4', auth });
  const headers = buildExpectedHeaders(fields);

  // 優先檢查：畫面上已貼的試算表網址、活動已綁試算表、或環境變數 GOOGLE_MASTER_SHEET_ID
  const masterEnv = stripWrappingQuotes(
    process.env.GOOGLE_MASTER_SHEET_ID || process.env.GOOGLE_MASTER_SHEET_URL
  );
  const existingTargetId = extractSpreadsheetId(
    options.sheetId || options.sheetUrl || event.sheet_id || event.sheet_url || masterEnv
  );

  // ==================== 路徑 1：在已共用試算表 / 母試算表中自動建立專屬活動分頁（免費帳號 100% 成功） ====================
  if (existingTargetId) {
    try {
      const requestedTab = String(options.tabName || '').trim();
      const baseTabName =
        requestedTab && requestedTab !== '報名資料'
          ? sanitizeSheetTabName(requestedTab)
          : sanitizeSheetTabName(event.name || '報名資料');

      const meta = await sheets.spreadsheets.get({ spreadsheetId: existingTargetId });
      const existingSheets = meta.data.sheets || [];
      let tabName = baseTabName;
      let existingTab = existingSheets.find((s) => s.properties?.title === tabName);
      let sheetGid;

      if (existingTab) {
        sheetGid = existingTab.properties.sheetId;
      } else {
        const addRes = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: existingTargetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: tabName,
                    gridProperties: { frozenRowCount: 1 },
                  },
                },
              },
            ],
          },
        });
        sheetGid = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
      }

      // 檢查該分頁是否已有報名資料列；若無則直接寫入格式化表頭，若有則補齊缺漏欄位
      const curRes = await sheets.spreadsheets.values.get({
        spreadsheetId: existingTargetId,
        range: `'${tabName}'!1:2`,
      });
      const curRows = curRes.data.values || [];
      let finalHeaders = headers;
      if (curRows.length > 1 && curRows[0]?.length > 0) {
        finalHeaders = [...curRows[0]];
        for (const h of headers) {
          if (!finalHeaders.includes(h)) finalHeaders.push(h);
        }
      }

      await styleAndWriteHeaderRow(sheets, existingTargetId, sheetGid, tabName, finalHeaders);

      const sheetUrl = `https://docs.google.com/spreadsheets/d/${existingTargetId}/edit#gid=${sheetGid}`;
      return {
        sheetId: existingTargetId,
        sheetUrl,
        tabName,
        headers: finalHeaders,
        createdType: 'tab',
        spreadsheetTitle: meta.data.properties?.title || '',
      };
    } catch (err) {
      throw new Error(formatGoogleError(err, 'tab'));
    }
  }

  // ==================== 路徑 2：嘗試新建獨立試算表檔案（若有 Workspace 配額或 Shared Drive） ====================
  try {
    const tabName = sanitizeSheetTabName(options.tabName || event.sheet_tab_name || '報名資料');
    const folderId = stripWrappingQuotes(process.env.GOOGLE_DRIVE_FOLDER_ID);
    let spreadsheetId = '';
    let spreadsheetUrl = '';
    let sheetGid = 0;

    if (folderId) {
      const drive = google.drive({ version: 'v3', auth });
      const fileRes = await drive.files.create({
        supportsAllDrives: true,
        requestBody: {
          name: `[路跑報名] ${event.name}`,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          parents: [folderId],
        },
        fields: 'id, webViewLink',
      });
      spreadsheetId = fileRes.data.id;
      spreadsheetUrl =
        fileRes.data.webViewLink || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
      sheetGid = await ensureWorksheetTab(sheets, spreadsheetId, tabName);
    } else {
      const createRes = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: `[路跑報名] ${event.name}`,
            locale: 'zh_TW',
            timeZone: 'Asia/Taipei',
          },
          sheets: [
            {
              properties: {
                title: tabName,
                gridProperties: { frozenRowCount: 1 },
              },
            },
          ],
        },
      });
      spreadsheetId = createRes.data.spreadsheetId;
      spreadsheetUrl = createRes.data.spreadsheetUrl;
      sheetGid = createRes.data.sheets?.[0]?.properties?.sheetId || 0;
    }

    await styleAndWriteHeaderRow(sheets, spreadsheetId, sheetGid, tabName, headers);

    // 若有設定個人 Email，自動分享編輯權限給管理者
    const shareEmail = stripWrappingQuotes(process.env.GOOGLE_AUTO_SHARE_EMAIL);
    if (shareEmail) {
      try {
        const drive = google.drive({ version: 'v3', auth });
        await drive.permissions.create({
          fileId: spreadsheetId,
          supportsAllDrives: true,
          requestBody: {
            type: 'user',
            role: 'writer',
            emailAddress: shareEmail,
          },
          sendNotificationEmail: false,
        });
      } catch (shareErr) {
        console.warn('[GoogleSheets] 自動分享試算表權限失敗（不影響試算表建立）：', shareErr.message);
      }
    }

    return {
      sheetId: spreadsheetId,
      sheetUrl: spreadsheetUrl,
      tabName,
      headers,
      createdType: 'spreadsheet',
    };
  } catch (err) {
    throw new Error(formatGoogleError(err, 'create'));
  }
}

/**
 * 呼叫 Google Apps Script Webhook（模式 B）
 */
async function callGasWebhook(webhookUrl, payload) {
  if (!webhookUrl) {
    throw new Error('請先填入 Google Apps Script 網頁應用程式網址（Webhook URL）。');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`GAS Webhook 回傳非 JSON 格式（HTTP ${res.status}），請確認已部署為「所有人皆可存取」的網頁應用程式。`);
    }
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `GAS Webhook 執行失敗（HTTP ${res.status}）`);
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Google Apps Script Webhook 連線逾時（15 秒），請稍後再試。');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 同步表頭至對應 Google 試算表第一列（新增欄位自動對齊不破壞舊資料）
 */
async function syncSheetHeaders(event, fields) {
  const target = resolveEffectiveSheetTarget(event);
  const mode = target.mode;
  const expectedHeaders = buildExpectedHeaders(fields);

  if (mode === 'local') {
    return { skipped: true, mode: 'local', headers: expectedHeaders };
  }

  if (mode === 'webhook') {
    const res = await callGasWebhook(target.gasUrl, {
      action: 'sync_headers',
      tabName: target.tabName,
      headers: expectedHeaders,
    });
    return { synced: true, mode: 'webhook', tabName: target.tabName, headers: res.headers || expectedHeaders };
  }

  // mode === 'api'
  const auth = getServiceAccountAuth();
  if (!auth) {
    throw new Error('未偵測到 Google Service Account 憑證，無法同步表頭。');
  }
  const spreadsheetId = target.sheetId;
  if (!spreadsheetId) {
    throw new Error('尚未設定平台統一 Google 試算表（GOOGLE_MASTER_SHEET_ID）。');
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const tabName = target.tabName;
    const sheetGid = await ensureWorksheetTab(sheets, spreadsheetId, tabName);

    // 讀取目前第一列，檢查是否已有報名資料
    const existingRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!1:2`,
    });
    const rows = existingRes.data.values || [];
    const currentHeaders = rows[0] || [];
    const hasExistingDataRows = rows.length > 1;

    let finalHeaders;
    if (!hasExistingDataRows || currentHeaders.length === 0) {
      finalHeaders = expectedHeaders;
    } else {
      finalHeaders = [...currentHeaders];
      for (const h of expectedHeaders) {
        if (!finalHeaders.includes(h)) {
          finalHeaders.push(h);
        }
      }
    }

    await styleAndWriteHeaderRow(sheets, spreadsheetId, sheetGid, tabName, finalHeaders);

    return {
      synced: true,
      mode: 'api',
      tabName,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetGid}`,
      headers: finalHeaders,
    };
  } catch (err) {
    throw new Error(formatGoogleError(err));
  }
}

/**
 * 將單筆報名資料依照試算表表頭自動對齊並寫入一列
 */
async function appendRegistrationToSheet(event, fields, registration) {
  const target = resolveEffectiveSheetTarget(event);
  const mode = target.mode;
  if (mode === 'local') {
    return { synced: false, status: 'local', message: '尚未設定統一雲端試算表，暫存於本機資料庫' };
  }

  // 建立「表頭名稱 -> 欄位值」對照表
  const valueByHeader = {
    '報名序號': registration.reg_code,
    '報名類型': registration.reg_type === 'group' ? '團體報名' : registration.bundle_code ? '多場聯合報名' : '個人報名',
    '團體名稱': registration.group_name || '',
    '團報代碼': registration.group_code || '',
    '團報角色': registration.group_role === 'leader' ? '團長' : registration.group_role === 'member' ? '組員' : '',
    '合併單號': registration.bundle_code || '',
    '參賽編號': registration.bib_number || '',
    '分組代碼': registration.category_code || '',
    '報名時間': registration.created_at,
    '應繳總金額': registration.total_amount,
    '匯款方式': registration.payment_mode === 'group' ? '團體匯款' : registration.payment_mode === 'bundle' ? '合併匯款' : '個別匯款',
    '匯款後五碼': registration.remittance_last5 || '',
    '繳費狀態': registration.payment_status || '待繳費',
  };

  const answers = typeof registration.answers_json === 'string'
    ? JSON.parse(registration.answers_json || '{}')
    : (registration.answers || {});

  for (const field of fields) {
    if (field.type === 'calculated') continue;
    const label = String(field.label || field.id).trim();
    const val = answers[field.id];
    if (Array.isArray(val)) {
      valueByHeader[label] = val.join('、');
    } else {
      valueByHeader[label] = val === undefined || val === null ? '' : String(val);
    }
  }

  const expectedHeaders = buildExpectedHeaders(fields);

  if (mode === 'webhook') {
    const res = await callGasWebhook(target.gasUrl, {
      action: 'append_row',
      tabName: target.tabName,
      headers: expectedHeaders,
      rowMap: valueByHeader,
    });
    return {
      synced: true,
      status: 'synced',
      rowNumber: res.rowNumber || null,
    };
  }

  // mode === 'api'
  const auth = getServiceAccountAuth();
  if (!auth) {
    throw new Error('未偵測到 Google Service Account 憑證。');
  }
  const spreadsheetId = target.sheetId;
  if (!spreadsheetId) {
    throw new Error('尚未設定統一 Google 試算表 ID。');
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const tabName = target.tabName;
    const sheetGid = await ensureWorksheetTab(sheets, spreadsheetId, tabName);

    // 取得最新表頭（若空白則先建立）
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!1:1`,
    });
    let headers = headerRes.data.values?.[0] || [];
    if (headers.length === 0) {
      headers = expectedHeaders;
      await styleAndWriteHeaderRow(sheets, spreadsheetId, sheetGid, tabName, headers);
    } else {
      const missing = expectedHeaders.filter((h) => !headers.includes(h));
      if (missing.length > 0) {
        headers = [...headers, ...missing];
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'${tabName}'!A1:${colNumberToLetter(headers.length)}1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [headers] },
        });
      }
    }

    const rowValues = headers.map((h) => (valueByHeader[h] !== undefined ? valueByHeader[h] : ''));

    const appendRes = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${tabName}'!A:${colNumberToLetter(headers.length)}`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] },
    });

    const updatedRange = appendRes.data.updates?.updatedRange || '';
    const rowMatch = updatedRange.match(/(\d+)$/);

    return {
      synced: true,
      status: 'synced',
      rowNumber: rowMatch ? Number(rowMatch[1]) : null,
    };
  } catch (err) {
    throw new Error(formatGoogleError(err));
  }
}

/**
 * 雙向同步：從 Google 試算表讀取最新列資料（更新繳費狀態、匯入雲端手動新增列）
 */
async function pullRowsFromSheet(event) {
  const target = resolveEffectiveSheetTarget(event);
  const mode = target.mode;
  if (mode === 'local') {
    throw new Error('尚未設定平台統一 Google 試算表（GOOGLE_MASTER_SHEET_ID 或 GOOGLE_MASTER_GAS_URL）。');
  }

  if (mode === 'webhook') {
    const res = await callGasWebhook(target.gasUrl, {
      action: 'pull_rows',
      tabName: target.tabName,
    });
    return {
      headers: res.headers || [],
      rows: res.rows || [],
    };
  }

  const auth = getServiceAccountAuth();
  if (!auth) {
    throw new Error('未偵測到 Google Service Account 憑證。');
  }
  const spreadsheetId = target.sheetId;
  if (!spreadsheetId) {
    throw new Error('尚未設定統一 Google 試算表 ID。');
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const tabName = target.tabName;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!A:ZZ`,
    });
    const values = res.data.values || [];
    if (values.length === 0) {
      return { headers: [], rows: [] };
    }
    const headers = values[0];
    const rows = values.slice(1).map((rowArr, idx) => {
      const obj = {};
      headers.forEach((h, colIdx) => {
        obj[h] = rowArr[colIdx] !== undefined ? rowArr[colIdx] : '';
      });
      return { rowNumber: idx + 2, data: obj };
    });
    return { headers, rows };
  } catch (err) {
    throw new Error(formatGoogleError(err));
  }
}

/**
 * 測試平台統一 Google 試算表連線狀態
 */
async function testSheetConnection(event) {
  const target = resolveEffectiveSheetTarget(event);
  const mode = target.mode;
  if (mode === 'local') {
    return {
      ok: false,
      mode: 'local',
      message: '尚未設定平台統一雲端試算表，請於部署環境變數設定 GOOGLE_MASTER_SHEET_ID（搭配 Service Account）或 GOOGLE_MASTER_GAS_URL。',
    };
  }

  if (mode === 'webhook') {
    const res = await callGasWebhook(target.gasUrl, {
      action: 'ping',
      tabName: target.tabName,
    });
    return {
      ok: true,
      mode: 'webhook',
      sheetTitle: res.sheetTitle || '平台統一 Google 試算表',
      message: `統一雲端試算表連線成功（GAS 模式）！試算表：「${res.sheetTitle || '已連結'}」，活動分頁：「${target.tabName}」`,
    };
  }

  const auth = getServiceAccountAuth();
  if (!auth) {
    throw new Error('尚未偵測到 Google Service Account 金鑰，請先完成憑證設定。');
  }
  const spreadsheetId = target.sheetId;
  if (!spreadsheetId) {
    throw new Error('尚未設定平台統一試算表 GOOGLE_MASTER_SHEET_ID。');
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    return {
      ok: true,
      mode: 'api',
      sheetTitle: meta.data.properties?.title || spreadsheetId,
      message: `統一雲端試算表連線成功！試算表：「${meta.data.properties?.title}」，活動分頁：「${target.tabName}」`,
    };
  } catch (err) {
    throw new Error(formatGoogleError(err));
  }
}

/**
 * 更新活動專屬分頁中特定報名序號的繳費狀態
 */
async function updatePaymentStatusInSheet(event, regCode, newStatus) {
  const target = resolveEffectiveSheetTarget(event);
  const mode = target.mode;
  if (mode === 'local') return { skipped: true };

  if (mode === 'webhook') {
    try {
      await callGasWebhook(target.gasUrl, {
        action: 'update_payment_status',
        tabName: target.tabName,
        regCode,
        paymentStatus: newStatus,
      });
      return { synced: true };
    } catch (err) {
      return { synced: false, error: err.message };
    }
  }

  const auth = getServiceAccountAuth();
  const spreadsheetId = target.sheetId;
  if (!auth || !spreadsheetId) return { skipped: true };

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const tabName = target.tabName;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!A:Z`,
    });
    const values = res.data.values || [];
    if (values.length < 2) return { skipped: true };

    const headers = values[0];
    const regCodeCol = headers.indexOf('報名序號');
    const statusCol = headers.indexOf('繳費狀態');
    if (regCodeCol === -1 || statusCol === -1) return { skipped: true };

    const rowIdx = values.findIndex((row, idx) => idx > 0 && row[regCodeCol] === regCode);
    if (rowIdx === -1) return { skipped: true };

    const targetCell = `'${tabName}'!${colNumberToLetter(statusCol + 1)}${rowIdx + 1}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: targetCell,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[newStatus]] },
    });
    return { synced: true };
  } catch (err) {
    console.warn('[GoogleSheets] 更新試算表繳費狀態失敗：', err.message);
    return { synced: false, error: formatGoogleError(err) };
  }
}

/**
 * 更新活動專屬分頁中特定報名序號的參賽編號 (Bib) 與分組代碼
 */
async function updateBibInSheet(event, regCode, bibNumber, categoryCode) {
  const target = resolveEffectiveSheetTarget(event);
  const mode = target.mode;
  if (mode === 'local') return { skipped: true };

  if (mode === 'webhook') {
    try {
      await callGasWebhook(target.gasUrl, {
        action: 'update_bib',
        tabName: target.tabName,
        regCode,
        bibNumber: bibNumber || '',
        categoryCode: categoryCode || '',
      });
      return { synced: true };
    } catch (err) {
      return { synced: false, error: err.message };
    }
  }

  const auth = getServiceAccountAuth();
  const spreadsheetId = target.sheetId;
  if (!auth || !spreadsheetId) return { skipped: true };

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const tabName = target.tabName;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!A:Z`,
    });
    const values = res.data.values || [];
    if (values.length < 2) return { skipped: true };

    const headers = values[0];
    const regCodeCol = headers.indexOf('報名序號');
    const bibCol = headers.indexOf('參賽編號');
    const catCol = headers.indexOf('分組代碼');
    if (regCodeCol === -1) return { skipped: true };

    const rowIdx = values.findIndex((row, idx) => idx > 0 && row[regCodeCol] === regCode);
    if (rowIdx === -1) return { skipped: true };

    const updates = [];
    if (bibCol !== -1) {
      updates.push({
        range: `'${tabName}'!${colNumberToLetter(bibCol + 1)}${rowIdx + 1}`,
        values: [[bibNumber || '']],
      });
    }
    if (catCol !== -1 && categoryCode !== undefined) {
      updates.push({
        range: `'${tabName}'!${colNumberToLetter(catCol + 1)}${rowIdx + 1}`,
        values: [[categoryCode || '']],
      });
    }
    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: updates,
        },
      });
    }
    return { synced: true };
  } catch (err) {
    console.warn('[GoogleSheets] 更新試算表參賽編號失敗：', err.message);
    return { synced: false, error: formatGoogleError(err) };
  }
}

/**
 * 選手反向修改報名資料或補填匯款帳號後五碼時，更新活動專屬分頁中對應列
 */
async function updateRegistrationInSheet(event, fields, registration) {
  const target = resolveEffectiveSheetTarget(event);
  const mode = target.mode;
  if (mode === 'local') return { skipped: true };

  const valueByHeader = {
    '報名序號': registration.reg_code,
    '報名類型': registration.reg_type === 'group' ? '團體報名' : registration.bundle_code ? '多場聯合報名' : '個人報名',
    '團體名稱': registration.group_name || '',
    '團報代碼': registration.group_code || '',
    '團報角色': registration.group_role === 'leader' ? '團長' : registration.group_role === 'member' ? '組員' : '',
    '合併單號': registration.bundle_code || '',
    '參賽編號': registration.bib_number || '',
    '分組代碼': registration.category_code || '',
    '報名時間': registration.created_at,
    '應繳總金額': registration.total_amount,
    '匯款方式': registration.payment_mode === 'group' ? '團體匯款' : registration.payment_mode === 'bundle' ? '合併匯款' : '個別匯款',
    '匯款後五碼': registration.remittance_last5 || '',
    '繳費狀態': registration.payment_status || '待繳費',
  };

  const answers =
    typeof registration.answers_json === 'string'
      ? JSON.parse(registration.answers_json || '{}')
      : registration.answers || {};

  for (const field of fields || []) {
    if (field.type === 'calculated') continue;
    const label = String(field.label || field.id).trim();
    const val = answers[field.id];
    valueByHeader[label] = Array.isArray(val) ? val.join('、') : val === undefined || val === null ? '' : String(val);
  }

  const expectedHeaders = buildExpectedHeaders(fields);

  if (mode === 'webhook') {
    try {
      await callGasWebhook(target.gasUrl, {
        action: 'update_row',
        tabName: target.tabName,
        regCode: registration.reg_code,
        headers: expectedHeaders,
        rowMap: valueByHeader,
      });
      return { synced: true };
    } catch (err) {
      return { synced: false, error: err.message };
    }
  }

  const auth = getServiceAccountAuth();
  const spreadsheetId = target.sheetId;
  if (!auth || !spreadsheetId) return { skipped: true };

  try {
    const sheets = google.sheets({ version: 'v4', auth });
    const tabName = target.tabName;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!A:ZZ`,
    });
    const values = res.data.values || [];
    if (values.length < 2) {
      return await appendRegistrationToSheet(event, fields, registration);
    }

    let headers = values[0];
    const missing = expectedHeaders.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      headers = [...headers, ...missing];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${tabName}'!A1:${colNumberToLetter(headers.length)}1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [headers] },
      });
    }

    const regCodeCol = headers.indexOf('報名序號');
    if (regCodeCol === -1) return { skipped: true };
    const rowIdx = values.findIndex((row, idx) => idx > 0 && row[regCodeCol] === registration.reg_code);
    if (rowIdx === -1) {
      return await appendRegistrationToSheet(event, fields, registration);
    }

    const rowValues = headers.map((h) => (valueByHeader[h] !== undefined ? valueByHeader[h] : ''));
    const rowNum = rowIdx + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName}'!A${rowNum}:${colNumberToLetter(headers.length)}${rowNum}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rowValues] },
    });
    return { synced: true, rowNumber: rowNum };
  } catch (err) {
    console.warn('[GoogleSheets] 更新試算表整列資料失敗：', err.message);
    return { synced: false, error: formatGoogleError(err) };
  }
}

module.exports = {
  SYSTEM_HEADERS,
  extractSpreadsheetId,
  stripWrappingQuotes,
  getServiceAccountAuth,
  getMasterDatabaseConfig,
  resolveEffectiveSheetTarget,
  getCredentialsStatus,
  buildExpectedHeaders,
  colNumberToLetter,
  ensureWorksheetTab,
  sanitizeSheetTabName,
  styleAndWriteHeaderRow,
  formatGoogleError,
  callGasWebhook,
  createSpreadsheetForEvent,
  syncSheetHeaders,
  appendRegistrationToSheet,
  pullRowsFromSheet,
  testSheetConnection,
  updatePaymentStatusInSheet,
  updateBibInSheet,
  updateRegistrationInSheet,
};
