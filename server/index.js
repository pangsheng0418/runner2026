require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { UPLOADS_DIR } = require('./db');
const { ensureCloudSynced, getCloudSyncStatus } = require('./services/cloudStore');

const authRoutes = require('./routes/auth');
const adminEventRoutes = require('./routes/adminEvents');
const adminRegistrationRoutes = require('./routes/adminRegistrations');
const adminUserRoutes = require('./routes/adminUsers');
const adminDataRoutes = require('./routes/adminData');
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
app.get('/api/health', async (_req, res) => {
  const syncRes = await ensureCloudSynced();
  res.json({
    ok: true,
    service: 'TUR 路跑活動線上報名平台（統一雲端資料庫架構）',
    cloudDatabase: getCloudSyncStatus(),
    syncCheck: syncRes,
    timestamp: new Date().toISOString(),
  });
});

// 統一雲端資料庫自動同步 Middleware（確保網路版 / Vercel Serverless 實例始終指向同一資料庫）
app.use('/api', async (req, _res, next) => {
  if (req.path === '/health') return next();
  try {
    await ensureCloudSynced();
  } catch (err) {
    console.warn('[CloudSync Middleware]', err.message);
  }
  return next();
});

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/data', adminDataRoutes);
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
    const dbStatus = getCloudSyncStatus();
    console.log(`\n🏃 TUR 路跑活動線上報名平台已啟動！`);
    console.log(`   ▶ 前台報名平台：http://localhost:${PORT}`);
    console.log(`   ▶ 承辦人獨立入口：http://localhost:${PORT}/admin/login`);
    console.log(
      `   ▶ 統一雲端資料庫：${dbStatus.configured ? `已連線（${dbStatus.mode.toUpperCase()} 模式）` : '尚未設定（請於 .env 設定 GOOGLE_MASTER_SHEET_ID 或 GOOGLE_MASTER_GAS_URL）'}\n`
    );
  });
}

module.exports = app;
