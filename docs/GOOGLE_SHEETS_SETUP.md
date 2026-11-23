# 平台統一 Google 試算表資料庫設定教學（網路版必看）

本報名系統比照晶片管理系統的資料庫模式：**全平台整合至「同一份」Google 試算表**。
部署完成後，承辦人進入系統即自動指向同一資料庫，**不需要為每個活動各建一個連結**！

## 統一試算表內自動建立的分頁結構

| 分頁名稱 | 用途 | 說明 |
| :--- | :--- | :--- |
| `_DB_Admins` | 承辦人獨立帳號表 | 儲存各承辦人帳號與加密密碼，確保權限完全獨立隔離 |
| `_DB_Events` | 活動總表 | 儲存所有活動設定、報名起訖日期、狀態（開放中／籌備中／已結案）與動態表單 |
| `_DB_Registrations` | 報名總表 | 儲存所有活動的完整結構化報名資料（跨 Vercel 無伺服器實例零遺失） |
| `各活動名稱分頁` | 活動專屬檢視分頁 | 建立新活動時自動在同一份試算表開立該活動的專屬分頁與凍結表頭 |

---

## 設定方式（擇一即可，只需設定一次）

### 方式 A：單一 Google Apps Script 網址（免 GCP 專案，比照晶片計時系統）

1. 開啟一份專用的 Google 試算表（例如命名為 `TUR 活動報名系統統一資料庫`）。
2. 點選上方選單「**擴充功能**」→「**Apps Script**」。
3. 清空原本程式碼，完整貼上本專案 [Code.gs](../google-apps-script/Code.gs) 並儲存。
4. 點選右上角「**部署**」→「**新增部署作業**」：
   - 類型：**網頁應用程式**
   - 執行身分：**我**
   - 誰可以存取：**所有人**
5. 複製產生的 `/exec` 網址，貼到 Vercel（或 `.env`）環境變數：
   ```env
   GOOGLE_MASTER_GAS_URL=https://script.google.com/macros/s/AKfycb.../exec
   ```
6. 重新部署即可完成！

> **免費附贈自動 Email 通知**：最新版的 `Code.gs` 內建 `send_email` 功能。使用方式 A 設定 `GOOGLE_MASTER_GAS_URL` 後，選手報名、改報與承辦人核帳完成時，系統會自動透過該 Google 帳號的 `MailApp` 寄送報名通知信，免額外設定第三方寄信服務（若需自訂發信網域，可另設 `RESEND_API_KEY`）。

---

### 方式 B：Google Sheets API（Service Account，速度最快、高併發推薦）

1. 前往 [Google Cloud Console](https://console.cloud.google.com/) 啟用 **Google Sheets API**，並建立 Service Account 下載 JSON 金鑰。
2. 開啟一份專用的 Google 試算表，點右上角「**共用**」，將 Service Account 的 `client_email` 加入為「**編輯者**」。
3. 在 Vercel（或 `.env`）設定以下 3 個環境變數：
   ```env
   GOOGLE_MASTER_SHEET_ID=你的試算表ID或完整網址
   GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```
4. 重新部署即全平台自動指向該統一試算表資料庫！
