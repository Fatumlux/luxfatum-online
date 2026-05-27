LuxFatum 裁定對決 v4.1 連線版

啟動方式：
1. 安裝 Node.js 18 或更新版本。
2. 雙擊 start_server.bat，或在此資料夾開啟終端機後執行：npm start
3. 本機打開：http://localhost:8787
4. 同區網其他電腦打開：http://這台電腦的IP:8787

真正網站部署：
- 請看 DEPLOY_RENDER.txt。
- 部署後會得到 https://... 的網址，玩家不用在同一區網，也不用開本機伺服器。

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
- package.json：啟動腳本。
- start_server.bat：Windows 雙擊啟動用。
- render.yaml：Render 網站部署設定。
- Dockerfile：Docker / Railway / Fly.io 等平台可用。
- DEPLOY_RENDER.txt：部署成公開網站的步驟。

注意：
- 若其他電腦連不上，請確認兩台電腦在同一 Wi-Fi/區網，並允許 Windows 防火牆讓 Node.js 使用連線。
- 此版本採回合制狀態同步，適合朋友對戰測試；不要把房號公開給不相關的人。
- 臨時 trycloudflare 網址只要主機電腦或 tunnel 關閉就會失效；永久網址請部署到 Render 或其他 Node 網站平台。
