LuxFatum Windows 下載版 v4.2.1

啟動方式
1. 解壓縮整個 zip。
2. 執行 LuxFatum.exe。
3. 遊戲會在本地桌面視窗中開啟，不會跳到外部瀏覽器。
4. 建立房間、加入房間、同步戰鬥狀態會連到線上伺服器：
   https://luxfatum-online.onrender.com

重要說明
- Windows 包不需要 Node.js。
- LuxFatum.exe 會用桌面 WebView2 載入本地遊戲檔。
- 房間對戰 API 會直接連到線上 Render 伺服器，所以下載版與網頁版可以互相連線。
- 若要用瀏覽器開線上版，可執行：LuxFatum.exe --web
- 若要測試本機伺服器模式，可執行：LuxFatum.exe --local-server

更新
- 遊戲會透過 /api/version 檢查最新版本、最低支援版本與強制更新狀態。
- 修改 release.json 的 version、minSupportedVersion、forceUpdate 後，重新部署即可控制更新提示。
