# Google Cloud / Google Sheets API 串接設定教學

RunFlow 路跑報名管理平台支援**兩種 Google 試算表雙向同步模式**，請依需求擇一設定：

| 比較項目 | 模式 A：Google Sheets API（Service Account） | 模式 B：Google Apps Script Webhook |
| :--- | :--- | :--- |
| **適用情境** | 正式營運、多場活動、需「一鍵自動建立獨立試算表」 | 快速上手、不想開 GCP 專案、單純貼網址即可用 |
| **一鍵自動建新試算表** | 支援（透過 Google Sheets + Drive API） | 不支援（需先手動建立試算表再部署腳本） |
| **表頭自動對齊同步** | 支援 | 支援 |
| **即時寫入 & 雙向拉取** | 支援 | 支援 |
| **設定時間** | 約 5 分鐘 | 約 2 分鐘 |

---

## 模式 A：Google Cloud Platform（Service Account）設定步驟

### 步驟 1：建立 GCP 專案並啟用 API
1. 前往 [Google Cloud Console](https://console.cloud.google.com/) 並登入 Google 帳號。
2. 點擊左上角專案下拉選單 ->「新增專案」，命名為 `RunFlow-Sheets` 並建立。
3. 前往左側選單「API 和服務」->「程式庫」，分別搜尋並點選「啟用」以下兩個 API：
   - **Google Sheets API**（必裝：讀寫試算表資料與表頭）
   - **Google Drive API**（選裝：用於後台「一鍵自動建立試算表」與自動分享權限）

### 步驟 2：建立服務帳戶（Service Account）並下載 JSON 金鑰
1. 前往「IAM 與管理」->「服務帳戶」-> 點擊「建立服務帳戶」。
2. 輸入名稱（例如 `runflow-bot`），點「建立並繼續」-> 直接點「完成」。
3. 點擊剛建立的服務帳戶 Email（格式如 `runflow-bot@your-project.iam.gserviceaccount.com`）。
4. 切換至「金鑰」分頁 -> 點擊「新增金鑰」->「建立新金鑰」-> 選擇 **JSON** -> 點「建立」，瀏覽器會自動下載一個 `.json` 檔案。

### 步驟 3：將憑證放入本系統
1. 在專案根目錄建立 `credentials/` 資料夾。
2. 將下載的 JSON 檔改名為 `google-service-account.json`，放置於：
   `credentials/google-service-account.json`
3. 複製 `.env.example` 為 `.env`，確認以下設定：
   ```env
   GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./credentials/google-service-account.json
   # 若要使用後台「一鍵自動建立試算表」，請填入您的個人 Gmail 以自動取得編輯權限
   GOOGLE_AUTO_SHARE_EMAIL=your-email@gmail.com
   ```
4. 重新啟動伺服器（`npm start`）。

### 步驟 4：授權試算表寫入權限（若綁定既有試算表）
1. 開啟您要綁定的 Google 試算表。
2. 點擊右上角「共用（Share）」。
3. 貼上 Service Account 的 Email（可在 JSON 檔中的 `client_email` 或本系統後台看到）。
4. 權限務必選擇「**編輯者（Editor）**」，取消勾選通知並儲存。
5. 回到本系統後台 -> 選擇該活動 ->「Google 試算表」分頁 -> 選擇「Google Sheets API 模式」並貼上試算表網址 -> 點擊「測試連線」與「立即同步表頭」。

---

## 模式 B：Google Apps Script（GAS）Webhook 快速設定

如果您不想設定 Google Cloud 專案，可以使用專案內附的 `google-apps-script/Code.gs`：

1. 在您的 Google 雲端硬碟建立一個新的 Google 試算表。
2. 點擊上方選單「**擴充功能**」->「**Apps Script**」。
3. 清空編輯器原本的程式碼，將本專案 `google-apps-script/Code.gs` 的完整內容貼上並按 `Ctrl + S` 儲存。
4. 點擊右上角「**部署**」->「**新增部署作業**」：
   - 選取類型：點擊齒輪圖示 -> 選擇「**網頁應用程式**」
   - 執行身分：**我**
   - 誰可以存取：**所有人**
5. 點擊「部署」，依提示授權您的 Google 帳號存取試算表。
6. 複製產生的「**網頁應用程式網址**」（以 `/exec` 結尾）。
7. 貼到 RunFlow 後台的「GAS Webhook 模式」欄位中，按「測試連線」並儲存即可立即雙向同步！

---

## 常見錯誤排除

| 錯誤訊息 | 原因 | 解決方式 |
| :--- | :--- | :--- |
| `403 權限不足` | 試算表未共用給 Service Account，或未啟用 Sheets API | 將試算表共用給 `client_email`（編輯者），並確認 GCP 已啟用 Google Sheets API |
| `404 找不到試算表` | 貼錯試算表 ID / 網址，或試算表已被移至垃圾桶 | 重新複製完整的試算表瀏覽器網址貼上 |
| `GAS 回傳非 JSON` | GAS 部署權限設為「僅限我自己」導致重導向登入頁 | 重新部署 GAS 並將「誰可以存取」改為「所有人」 |
