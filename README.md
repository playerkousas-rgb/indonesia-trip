# 童遊世界‧印尼活動備忘｜v8 完整覆蓋版

## 這個壓縮檔是什麼？
這份是 **完整覆蓋版**，適合你直接：
- 覆蓋 Apps Script 的 `Code.gs`
- 覆蓋前端 `index.html`
- 覆蓋前端 `app.js`

不再只是 patch。

## 檔案
- `Code.gs`：完整 Apps Script 後端
- `index.html`：手機版前端
- `app.js`：前端互動與 API 對接
- `README.md`：本說明

## 部署步驟
### Apps Script
1. 打開你現有 Apps Script 專案
2. 直接用這份 `Code.gs` **整份覆蓋**
3. 儲存
4. 執行一次：`initSheets()` 或直接用前端呼叫初始化（如你已有資料，請自行評估後再做）
5. 重新部署 Web App

### 前端
1. 覆蓋 `index.html`
2. 覆蓋 `app.js`
3. push 到 GitHub / Vercel

## 緊急聯絡相關邏輯
### 緊急聯絡清單
- 對應：`emergency_contacts`
- 顯示領袖 / 支援電話

### 緊急時應如何處理
- 對應：`emergency_actions`
- 顯示緊急情況時應如何做

### 個人緊急聯絡資料
- 卡片：`emergency_member_info`
- 成員：只看自己電話、自己緊急聯絡人、自己緊急聯絡人電話，再加領袖 / 支援電話
- 領袖 / 超管：可看全體

## 手機版優化
- 卡片內容在原卡下方展開
- 手機避免超框
- 表格可橫向滑動
- 長文字 / 連結自動換行
- 酒店卡分頁
- packing list 分頁

## 印尼緊急電話（建議你自行貼回 Sheet）
- 綜合緊急求助：112
- 警察：110
- 救護車：118 / 119
- 消防：113
- 搜救：115
- 天災協助：129
