# RunFlow｜路跑活動線上報名與管理平台

一套專為路跑與馬拉松賽事打造的全端報名與管理系統，具備：
- **前台公開報名頁**：路跑運動感 RWD 介面、倒數計時器、動態表單渲染、身分證/護照防呆驗證、即時自動加總應繳金額、報名成功確認畫面。
- **後台活動管理系統**：JWT 權限驗證、活動 CRUD、專屬公開報名網址、橫幅 Banner 自訂（支援圖片上傳與即時預覽）。
- **動態表單設計器**：內建 12 項路跑標準預設欄位、支援拖曳排序與增刪改、選項計價自動計算、儲存自動同步 Google 試算表第一列表頭。
- **Google 試算表雙向同步**：支援 Google Sheets API（可一鍵自動建立獨立試算表）與 Google Apps Script Webhook 兩種模式，並內建本地 SQLite 防掉單容錯與重試機制。

## 快速啟動

```bash
# 1. 安裝相依套件（Windows PowerShell 請使用 npm.cmd）
npm.cmd install

# 2. 編譯前端靜態檔
npm.cmd run build

# 3. 啟動全端伺服器
npm.cmd start
```

啟動後開啟瀏覽器前往：
- **前台活動首頁**：`http://localhost:3000`
- **範例活動公開報名頁**：`http://localhost:3000/register/taipei-speed-marathon-2026`
- **後台登入頁**：`http://localhost:3000/admin/login`
  - 預設管理員帳號：`admin`
  - 預設管理員密碼：`runner2026`

## Google 試算表串接教學

完整步驟請參閱 [docs/GOOGLE_SHEETS_SETUP.md](./docs/GOOGLE_SHEETS_SETUP.md)。
