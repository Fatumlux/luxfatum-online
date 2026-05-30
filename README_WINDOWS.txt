LuxFatum App 版 / Windows 下載版 v5.0.0

啟動方式
1. 解壓縮整個 zip。
2. 執行 LuxFatum.exe。
3. 遊戲會在本地桌面視窗中開啟，不會跳到外部瀏覽器。
4. 建立房間、加入房間、同步戰鬥狀態會連到線上伺服器：
   https://luxfatum-online.onrender.com

重要說明
- Windows 包不需要 Node.js。
- LuxFatum.exe 會啟動內建 localhost 靜態伺服器，並用桌面 WebView2 載入 web-build/index.html 的正式建置檔。
- 房間對戰 API 會直接連到線上 Render 伺服器，所以下載版與網頁版可以互相連線。
- 線上正式連結：https://luxfatum-online.onrender.com
- 本包已包含最新版資訊：桌面黑畫面修正、原 LuxFatum logo 多尺寸 App 圖示、統一角色選取樣式。
- v5.0.0 是 GitHub/Render 線上版與 App 下載版的正式收斂版本。
- 本版採用 V5 正式節奏：起始能量下修、開戰 HP +1，並保留核心 3v3、25 角色、裁定、共鳴與勝負判定。
- 若要用瀏覽器開線上版，可執行：LuxFatum.exe --web
- 若要測試本機伺服器模式，可執行：LuxFatum.exe --local-server

更新
- 遊戲會透過 /api/version 檢查最新版本、最低支援版本與強制更新狀態。
- 修改 release.json 的 version、minSupportedVersion、forceUpdate 後，重新部署即可控制更新提示。
