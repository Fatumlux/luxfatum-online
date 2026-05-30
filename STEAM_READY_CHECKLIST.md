# LuxFatum：裁定對決 Steam 前置檢查清單

## 目前狀態

- [x] 是否可離線遊玩：本機雙人與 AI 對戰不依賴後端；`file://` 或離線時會跳過線上更新檢查。
- [x] 是否移除外部 CDN：前端程式未使用 CDN 載入 PixiJS、Howler、React、字體、圖片或音效；主要 runtime 依賴由 npm 打包。
- [x] 是否有主選單：主選單包含開始遊戲、規則書、角色百科、設定、離開遊戲入口。
- [x] 是否有設定頁：已新增設定頁。
- [x] 是否有全螢幕：設定頁與戰鬥工具列可切換全螢幕。
- [x] 是否有音量設定：設定頁包含主音量、音效音量、BGM 音量。
- [x] 是否有退出遊戲入口：網頁版顯示不可用提示；未來 Electron 可接到視窗關閉。
- [x] 是否有本機存檔：設定、教學觀看狀態與最近使用隊伍使用 localStorage。
- [x] 是否有規則書：已有規則書頁面。
- [x] 是否有角色百科：已新增角色百科頁與角色詳情。
- [x] 是否有素材來源整理：素材集中在 `public/assets`，目前分為 `audio`、`images`、`cards`、`portraits`、`fonts`、`ui`。
- [x] 是否有版本號：版本資訊由 `src/config/version.json` 管理。
- [x] 是否有 build 指令：`npm run build` 輸出至 `web-build`。
- [x] 是否準備 Electron 包裝：已新增 Electron preload / main adapter 範本，可讓桌面外殼載入 `web-build/index.html` 並銜接未來 Steam bridge；尚未進行正式打包。

## 素材目錄

- `public/assets/audio`：BGM 與音效。
- `public/assets/images`：背景與通用圖片。
- `public/assets/cards`：卡牌圖。
- `public/assets/portraits`：角色立繪。
- `public/assets/fonts`：預留字體目錄。
- `public/assets/ui`：預留 UI 素材目錄。

## 離線注意事項

- 線上房間、更新檢查與下載入口仍需網路。
- 離線模式應優先使用本機雙人或 AI 對戰。
- 桌面版若使用 Electron，建議載入 `web-build/index.html` 或啟動本機靜態 server，不需要瀏覽器網址路由。

## Electron 下一步

- 建立正式 Electron app 入口與 package 設定。
- 讓正式 Electron 視窗載入 `web-build/index.html`。
- 將離開遊戲入口接到 Electron IPC 視窗關閉。
- 將視窗大小、全螢幕狀態與 localStorage 設定對齊。
- 確認打包後 `public/assets` 全數被包含。
