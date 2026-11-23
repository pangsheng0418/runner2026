require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { UPLOADS_DIR } = require('./db');

const authRoutes = require('./routes/auth');
const adminEventRoutes = require('./routes/adminEvents');
const adminRegistrationRoutes = require('./routes/adminRegistrations');
const publicRoutes = require('./routes/public');
const integrationRoutes = require('./routes/integration');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// 靜態檔案：上傳的橫幅圖片
app.use('/uploads', express.static(UPLOADS_DIR));

// 健康檢查
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'TUR (Taiwan Ultra Runners) 路跑活動線上報名與管理平台',
    timestamp: new Date().toISOString(),
  });
});

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/admin/events', adminEventRoutes);
app.use('/api/admin', adminRegistrationRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/integration', integrationRoutes);

// 生產環境（非 Vercel）：提供前端 React build 靜態檔
const distDir = path.join(__dirname, '..', 'dist');
if (!process.env.VERCEL && fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return next();
    }
    return res.sendFile(path.join(distDir, 'index.html'));
  });
}

// 全域錯誤處理
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    error: err.message || '伺服器發生預期外錯誤，請稍後再試。',
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🏃 RunFlow 路跑活動報名管理平台已啟動！`);
    console.log(`   ▶ 前台首頁：http://localhost:${PORT}`);
    console.log(`   ▶ 範例活動：http://localhost:${PORT}/register/taipei-speed-marathon-2026`);
    console.log(`   ▶ 後台管理：http://localhost:${PORT}/admin/login`);
    console.log(`   ▶ 預設帳號：${process.env.ADMIN_USERNAME || 'admin'} / ${process.env.ADMIN_PASSWORD || 'runner2026'}\n`);
  });
}

module.exports = app;
