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
const {
  sendRegistrationEmail,
  sendGroupLeaderEmail,
  sendMultiBundleEmail,
} = require('../services/emailService');
const { maskIdNumber, resolveCategoryMeta } = require('../services/chipBridge');

const router = express.Router();

function isBundleCodeFormat(code) {
  return /^TURM-[A-Z0-9-]+$/i.test(String(code || '').trim());
}

function generateBundleCode() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  let code = `TURM-${yy}${mm}${dd}-${Math.floor(1000 + Math.random() * 9000)}`;
  while (db.prepare('SELECT id FROM registrations WHERE upper(bundle_code) = ?').get(code)) {
    code = `TURM-${yy}${mm}${dd}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  return code;
}

function generateRegCode(seqBase) {
  const yearShort = String(new Date().getFullYear()).slice(-2);
  const seqNum = String(seqBase).padStart(4, '0');
  let regCode = `TUR${yearShort}-${seqNum}`;
  if (db.prepare('SELECT id FROM registrations WHERE reg_code = ?').get(regCode)) {
    regCode = `TUR${yearShort}-${seqNum}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  }
  return regCode;
}

function getGroupMembersForEvent(eventId, groupCode) {
  const gc = String(groupCode || '').trim().toUpperCase();
  if (!gc) return [];
  return db
    .prepare(
      `SELECT * FROM registrations
       WHERE event_id = ? AND upper(group_code) = ? AND payment_status != '已取消'
       ORDER BY id ASC`
    )
    .all(Number(eventId), gc);
}

function resolveGroupLeader(members) {
  if (!Array.isArray(members) || members.length === 0) return null;
  const explicit = members.find((m) => String(m.group_role || '').toLowerCase() === 'leader');
  return explicit || members[0];
}

function signRunnerEditToken(reg, { authIdNumber = '', isGroupLeader = false } = {}) {
  return jwt.sign(
    {
      purpose: 'runner_edit',
      regId: reg.id,
      eventId: reg.event_id,
      regCode: reg.reg_code,
      authIdNumber: String(authIdNumber || reg.runner_id_number || '').trim().toUpperCase(),
      isGroupLeader: Boolean(isGroupLeader),
    },
    JWT_SECRET,
    { expiresIn: '45m' }
  );
}

function verifyRunnerEditToken(token, expectedReg) {
  if (!token) return null;
  try {
    const payload = jwt.verify(String(token).trim(), JWT_SECRET);
    const ok =
      payload.purpose === 'runner_edit' &&
      Number(payload.regId) === Number(expectedReg.id) &&
      Number(payload.eventId) === Number(expectedReg.event_id) &&
      String(payload.regCode) === String(expectedReg.reg_code);
    return ok ? payload : null;
  } catch (_) {
    return null;
  }
}

function signGroupRemitToken(eventId, groupCode, leaderIdNumber) {
  return jwt.sign(
    {
      purpose: 'group_remit',
      eventId: Number(eventId),
      groupCode: String(groupCode || '').trim().toUpperCase(),
      leaderIdNumber: String(leaderIdNumber || '').trim().toUpperCase(),
    },
    JWT_SECRET,
    { expiresIn: '45m' }
  );
}

function signBundleRemitToken(bundleCode, idNumber) {
  return jwt.sign(
    {
      purpose: 'bundle_remit',
      bundleCode: String(bundleCode || '').trim().toUpperCase(),
      idNumber: String(idNumber || '').trim().toUpperCase(),
    },
    JWT_SECRET,
    { expiresIn: '45m' }
  );
}

function serializePublicEvent(event) {
  const countRow = db
    .prepare("SELECT COUNT(*) as cnt FROM registrations WHERE event_id = ? AND payment_status != '已取消'")
    .get(event.id);
  const currentCount = countRow?.cnt || 0;
  const regState = computeEventRegistrationState(event, currentCount);

  return {
    id: event.id,
    owner_admin_id: Number(event.owner_admin_id || 1),
    owner_username: event.owner_username || 'admin',
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

function serializeLookupRecord(event, reg, verifiedIdNumber = '') {
  const authId = String(verifiedIdNumber || reg.runner_id_number || '').trim().toUpperCase();
  const countRow = db
    .prepare("SELECT COUNT(*) as cnt FROM registrations WHERE event_id = ? AND payment_status != '已取消'")
    .get(event.id);
  const regState = computeEventRegistrationState(event, countRow?.cnt || 0);
  const isClosed = regState.status === 'closed';
  const isCancelled = reg.payment_status === '已取消';
  const isPaid = reg.payment_status === '已繳費';

  // 團體報名團長／組員權限判定（比照路跑管理系統：僅團長可修改整團資料與末五碼，組員唯讀）
  const hasGroup = Boolean(String(reg.group_code || '').trim());
  let groupInfo = null;
  let isGroupLeaderLogin = false;
  let isGroupMemberReadOnly = false;
  let resolvedRole = String(reg.group_role || '').toLowerCase();

  if (hasGroup) {
    const members = getGroupMembersForEvent(event.id, reg.group_code);
    const leader = resolveGroupLeader(members);
    if (!resolvedRole && leader) {
      resolvedRole = leader.id === reg.id ? 'leader' : 'member';
    }
    isGroupLeaderLogin = Boolean(
      leader && authId && String(leader.runner_id_number || '').trim().toUpperCase() === authId
    );
    isGroupMemberReadOnly = !isGroupLeaderLogin;
    const unpaidMembers = members.filter((m) => m.payment_status !== '已繳費');
    const groupTotal = members.reduce((sum, m) => sum + Number(m.total_amount || 0), 0);
    const unifiedLast5 =
      leader?.remittance_last5 || (members.find((m) => m.remittance_last5)?.remittance_last5 || '');

    groupInfo = {
      group_code: String(reg.group_code || '').toUpperCase(),
      group_name: reg.group_name || '團體報名',
      leader_name: leader?.runner_name || '',
      leader_email: leader?.runner_email || '',
      leader_reg_code: leader?.reg_code || '',
      member_count: members.length,
      unpaid_count: unpaidMembers.length,
      total_amount: groupTotal,
      remittance_last5: unifiedLast5,
      isLeader: isGroupLeaderLogin,
      isMemberReadOnly: isGroupMemberReadOnly,
      isEditingOtherMember: Boolean(isGroupLeaderLogin && leader && leader.id !== reg.id),
      groupRemitToken:
        isGroupLeaderLogin && !isClosed && !isCancelled && unpaidMembers.length > 0
          ? signGroupRemitToken(event.id, reg.group_code, authId)
          : '',
      members: members.map((m, idx) => ({
        reg_code: m.reg_code,
        runner_name: m.runner_name,
        category_code: m.category_code || '',
        bib_number: m.bib_number || '',
        payment_status: m.payment_status,
        total_amount: Number(m.total_amount || 0),
        group_role: leader && m.id === leader.id ? 'leader' : 'member',
        index: idx + 1,
      })),
    };
  }

  // 多場聯合報名合併單彙總 (TURM-...)
  let bundleInfo = null;
  const bundleCode = String(reg.bundle_code || '').trim().toUpperCase();
  if (bundleCode && isBundleCodeFormat(bundleCode)) {
    const siblings = db
      .prepare(
        `SELECT r.*, e.name as event_name, e.event_date as event_date, e.slug as event_slug
         FROM registrations r
         JOIN events e ON e.id = r.event_id
         WHERE upper(r.bundle_code) = ? AND upper(r.runner_id_number) = ? AND r.payment_status != '已取消'
         ORDER BY r.id ASC`
      )
      .all(bundleCode, String(reg.runner_id_number || '').trim().toUpperCase());

    if (siblings.length >= 2) {
      const unpaidSibs = siblings.filter((s) => s.payment_status !== '已繳費');
      const bundleTotal = siblings.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
      const bundleLast5 = siblings.find((s) => s.remittance_last5)?.remittance_last5 || '';
      bundleInfo = {
        bundle_code: bundleCode,
        event_count: siblings.length,
        unpaid_count: unpaidSibs.length,
        total_amount: bundleTotal,
        remittance_last5: bundleLast5,
        bundleRemitToken:
          !isGroupMemberReadOnly && unpaidSibs.length > 0
            ? signBundleRemitToken(bundleCode, authId)
            : '',
        items: siblings.map((s) => ({
          reg_code: s.reg_code,
          event_id: s.event_id,
          event_slug: s.event_slug,
          event_name: s.event_name,
          event_date: s.event_date,
          category_code: s.category_code || '',
          bib_number: s.bib_number || '',
          total_amount: Number(s.total_amount || 0),
          payment_status: s.payment_status,
        })),
      };
    }
  }

  const canEdit = !isClosed && !isCancelled && !isGroupMemberReadOnly;
  const cannotEditReason = isClosed
    ? '本活動已結案，僅供查詢紀錄，無法再線上修改資料。'
    : isCancelled
    ? '此筆報名已標記為「已取消」，無法線上修改，如有疑問請聯繫主辦單位。'
    : isGroupMemberReadOnly
    ? `組員唯讀（不可修改）：如需異動資料或補填匯款後五碼，請洽團長「${groupInfo?.leader_name || '團長'}」登入修改。`
    : '';

  return {
    editToken: canEdit
      ? signRunnerEditToken(reg, { authIdNumber: authId, isGroupLeader: isGroupLeaderLogin })
      : '',
    canEdit,
    cannotEditReason,
    pricingLocked: isPaid,
    pricingLockedNotice: isPaid
      ? '本筆報名已完成對帳（已繳費），為確保帳務一致，已鎖定「金額變動項目」，但仍可修改聯絡電話、緊急聯絡人與備註等個人資料。'
      : '',
    groupInfo,
    bundleInfo,
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
      group_role: resolvedRole || '',
      bundle_code: bundleCode,
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

/**
 * 雙因子匹配輔助：支援「身分證字號」＋「報名序號 / 團報代碼 / 合併單號 / Email」
 */
function findMatchedRegistrationsByCredential({ idNumber, credential, regCode, email, eventId = null }) {
  const idUpper = String(idNumber || '').trim().toUpperCase();
  const credRaw = String(credential || regCode || email || '').trim();
  const credUpper = credRaw.toUpperCase();
  const credLower = credRaw.toLowerCase();

  if (!idUpper || !credRaw) return [];

  const scopeSql = eventId ? 'AND event_id = ?' : '';
  const scopeParams = eventId ? [Number(eventId)] : [];

  return db
    .prepare(
      `SELECT * FROM registrations
       WHERE upper(runner_id_number) = ?
         ${scopeSql}
         AND (
           upper(reg_code) = ?
           OR upper(group_code) = ?
           OR upper(bundle_code) = ?
           OR lower(runner_email) = ?
         )
       ORDER BY created_at DESC, id DESC`
    )
    .all(idUpper, ...scopeParams, credUpper, credUpper, credUpper, credLower);
}

// POST /api/public/lookup — 跨活動反向查詢（支援序號 / 團報碼 / 合併單號 / Email；團長自動帶入全團管理）
router.post('/lookup', (req, res) => {
  const idNumber = String(req.body?.idNumber || '').trim().toUpperCase();
  const credential = String(req.body?.credential || '').trim();
  const regCode = String(req.body?.regCode || '').trim().toUpperCase();
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (!idNumber) {
    return res.status(400).json({ error: '請輸入身份證字號以驗證身分。' });
  }
  if (!credential && !regCode && !email) {
    return res.status(400).json({
      error: '請輸入「報名序號」、「團報代碼」、「合併單號」或「電子信箱」其中一項進行雙重驗證。',
    });
  }

  const matched = findMatchedRegistrationsByCredential({ idNumber, credential, regCode, email });
  if (matched.length === 0) {
    return res.status(404).json({
      error: '查無符合條件的報名紀錄，請確認證件號碼與序號／團報碼／合併單號／電子信箱是否正確。',
    });
  }

  // 載入本人名下所有未取消報名紀錄，若本人是某團團長則一併帶入全團組員供切換管理
  const ownActive = db
    .prepare(
      `SELECT * FROM registrations
       WHERE upper(runner_id_number) = ? AND payment_status != '已取消'
       ORDER BY created_at DESC, id DESC`
    )
    .all(idNumber);

  const combinedMap = new Map();
  const seedList = ownActive.length > 0 ? ownActive : matched;
  for (const r of seedList) {
    combinedMap.set(r.id, r);
    if (r.group_code) {
      const members = getGroupMembersForEvent(r.event_id, r.group_code);
      const leader = resolveGroupLeader(members);
      if (leader && String(leader.runner_id_number || '').trim().toUpperCase() === idNumber) {
        for (const m of members) {
          combinedMap.set(m.id, m);
        }
      }
    }
  }
  // 確保最初比對命中的紀錄也在列表內
  for (const r of matched) {
    if (!combinedMap.has(r.id)) combinedMap.set(r.id, r);
  }

  const eventCache = new Map();
  const getEv = (eid) => {
    if (!eventCache.has(eid)) {
      eventCache.set(eid, db.prepare('SELECT * FROM events WHERE id = ?').get(eid));
    }
    return eventCache.get(eid);
  };

  const results = [];
  for (const reg of combinedMap.values()) {
    const event = getEv(reg.event_id);
    if (!event) continue;
    results.push(serializeLookupRecord(event, reg, idNumber));
  }

  return res.json({
    count: results.length,
    matchedRegCode: matched[0].reg_code,
    records: results,
  });
});

// POST /api/public/events/:slug/lookup — 單一活動內反向查詢（支援團長帶入全團）
router.post('/events/:slug/lookup', (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const event = db.prepare('SELECT * FROM events WHERE slug = ?').get(slug);
  if (!event) {
    return res.status(404).json({ error: '找不到此路跑活動。' });
  }

  const idNumber = String(req.body?.idNumber || '').trim().toUpperCase();
  const credential = String(req.body?.credential || '').trim();
  const regCode = String(req.body?.regCode || '').trim().toUpperCase();
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (!idNumber) {
    return res.status(400).json({ error: '請輸入身份證字號。' });
  }
  if (!credential && !regCode && !email) {
    return res.status(400).json({ error: '請輸入「報名序號」、「團報代碼」、「合併單號」或「電子信箱」進行雙重驗證。' });
  }

  const matched = findMatchedRegistrationsByCredential({
    idNumber,
    credential,
    regCode,
    email,
    eventId: event.id,
  });
  if (matched.length === 0) {
    return res.status(404).json({
      error: '在此活動中查無符合的報名資料，請確認輸入的證件號碼與序號／團報碼／電子信箱。',
    });
  }

  const primary = matched[0];
  const primarySerialized = serializeLookupRecord(event, primary, idNumber);

  // 若為團長登入，額外附上全團各成員完整查改物件供前台直接切換管理
  let groupMemberRecords = [];
  if (primarySerialized.groupInfo?.isLeader) {
    const members = getGroupMembersForEvent(event.id, primary.group_code);
    groupMemberRecords = members.map((m) => serializeLookupRecord(event, m, idNumber));
  }

  return res.json({
    ...primarySerialized,
    groupMemberRecords,
  });
});

// PATCH /api/public/groups/:groupCode/remittance — 團長一次補填／更新整團匯款後五碼
router.patch('/groups/:groupCode/remittance', async (req, res) => {
  const groupCode = String(req.params.groupCode || '').trim().toUpperCase();
  const last5 = String(req.body?.remittance_last5 || '').trim();
  const token = String(req.body?.groupRemitToken || '').trim();
  const eventId = Number(req.body?.eventId || 0);

  if (!isValidRemittanceLast5(last5)) {
    return res.status(400).json({ error: '整團統一匯款後五碼須為 5 位純數字。' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (_) {
    return res.status(401).json({ error: '團長驗證已過期或無效，請重新查詢後再操作。' });
  }
  if (
    payload.purpose !== 'group_remit' ||
    String(payload.groupCode || '').toUpperCase() !== groupCode ||
    (eventId && Number(payload.eventId) !== eventId)
  ) {
    return res.status(403).json({ error: '無權修改此團報之匯款後五碼。' });
  }

  const targetEventId = Number(payload.eventId);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(targetEventId);
  if (!event) {
    return res.status(404).json({ error: '找不到對應活動。' });
  }

  const members = getGroupMembersForEvent(targetEventId, groupCode);
  const leader = resolveGroupLeader(members);
  if (!leader || String(leader.runner_id_number || '').toUpperCase() !== String(payload.leaderIdNumber || '').toUpperCase()) {
    return res.status(403).json({ error: '僅限本團團長可補填整團統一匯款後五碼。' });
  }

  const unpaidMembers = members.filter((m) => m.payment_status !== '已繳費');
  if (unpaidMembers.length === 0) {
    return res.status(400).json({ error: '本團所有成員皆已完成對帳（已繳費），無需再補填末五碼。' });
  }

  const fields = JSON.parse(event.fields_json || '[]');
  const updateStmt = db.prepare('UPDATE registrations SET remittance_last5 = ?, answers_json = ? WHERE id = ?');
  db.exec('BEGIN TRANSACTION;');
  try {
    for (const m of unpaidMembers) {
      const ans = JSON.parse(m.answers_json || '{}');
      ans.remittance_last5 = last5;
      updateStmt.run(last5, JSON.stringify(ans), m.id);
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ error: `更新整團末五碼失敗：${err.message}` });
  }

  const refreshedMembers = getGroupMembersForEvent(targetEventId, groupCode);
  const master = getMasterDatabaseConfig();
  if (master.configured || event.sheet_sync_mode !== 'local') {
    for (const m of refreshedMembers) {
      await updateRegistrationInSheet(event, fields, m).catch(() => {});
    }
    await syncAllRegistrationsToCloud();
  }

  return res.json({
    ok: true,
    groupCode,
    remittance_last5: last5,
    updatedCount: unpaidMembers.length,
    message: `已一次更新全團 ${groupCode}（共 ${unpaidMembers.length} 位待繳成員）的統一匯款末五碼為 ${last5}！`,
  });
});

// PATCH /api/public/bundles/:bundleCode/remittance — 多場合併單一次補填／更新全單匯款後五碼
router.patch('/bundles/:bundleCode/remittance', async (req, res) => {
  const bundleCode = String(req.params.bundleCode || '').trim().toUpperCase();
  const last5 = String(req.body?.remittance_last5 || '').trim();
  const token = String(req.body?.bundleRemitToken || '').trim();

  if (!isValidRemittanceLast5(last5)) {
    return res.status(400).json({ error: '合併單匯款後五碼須為 5 位純數字。' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (_) {
    return res.status(401).json({ error: '驗證已過期或無效，請重新查詢後再操作。' });
  }
  if (
    payload.purpose !== 'bundle_remit' ||
    String(payload.bundleCode || '').toUpperCase() !== bundleCode
  ) {
    return res.status(403).json({ error: '無權修改此合併單之匯款後五碼。' });
  }

  const targets = db
    .prepare(
      `SELECT * FROM registrations
       WHERE upper(bundle_code) = ? AND upper(runner_id_number) = ?
         AND payment_status != '已繳費' AND payment_status != '已取消'
       ORDER BY id ASC`
    )
    .all(bundleCode, String(payload.idNumber || '').toUpperCase());

  if (targets.length === 0) {
    return res.status(400).json({ error: '此合併單目前沒有待繳費場次可更新末五碼。' });
  }

  const updateStmt = db.prepare('UPDATE registrations SET remittance_last5 = ?, answers_json = ? WHERE id = ?');
  db.exec('BEGIN TRANSACTION;');
  try {
    for (const r of targets) {
      const ans = JSON.parse(r.answers_json || '{}');
      ans.remittance_last5 = last5;
      updateStmt.run(last5, JSON.stringify(ans), r.id);
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ error: `更新合併單末五碼失敗：${err.message}` });
  }

  const master = getMasterDatabaseConfig();
  for (const r of targets) {
    const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(r.event_id);
    if (!ev) continue;
    const latest = db.prepare('SELECT * FROM registrations WHERE id = ?').get(r.id);
    if (master.configured || ev.sheet_sync_mode !== 'local') {
      await updateRegistrationInSheet(ev, JSON.parse(ev.fields_json || '[]'), latest).catch(() => {});
    }
  }
  if (master.configured) {
    await syncAllRegistrationsToCloud();
  }

  return res.json({
    ok: true,
    bundleCode,
    remittance_last5: last5,
    updatedCount: targets.length,
    message: `已一次更新合併單 ${bundleCode} 全部 ${targets.length} 場待繳報名的匯款末五碼為 ${last5}！`,
  });
});

// PUT /api/public/events/:slug/registrations/:regCode — 選手（或團長）反向修改報名資料
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
  const tokenPayload = verifyRunnerEditToken(editToken, existing);
  if (!tokenPayload) {
    return res.status(401).json({
      error: '查詢驗證已過期或無效，請重新輸入證件號碼與序號／團報碼／信箱查詢後再修改。',
      code: 'EDIT_TOKEN_INVALID',
    });
  }

  const hasGroup = Boolean(String(existing.group_code || '').trim());
  let groupMembers = [];
  let groupLeader = null;
  if (hasGroup) {
    groupMembers = getGroupMembersForEvent(event.id, existing.group_code);
    groupLeader = resolveGroupLeader(groupMembers);
    const isLeader =
      Boolean(tokenPayload.isGroupLeader) &&
      groupLeader &&
      String(groupLeader.runner_id_number || '').toUpperCase() ===
        String(tokenPayload.authIdNumber || '').toUpperCase();
    if (!isLeader) {
      return res.status(403).json({
        error: '團體報名僅限團長登入修改資料，組員僅供唯讀檢視。',
        code: 'GROUP_MEMBER_READ_ONLY',
      });
    }
  }

  const countRow = db
    .prepare("SELECT COUNT(*) as cnt FROM registrations WHERE event_id = ? AND payment_status != '已取消'")
    .get(event.id);
  const regState = computeEventRegistrationState(event, countRow?.cnt || 0);

  if (regState.status === 'closed') {
    return res.status(400).json({ error: '本活動已結案，無法再修改報名資料。' });
  }
  if (existing.payment_status === '已取消') {
    return res.status(400).json({ error: '此筆報名已取消，無法修改資料。' });
  }

  const fields = JSON.parse(event.fields_json || '[]');
  const rawAnswers = { ...(req.body?.answers || {}) };

  // 若團長正在修改其他組員資料，強制維持沿用團長信箱與團報統一末五碼
  const isEditingOtherMember = Boolean(hasGroup && groupLeader && groupLeader.id !== existing.id);
  if (isEditingOtherMember && groupLeader) {
    rawAnswers.email = groupLeader.runner_email || rawAnswers.email;
    if (fields.some((f) => f.id === 'remittance_last5')) {
      rawAnswers.remittance_last5 = existing.remittance_last5 || '';
    }
  }

  const allowEmptyRemit = hasGroup || Boolean(existing.bundle_code);
  const result = validateAndCalculateRegistration(fields, rawAnswers, {
    allowEmptyRemittance: allowEmptyRemit,
  });
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

  // 防止將證件號碼改成同一活動其他有效跑者的證號
  if (summary.runnerIdNumber) {
    const dup = db
      .prepare(
        "SELECT reg_code FROM registrations WHERE event_id = ? AND upper(runner_id_number) = ? AND id != ? AND payment_status != '已取消'"
      )
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
      : req.body?.payment_mode === 'bundle'
      ? 'bundle'
      : req.body?.payment_mode === 'individual'
      ? 'individual'
      : existing.payment_mode || 'individual';
  const nextGroupName =
    req.body?.group_name !== undefined
      ? String(req.body.group_name || '').trim()
      : existing.group_name || '';

  const finalEmail = isEditingOtherMember && groupLeader ? groupLeader.runner_email : summary.runnerEmail;
  if (isEditingOtherMember && groupLeader) {
    result.cleanAnswers.email = finalEmail;
  }

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
    finalEmail,
    summary.runnerPhone,
    hasGroup ? existing.remittance_last5 || '' : summary.remittanceLast5 || '',
    nextPaymentMode,
    nextGroupName,
    JSON.stringify(result.cleanAnswers),
    JSON.stringify(result.priceBreakdown),
    result.totalAmount,
    existing.id
  );

  // 若團長修改了自己的 Email，同步更新同團其他組員 Email（維持統一由團長收信）
  if (hasGroup && !isEditingOtherMember && finalEmail && finalEmail !== existing.runner_email) {
    for (const m of groupMembers) {
      if (m.id === existing.id) continue;
      const mAns = JSON.parse(m.answers_json || '{}');
      mAns.email = finalEmail;
      db.prepare('UPDATE registrations SET runner_email = ?, answers_json = ? WHERE id = ?').run(
        finalEmail,
        JSON.stringify(mAns),
        m.id
      );
    }
  }

  const updatedReg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(existing.id);

  // 同步更新至統一 Google 試算表資料庫與活動專屬分頁
  const master = getMasterDatabaseConfig();
  if (master.configured || event.sheet_sync_mode !== 'local') {
    await updateRegistrationInSheet(event, fields, updatedReg).catch(() => {});
    if (hasGroup && !isEditingOtherMember && finalEmail !== existing.runner_email) {
      await syncAllRegistrationsToCloud();
    } else {
      await syncRegistrationToCloud(updatedReg);
    }
  }

  // 發送「報名資料更新確認信」至跑者（或團長）Email
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
    ...serializeLookupRecord(event, updatedReg, tokenPayload.authIdNumber),
    emailNotification,
  });
});

// POST /api/public/events/:slug/register — 單場個人報名
router.post('/events/:slug/register', async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const event = db.prepare('SELECT * FROM events WHERE slug = ?').get(slug);
  if (!event) {
    return res.status(404).json({ error: '找不到此路跑活動，無法送出報名。' });
  }

  const countRow = db
    .prepare("SELECT COUNT(*) as cnt FROM registrations WHERE event_id = ? AND payment_status != '已取消'")
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

  // 2. 重複報名防呆檢查（同一活動 + 相同身分證字號，排除已取消）
  if (summary.runnerIdNumber) {
    const dup = db
      .prepare(
        "SELECT reg_code FROM registrations WHERE event_id = ? AND upper(runner_id_number) = ? AND payment_status != '已取消'"
      )
      .get(event.id, summary.runnerIdNumber.toUpperCase());
    if (dup) {
      return res.status(409).json({
        error: `此證件號碼已完成報名（報名序號：${dup.reg_code}），請勿重複報名。如需修改或補填匯款後五碼，請使用「查詢／修改報名」功能。`,
        code: 'DUPLICATE_REGISTRATION',
      });
    }
  }

  // 3. 產生專屬報名序號（例：TUR26-0003）並解析組別代碼
  const totalCountRow = db.prepare('SELECT COUNT(*) as cnt FROM registrations WHERE event_id = ?').get(event.id);
  const regCode = generateRegCode((totalCountRow?.cnt || 0) + 1);
  const catMeta = resolveCategoryMeta(fields, result.cleanAnswers);

  const master = getMasterDatabaseConfig();
  const hasCloudSheet = master.configured || event.sheet_sync_mode !== 'local';

  // 4. 寫入資料庫
  const insertInfo = db
    .prepare(`
      INSERT INTO registrations (
        event_id, reg_code, category_code, runner_name, runner_id_number, runner_email, runner_phone,
        remittance_last5, reg_type, group_name, group_code, group_role, bundle_code, payment_mode,
        answers_json, price_breakdown_json, total_amount, payment_status, sheet_sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'individual', ?, '', '', '', ?, ?, ?, ?, '待繳費', ?)
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

  // 5. 即時寫入平台統一 Google 試算表
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

  // 6. 寄發個人報名確認信
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
      group_role: '',
      bundle_code: '',
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

// POST /api/public/events/:slug/register-group — 團體報名（比照路跑管理系統：2～50 人、第 1 位團長統一收信匯款與管理）
router.post('/events/:slug/register-group', async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const event = db.prepare('SELECT * FROM events WHERE slug = ?').get(slug);
  if (!event) {
    return res.status(404).json({ error: '找不到此路跑活動，無法送出團體報名。' });
  }

  const countRow = db
    .prepare("SELECT COUNT(*) as cnt FROM registrations WHERE event_id = ? AND payment_status != '已取消'")
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
  if (groupName.length < 2) {
    return res.status(400).json({ error: '團體報名請填寫「團體名稱」（至少 2 字）。' });
  }

  const groupRemittanceLast5 = String(req.body?.group_remittance_last5 || '').trim();
  if (groupRemittanceLast5 && !isValidRemittanceLast5(groupRemittanceLast5)) {
    return res.status(400).json({
      error: '整團統一匯款帳號尾五碼需為 5 位純數字（亦可先留空，匯款後由團長登入補填）。',
    });
  }

  const membersInput = Array.isArray(req.body?.members) ? req.body.members : [];
  if (membersInput.length < 2) {
    return res.status(400).json({
      error: '團體報名至少須 2 位成員（第 1 位團長 ＋ 至少 1 位組員），單人請改用個人報名。',
    });
  }
  if (membersInput.length > 50) {
    return res.status(400).json({ error: '單次團體報名上限 50 位成員，超過請分批送出。' });
  }

  const max = Number(event.max_participants || 0);
  if (max > 0 && currentCount + membersInput.length > max) {
    const left = Math.max(0, max - currentCount);
    return res.status(400).json({
      error: `本活動剩餘名額不足（目前剩餘 ${left} 名，本次團報 ${membersInput.length} 位）。`,
      code: 'CAPACITY_EXCEEDED',
    });
  }

  const fields = JSON.parse(event.fields_json || '[]');
  const memberErrors = {};
  const validatedMembers = [];
  const seenIdsInBatch = new Set();

  // 第 1 位為團長，先取出團長信箱，讓後續組員自動沿用團長信箱
  const leaderRawEmail = String(membersInput[0]?.answers?.email || '').trim();

  for (let i = 0; i < membersInput.length; i++) {
    const isLeader = i === 0;
    const rawAnswers = { ...(membersInput[i]?.answers || {}) };
    rawAnswers.remittance_last5 = groupRemittanceLast5;
    if (!isLeader && leaderRawEmail) {
      rawAnswers.email = leaderRawEmail;
    }

    const resVal = validateAndCalculateRegistration(fields, rawAnswers, {
      allowEmptyRemittance: true,
    });
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
        .prepare(
          "SELECT reg_code FROM registrations WHERE event_id = ? AND upper(runner_id_number) = ? AND payment_status != '已取消'"
        )
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
      role: isLeader ? 'leader' : 'member',
      cleanAnswers: resVal.cleanAnswers,
      priceBreakdown: resVal.priceBreakdown,
      totalAmount: resVal.totalAmount,
      summary,
      catMeta,
      remittanceLast5: groupRemittanceLast5,
    });
  }

  if (Object.keys(memberErrors).length > 0) {
    return res.status(400).json({
      error: `第 ${Object.keys(memberErrors)
        .map((k) => Number(k) + 1)
        .join('、')} 位團員資料有誤或未填寫完整，請檢查紅色提示項目。`,
      memberErrors,
    });
  }

  // 確保所有成員皆沿用團長信箱
  const leaderEmail = validatedMembers[0]?.summary?.runnerEmail || leaderRawEmail;
  for (const vm of validatedMembers) {
    if (leaderEmail) {
      vm.summary.runnerEmail = leaderEmail;
      vm.cleanAnswers.email = leaderEmail;
    }
  }

  const yearShort = String(new Date().getFullYear()).slice(-2);
  let groupCode = `GRP${yearShort}-${Math.floor(1000 + Math.random() * 8999)}`;
  while (db.prepare('SELECT id FROM registrations WHERE upper(group_code) = ?').get(groupCode)) {
    groupCode = `GRP${yearShort}-${Math.floor(1000 + Math.random() * 8999)}`;
  }

  const master = getMasterDatabaseConfig();
  const hasCloudSheet = master.configured || event.sheet_sync_mode !== 'local';
  const totalCountRow = db.prepare('SELECT COUNT(*) as cnt FROM registrations WHERE event_id = ?').get(event.id);
  const baseSeq = Number(totalCountRow?.cnt || 0);
  const savedRows = [];

  db.exec('BEGIN TRANSACTION;');
  try {
    const insertStmt = db.prepare(`
      INSERT INTO registrations (
        event_id, reg_code, category_code, runner_name, runner_id_number, runner_email, runner_phone,
        remittance_last5, reg_type, group_name, group_code, group_role, bundle_code, payment_mode,
        answers_json, price_breakdown_json, total_amount, payment_status, sheet_sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'group', ?, ?, ?, '', 'group', ?, ?, ?, '待繳費', ?)
    `);

    for (let idx = 0; idx < validatedMembers.length; idx++) {
      const m = validatedMembers[idx];
      const regCode = generateRegCode(baseSeq + idx + 1);
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
        m.role,
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

  // 同步寫入試算表活動分頁 + 統一資料庫
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
  }

  if (hasCloudSheet) {
    db.prepare("UPDATE events SET last_sheet_sync_at = datetime('now', 'localtime') WHERE id = ?").run(event.id);
    await syncAllRegistrationsToCloud();
    const refreshedEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(event.id);
    await syncEventToCloud(refreshedEvent).catch(() => {});
  }

  const groupTotalAmount = savedRows.reduce((acc, item) => acc + Number(item.saved.total_amount || 0), 0);

  // 比照路跑管理系統：團報僅統一寄發 1 封確認信給第 1 位團長
  const siteOrigin = `${req.protocol}://${req.get('host')}`;
  const leaderMailRes = await sendGroupLeaderEmail({
    type: 'created',
    event,
    groupName,
    groupCode,
    members: savedRows.map((x) => x.saved),
    totalAmount: groupTotalAmount,
    remittanceLast5: groupRemittanceLast5,
    paymentStatus: '待繳費',
    siteOrigin,
  });

  return res.status(201).json({
    message: `團體「${groupName}」共 ${savedRows.length} 位跑者報名成功！`,
    isGroup: true,
    group: {
      group_code: groupCode,
      group_name: groupName,
      leader_name: savedRows[0]?.saved?.runner_name || '',
      leader_email: leaderEmail,
      payment_mode: 'group',
      group_remittance_last5: groupRemittanceLast5,
      member_count: savedRows.length,
      total_amount: groupTotalAmount,
    },
    registrations: savedRows.map(({ saved, meta }) => ({
      reg_code: saved.reg_code,
      runner_name: saved.runner_name,
      group_role: saved.group_role,
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
      sent: Boolean(leaderMailRes.sent),
      to: leaderEmail,
      notice: leaderMailRes.notice || '',
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

// ==================== 多場活動聯合報名 API（比照路跑管理系統：同承辦人合併繳費） ====================
function mergeProfileIntoEventAnswers(fields, profile, eventSpecificAnswers, remittanceLast5) {
  const merged = { ...(eventSpecificAnswers || {}) };
  const p = profile || {};

  for (const f of fields || []) {
    if (f.type === 'calculated') continue;
    const id = String(f.id || '');
    const lbl = String(f.label || '');

    if (id === 'full_name' || id === 'name' || lbl === '姓名') {
      if (merged[id] === undefined || merged[id] === '') merged[id] = p.full_name || '';
    } else if (id === 'gender' || lbl.includes('性別')) {
      if (merged[id] === undefined || merged[id] === '') merged[id] = p.gender || '';
    } else if (id === 'id_number' || f.type === 'tw_id' || lbl.includes('身份證') || lbl.includes('身分證')) {
      if (merged[id] === undefined || merged[id] === '') merged[id] = String(p.id_number || '').toUpperCase();
    } else if (id === 'birth_date' || (f.type === 'date' && lbl.includes('出生'))) {
      if (merged[id] === undefined || merged[id] === '') merged[id] = p.birth_date || '';
    } else if (id === 'phone' || id === 'mobile' || ((f.type === 'tel' || f.validation === 'phone') && !lbl.includes('緊急'))) {
      if (merged[id] === undefined || merged[id] === '') merged[id] = p.phone || '';
    } else if (id === 'email' || f.type === 'email' || lbl.includes('信箱')) {
      if (merged[id] === undefined || merged[id] === '') merged[id] = p.email || '';
    } else if (id === 'emergency_name' || (lbl.includes('緊急') && !lbl.includes('電話'))) {
      if (merged[id] === undefined || merged[id] === '') merged[id] = p.emergency_name || '';
    } else if (id === 'emergency_phone' || (lbl.includes('緊急') && lbl.includes('電話'))) {
      if (merged[id] === undefined || merged[id] === '') merged[id] = p.emergency_phone || '';
    } else if (id === 'diet_preference' || lbl.includes('飲食')) {
      if (merged[id] === undefined || merged[id] === '') merged[id] = p.diet_preference || '';
    } else if (id === 'notes' || lbl.includes('備考') || lbl.includes('備註')) {
      if (merged[id] === undefined || merged[id] === '') merged[id] = p.notes || '';
    } else if (id === 'remittance_last5' || f.validation === 'remittance_last5' || lbl.includes('尾五碼') || lbl.includes('後五碼')) {
      merged[id] = remittanceLast5 || '';
    }
  }
  return merged;
}

// POST /api/public/register-multi — 多場聯合報名（同承辦人一次填表、產生統一合併單號 TURM-...）
router.post('/register-multi', async (req, res) => {
  const profile = req.body?.profile || {};
  const remittanceLast5 = String(req.body?.remittance_last5 || '').trim();
  const selectionsInput = Array.isArray(req.body?.selections) ? req.body.selections : [];

  if (selectionsInput.length === 0) {
    return res.status(400).json({ error: '請至少勾選 1 場活動進行報名。' });
  }
  if (selectionsInput.length > 20) {
    return res.status(400).json({ error: '單次多場聯合報名最多 20 場活動。' });
  }
  if (remittanceLast5 && !isValidRemittanceLast5(remittanceLast5)) {
    return res.status(400).json({ error: '合併匯款帳號後五碼需為 5 位純數字（亦可留空事後補填）。' });
  }

  // 防呆：緊急聯絡人不可與本人同名或同手機
  const pName = String(profile.full_name || '').trim();
  const pPhone = String(profile.phone || '').replace(/[\s\-()]/g, '');
  const eName = String(profile.emergency_name || '').trim();
  const ePhone = String(profile.emergency_phone || '').replace(/[\s\-()]/g, '');
  if (pName && eName && pName === eName) {
    return res.status(400).json({ error: '緊急聯絡人姓名不可與選手本人相同。' });
  }
  if (pPhone && ePhone && pPhone === ePhone) {
    return res.status(400).json({ error: '緊急聯絡人電話不可與選手本人手機相同。' });
  }

  const seenEventIds = new Set();
  const loadedSelections = [];
  let lockedOwnerId = null;

  for (const sel of selectionsInput) {
    const eid = Number(sel?.eventId);
    if (!eid || seenEventIds.has(eid)) {
      return res.status(400).json({ error: '勾選的活動資料不正確或有重複場次。' });
    }
    seenEventIds.add(eid);

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eid);
    if (!event) {
      return res.status(404).json({ error: `找不到活動（ID: ${eid}）。` });
    }

    const ownerId = Number(event.owner_admin_id || 1);
    if (lockedOwnerId === null) {
      lockedOwnerId = ownerId;
    } else if (lockedOwnerId !== ownerId) {
      return res.status(400).json({
        error: '多場聯合報名僅限合併「同一位承辦人」舉辦的活動（不同承辦人收款帳戶不同不可混單）。',
        code: 'DIFFERENT_ORGANIZER',
      });
    }

    const countRow = db
      .prepare("SELECT COUNT(*) as cnt FROM registrations WHERE event_id = ? AND payment_status != '已取消'")
      .get(event.id);
    const currentCount = countRow?.cnt || 0;
    const regState = computeEventRegistrationState(event, currentCount);
    if (!regState.canRegister) {
      return res.status(400).json({
        error: `活動「${event.name}」目前無法報名：${regState.reason}`,
      });
    }

    loadedSelections.push({
      event,
      fields: JSON.parse(event.fields_json || '[]'),
      answers: sel?.answers || {},
    });
  }

  const eventErrors = {};
  const validatedItems = [];

  for (const item of loadedSelections) {
    const mergedAnswers = mergeProfileIntoEventAnswers(
      item.fields,
      profile,
      item.answers,
      remittanceLast5
    );
    const resVal = validateAndCalculateRegistration(item.fields, mergedAnswers, {
      allowEmptyRemittance: true,
    });
    if (!resVal.valid) {
      eventErrors[item.event.id] = resVal.errors;
      continue;
    }

    const summary = extractRunnerSummary(item.fields, resVal.cleanAnswers);
    const idUpper = String(summary.runnerIdNumber || '').toUpperCase();
    if (idUpper) {
      const dup = db
        .prepare(
          "SELECT reg_code FROM registrations WHERE event_id = ? AND upper(runner_id_number) = ? AND payment_status != '已取消'"
        )
        .get(item.event.id, idUpper);
      if (dup) {
        eventErrors[item.event.id] = {
          id_number: `此證件號碼已報名「${item.event.name}」（序號：${dup.reg_code}），請取消勾選該場。`,
        };
        continue;
      }
    }

    const catMeta = resolveCategoryMeta(item.fields, resVal.cleanAnswers);
    validatedItems.push({
      event: item.event,
      fields: item.fields,
      cleanAnswers: resVal.cleanAnswers,
      priceBreakdown: resVal.priceBreakdown,
      totalAmount: resVal.totalAmount,
      summary,
      catMeta,
    });
  }

  if (Object.keys(eventErrors).length > 0) {
    const firstEvId = Object.keys(eventErrors)[0];
    const firstFieldErr = Object.values(eventErrors[firstEvId] || {})[0];
    return res.status(400).json({
      error: firstFieldErr || '部分欄位格式不正確或尚未填寫完整，請檢查紅色提示。',
      eventErrors,
    });
  }

  const isBundle = validatedItems.length >= 2;
  const bundleCode = isBundle ? generateBundleCode() : '';
  const grandTotal = validatedItems.reduce((sum, it) => sum + Number(it.totalAmount || 0), 0);
  const master = getMasterDatabaseConfig();
  const savedItems = [];

  db.exec('BEGIN TRANSACTION;');
  try {
    const insertStmt = db.prepare(`
      INSERT INTO registrations (
        event_id, reg_code, category_code, runner_name, runner_id_number, runner_email, runner_phone,
        remittance_last5, reg_type, group_name, group_code, group_role, bundle_code, payment_mode,
        answers_json, price_breakdown_json, total_amount, payment_status, sheet_sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'individual', '', '', '', ?, ?, ?, ?, ?, '待繳費', ?)
    `);

    for (const it of validatedItems) {
      const totalRow = db.prepare('SELECT COUNT(*) as cnt FROM registrations WHERE event_id = ?').get(it.event.id);
      const regCode = generateRegCode((totalRow?.cnt || 0) + 1);
      const hasCloudSheet = master.configured || it.event.sheet_sync_mode !== 'local';

      const info = insertStmt.run(
        it.event.id,
        regCode,
        it.catMeta.categoryCode || '',
        it.summary.runnerName,
        it.summary.runnerIdNumber,
        it.summary.runnerEmail,
        it.summary.runnerPhone,
        remittanceLast5,
        bundleCode,
        isBundle ? 'bundle' : 'individual',
        JSON.stringify(it.cleanAnswers),
        JSON.stringify(it.priceBreakdown),
        it.totalAmount,
        hasCloudSheet ? 'pending' : 'local'
      );

      const saved = db.prepare('SELECT * FROM registrations WHERE id = ?').get(info.lastInsertRowid);
      savedItems.push({ event: it.event, fields: it.fields, saved, meta: it });
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    return res.status(500).json({ error: `多場聯合報名寫入失敗：${err.message}` });
  }

  // 同步寫入各活動分頁 + 統一資料庫
  let anyCloud = false;
  for (const item of savedItems) {
    const hasCloudSheet = master.configured || item.event.sheet_sync_mode !== 'local';
    if (hasCloudSheet) {
      anyCloud = true;
      try {
        const syncRes = await appendRegistrationToSheet(item.event, item.fields, item.saved);
        db.prepare(
          "UPDATE registrations SET sheet_sync_status = 'synced', sheet_sync_error = '', sheet_row_number = ? WHERE id = ?"
        ).run(syncRes.rowNumber || null, item.saved.id);
        db.prepare("UPDATE events SET last_sheet_sync_at = datetime('now', 'localtime') WHERE id = ?").run(
          item.event.id
        );
      } catch (err) {
        db.prepare(
          "UPDATE registrations SET sheet_sync_status = 'error', sheet_sync_error = ? WHERE id = ?"
        ).run(err.message, item.saved.id);
      }
    }
  }
  if (anyCloud) {
    await syncAllRegistrationsToCloud();
  }

  const firstItem = savedItems[0];
  const siteOrigin = `${req.protocol}://${req.get('host')}`;
  const emailNotification = await sendMultiBundleEmail({
    type: 'created',
    bundleCode,
    runnerName: firstItem.saved.runner_name,
    runnerEmail: firstItem.saved.runner_email,
    organizerName: firstItem.event.owner_display_name || '主辦單位',
    items: savedItems.map((x) => ({ event: x.event, registration: x.saved })),
    totalAmount: grandTotal,
    remittanceLast5,
    paymentStatus: '待繳費',
    paymentInfo: firstItem.event.payment_info || '',
    siteOrigin,
  });

  return res.status(201).json({
    message: isBundle
      ? `多場聯合報名成功！合併單號 ${bundleCode}（共 ${savedItems.length} 場・合計 NT$ ${grandTotal.toLocaleString()}）`
      : `報名成功！（序號：${firstItem.saved.reg_code}）`,
    isBundle,
    bundle_code: bundleCode,
    organizer_name: firstItem.event.owner_display_name || '主辦單位',
    payment_info: firstItem.event.payment_info || '',
    runner_name: firstItem.saved.runner_name,
    id_masked: maskIdNumber(firstItem.saved.runner_id_number),
    runner_email: firstItem.saved.runner_email,
    remittance_last5: remittanceLast5,
    total_amount: grandTotal,
    items: savedItems.map(({ event, saved, meta }) => ({
      event_id: event.id,
      event_slug: event.slug,
      event_name: event.name,
      event_date: event.event_date,
      location: event.location,
      reg_code: saved.reg_code,
      category_code: saved.category_code || '',
      total_amount: saved.total_amount,
      payment_status: saved.payment_status,
      priceBreakdown: meta.priceBreakdown,
    })),
    emailNotification,
  });
});

module.exports = router;
