# LuxFatum 裁定對決 v5.0.1

`v5.0.1｜MVP 平衡與規則文字修正版`

LuxFatum 是 3v3 小隊戰角色卡牌遊戲。雙方透過攻擊、技能、共鳴、狀態與裁定標記擊倒對手全部角色。

## v5.0.1 重點

- 裁定規則與 UI 文字已同步：每方每回合最多 1 次，且不會結束目前角色行動。
- 修正天訊速度重排造成的二動問題；規則補充調整為 +1 MVP 平衡值。
- 修正迴音回聲模仿目標邏輯：複製傷害指定敵方，複製治療指定我方。
- GitHub repository 可直接接 Render Web Service 或 Blueprint 部署。
- Render 線上版提供首頁、房間 API、版本 API、健康檢查與下載入口。
- Windows App 版可離線玩本機/AI 對戰，也能連到 Render 房間與更新檢查。
- 主選單、更新紀錄與文件收斂為正式版玩家語氣。
- 桌面版已修正 WebView2 黑畫面，使用內建 localhost 靜態伺服器載入正式建置檔。
- App 圖示使用原 LuxFatum logo 多尺寸 ico，角色選取視覺統一為低亮金邊。
- V5 正式節奏下修起始能量、開戰 HP +1，讓單局不會太快結束。
- 保留核心 3v3、25 角色、裁定、共鳴與勝負判定。

## 指令

```bash
npm install
npm run typecheck
npm run check
npm run test:rules
npm run smoke:ui
npm run build
npm start
```

## GitHub / Render

- Build Command：`npm ci && npm run build`
- Start Command：`npm start`
- Health Check：`/api/health`
- Version API：`/api/version`
- 下載入口：`/download/installer.exe`、`/download/windows.zip`、`/download/package.zip`

## App 版

- Windows App 版不需要 Node.js。
- `LuxFatum.exe` 以桌面 WebView2 載入本地 `web-build/`。
- App 版預設連到 `https://luxfatum-online.onrender.com`，可與網頁版房間互通。

## 主要檔案

- `src/data/characters.ts`：角色數值、技能、被動、共鳴、定位、難度、標籤與提示。
- `src/data/rulesGuide.ts`：UI 規則導覽、狀態說明、基本行動、裁定選項與回合流程。
- `src/game.ts`：實戰規則、技能結算、狀態與待決流程。
- `src/App.tsx`：主選單、規則頁、百科、戰鬥 UI、目標預覽。
- `src/config/version.json`、`release.json`：版本與更新資訊。
