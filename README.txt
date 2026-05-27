LuxFatum 裁定對決 v4.2.2 桌面連線版

本版本提供兩種玩法：

1. 線上網頁版
   部署到 Render 後，可用網址開啟並建立/加入房間。

2. Windows 下載版
   執行 LuxFatum.exe 後，遊戲會在本地桌面視窗中開啟。
   畫面與素材從本機載入，房間對戰資料直接連到線上 Render 伺服器。

Render 部署
1. 將本資料夾內容上傳到 GitHub repository 根目錄。
2. Render 建立 Blueprint 或 Web Service。
3. Build Command：npm install
4. Start Command：npm start
5. 部署後檢查：
   /api/health
   /api/version

Windows 下載版
- 玩家下載 Windows zip 後解壓縮。
- 執行 LuxFatum.exe。
- 不會跳外部瀏覽器。
- 不需要 Node.js。
- 可建立房間或輸入房號加入。
- 下載版與線上網頁版使用同一套房間 API，可互相連線。

版本與更新
- release.json 控制版本號、更新提示與強制更新。
- /download/installer.exe 提供最新版 Windows 安裝檔。
- /download/windows.zip 提供免安裝 zip。
- /download/package.zip 提供 Render/GitHub 上傳包。
- 房間對戰 API 保持不變：/api/create、/api/join、/api/state。

主要檔案
- index.html：遊戲前端。
- server.js：靜態檔案、房間 API、下載包、桌面版 API 轉送。
- release.json：版本、更新與下載資訊。
- package.json：Node 啟動設定。
- render.yaml：Render 部署設定。
- launcher/LuxFatumLauncher.cs：Windows 桌面啟動器原始碼。
- dist/windows/LuxFatum.exe：Windows 桌面版執行檔。
- dist/windows/*.dll：桌面 WebView2 需要的 DLL。
