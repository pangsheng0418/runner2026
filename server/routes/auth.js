const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { signAdminToken, requireAdminAuth } = require('../middleware/auth');
const { getCredentialsStatus } = require('../services/googleSheets');
const { syncAdminToCloud, getCloudSyncStatus } = require('../services/cloudStore');

const router = express.Router();

function sanitizePublicCreds(googleStatus, role) {
  // 僅呈現連線狀態與模式，避免一般承辦人直接取得母試算表 ID 進而看到其他承辦人分頁
  const isSuper = role === 'super_admin';
  return {
    configured: googleStatus.configured,
    unifiedDbConfigured: googleStatus.unifiedDbConfigured,
    unifiedDbMode: googleStatus.unifiedDbMode,
    masterSheetConfigured: googleStatus.masterSheetConfigured,
    masterGasConfigured: googleStatus.masterGasConfigured,
    isVercel: googleStatus.isVercel,
    serviceAccountEmail: isSuper ? googleStatus.serviceAccountEmail : '',
    masterSheetId: isSuper ? googleStatus.masterSheetId : '',
  };
}

// POST /api/auth/register — 承辦人獨立註冊帳號（各承辦人互相獨立作業）
router.post('/register', async (req, res) => {
  const { username, password, displayName, inviteCode } = req.body || {};
  const cleanUser = String(username || '').trim().toLowerCase();
  const cleanName = String(displayName || '').trim();
  const cleanPass = String(password || '');

  // 若系統有設定環境變數 ORGANIZER_REGISTER_CODE，則需驗證承辦人開通碼
  const requiredCode = String(process.env.ORGANIZER_REGISTER_CODE || '').trim();
  if (requiredCode && String(inviteCode || '').trim() !== requiredCode) {
    return res.status(403).json({ error: '承辦人開通授權碼不正確，請洽平台管理員。' });
  }

  if (!/^[a-z0-9._-]{3,32}$/.test(cleanUser)) {
    return res.status(400).json({ error: '帳號需為 3~32 碼英文小寫、數字或 ._- 符號。' });
  }
  if (cleanPass.length < 6) {
    return res.status(400).json({ error: '密碼長度至少需 6 個字元。' });
  }
  if (!cleanName) {
    return res.status(400).json({ error: '請填寫承辦單位或承辦人顯示名稱。' });
  }

  const dup = db.prepare('SELECT id FROM admins WHERE lower(username) = ?').get(cleanUser);
  if (dup) {
    return res.status(409).json({ error: `帳號「${cleanUser}」已被使用，請改用其他帳號。` });
  }

  const hash = bcrypt.hashSync(cleanPass, 10);
  const info = db
    .prepare('INSERT INTO admins (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)')
    .run(cleanUser, hash, cleanName, 'organizer');

  const created = db.prepare('SELECT * FROM admins WHERE id = ?').get(info.lastInsertRowid);
  try {
    await syncAdminToCloud(created);
  } catch (err) {
    // 若雲端寫入失敗，回滾本地新增以確保資料一致性
    db.prepare('DELETE FROM admins WHERE id = ?').run(created.id);
    return res.status(503).json({ error: `雲端資料庫寫入失敗，請稍後重試：${err.message}` });
  }

  const token = signAdminToken(created);
  return res.status(201).json({
    token,
    admin: {
      id: created.id,
      username: created.username,
      displayName: created.display_name,
      role: created.role,
      eventCount: 0,
    },
    message: `歡迎加入！承辦人帳號「${cleanName}」已建立，請開始建立您的專屬活動報名表。`,
  });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '請輸入承辦人帳號與密碼。' });
  }

  const cleanUser = String(username).trim();
  const admin = db
    .prepare('SELECT * FROM admins WHERE lower(username) = lower(?)')
    .get(cleanUser);
  if (!admin || !bcrypt.compareSync(String(password), admin.password_hash)) {
    return res.status(401).json({ error: '帳號或密碼不正確，請重新確認。' });
  }

  const countRow = db
    .prepare('SELECT COUNT(*) as cnt FROM events WHERE owner_admin_id = ?')
    .get(admin.id);

  const token = signAdminToken(admin);
  return res.json({
    token,
    admin: {
      id: admin.id,
      username: admin.username,
      displayName: admin.display_name,
      role: admin.role || 'organizer',
      eventCount: countRow?.cnt || 0,
    },
  });
});

// GET /api/auth/register-config — 查詢是否需要填寫承辦人開通碼
router.get('/register-config', (_req, res) => {
  return res.json({
    requireInviteCode: Boolean(String(process.env.ORGANIZER_REGISTER_CODE || '').trim()),
    cloudSync: getCloudSyncStatus(),
  });
});

// GET /api/auth/me
router.get('/me', requireAdminAuth, (req, res) => {
  const admin = db.prepare('SELECT id, username, display_name, role FROM admins WHERE id = ?').get(req.admin.id);
  if (!admin) {
    return res.status(401).json({ error: '找不到此承辦人帳號，請重新登入。', code: 'AUTH_INVALID' });
  }
  const countRow = db
    .prepare('SELECT COUNT(*) as cnt FROM events WHERE owner_admin_id = ?')
    .get(admin.id);
  const googleStatus = getCredentialsStatus();

  return res.json({
    admin: {
      id: admin.id,
      username: admin.username,
      displayName: admin.display_name,
      role: admin.role || 'organizer',
      eventCount: countRow?.cnt || 0,
    },
    googleCredentials: sanitizePublicCreds(googleStatus, admin.role),
    cloudSync: getCloudSyncStatus(),
  });
});

// POST /api/auth/change-password
router.post('/change-password', requireAdminAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: '新密碼長度至少需 6 個字元。' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!admin || !bcrypt.compareSync(String(currentPassword), admin.password_hash)) {
    return res.status(400).json({ error: '目前密碼不正確。' });
  }

  const newHash = bcrypt.hashSync(String(newPassword), 10);
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(newHash, admin.id);
  const updated = db.prepare('SELECT * FROM admins WHERE id = ?').get(admin.id);
  try {
    await syncAdminToCloud(updated);
  } catch (err) {
    return res.status(503).json({ error: `密碼更新失敗（雲端同步異常）：${err.message}` });
  }
  return res.json({ message: '密碼已更新成功！' });
});

module.exports = router;
