# LuxFatum：裁定對決 Steam 發行準備流程

本文件是 Steam 發行前的內部流程備忘。此階段只整理流程，不修改遊戲規則、角色數值、技能、冷卻、能量、裁定或勝負判定，也不接 Steamworks SDK、不上傳 Steam。

## 一、補完遊戲

- [ ] 主選單可正常操作。
- [ ] 設定頁可調整全螢幕、音量與顯示相關設定。
- [ ] 規則書可從主選單或遊戲內開啟。
- [ ] 角色百科包含所有目前版本角色、數值、技能與共鳴說明。
- [ ] 本機雙人或 AI 對戰可正常開始。
- [ ] 戰鬥 Log 可閱讀，並能追蹤關鍵結算。
- [ ] 勝利結算畫面可正常顯示勝方與統計。
- [ ] Electron 桌面版入口已規劃，之後可接打包流程。
- [ ] 離線資源整理完成，圖片、音效、字體與 UI 素材不依賴外部 CDN。

## 二、本機 Build

- [ ] 執行 `npm run build`。
- [ ] 產出可包裝為 Windows 桌面版的靜態檔案或 Electron build 內容。
- [ ] 產出 Windows 桌面版後，測試 `.exe` 可正常啟動。
- [ ] 測試從主選單開始，完整打一局直到勝利結算。
- [ ] 測試返回主選單與再來一局流程。

## 三、Steam App 建立

- [ ] 完成 Steamworks 開發者帳號與必要文件。
- [ ] 付款 Steam Direct。
- [ ] 在 Steamworks 建立 App。
- [ ] 設定 App 名稱為 `LuxFatum：裁定對決`。
- [ ] 確認 AppID，並記錄到發行內部文件。
- [ ] 確認目前仍不接 Steamworks SDK；此步只建立 Steam 後台項目。

## 四、SteamPipe 測試上傳

- [ ] 在 Steamworks 建立 depot，例如 Windows Content。
- [ ] 建立 SteamPipe build script。
- [ ] 建立 depot build script，映射桌面版輸出資料夾。
- [ ] 使用 SteamPipe 上傳 build。
- [ ] 建立 `devtest` branch。
- [ ] 將 build 指派到 `devtest` branch。
- [ ] 用 Steam 客戶端下載 `devtest` 測試。
- [ ] 測試安裝、啟動、完整打一局、離線啟動與更新覆蓋。

## 五、朋友測試

- [ ] 建立 beta 或 `devtest` 分支。
- [ ] 設定分支密碼。
- [ ] 發送測試說明給測試者。
- [ ] 讓測試者在 Steam 客戶端的 Betas 分支切換到測試分支。
- [ ] 收集 bug、截圖、硬體資訊、作業系統版本與重現步驟。
- [ ] 修正後重新打包，先上傳到 `devtest`，確認無誤後再考慮切到正式分支。

## 六、商店頁送審

- [ ] 準備符合實際遊戲內容的截圖。
- [ ] 準備 capsule 圖。
- [ ] 準備遊戲描述。
- [ ] 準備系統需求。
- [ ] 準備價格。
- [ ] 完成 Store Presence checklist。
- [ ] 確認商店頁沒有宣傳尚未實作的功能。
- [ ] 點選 `Mark as ready for review`，送出商店頁審核。

## 七、Build 送審

- [ ] 完成 App Build checklist。
- [ ] 確認 build 可安裝。
- [ ] 確認 build 可啟動。
- [ ] 確認 build 可遊玩完整一局。
- [ ] 確認 build 內容與商店頁描述一致。
- [ ] 確認 build 已放在審核需要的 branch。
- [ ] 點選 `Mark as ready for review`，送出 build 審核。

## 八、正式發行

- [ ] 確認商店頁狀態為 Ready for release。
- [ ] 確認 Build 狀態為 Ready for release。
- [ ] 設定 release 日期。
- [ ] 將正式 build 指派到 default branch。
- [ ] 最後確認售價、折扣、商店圖與 build。
- [ ] 到發行時間後，在 Steamworks 使用正式發行控制項發行。

## 九、更新流程

- [ ] 修改版本號。
- [ ] 更新 `CHANGELOG.md`。
- [ ] 打包新 build。
- [ ] 上傳到 `devtest` branch。
- [ ] 用 Steam 客戶端測試 `devtest`。
- [ ] 沒問題後切到 default branch。
- [ ] 發更新公告。
- [ ] 保留舊 build 紀錄，必要時可回滾。

## 參考文件

- Steam Direct Fee: https://partner.steamgames.com/doc/gettingstarted/appfee
- Uploading to Steam / SteamPipe: https://partner.steamgames.com/doc/sdk/uploading
- Builds and beta branches: https://partner.steamgames.com/doc/store/application/builds
- Release process: https://partner.steamgames.com/doc/store/releasing
- Review process: https://partner.steamgames.com/doc/store/review_process
