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
    display_name TEXT NOT NULL DEFAULT '系統管理員',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    event_date TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    reg_start_at TEXT NOT NULL,
    reg_end_at TEXT NOT NULL,
    max_participants INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
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
    fields_json TEXT NOT NULL DEFAULT '[]',
    last_sheet_sync_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    reg_code TEXT UNIQUE NOT NULL,
    runner_name TEXT NOT NULL DEFAULT '',
    runner_id_number TEXT NOT NULL DEFAULT '',
    runner_email TEXT NOT NULL DEFAULT '',
    runner_phone TEXT NOT NULL DEFAULT '',
    answers_json TEXT NOT NULL DEFAULT '{}',
    price_breakdown_json TEXT NOT NULL DEFAULT '[]',
    total_amount INTEGER NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT '待繳費',
    sheet_sync_status TEXT NOT NULL DEFAULT 'local',
    sheet_sync_error TEXT NOT NULL DEFAULT '',
    sheet_row_number INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON registrations(event_id);
  CREATE INDEX IF NOT EXISTS idx_registrations_reg_code ON registrations(reg_code);
`);

/**
 * 路跑活動標準預設欄位範本（建立新活動時自動帶入）
 */
function getDefaultRunningFields() {
  return [
    {
      id: 'full_name',
      label: '姓名',
      type: 'text',
      required: true,
      placeholder: '請輸入真實姓名（供保險與完賽證書使用）',
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
      label: '身分證字號 / 護照號碼',
      type: 'tw_id',
      required: true,
      placeholder: '例如：A123456789 或外籍護照號碼',
      helperText: '本國籍將自動驗證身分證格式；外籍選手請輸入有效護照號碼',
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
      helperText: '將用於賽會保險投保與年齡分組計算',
      options: [],
      unitPrice: 0,
      validation: 'none',
    },
    {
      id: 'phone',
      label: '聯絡電話',
      type: 'tel',
      required: true,
      placeholder: '例如：0912-345678',
      helperText: '賽前簡訊通知與報到物資領取將寄送至此號碼',
      options: [],
      unitPrice: 0,
      validation: 'phone',
    },
    {
      id: 'email',
      label: '電子信箱',
      type: 'email',
      required: true,
      placeholder: 'runner@example.com',
      helperText: '報名確認信與電子完賽證書將寄送至此信箱',
      options: [],
      unitPrice: 0,
      validation: 'email',
    },
    {
      id: 'emergency_name',
      label: '緊急聯絡人姓名',
      type: 'text',
      required: true,
      placeholder: '請輸入緊急聯絡人姓名',
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
      placeholder: '例如：0988-765432',
      helperText: '請勿填寫與參賽者本人相同之電話',
      options: [],
      unitPrice: 0,
      validation: 'phone',
    },
    {
      id: 'race_category',
      label: '報名組別',
      type: 'select',
      required: true,
      placeholder: '請選擇參賽組別',
      helperText: '費用包含賽道補給、晶片計時、賽事紀念衫與完賽獎牌',
      options: [
        { label: '全馬 42K', value: '全馬 42K', price: 1200 },
        { label: '半馬 21K', value: '半馬 21K', price: 1000 },
        { label: '挑戰組 10K', value: '挑戰組 10K', price: 800 },
        { label: '健康組 5K', value: '健康組 5K', price: 600 },
      ],
      unitPrice: 0,
      validation: 'none',
    },
    {
      id: 'shirt_size',
      label: '紀念衫尺寸',
      type: 'select',
      required: true,
      placeholder: '請選擇衣服尺寸',
      helperText: '中性吸濕排汗機能版型，建議依平時穿著尺碼選擇',
      options: [
        { label: 'XS', value: 'XS', price: 0 },
        { label: 'S', value: 'S', price: 0 },
        { label: 'M', value: 'M', price: 0 },
        { label: 'L', value: 'L', price: 0 },
        { label: 'XL', value: 'XL', price: 0 },
        { label: '2XL', value: '2XL', price: 0 },
        { label: '3XL', value: '3XL', price: 0 },
      ],
      unitPrice: 0,
      validation: 'none',
    },
    {
      id: 'addons',
      label: '加購賽事裝備與服務（可複選）',
      type: 'checkbox',
      required: false,
      placeholder: '',
      helperText: '勾選項目將自動累計至應繳總金額',
      options: [
        { label: '疾速聯名防風外套', value: '疾速聯名防風外套', price: 680 },
        { label: '完賽獎牌雷射刻字服務', value: '完賽獎牌雷射刻字服務', price: 150 },
        { label: '賽日接駁專車（台北車站往返）', value: '賽日接駁專車', price: 200 },
      ],
      unitPrice: 0,
      validation: 'none',
    },
    {
      id: 'notes',
      label: '特殊需求或備註',
      type: 'textarea',
      required: false,
      placeholder: '例如：素食補給需求、團報隊名或其他備註事項',
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
  const adminPassword = process.env.ADMIN_PASSWORD || 'runner2026';

  const existingAdmin = db.prepare('SELECT id FROM admins WHERE username = ?').get(adminUsername);
  if (!existingAdmin) {
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare('INSERT INTO admins (username, password_hash, display_name) VALUES (?, ?, ?)').run(
      adminUsername,
      hash,
      '賽事總監 Admin'
    );
    console.log(`[Seed] 已建立預設管理員帳號：${adminUsername}`);
  }

  // 2. 建立內建範例路跑活動
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
        slug, name, event_date, location, reg_start_at, reg_end_at,
        max_participants, is_active, banner_title, banner_subtitle,
        banner_image_url, description, payment_info,
        sheet_sync_mode, sheet_id, sheet_url, sheet_tab_name, gas_webhook_url, fields_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertEvent.run(
      'taipei-speed-marathon-2026',
      '2026 台北疾速城市馬拉松',
      formatDateOnly(eventDay),
      '台北市政府市民廣場（起終點）',
      formatLocalISO(start),
      formatLocalISO(end),
      500,
      1,
      '2026 TAIPEI SPEED MARATHON',
      '突破極限・疾速開跑｜AIMS 認證城市賽道，全馬 / 半馬 / 10K / 5K 熱血徵召中',
      'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1600&q=80',
      '年度最具速度感的城市路跑盛會！貫穿台北經典地標與河濱賽道，配備雙晶片即時分段計時系統、專業配速列車與頂級賽道補給。歡迎各路跑者挑戰個人最佳成績（PB）！',
      '請於報名完成後 3 日內完成匯款，並於備註填寫「報名序號」：\n銀行代碼：822（中國信託）\n帳號：1234-5678-9012-3456\n戶名：疾速路跑賽事籌備委員會\n完成轉帳後將於 1-2 個工作天內寄發入帳確認通知。',
      'local',
      '',
      '',
      '報名資料',
      '',
      JSON.stringify(defaultFields)
    );

    // 內建 2 筆範例報名資料，方便後台立即檢視效果
    const eventId = result.lastInsertRowid;
    const insertReg = db.prepare(`
      INSERT INTO registrations (
        event_id, reg_code, runner_name, runner_id_number, runner_email, runner_phone,
        answers_json, price_breakdown_json, total_amount, payment_status, sheet_sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertReg.run(
      eventId,
      'RUN26-0001',
      '林志翔',
      'A123456789',
      'zhixiang.lin@example.com',
      '0912-345678',
      JSON.stringify({
        full_name: '林志翔',
        gender: '男',
        id_number: 'A123456789',
        birth_date: '1993-05-18',
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
      'RUN26-0002',
      '陳怡君',
      'F223456781',
      'yijun.chen@example.com',
      '0988-654321',
      JSON.stringify({
        full_name: '陳怡君',
        gender: '女',
        id_number: 'F223456781',
        birth_date: '1996-11-02',
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

    console.log('[Seed] 已建立範例路跑活動：2026 台北疾速城市馬拉松');
  }
}

seedInitialData();

module.exports = {
  db,
  getDefaultRunningFields,
  UPLOADS_DIR,
};
