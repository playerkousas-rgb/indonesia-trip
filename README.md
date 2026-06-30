# Live 對接版

## 檔案
- `index.html`：前端入口
- `app.js`：前端 API 對接
- `Code.gs`：Google Apps Script 後端

## 部署步驟
1. 把 `Code.gs` 貼到你的 Apps Script 專案。
2. 確認 `SPREADSHEET_ID` 為你的 Google Sheet。
3. 重新部署 Apps Script Web App，權限設為任何知道連結的人可存取。
4. 先呼叫一次：
   - POST `{"action":"initSheets"}`
   讓系統建立 / 初始化所需工作表。
5. 把 `index.html` 和 `app.js` 放上 GitHub / Vercel。
6. 確認 `app.js` 內 `SCRIPT_URL` 為你目前的 Apps Script Web App URL。

## 新增工作表
- `weather_locations`
- `exchange_rates`
- `marine_life`
- `emergency_actions`
- `packing_list`（已加入 quantity 欄位）

## 匯率首頁
- 透過 `exchange_rates` 卡片讀取 open.er-api.com
- 建議你也可把 `exchange_rates` 卡片排到首頁前列

## 天氣 API
- 使用 Open-Meteo，免 API key，較易整合

## 注意
- `runInitialSetup()` 會把整份 Google Sheet 由 0 開始寫入完整 starter data，包括 USER、MEMBERS、行程、酒店、機票、備忘、餐廳、手信、景點、海洋生物、潛水備忘、登山備忘、匯率與天氣設定。
- 香港支援帳戶已加入：`ddc.training@skwscout.org.hk`、`dc@skwscout.org.hk`，預設密碼 `1234`。
- 超管莫穎民使用 `wingman / 0728`，其他 CSV 名單已按 leader/member 分類寫入。
- 一般公開 / 成員看到的緊急聯絡卡只顯示莫穎民及香港支援電話；超管與兩個香港支援帳戶可看到所有參加者及其緊急聯絡資料。
