const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'runflow-super-secret-jwt-key-change-me-2026';

function signAdminToken(admin) {
  return jwt.sign(
    {
      id: admin.id,
      username: admin.username,
      displayName: admin.display_name,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({
      error: '未授權存取，請先登入後台管理帳號。',
      code: 'AUTH_REQUIRED',
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = payload;
    return next();
  } catch (err) {
    return res.status(401).json({
      error: '登入憑證已過期或無效，請重新登入。',
      code: 'AUTH_INVALID',
    });
  }
}

module.exports = {
  JWT_SECRET,
  signAdminToken,
  requireAdminAuth,
};
