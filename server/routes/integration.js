const express = require('express');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { JWT_SECRET } = require('../middleware/auth');
const {
  toChipTimingRegistration,
  buildChipImportCsv,
} = require('../services/chipBridge');

const router = express.Router();

/**
 * 允許兩種授權方式存取獨立跨系統串接 API：
 * 1. X-API-Key Header（對應環境變數 INTEGRATION_API_KEY，供晶片系統自動化拉取）
 * 2. Authorization: Bearer <Admin JWT>（供管理員預覽或腳本呼叫）
 */
function requireIntegrationAuth(req, res, next) {
  const configuredKey = String(process.env.INTEGRATION_API_KEY || '').trim();
  const providedKey = String(req.headers['x-api-key'] || req.query.apiKey || '').trim();

  if (configuredKey && providedKey && providedKey === configuredKey) {
    return next();
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (token) {
    try {
      req.admin = jwt.verify(token, JWT_SECRET);
      return next();
    } catch (_) {
      // fall through
    }
  }

  return res.status(401).json({
    error: '跨系統串接未授權：請提供有效的 X-API-Key（INTEGRATION_API_KEY）或管理員 Bearer Token。',
    code: 'INTEGRATION_AUTH_REQUIRED',
  });
}

// GET /api/integration/events/:slug/roster
// 獨立資料庫串接端點：輸出 100% 相容 TUR 晶片計時系統 (runchip-timing) 的選手名單
router.get('/events/:slug/roster', requireIntegrationAuth, (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const event = db
    .prepare('SELECT * FROM events WHERE slug = ? OR timing_event_id = ?')
    .get(slug, slug);

  if (!event) {
    return res.status(404).json({ error: '找不到指定的活動代碼。' });
  }

  const paidOnly = String(req.query.paidOnly || '').toLowerCase() === 'true';
  const format = String(req.query.format || 'json').toLowerCase();
  const fields = JSON.parse(event.fields_json || '[]');

  const query = paidOnly
    ? "SELECT * FROM registrations WHERE event_id = ? AND payment_status = '已繳費' ORDER BY id ASC"
    : 'SELECT * FROM registrations WHERE event_id = ? ORDER BY id ASC';
  const rows = db.prepare(query).all(event.id);

  if (format === 'csv') {
    const csv = buildChipImportCsv(event, fields, rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(`${event.timing_event_id || event.slug}-tur-chip-roster.csv`)}`
    );
    return res.send(csv);
  }

  const registrations = rows.map((r) => toChipTimingRegistration(event, fields, r));
  return res.json({
    ok: true,
    schema: 'tur-runchip-timing-v1',
    exportedAt: new Date().toISOString(),
    paidOnly,
    event: {
      eventId: event.timing_event_id || event.slug,
      slug: event.slug,
      name: event.name,
      englishName: event.english_name || '',
      organization: 'Taiwan Ultra Runners',
      date: event.event_date,
      location: event.location,
      eventType: event.event_type || 'distance',
    },
    count: registrations.length,
    registrations,
  });
});

module.exports = router;
