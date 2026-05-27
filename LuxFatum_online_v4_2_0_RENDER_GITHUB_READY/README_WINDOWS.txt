LuxFatum Windows 版

啟動方式：
1. 解壓縮整個資料夾。
2. 執行 LuxFatum.exe。
3. 啟動器會開啟本機伺服器並自動打開遊戲。

需求：
- Windows 遊戲包會內建 runtime/node.exe，可直接啟動。
- 若你刪除了 runtime/node.exe，啟動器會改找系統安裝的 Node.js。

線上對戰：
- Windows 本機版可本機遊玩。
- 真正跨網路連線建議使用 Render 部署版。
- Render/GitHub 部署包可直接上傳到 GitHub，Render 會讀取 render.yaml。

更新：
- 遊戲會透過 /api/version 檢查目前版本。
- release.json 可調整 latest version、minSupportedVersion、forceUpdate。
- 若 forceUpdate 為 true，或玩家版本低於 minSupportedVersion，網頁會顯示強制更新提示。
