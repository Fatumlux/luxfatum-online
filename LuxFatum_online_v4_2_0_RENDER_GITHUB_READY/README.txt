LuxFatum 裁定對決 v4.2 連線版

啟動方式：
1. 安裝 Node.js 18 或更新版本。
2. 雙擊 start_server.bat，或在此資料夾開啟終端機後執行：npm start
3. 本機打開：http://localhost:8787
4. 同區網其他電腦打開：http://這台電腦的IP:8787

Windows 遊戲版：
- 解壓 Windows 版遊戲包後，執行 LuxFatum.exe。
- 啟動器會直接打開線上連線版：https://luxfatum-online.onrender.com
- 可跨網路建立房間與加入房間。
- 若要離線本機模式，可用命令列執行 LuxFatum.exe --local。

真正網站部署：
- 請看 DEPLOY_RENDER.txt。
- 部署後會得到 https://... 的網址，玩家不用在同一區網，也不用開本機伺服器。
- Render/GitHub 部署包可直接解壓上傳 GitHub，Render 會讀取 render.yaml。

連線對戰：
1. 第一位玩家按「建立線上房間」，座位是 P1。
2. 建房後頁面上方會顯示大型房號，例如 ABC23。
3. P1 可按「複製房號」或「複製邀請連結」傳給 P2。
4. P2 打開邀請連結會看到「加入邀請房間」，按下即可加入。
5. 如果 P2 只拿到房號，也可以在首頁輸入房號加入。
6. 兩邊都會自動同步選角與戰鬥狀態。

離線遊玩：
- 直接按「本機雙人遊玩」即可在同一台電腦玩。

檔案說明：
- index.html：遊戲本體，支援本機與線上房間。
- server.js：免外部套件的 Node 連線同步伺服器。
- release.json：版本號、最低支援版本、強制更新與下載連結。
- package.json：啟動腳本。
- start_server.bat：Windows 雙擊啟動用。
- LuxFatum.exe：Windows 遊戲啟動器，放在 Windows 版遊戲包根目錄。
- render.yaml：Render 網站部署設定。
- Dockerfile：Docker / Railway / Fly.io 等平台可用。
- DEPLOY_RENDER.txt：部署成公開網站的步驟。

更新與下載：
- /api/version：版本檢查、未來更新提示、強制更新判定。
- /api/health：Render 健康檢查與版本確認。
- /download/windows.zip：Windows 遊戲包。
- /download/package.zip：Render/GitHub 部署包。
- 強制更新可在 release.json 設定 forceUpdate 或 minSupportedVersion。

注意：
- 若其他電腦連不上，請確認兩台電腦在同一 Wi-Fi/區網，並允許 Windows 防火牆讓 Node.js 使用連線。
- 此版本採回合制狀態同步，適合朋友對戰測試；不要把房號公開給不相關的人。
- 臨時 trycloudflare 網址只要主機電腦或 tunnel 關閉就會失效；永久網址請部署到 Render 或其他 Node 網站平台。
