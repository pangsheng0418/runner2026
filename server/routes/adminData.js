const express = require('express');
const bcrypt = require('bcryptjs');
const { db, getDefaultRunningFields } = require('../db');
const { requireAdminAuth } = require('../middleware/auth');
const { getMasterDatabaseConfig } = require('../services/googleSheets');
const { syncAllTablesToCloud } = require('../services/cloudStore');

const router = express.Router();
router.use(requireAdminAuth);

function requireSuperAdmin(req, res, next) {
  const me = db
    .prepare('SELECT id, username, display_name, role FROM admins WHERE id = ?')
    .get(req.admin.id);
  if (!me || me.role !== 'super_admin') {
    return res.status(403).json({
      error: '權限不足：僅最高權限承辦人可執行資料載入、清空與完整備份還原。',
      code: 'SUPER_ADMIN_REQUIRED',
    });
  }
  req.adminRecord = me;
  return next();
}

router.use(requireSuperAdmin);

function formatLocalISO(dateObj) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}T${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
}

function formatDateOnly(dateObj) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
}

function getDbSummary() {
  const adminsCount = db.prepare('SELECT COUNT(*) as cnt FROM admins').get()?.cnt || 0;
  const eventsCount = db.prepare('SELECT COUNT(*) as cnt FROM events').get()?.cnt || 0;
  const regsCount = db.prepare('SELECT COUNT(*) as cnt FROM registrations').get()?.cnt || 0;
  return { adminsCount, eventsCount, regsCount };
}

/**
 * 載入完整示範測試資料（多承辦人 + 開放中/籌備中/已結案三態活動 + 範例報名跑者）
 */
function seedDemoDataset() {
  const master = getMasterDatabaseConfig();
  const sheetMode = master.configured ? master.mode : 'local';
  const sheetId = master.sheetId || '';
  const sheetUrl = master.sheetUrl || '';
  const gasUrl = master.gasUrl || '';
  const defaultFields = getDefaultRunningFields();

  // 1. 建立 2 位獨立一般承辦人帳號（若已存在則直接沿用）
  const demoOrganizers = [
    { username: 'org_north', display_name: '台北超馬承辦小組', password: 'runner2026' },
    { username: 'org_south', display_name: '高雄路跑承辦小組', password: 'runner2026' },
  ];

  const orgMap = {};
  let createdOrganizers = 0;
  for (const o of demoOrganizers) {
    let row = db.prepare('SELECT * FROM admins WHERE lower(username) = lower(?)').get(o.username);
    if (!row) {
      const hash = bcrypt.hashSync(o.password, 10);
      const info = db
        .prepare('INSERT INTO admins (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)')
        .run(o.username, hash, o.display_name, 'organizer');
      row = db.prepare('SELECT * FROM admins WHERE id = ?').get(info.lastInsertRowid);
      createdOrganizers += 1;
    }
    orgMap[o.username] = row;
  }

  const now = Date.now();
  const offsetDt = (days) => formatLocalISO(new Date(now + days * 86400000));
  const offsetDate = (days) => formatDateOnly(new Date(now + days * 86400000));

  // 2. 建立 4 場測試賽事（2 開放中、1 籌備中、1 已結案）
  const demoEvents = [
    {
      owner: orgMap.org_north,
      slug: 'demo-taipei-ultra-2026',
      name: '2026 TUR 台北極速城市超馬挑戰賽',
      english_name: '2026 TUR TAIPEI ULTRA SPEED CHALLENGE',
      event_type: 'distance',
      timing_event_id: 'TUR-2026-TPE',
      event_date: offsetDate(65),
      location: '台北市大佳河濱公園（迎風段起終點）',
      reg_start_at: offsetDt(-3),
      reg_end_at: offsetDt(35),
      max_participants: 600,
      is_active: 1,
      event_status: 'open',
      banner_title: '2026 TUR 台北極速城市超馬挑戰賽',
      banner_subtitle: '超馬 50K / 全馬 42K / 半馬 21K / 10K 熱烈開放報名中！',
      banner_image_url:
        'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1600&q=80',
      description:
        '北台灣指標性平緩高速河濱賽道，適合挑戰個人最佳成績（PB）與初超馬完賽！全賽道每 2.5 公里設置豐盛補給站與晶片感應點。',
      payment_info:
        '請於報名完成後 3 日內完成匯款並備註報名序號：\n銀行代碼：822（中國信託）\n帳號：2026-8888-1111-2222\n戶名：台北超馬承辦小組',
      registrations: [
        {
          reg_code: 'DEMO-TPE-0001',
          bib_number: 'A001',
          category_code: '50K',
          runner_name: '林冠宇',
          runner_id_number: 'A123456789',
          runner_email: 'kuanyu.lin@example.com',
          runner_phone: '0912-345678',
          payment_status: '已繳費',
          total_amount: 2180,
          answers: {
            full_name: '林冠宇',
            gender: '男',
            id_number: 'A123456789',
            birth_date: '1989-04-12',
            city: '台北市',
            country: 'TPE',
            phone: '0912-345678',
            email: 'kuanyu.lin@example.com',
            emergency_name: '林佳慧',
            emergency_phone: '0922-333444',
            race_category: '超馬 50K',
            shirt_size: 'L',
            addons: ['疾速聯名防風外套'],
            notes: '目標 4 小時內完賽！',
          },
          priceBreakdown: [
            { fieldLabel: '報名組別', itemLabel: '超馬 50K', amount: 1500 },
            { fieldLabel: '加購賽事裝備與服務（可複選）', itemLabel: '疾速聯名防風外套', amount: 680 },
          ],
        },
        {
          reg_code: 'DEMO-TPE-0002',
          bib_number: 'B001',
          category_code: '42K',
          runner_name: '張雅婷',
          runner_id_number: 'F223456781',
          runner_email: 'yating.chang@example.com',
          runner_phone: '0933-555666',
          payment_status: '已繳費',
          total_amount: 1350,
          answers: {
            full_name: '張雅婷',
            gender: '女',
            id_number: 'F223456781',
            birth_date: '1994-08-25',
            city: '新北市',
            country: 'TPE',
            phone: '0933-555666',
            email: 'yating.chang@example.com',
            emergency_name: '張志豪',
            emergency_phone: '0955-777888',
            race_category: '全馬 42K',
            shirt_size: 'S',
            addons: ['完賽獎牌雷射刻字服務'],
            notes: '',
          },
          priceBreakdown: [
            { fieldLabel: '報名組別', itemLabel: '全馬 42K', amount: 1200 },
            { fieldLabel: '加購賽事裝備與服務（可複選）', itemLabel: '完賽獎牌雷射刻字服務', amount: 150 },
          ],
        },
        {
          reg_code: 'DEMO-TPE-0003',
          bib_number: '',
          category_code: '21K',
          runner_name: '王柏翔',
          runner_id_number: 'C120000001',
          runner_email: 'poshiang.wang@example.com',
          runner_phone: '0966-112233',
          payment_status: '待繳費',
          total_amount: 1200,
          answers: {
            full_name: '王柏翔',
            gender: '男',
            id_number: 'C120000001',
            birth_date: '1997-11-03',
            city: '基隆市',
            country: 'TPE',
            phone: '0966-112233',
            email: 'poshiang.wang@example.com',
            emergency_name: '王美玲',
            emergency_phone: '0911-223344',
            race_category: '半馬 21K',
            shirt_size: 'M',
            addons: ['賽日接駁專車'],
            notes: '素食補給',
          },
          priceBreakdown: [
            { fieldLabel: '報名組別', itemLabel: '半馬 21K', amount: 1000 },
            { fieldLabel: '加購賽事裝備與服務（可複選）', itemLabel: '賽日接駁專車', amount: 200 },
          ],
        },
        {
          reg_code: 'DEMO-TPE-0004',
          bib_number: 'D001',
          category_code: '10K',
          runner_name: '黃詩涵',
          runner_id_number: 'H220000008',
          runner_email: 'shihan.huang@example.com',
          runner_phone: '0987-654321',
          payment_status: '已繳費',
          total_amount: 800,
          answers: {
            full_name: '黃詩涵',
            gender: '女',
            id_number: 'H220000008',
            birth_date: '1999-02-14',
            city: '桃園市',
            country: 'TPE',
            phone: '0987-654321',
            email: 'shihan.huang@example.com',
            emergency_name: '黃建國',
            emergency_phone: '0919-888777',
            race_category: '挑戰組 10K',
            shirt_size: 'XS',
            addons: [],
            notes: '',
          },
          priceBreakdown: [{ fieldLabel: '報名組別', itemLabel: '挑戰組 10K', amount: 800 }],
        },
      ],
    },
    {
      owner: orgMap.org_south,
      slug: 'demo-kaohsiung-starlight-2026',
      name: '2026 高雄港都星光半程馬拉松',
      english_name: '2026 KAOHSIUNG HARBOR STARLIGHT HALF MARATHON',
      event_type: 'distance',
      timing_event_id: 'KHH-2026-STAR',
      event_date: offsetDate(80),
      location: '高雄駁二藝術特區大義倉庫廣場',
      reg_start_at: offsetDt(-5),
      reg_end_at: offsetDt(40),
      max_participants: 800,
      is_active: 1,
      event_status: 'open',
      banner_title: '2026 高雄港都星光半程馬拉松',
      banner_subtitle: '吹著海風迎向星光・港灣夜景最美夜跑盛會開放報名中！',
      banner_image_url:
        'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1600&q=80',
      description:
        '沿途經過高雄流行音樂中心、大港橋、愛河灣與旗津夕陽景觀！賽後提供高雄在地海味補給與音樂派對。',
      payment_info:
        '請於 3 日內完成匯款：\n銀行代碼：004（台灣銀行）\n帳號：0123-4567-8901\n戶名：高雄路跑承辦小組',
      registrations: [
        {
          reg_code: 'DEMO-KHH-0001',
          bib_number: 'C001',
          category_code: '21K',
          runner_name: '陳俊宏',
          runner_id_number: 'E123456789',
          runner_email: 'junhong.chen@example.com',
          runner_phone: '0921-111222',
          payment_status: '已繳費',
          total_amount: 1150,
          answers: {
            full_name: '陳俊宏',
            gender: '男',
            id_number: 'E123456789',
            birth_date: '1986-09-20',
            city: '高雄市',
            country: 'TPE',
            phone: '0921-111222',
            email: 'junhong.chen@example.com',
            emergency_name: '陳淑芬',
            emergency_phone: '0932-222333',
            race_category: '半馬 21K',
            shirt_size: 'XL',
            addons: ['完賽獎牌雷射刻字服務'],
            notes: '',
          },
          priceBreakdown: [
            { fieldLabel: '報名組別', itemLabel: '半馬 21K', amount: 1000 },
            { fieldLabel: '加購賽事裝備與服務（可複選）', itemLabel: '完賽獎牌雷射刻字服務', amount: 150 },
          ],
        },
        {
          reg_code: 'DEMO-KHH-0002',
          bib_number: 'D001',
          category_code: '10K',
          runner_name: '吳欣怡',
          runner_id_number: 'S223456782',
          runner_email: 'xinyi.wu@example.com',
          runner_phone: '0952-333444',
          payment_status: '已繳費',
          total_amount: 800,
          answers: {
            full_name: '吳欣怡',
            gender: '女',
            id_number: 'S223456782',
            birth_date: '1992-07-08',
            city: '台南市',
            country: 'TPE',
            phone: '0952-333444',
            email: 'xinyi.wu@example.com',
            emergency_name: '吳明哲',
            emergency_phone: '0918-444555',
            race_category: '挑戰組 10K',
            shirt_size: 'M',
            addons: [],
            notes: '',
          },
          priceBreakdown: [{ fieldLabel: '報名組別', itemLabel: '挑戰組 10K', amount: 800 }],
        },
        {
          reg_code: 'DEMO-KHH-0003',
          bib_number: '',
          category_code: '5K',
          runner_name: '蔡家豪',
          runner_id_number: 'T120000006',
          runner_email: 'chiahao.tsai@example.com',
          runner_phone: '0975-666777',
          payment_status: '待繳費',
          total_amount: 600,
          answers: {
            full_name: '蔡家豪',
            gender: '男',
            id_number: 'T120000006',
            birth_date: '2001-01-29',
            city: '屏東縣',
            country: 'TPE',
            phone: '0975-666777',
            email: 'chiahao.tsai@example.com',
            emergency_name: '蔡惠美',
            emergency_phone: '0963-777888',
            race_category: '健康組 5K',
            shirt_size: 'L',
            addons: [],
            notes: '親子同跑',
          },
          priceBreakdown: [{ fieldLabel: '報名組別', itemLabel: '健康組 5K', amount: 600 }],
        },
      ],
    },
    {
      owner: orgMap.org_north,
      slug: 'demo-taiwan-24h-ultra-2027',
      name: '2027 台灣國際 24 小時繞圈超級馬拉松（籌備中）',
      english_name: '2027 TAIWAN INTERNATIONAL 24H ULTRA MARATHON',
      event_type: 'lap_timed',
      timing_event_id: 'TUR-2027-24H',
      event_date: offsetDate(140),
      location: '台北花博新生園區田徑場',
      reg_start_at: offsetDt(15),
      reg_end_at: offsetDt(75),
      max_participants: 250,
      is_active: 1,
      event_status: 'preparing',
      banner_title: '2027 台灣國際 24 小時繞圈超級馬拉松',
      banner_subtitle: 'IAU 國際認證標準賽道・預計 15 天後正式開放報名，敬請期待！',
      banner_image_url:
        'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1600&q=80',
      description: '24H / 12H / 6H 繞圈限時極限挑戰賽，目前正進行賽道丈量與物資籌備中，將於報名起始日準時上架首頁。',
      payment_info: '將於開放報名時公告正式匯款帳號。',
      registrations: [],
    },
    {
      owner: orgMap.org_south,
      slug: 'demo-yangmingshan-trail-2026',
      name: '2026 春季山林越野挑戰賽（已結案）',
      english_name: '2026 SPRING MOUNTAIN TRAIL CHALLENGE',
      event_type: 'distance',
      timing_event_id: 'TUR-2026-TRAIL',
      event_date: offsetDate(-15),
      location: '高雄柴山登山口廣場',
      reg_start_at: offsetDt(-70),
      reg_end_at: offsetDt(-25),
      max_participants: 300,
      is_active: 0,
      event_status: 'closed',
      banner_title: '2026 春季山林越野挑戰賽',
      banner_subtitle: '本場賽事已圓滿落幕並完成結案，感謝所有跑者支持！',
      banner_image_url:
        'https://images.unsplash.com/photo-1513593771513-7b58b6c4af38?auto=format&fit=crop&w=1600&q=80',
      description: '已結案賽事範例，不會出現在前台首頁，但承辦人與最高權限管理者仍可於後台檢視歷史名單與匯出報表。',
      payment_info: '本活動已結案停止收費。',
      registrations: [
        {
          reg_code: 'DEMO-TRL-0001',
          bib_number: 'A001',
          category_code: '21K',
          runner_name: '許哲維',
          runner_id_number: 'D123456789',
          runner_email: 'chewei.hsu@example.com',
          runner_phone: '0910-222333',
          payment_status: '已繳費',
          total_amount: 1000,
          answers: {
            full_name: '許哲維',
            gender: '男',
            id_number: 'D123456789',
            birth_date: '1988-06-15',
            city: '台南市',
            country: 'TPE',
            phone: '0910-222333',
            email: 'chewei.hsu@example.com',
            emergency_name: '許佩珊',
            emergency_phone: '0920-444555',
            race_category: '半馬 21K',
            shirt_size: 'L',
            addons: [],
            notes: '',
          },
          priceBreakdown: [{ fieldLabel: '報名組別', itemLabel: '半馬 21K', amount: 1000 }],
        },
        {
          reg_code: 'DEMO-TRL-0002',
          bib_number: 'B001',
          category_code: '10K',
          runner_name: '鄭宜庭',
          runner_id_number: 'B223456780',
          runner_email: 'yiting.cheng@example.com',
          runner_phone: '0918-777999',
          payment_status: '已繳費',
          total_amount: 800,
          answers: {
            full_name: '鄭宜庭',
            gender: '女',
            id_number: 'B223456780',
            birth_date: '1995-12-09',
            city: '台中市',
            country: 'TPE',
            phone: '0918-777999',
            email: 'yiting.cheng@example.com',
            emergency_name: '鄭國華',
            emergency_phone: '0935-111333',
            race_category: '挑戰組 10K',
            shirt_size: 'S',
            addons: [],
            notes: '',
          },
          priceBreakdown: [{ fieldLabel: '報名組別', itemLabel: '挑戰組 10K', amount: 800 }],
        },
      ],
    },
  ];

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

  const insertReg = db.prepare(`
    INSERT INTO registrations (
      event_id, reg_code, bib_number, category_code, runner_name, runner_id_number, runner_email, runner_phone,
      answers_json, price_breakdown_json, total_amount, payment_status, sheet_sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let createdEvents = 0;
  let createdRegs = 0;

  for (const ev of demoEvents) {
    let eventRow = db.prepare('SELECT * FROM events WHERE slug = ?').get(ev.slug);
    if (!eventRow) {
      const info = insertEvent.run(
        ev.owner.id,
        ev.owner.username,
        ev.owner.display_name,
        ev.slug,
        ev.name,
        ev.english_name,
        ev.event_type,
        ev.timing_event_id,
        'https://runchip-timing.vercel.app/',
        '',
        ev.event_date,
        ev.location,
        ev.reg_start_at,
        ev.reg_end_at,
        ev.max_participants,
        ev.is_active,
        ev.event_status,
        ev.banner_title,
        ev.banner_subtitle,
        ev.banner_image_url,
        ev.description,
        ev.payment_info,
        sheetMode,
        sheetId,
        sheetUrl,
        ev.name.slice(0, 60),
        gasUrl,
        JSON.stringify(defaultFields)
      );
      eventRow = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
      createdEvents += 1;
    }

    for (const r of ev.registrations) {
      const dupReg = db.prepare('SELECT id FROM registrations WHERE reg_code = ?').get(r.reg_code);
      if (dupReg) continue;
      insertReg.run(
        eventRow.id,
        r.reg_code,
        r.bib_number,
        r.category_code,
        r.runner_name,
        r.runner_id_number,
        r.runner_email,
        r.runner_phone,
        JSON.stringify(r.answers),
        JSON.stringify(r.priceBreakdown),
        r.total_amount,
        r.payment_status,
        master.configured ? 'pending' : 'local'
      );
      createdRegs += 1;
    }
  }

  return {
    createdOrganizers,
    createdEvents,
    createdRegs,
    summary: getDbSummary(),
  };
}

// GET /api/admin/data/summary — 取得資料庫目前筆數統計
router.get('/summary', (_req, res) => {
  return res.json({
    summary: getDbSummary(),
  });
});

// POST /api/admin/data/seed-demo — 一鍵載入測試資料
router.post('/seed-demo', async (_req, res) => {
  const result = seedDemoDataset();
  await syncAllTablesToCloud();

  const detail =
    result.createdEvents === 0 && result.createdRegs === 0 && result.createdOrganizers === 0
      ? '測試資料均已存在於資料庫中，無需重複建立。'
      : `測試資料載入完成！本次新增 ${result.createdOrganizers} 位承辦人、${result.createdEvents} 場活動（含開放中／籌備中／已結案）與 ${result.createdRegs} 筆範例報名資料。`;

  return res.json({
    ...result,
    message: detail,
  });
});

// GET /api/admin/data/backup — 下載全平台完整備份檔 (.json)
router.get('/backup', (req, res) => {
  const admins = db.prepare('SELECT * FROM admins ORDER BY id ASC').all();
  const events = db.prepare('SELECT * FROM events ORDER BY id ASC').all();
  const registrations = db.prepare('SELECT * FROM registrations ORDER BY id ASC').all();

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const payload = {
    schema: 'tur-registration-full-backup-v1',
    exportedAt: now.toISOString(),
    exportedBy: req.adminRecord.username,
    counts: {
      admins: admins.length,
      events: events.length,
      registrations: registrations.length,
    },
    data: {
      admins,
      events,
      registrations,
    },
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="tur-registration-backup-${stamp}.json"`
  );
  return res.send(JSON.stringify(payload, null, 2));
});

// POST /api/admin/data/restore — 上傳完整備份檔 (.json) 一鍵還原全平台資料
router.post('/restore', async (req, res) => {
  const backup = req.body;
  if (
    !backup ||
    !backup.data ||
    !Array.isArray(backup.data.admins) ||
    !Array.isArray(backup.data.events) ||
    !Array.isArray(backup.data.registrations)
  ) {
    return res.status(400).json({
      error: '無效的備份檔格式，請選擇本系統匯出的完整備份 JSON 檔案。',
    });
  }

  const hasSuperAdmin = backup.data.admins.some((a) => a.role === 'super_admin');
  if (!hasSuperAdmin) {
    return res.status(400).json({
      error: '備份檔中缺少最高權限承辦人（super_admin）帳號，為避免系統鎖死已取消還原。',
    });
  }

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN TRANSACTION;');
  try {
    db.exec('DELETE FROM registrations;');
    db.exec('DELETE FROM events;');
    db.exec('DELETE FROM admins;');

    const insAdmin = db.prepare(
      'INSERT INTO admins (id, username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const a of backup.data.admins) {
      insAdmin.run(
        Number(a.id),
        String(a.username),
        String(a.password_hash),
        String(a.display_name || a.username),
        String(a.role || 'organizer'),
        String(a.created_at || new Date().toISOString())
      );
    }

    const insEvent = db.prepare(`
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
    for (const ev of backup.data.events) {
      insEvent.run(
        Number(ev.id),
        Number(ev.owner_admin_id || 1),
        String(ev.owner_username || 'admin'),
        String(ev.owner_display_name || ''),
        String(ev.slug),
        String(ev.name),
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
        ev.is_active ? 1 : 0,
        String(ev.event_status || 'auto'),
        String(ev.banner_title || ev.name || ''),
        String(ev.banner_subtitle || ''),
        String(ev.banner_image_url || ''),
        String(ev.description || ''),
        String(ev.payment_info || ''),
        String(ev.sheet_sync_mode || 'local'),
        String(ev.sheet_id || ''),
        String(ev.sheet_url || ''),
        String(ev.sheet_tab_name || ev.name || '報名資料'),
        String(ev.gas_webhook_url || ''),
        typeof ev.fields_json === 'string' ? ev.fields_json : JSON.stringify(ev.fields || []),
        ev.last_sheet_sync_at || null,
        String(ev.created_at || new Date().toISOString()),
        String(ev.updated_at || new Date().toISOString())
      );
    }

    const insReg = db.prepare(`
      INSERT INTO registrations (
        id, event_id, reg_code, bib_number, category_code,
        runner_name, runner_id_number, runner_email, runner_phone,
        answers_json, price_breakdown_json, total_amount, payment_status, remittance_last5,
        reg_type, group_name, group_code, payment_mode,
        sheet_sync_status, sheet_sync_error, sheet_row_number, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of backup.data.registrations) {
      insReg.run(
        Number(r.id),
        Number(r.event_id),
        String(r.reg_code),
        String(r.bib_number || ''),
        String(r.category_code || ''),
        String(r.runner_name || ''),
        String(r.runner_id_number || ''),
        String(r.runner_email || ''),
        String(r.runner_phone || ''),
        typeof r.answers_json === 'string' ? r.answers_json : JSON.stringify(r.answers || {}),
        typeof r.price_breakdown_json === 'string'
          ? r.price_breakdown_json
          : JSON.stringify(r.priceBreakdown || []),
        Number(r.total_amount || 0),
        String(r.payment_status || '待繳費'),
        String(r.remittance_last5 || ''),
        String(r.reg_type || 'individual'),
        String(r.group_name || ''),
        String(r.group_code || ''),
        String(r.payment_mode || 'individual'),
        String(r.sheet_sync_status || 'local'),
        String(r.sheet_sync_error || ''),
        r.sheet_row_number ? Number(r.sheet_row_number) : null,
        String(r.created_at || new Date().toISOString())
      );
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(400).json({ error: `備份還原失敗：${err.message}` });
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }

  await syncAllTablesToCloud();
  const summary = getDbSummary();
  return res.json({
    summary,
    message: `備份還原完成！已還原 ${summary.adminsCount} 位承辦人、${summary.eventsCount} 場活動與 ${summary.regsCount} 筆報名紀錄。`,
  });
});

// POST /api/admin/data/clear — 資料清空（需明確帶入 confirm: 'CONFIRM_CLEAR'）
router.post('/clear', async (req, res) => {
  const { scope = 'registrations_only', clearOrganizers = false, confirm } = req.body || {};
  if (confirm !== 'CONFIRM_CLEAR') {
    return res.status(400).json({ error: '缺少清空確認參數，已取消操作。' });
  }

  if (scope === 'registrations_only') {
    db.exec('DELETE FROM registrations;');
    await syncAllTablesToCloud();
    return res.json({
      summary: getDbSummary(),
      message: '已清空所有報名名單紀錄（已保留所有活動設定與承辦人帳號）。',
    });
  }

  if (scope === 'all_data') {
    db.exec('BEGIN TRANSACTION;');
    try {
      db.exec('DELETE FROM registrations;');
      db.exec('DELETE FROM events;');
      if (clearOrganizers) {
        db.prepare('DELETE FROM admins WHERE id != ?').run(req.adminRecord.id);
      }
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      return res.status(500).json({ error: `資料清空失敗：${err.message}` });
    }

    await syncAllTablesToCloud();
    return res.json({
      summary: getDbSummary(),
      message: clearOrganizers
        ? '已清空所有活動、報名名單與其他承辦人帳號（僅保留您目前登入的最高權限帳號）。'
        : '已清空所有活動與報名名單資料（已保留承辦人帳號）。',
    });
  }

  return res.status(400).json({ error: '不支援的清空範圍。' });
});

module.exports = router;
module.exports.seedDemoDataset = seedDemoDataset;
