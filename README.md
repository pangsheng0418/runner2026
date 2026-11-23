# TUR (Taiwan Ultra Runners)｜路跑活動線上報名與管理平台

一套以 **TUR (Taiwan Ultra Runners)** 官方風格打造的全端路跑報名與管理平台，具備獨立資料庫架構，並與 [TUR 晶片計時系統](https://runchip-timing.vercel.app/) 無縫對接。

## 核心功能
- **TUR 官方風格介面**：內嵌官方 Logo、深色三色光暈網格主題、戶外強光高對比模式與完整 RWD。
- **動態表單設計器**：內建 14 項 TUR 路跑標準欄位，支援拖曳排序、選項計價自動加總、晶片組別代碼與配號前綴。
- **Google 試算表雙向同步**：支援 Google Sheets API（一鍵建立活動專屬分頁）與 GAS Webhook 雙模式。
- **晶片系統獨立串接**：一鍵依組別自動配號（Bib）、匯出 1:1 對應 `runchip-timing` 專用 CSV、一鍵 GAS 推送與獨立跨系統 JSON API。

## 完整文件
- **完整系統使用與技術說明書**：[docs/SYSTEM_GUIDE.md](./docs/SYSTEM_GUIDE.md)
- **Google Sheets API & GAS 串接教學**：[docs/GOOGLE_SHEETS_SETUP.md](./docs/GOOGLE_SHEETS_SETUP.md)

## 快速啟動

```powershell
# 1. 安裝相依套件（Windows PowerShell 請使用 npm.cmd）
npm.cmd install

# 2. 編譯前端靜態檔
npm.cmd run build

# 3. 啟動全端伺服器
npm.cmd start
```

啟動後開啟瀏覽器：
- **TUR 大廳首頁**：`http://localhost:3000`
- **範例活動公開報名頁**：`http://localhost:3000/register/taipei-speed-marathon-2026`
- **後台登入頁**：`http://localhost:3000/admin/login`（預設測試帳密：`admin` / `runner2026`）
