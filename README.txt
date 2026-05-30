LuxFatum 裁定對決 v5.0.0 GitHub Render 與 App 正式版

本版本提供三種主要入口：

1. 快速對戰
   直接進入 P1 vs 標準 AI，適合快速測試 3v3、能量、裁定、共鳴與角色平衡。

2. 本機 / AI 對戰
   本機雙人可在同一台裝置上輪流操作；AI 對戰提供多種難度，支援輪抽、待決效果與戰鬥行動。

3. 線上房間
   部署到 Render 後，可建立房號、複製邀請連結，讓另一位玩家加入同一場對戰。

v5.0.0 版本重點
- GitHub repository 可直接接 Render Web Service 或 Blueprint 部署。
- Render 線上版提供房間 API、版本 API、健康檢查與下載入口。
- Windows App 版可離線玩本機/AI 對戰，也能連到 Render 房間與更新檢查。
- 主選單、更新紀錄與文件收斂為正式版玩家語氣。
- 桌面版已修正 WebView2 黑畫面，使用內建 localhost 靜態伺服器載入正式建置檔。
- App 圖示使用原 LuxFatum logo 多尺寸 ico，角色選取視覺統一為低亮金邊。
- V5 正式節奏下修起始能量、開戰 HP +1，讓單局不會太快結束。
- 保留核心 3v3、25 角色、裁定、共鳴與勝負判定。

Render 部署
1. 將本資料夾內容上傳到 GitHub repository 根目錄。
2. Render 建立 Blueprint 或 Web Service。
3. Build Command：npm ci && npm run build
4. Start Command：npm start
5. 部署後檢查：
   /api/health
   /api/version

版本與更新
- src/config/version.json 是遊戲內顯示的版本資訊來源。
- release.json 控制版本號、更新提示與強制更新。
- CHANGELOG.md 記錄版本更新。
- rules_v4_1.txt 是延續保留的規則文字檔名；內容已更新為 v5.0.0 正式版規則。
- npm run version:show 可在終端顯示目前版本資訊。

主要檔案
- src/data/characters.ts：25 角色數值、技能、被動、共鳴、定位、難度、標籤與提示。
- src/data/rulesGuide.ts：UI 規則導覽、狀態說明、基本行動、裁定選項與回合流程。
- src/game.ts：實戰規則與技能結算。
- src/App.tsx：主選單、規則頁、百科、待決面板、目標預覽與戰鬥 UI。
- src/styles.css：商業化 UI、戰鬥版面與響應式樣式。
- server.js：靜態檔案、房間 API、下載包與桌面版 API 轉送。
