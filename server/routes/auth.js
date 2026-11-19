const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { signAdminToken, requireAdminAuth } = require('../middleware/auth');
const { getCredentialsStatus } = require('../services/googleSheets');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '請輸入管理員帳號與密碼。' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(String(username).trim());
  if (!admin || !bcrypt.compareSync(String(password), admin.password_hash)) {
    return res.status(401).json({ error: '帳號或密碼不正確，請重新確認。' });
  }

  const token = signAdminToken(admin);
  return res.json({
    token,
    admin: {
      id: admin.id,
      username: admin.username,
      displayName: admin.display_name,
    },
  });
});

// GET /api/auth/me
router.get('/me', requireAdminAuth, (req, res) => {
  const googleStatus = getCredentialsStatus();
  return res.json({
    admin: req.admin,
    googleCredentials: googleStatus,
  });
});

// POST /api/auth/change-password
router.post('/change-password', requireAdminAuth, (req, res) => {
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
  return res.json({ message: '密碼已更新成功！' });
});

module.exports = router;
