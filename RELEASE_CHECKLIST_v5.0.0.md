# LuxFatum v5.0.0 Release Checklist

版本定位：`v5.0.0｜GitHub Render 與 App 正式版`

## 必跑指令

- `npm run version:show`
- `npm run typecheck`
- `npm run check`
- `npm run test:rules`
- `npm run build`
- `npm run package:release`
- `npm run smoke:ui`

## 正式節奏驗收

- V5 正式節奏需確認：起始能量下修、全角色開戰 HP +1。
- 保留核心 3v3、25 角色、裁定、共鳴與勝負判定。
- 規則回歸需通過：休息、1/2/3 裁定、天訊、祈衡、縫星、訟鴉、刻律、鏡刃、裂舞、蝕璃、混亂改目標。
- 若 V5 期間發現規則 bug，優先修正 bug；大型模式或重算平衡另開版本處理。

## GitHub / Render

- Repo 根目錄需包含：`package.json`、`package-lock.json`、`server.js`、`render.yaml`、`index.html`、`src/`、`public/assets/`、`web-build/`。
- 線上正式連結需指向：https://luxfatum-online.onrender.com
- Render Build Command：`npm ci && npm run build`
- Render Start Command：`npm start`
- Health Check Path：`/api/health`
- 部署後檢查：
  - 首頁顯示 `v5.0.0`
  - `/api/health` 回傳 `ok: true`
  - `/api/version` 回傳 `latestVersion: v5.0.0`
  - 快速對戰可進入戰鬥畫面
  - 線上開房、加入房間、重新同步可用

## App 版

- `release.json` 版本為 `v5.0.0`，`src/config/version.json` 遊戲版本與規則版本皆為 `v5.0.0`。
- `/download/package.zip` 可下載 GitHub/Render package。
- `/download/windows.zip` 可下載 Windows App zip。
- `/download/installer.exe` 可下載 installer；若 payload 缺失，需補上 `dist/installer/LuxFatum_Setup_Base.exe` 與 `installer/MicrosoftEdgeWebView2Setup.exe`。
- Windows App 測試：
  - `LuxFatum.exe` 可啟動
  - 預設模式會啟動內建 localhost 靜態伺服器載入 `web-build/index.html`，避免 WebView2 直接讀檔黑畫面
  - 視窗標題列與工作列可顯示原 LuxFatum logo 多尺寸 icon，不使用預設 WinForms 圖示
  - 本機/AI 對戰可離線遊玩
  - App 版可連到 Render 房間
  - `--web` 與 `--local-server` 行為符合 README_WINDOWS.txt

## UI Smoke

- 截圖輸出：`artifacts/v5.0.0-smoke/`
- 必含畫面：主選單、輪抽、戰鬥待決、普通行動、技能對話框、規則頁、結算頁。
- 必查：`v5.0.0` 文字、Pixi canvas、戰鬥目標提示、手機無水平捲動。

## 發行前確認

- `CHANGELOG.md` 最上方為 `v5.0.0`。
- README、Render 部署說明、Windows App 說明皆以 GitHub/Render 與 App 版為主。
- 不宣傳尚未接上的 Steamworks SDK 私人房；Steam bridge 僅作未來桌面整合基礎。
