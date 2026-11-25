const path = require('path');
const fs = require('fs');
const os = require('os');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');

const IS_VERCEL = Boolean(process.env.VERCEL);

const DATA_DIR = IS_VERCEL
  ? path.join(os.tmpdir(), 'runflow-data')
  : path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const UPLOADS_DIR = IS_VERCEL
  ? path.join(os.tmpdir(), 'runflow-uploads')
  : path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'runflow.db');
const db = new DatabaseSync(DB_PATH);

// 啟用外鍵（本機使用 WAL 提升並發，Vercel 無伺服器環境使用單檔模式）
db.exec('PRAGMA foreign_keys = ON;');
if (!IS_VERCEL) {
  db.exec('PRAGMA journal_mode = WAL;');
}

// 建立資料表
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '賽事承辦人',
    role TEXT NOT NULL DEFAULT 'organizer',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_admin_id INTEGER NOT NULL DEFAULT 1,
    owner_username TEXT NOT NULL DEFAULT 'admin',
    owner_display_name TEXT NOT NULL DEFAULT '',
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    event_date TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    reg_start_at TEXT NOT NULL,
    reg_end_at TEXT NOT NULL,
    max_participants INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    event_status TEXT NOT NULL DEFAULT 'auto',
    banner_title TEXT NOT NULL DEFAULT '',
    banner_subtitle TEXT NOT NULL DEFAULT '',
    banner_image_url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    payment_info TEXT NOT NULL DEFAULT '',
    sheet_sync_mode TEXT NOT NULL DEFAULT 'local',
    sheet_id TEXT NOT NULL DEFAULT '',
    sheet_url TEXT NOT NULL DEFAULT '',
    sheet_tab_name TEXT NOT NULL DEFAULT '報名資料',
    gas_webhook_url TEXT NOT NULL DEFAULT '',
    english_name TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL DEFAULT 'distance',
    timing_event_id TEXT NOT NULL DEFAULT '',
    timing_portal_url TEXT NOT NULL DEFAULT 'https://runchip-timing.vercel.app/',
    timing_gas_url TEXT NOT NULL DEFAULT '',
    fields_json TEXT NOT NULL DEFAULT '[]',
    last_sheet_sync_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    reg_code TEXT UNIQUE NOT NULL,
    bib_number TEXT NOT NULL DEFAULT '',
    category_code TEXT NOT NULL DEFAULT '',
    runner_name TEXT NOT NULL DEFAULT '',
    runner_id_number TEXT NOT NULL DEFAULT '',
    runner_email TEXT NOT NULL DEFAULT '',
    runner_phone TEXT NOT NULL DEFAULT '',
    answers_json TEXT NOT NULL DEFAULT '{}',
    price_breakdown_json TEXT NOT NULL DEFAULT '[]',
    total_amount INTEGER NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT '待繳費',
    remittance_last5 TEXT NOT NULL DEFAULT '',
    reg_type TEXT NOT NULL DEFAULT 'individual',
    group_name TEXT NOT NULL DEFAULT '',
    group_code TEXT NOT NULL DEFAULT '',
    payment_mode TEXT NOT NULL DEFAULT 'individual',
    sheet_sync_status TEXT NOT NULL DEFAULT 'local',
    sheet_sync_error TEXT NOT NULL DEFAULT '',
    sheet_row_number INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON registrations(event_id);
  CREATE INDEX IF NOT EXISTS idx_registrations_reg_code ON registrations(reg_code);
`);

// 向下相容自動遷移：舊資料庫自動補齊欄位（多承辦人獨立隔離、活動三態、統一資料庫與晶片串接）
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}
ensureColumn('admins', 'role', "TEXT NOT NULL DEFAULT 'organizer'");
ensureColumn('events', 'owner_admin_id', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('events', 'owner_username', "TEXT NOT NULL DEFAULT 'admin'");
ensureColumn('events', 'owner_display_name', "TEXT NOT NULL DEFAULT ''");
ensureColumn('events', 'event_status', "TEXT NOT NULL DEFAULT 'auto'");
ensureColumn('events', 'english_name', "TEXT NOT NULL DEFAULT ''");
ensureColumn('events', 'event_type', "TEXT NOT NULL DEFAULT 'distance'");
ensureColumn('events', 'timing_event_id', "TEXT NOT NULL DEFAULT ''");
ensureColumn('events', 'timing_portal_url', "TEXT NOT NULL DEFAULT 'https://runchip-timing.vercel.app/'");
ensureColumn('events', 'timing_gas_url', "TEXT NOT NULL DEFAULT ''");
ensureColumn('registrations', 'bib_number', "TEXT NOT NULL DEFAULT ''");
ensureColumn('registrations', 'category_code', "TEXT NOT NULL DEFAULT ''");
ensureColumn('registrations', 'remittance_last5', "TEXT NOT NULL DEFAULT ''");
ensureColumn('registrations', 'reg_type', "TEXT NOT NULL DEFAULT 'individual'");
ensureColumn('registrations', 'group_name', "TEXT NOT NULL DEFAULT ''");
ensureColumn('registrations', 'group_code', "TEXT NOT NULL DEFAULT ''");
ensureColumn('registrations', 'payment_mode', "TEXT NOT NULL DEFAULT 'individual'");

db.exec('CREATE INDEX IF NOT EXISTS idx_events_owner_admin_id ON events(owner_admin_id);');

/**
 * 路跑活動標準預設欄位範本（建立新活動時自動帶入）
 * 預設欄位：姓名、性別、身份證字號、出生年月日、連絡電話、電子信箱、
 * 緊急聯絡人姓名、緊急聯絡人電話、報名組別、賽事加購服務、匯款帳號尾五碼、飲食習慣（葷/素）、備考、本次報名應繳總金額
 */
function getDefaultRunningFields() {
  return [
    {
      id: 'full_name',
      label: '姓名',
      type: 'text',
      required: true,
      placeholder: '真實姓名',
      helperText: '',
      options: [],
      unitPrice: 0,
      validation: 'none',
    },
    {
      id: 'gender',
      label: '性別',
      type: 'radio',
      required: true,
      placeholder: '',
      helperText: '',
      options: [
        { label: '男', value: '男', price: 0 },
        { label: '女', value: '女', price: 0 },
      ],
      unitPrice: 0,
      validation: 'none',
    },
    {
      id: 'id_number',
      label: '身份證字號',
      type: 'tw_id',
      required: true,
      placeholder: '例：A123456789',
      helperText: '',
      options: [],
      unitPrice: 0,
      validation: 'tw_id_or_passport',
    },
    {
      id: 'birth_date',
      label: '出生年月日',
      type: 'date',
      required: true,
      placeholder: '',
      helperText: '限 10～80 歲',
      options: [],
      unitPrice: 0,
      validation: 'age_10_80',
    },
    {
      id: 'phone',
      label: '連絡電話',
      type: 'tel',
      required: true,
      placeholder: '0912345678（手機 10 碼）',
      helperText: '',
      options: [],
      unitPrice: 0,
      validation: 'phone',
    },
    {
      id: 'email',
      label: '電子信箱',
      type: 'email',
      required: true,
      placeholder: 'name@example.com',
      helperText: '',
      options: [],
      unitPrice: 0,
      validation: 'email',
    },
    {
      id: 'emergency_name',
      label: '緊急聯絡人姓名',
      type: 'text',
      required: true,
      placeholder: '緊急聯絡人',
      helperText: '',
      options: [],
      unitPrice: 0,
      validation: 'none',
    },
    {
      id: 'emergency_phone',
      label: '緊急聯絡人電話',
      type: 'tel',
      required: true,
      placeholder: '0912345678（手機 10 碼）',
      helperText: '',
      options: [],
      unitPrice: 0,
      validation: 'phone',
    },
    {
      id: 'race_category',
      label: '報名組別',
      type: 'select',
      required: true,
      placeholder: '請選擇組別',
      helperText: '',
      options: [
        { label: '超馬 50K', value: '超馬 50K', price: 1500, code: '50K', bibPrefix: 'A' },
        { label: '全馬 42K', value: '全馬 42K', price: 1200, code: '42K', bibPrefix: 'B' },
        { label: '半馬 21K', value: '半馬 21K', price: 1000, code: '21K', bibPrefix: 'C' },
        { label: '挑戰組 10K', value: '挑戰組 10K', price: 800, code: '10K', bibPrefix: 'D' },
        { label: '健康組 5K', value: '健康組 5K', price: 600, code: '5K', bibPrefix: 'E' },
      ],
      unitPrice: 0,
      validation: 'none',
    },
    {
      id: 'addons',
      label: '賽事加購服務',
      type: 'checkbox',
      required: false,
      placeholder: '',
      helperText: '非必選，可依需求複選加購項目',
      options: [
        { label: '疾速聯名防風外套', value: '疾速聯名防風外套', price: 680 },
        { label: '完賽獎牌雷射刻字服務', value: '完賽獎牌雷射刻字服務', price: 150 },
        { label: '賽日接駁專車', value: '賽日接駁專車', price: 200 },
      ],
      unitPrice: 0,
      validation: 'none',
    },
    {
      id: 'remittance_last5',
      label: '匯款帳號尾五碼',
      type: 'text',
      required: true,
      placeholder: '請輸入 5 位數字',
      helperText: '',
      options: [],
      unitPrice: 0,
      validation: 'remittance_last5',
    },
    {
      id: 'diet_preference',
      label: '飲食習慣',
      type: 'radio',
      required: true,
      placeholder: '',
      helperText: '',
      options: [
        { label: '葷', value: '葷', price: 0 },
        { label: '素', value: '素', price: 0 },
      ],
      unitPrice: 0,
      validation: 'none',
    },
    {
      id: 'notes',
      label: '備考',
      type: 'textarea',
      required: false,
      placeholder: '選填',
      helperText: '',
      options: [],
      unitPrice: 0,
      validation: 'none',
    },
    {
      id: 'calculated_total',
      label: '本次報名應繳總金額',
      type: 'calculated',
      required: false,
      placeholder: '',
      helperText: '',
      options: [],
      unitPrice: 0,
      validation: 'none',
    },
  ];
}

function seedInitialData() {
  // 1. 建立預設管理員帳號
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234';

  let defaultAdmin = db.prepare('SELECT * FROM admins WHERE username = ?').get(adminUsername);
  if (!defaultAdmin) {
    const hash = bcrypt.hashSync(adminPassword, 10);
    const info = db
      .prepare('INSERT INTO admins (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)')
      .run(adminUsername, hash, 'TUR 賽事總監', 'super_admin');
    defaultAdmin = db.prepare('SELECT * FROM admins WHERE id = ?').get(info.lastInsertRowid);
    console.log(`[Seed] 已建立預設承辦管理帳號：${adminUsername}`);
  } else {
    if (!defaultAdmin.role || defaultAdmin.role === 'organizer') {
      db.prepare("UPDATE admins SET role = 'super_admin' WHERE id = ?").run(defaultAdmin.id);
      defaultAdmin.role = 'super_admin';
    }
    // 若既有預設帳號仍沿用舊版預設密碼 runner2026，自動升級為新預設密碼 admin1234
    if (defaultAdmin.password_hash && bcrypt.compareSync('runner2026', defaultAdmin.password_hash)) {
      const nextHash = bcrypt.hashSync(adminPassword, 10);
      db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(nextHash, defaultAdmin.id);
      defaultAdmin.password_hash = nextHash;
    }
  }

  // 若既有測試承辦人仍沿用舊版預設密碼 runner2026，同步升級為 admin1234
  for (const demoUser of ['org_north', 'org_south']) {
    const row = db.prepare('SELECT id, password_hash FROM admins WHERE lower(username) = ?').get(demoUser);
    if (row && row.password_hash && bcrypt.compareSync('runner2026', row.password_hash)) {
      db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync('admin1234', 10), row.id);
    }
  }

  // 補齊舊活動缺漏的承辦人資訊
  db.prepare(
    `UPDATE events
     SET owner_admin_id = ?, owner_username = ?, owner_display_name = ?
     WHERE owner_admin_id IS NULL OR owner_admin_id = 0 OR owner_username = ''`
  ).run(defaultAdmin.id, defaultAdmin.username, defaultAdmin.display_name);

  // 補齊既有活動表單若尚未包含「緊急聯絡人電話」或「匯款帳號尾五碼」欄位
  const existingEventsForFieldCheck = db.prepare('SELECT id, fields_json FROM events').all();
  const defaultTemplateList = getDefaultRunningFields();
  const emergencyPhoneTemplate = defaultTemplateList.find((f) => f.id === 'emergency_phone');
  const remittanceFieldTemplate = defaultTemplateList.find((f) => f.id === 'remittance_last5');
  for (const ev of existingEventsForFieldCheck) {
    try {
      const parsedFields = JSON.parse(ev.fields_json || '[]');
      if (!Array.isArray(parsedFields)) continue;
      let changed = false;

      if (
        emergencyPhoneTemplate &&
        !parsedFields.some(
          (f) =>
            f.id === 'emergency_phone' ||
            /緊急[聯連]絡人電話/.test(String(f.label || ''))
        )
      ) {
        const emNameIdx = parsedFields.findIndex(
          (f) => f.id === 'emergency_name' || /緊急[聯連]絡人/.test(String(f.label || ''))
        );
        if (emNameIdx !== -1) {
          parsedFields.splice(emNameIdx + 1, 0, emergencyPhoneTemplate);
        } else {
          parsedFields.push(emergencyPhoneTemplate);
        }
        changed = true;
      }

      if (
        remittanceFieldTemplate &&
        !parsedFields.some(
          (f) =>
            f.id === 'remittance_last5' ||
            String(f.label || '').includes('後五碼') ||
            String(f.label || '').includes('尾五碼')
        )
      ) {
        const notesIdx = parsedFields.findIndex((f) => f.id === 'notes');
        if (notesIdx !== -1) {
          parsedFields.splice(notesIdx, 0, remittanceFieldTemplate);
        } else {
          parsedFields.push(remittanceFieldTemplate);
        }
        changed = true;
      }

      if (changed) {
        db.prepare('UPDATE events SET fields_json = ? WHERE id = ?').run(JSON.stringify(parsedFields), ev.id);
      }
    } catch (_) {
      // ignore malformed json
    }
  }

  // 2. 建立內建範例路跑活動（僅在全新空資料庫且非雲端待同步時建立）
  const existingEvents = db.prepare('SELECT COUNT(*) as cnt FROM events').get();
  if (existingEvents.cnt === 0) {
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 昨天開放
    const end = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000); // 45 天後截止
    const eventDay = new Date(now.getTime() + 75 * 24 * 60 * 60 * 1000); // 75 天後起跑

    const formatLocalISO = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const formatDateOnly = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };

    const defaultFields = getDefaultRunningFields();

    const insertEvent = db.prepare(`
      INSERT INTO events (
        owner_admin_id, owner_username, owner_display_name,
        slug, name, english_name, event_type, timing_event_id, timing_portal_url, timing_gas_url,
        event_date, location, reg_start_at, reg_end_at,
        max_participants, is_active, event_status, banner_title, banner_subtitle,
        banner_image_url, description, payment_info,
        sheet_sync_mode, sheet_id, sheet_url, sheet_tab_name, gas_webhook_url, fields_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const rawMasterSheet = String(
      process.env.GOOGLE_MASTER_SHEET_ID || process.env.GOOGLE_MASTER_SHEET_URL || ''
    ).replace(/^["']+/, '').replace(/["',]+$/, '').trim();
    const masterMatch = rawMasterSheet.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const seedSheetId = masterMatch ? masterMatch[1] : rawMasterSheet;
    const masterGasUrl = String(process.env.GOOGLE_MASTER_GAS_URL || '')
      .replace(/^["']+/, '')
      .replace(/["',]+$/, '')
      .trim();
    const seedSheetMode = seedSheetId ? 'api' : masterGasUrl ? 'webhook' : 'local';
    const seedSheetUrl = seedSheetId
      ? `https://docs.google.com/spreadsheets/d/${seedSheetId}/edit`
      : '';

    const result = insertEvent.run(
      defaultAdmin.id,
      defaultAdmin.username,
      defaultAdmin.display_name,
      'taipei-speed-marathon-2026',
      '2026 TUR 台灣超馬疾速城市挑戰賽',
      '2026 TUR TAIWAN ULTRA SPEED CHALLENGE',
      'distance',
      'TUR-2026-SPEED',
      'https://runchip-timing.vercel.app/',
      '',
      formatDateOnly(eventDay),
      '台北市政府市民廣場（起終點）',
      formatLocalISO(start),
      formatLocalISO(end),
      500,
      1,
      'auto',
      '2026 TUR 台灣超馬疾速城市挑戰賽',
      'Taiwan Ultra Runners 官方賽事｜超馬 50K / 全馬 42K / 半馬 21K / 10K 熱血徵召中',
      'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1600&q=80',
      'TUR (Taiwan Ultra Runners) 年度指標性城市超級馬拉松與路跑盛會！支援即時報名與配號作業，歡迎各路跑者熱血挑戰。',
      '請於報名完成後 3 日內完成匯款，並於備註填寫「報名序號」：\n銀行代碼：822（中國信託）\n帳號：1234-5678-9012-3456\n戶名：TUR 台灣超級馬拉松跑者協會\n完成轉帳後將於 1-2 個工作天內完成對帳並開放參賽編號配號。',
      seedSheetMode,
      seedSheetId,
      seedSheetUrl,
      '2026 TUR 台灣超馬疾速城市挑戰賽',
      masterGasUrl,
      JSON.stringify(defaultFields)
    );

    // 內建 2 筆範例報名資料，方便後台立即檢視與測試晶片匯出效果
    const eventId = result.lastInsertRowid;
    const insertReg = db.prepare(`
      INSERT INTO registrations (
        event_id, reg_code, bib_number, category_code, runner_name, runner_id_number, runner_email, runner_phone,
        answers_json, price_breakdown_json, total_amount, payment_status, sheet_sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertReg.run(
      eventId,
      'TUR26-0001',
      'B001',
      '42K',
      '林志翔',
      'A123456789',
      'zhixiang.lin@example.com',
      '0912-345678',
      JSON.stringify({
        full_name: '林志翔',
        gender: '男',
        id_number: 'A123456789',
        birth_date: '1993-05-18',
        city: '台北市',
        country: 'TPE',
        phone: '0912-345678',
        email: 'zhixiang.lin@example.com',
        emergency_name: '林美華',
        emergency_phone: '0922-111222',
        race_category: '全馬 42K',
        shirt_size: 'L',
        addons: ['疾速聯名防風外套', '完賽獎牌雷射刻字服務'],
        notes: '目標破三！',
      }),
      JSON.stringify([
        { fieldLabel: '報名組別', itemLabel: '全馬 42K', amount: 1200 },
        { fieldLabel: '加購賽事裝備與服務（可複選）', itemLabel: '疾速聯名防風外套', amount: 680 },
        { fieldLabel: '加購賽事裝備與服務（可複選）', itemLabel: '完賽獎牌雷射刻字服務', amount: 150 },
      ]),
      2030,
      '已繳費',
      'local'
    );

    insertReg.run(
      eventId,
      'TUR26-0002',
      'C001',
      '21K',
      '陳怡君',
      'F223456781',
      'yijun.chen@example.com',
      '0988-654321',
      JSON.stringify({
        full_name: '陳怡君',
        gender: '女',
        id_number: 'F223456781',
        birth_date: '1996-11-02',
        city: '新北市',
        country: 'TPE',
        phone: '0988-654321',
        email: 'yijun.chen@example.com',
        emergency_name: '陳大明',
        emergency_phone: '0933-444555',
        race_category: '半馬 21K',
        shirt_size: 'S',
        addons: ['賽日接駁專車'],
        notes: '',
      }),
      JSON.stringify([
        { fieldLabel: '報名組別', itemLabel: '半馬 21K', amount: 1000 },
        { fieldLabel: '加購賽事裝備與服務（可複選）', itemLabel: '賽日接駁專車', amount: 200 },
      ]),
      1200,
      '待繳費',
      'local'
    );

    console.log('[Seed] 已建立範例路跑活動：2026 TUR 台灣超馬疾速城市挑戰賽');
  }
}

seedInitialData();

module.exports = {
  db,
  getDefaultRunningFields,
  UPLOADS_DIR,
};
