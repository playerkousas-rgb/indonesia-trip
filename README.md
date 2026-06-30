# v9.3.1 更新包 — 個人緊急聯絡修復 + 行程路線圖

## 修復內容

### 1. 個人緊急聯絡資料 — 容錯備用機制（關鍵修復）

**問題**：後端 Code.gs 未更新部署時，`emergency_member_info` API 仍回傳 "Card not found"。

**修復策略**：前端加入**容錯備用方案**，不論後端新舊都能正常顯示：

- 先嘗試 `getCardData` 的 `emergency_member_info`（新版後端）
- 若失敗，自動改用以下 API 組合資料（舊版後端也能用）：
  - **領袖/超管**：`members_all`（全部成員）+ `emergency_contacts` + `hotels` + 固定熱線
  - **普通成員**：`getMyProfile`（自己）+ `emergency_contacts` + `hotels` + 固定熱線
- 印尼官方緊急電話（112/110/118/113/115/129）為前端固定值，不依賴後端

### 2. 行程路線圖（route_map）
- 使用 Leaflet.js + OpenStreetMap（免費無需 Key）
- emoji 標記 + 虛線路線 + 彈窗詳情

## 部署步驟

### 前端（必須更新！）
1. 將 `index.html` 和 `app.js` 推到 GitHub
2. Vercel 自動部署
3. **部署後即可使用** — 個人緊急聯絡資料不再依賴後端更新

### 後端 Code.gs（建議但非必須）
1. 在 Apps Script 編輯器**完整覆蓋**貼上 `Code.gs`
2. 儲存
3. 點「部署」→「新增部署」或「管理部署」→ 選新版本
4. 更新部署後，`emergency_member_info` 會走專屬 API（更快、更乾淨）

### 啟用行程路線圖
部署 Code.gs 後，執行一次 `appendLatestUpdates`：
- 在 Apps Script 編輯器選擇 `appendLatestUpdates` 函數 → 執行
- 會建立 `route_map_locations` 工作表並預填地點
- 本地遊座標為預估值，之後直接改 Sheet 即可

## 重點
- **前端更新後，緊急聯絡卡片立即可用**，不需等後端
- 後端更新只是優化，不是必須
- route_map_locations 工作表欄位：sort_order, date, location_name, lat, lng, note, icon
