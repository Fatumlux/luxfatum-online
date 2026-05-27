LuxFatum Windows 版

啟動方式：
1. 解壓縮整個資料夾。
2. 執行 LuxFatum.exe。
3. 啟動器會直接打開線上連線版：https://luxfatum-online.onrender.com

需求：
- 一般線上連線不需要安裝 Node.js。
- 若要離線本機模式，可用命令列執行 LuxFatum.exe --local。
- 離線本機模式需要電腦已安裝 Node.js。

線上對戰：
- Windows 下載版預設使用 Render 線上連線，可跨網路建房/加入。
- Render/GitHub 部署包可直接上傳到 GitHub，Render 會讀取 render.yaml。

更新：
- 遊戲會透過 /api/version 檢查目前版本。
- release.json 可調整 latest version、minSupportedVersion、forceUpdate。
- 若 forceUpdate 為 true，或玩家版本低於 minSupportedVersion，網頁會顯示強制更新提示。
