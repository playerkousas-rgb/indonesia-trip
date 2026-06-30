# v9.3 更新包 — 個人緊急聯絡修復 + 行程路線圖

## 修復內容

### 1. 個人緊急聯絡資料 CARD NOT FOUND 修復
- **問題**：`emergency_member_info` 是合成卡片，不在 CARDS 工作表內，但 `getCardData_` 先查 CARDS 表找不到就拋錯
- **修復**：把 `emergency_member_info` 及 `route_map` 的特殊處理移到 CARDS 查詢之前，改為直接返回合成卡片物件
- `getBootstrap_` 也會注入合成卡片，確保前端卡片列表包含它們

### 2. 新增：行程路線圖卡片（route_map）
- 使用 **Leaflet.js + OpenStreetMap**（免費、無需 API Key）
- 在地圖上用 emoji 標記顯示各站地點及日期
- 各站之間用虛線連接
- 點擊標記可看詳情彈窗
- 下方列出所有站點清單

## 部署步驟

### Code.gs
1. 開啟 Google Apps Script 編輯器
2. **完整覆蓋** 貼上 `Code.gs` 內容
3. 儲存 → 部署 → 更新現有部署

### 前端（index.html + app.js）
1. 推送到 GitHub repo（覆蓋原有檔案）
2. Vercel 會自動部署

### 首次啟用行程路線圖
部署 Code.gs 後，需執行一次 `appendLatestUpdates`：
- 在 Apps Script 編輯器中選擇 `appendLatestUpdates` 函數並執行
- 或在瀏覽器呼叫：`https://script.google.com/macros/s/AKfycby3COQ-Fg-RPk1qmnEU6X5noUWf5MA0r9jXbQtYbUEtSjI-jCaIiEgM95o7Sk7TPQ5_/exec?action=appendLatestUpdates`（GET）

此動作會：
- 建立 `route_map_locations` 工作表（含表頭）
- 預填已知的行程地點（香港機場、峇里酒店、雅加達酒店等）
- **本地遊的確切座標為預估值**，待你補齊本地遊資料後可直接在 Google Sheet 修改

### route_map_locations 工作表欄位
| 欄位 | 說明 |
|------|------|
| sort_order | 排序（數字） |
| date | 日期（如 11/7） |
| location_name | 地點名稱 |
| lat | 緯度 |
| lng | 經度 |
| note | 備註 |
| icon | 顯示 emoji（如 ✈️🏨🤿⛰️🌴） |

修改座標只需直接改 Sheet 即可，無需更新 Code.gs。

## 檔案清單
- `Code.gs` — 完整覆蓋版後端
- `app.js` — 前端 JS（含路線圖渲染）
- `index.html` — 前端 HTML（含 Leaflet.js CDN）
