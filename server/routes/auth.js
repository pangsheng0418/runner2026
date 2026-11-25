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

// POST /api/auth/register — 已停用一般承辦人自行註冊，僅限最高管理權限於後台建立新承辦人
router.post('/register', (_req, res) => {
  return res.status(403).json({
    error: '已取消公開註冊功能，僅「最高管理權限」帳號可於後台註冊新增承辦人。',
    code: 'SELF_REGISTER_DISABLED',
  });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password, loginMode } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '請輸入帳號與密碼。' });
  }

  const cleanUser = String(username).trim();
  const admin = db
    .prepare('SELECT * FROM admins WHERE lower(username) = lower(?)')
    .get(cleanUser);
  if (!admin || !bcrypt.compareSync(String(password), admin.password_hash)) {
    return res.status(401).json({ error: '帳號或密碼不正確，請重新確認。' });
  }

  const role = admin.role || 'organizer';
  if (loginMode === 'super_admin' && role !== 'super_admin') {
    return res.status(403).json({
      error: '此帳號不具備「最高管理權限」，請改用「承辦人登入」進入。',
      code: 'SUPER_ADMIN_REQUIRED',
    });
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
      role,
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
