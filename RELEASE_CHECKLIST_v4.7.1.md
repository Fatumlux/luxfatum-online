# LuxFatum v4.7.1 Release Checklist

版本定位：`v4.7.1｜全域穩定性與商業完整度補強版`

## 必跑指令

- `npm run version:show`
- `npm run typecheck`
- `npm run check`
- `npm run test:rules`
- `npm run smoke:ui`
- `npm run build`

## 規則驗收

- 休息：回復 1 HP，移除 1 個負面狀態。
- 1/2/3 裁定：傷害加權、回復/冷卻、封殺下一次技能共鳴並給予遲緩。
- 角色回歸：天訊、祈衡、縫星、訟鴉、刻律、鏡刃、裂舞、蝕璃、混亂改目標。

## UI Smoke

- 截圖輸出：`artifacts/v4.7.1-smoke/`
- 必含畫面：主選單、輪抽、戰鬥待決、普通行動、技能對話框、規則頁、結算頁。
- 必查：v4.7.1 文字、Pixi canvas、戰鬥目標提示、手機無水平捲動。

## 發行檔

- `web-build/` 由 `npm run build` 重新產生。
- `release.json` 版本為 `v4.7.1`。
- `src/config/version.json` 遊戲版本與規則版本皆為 `v4.7.1`。
- 桌面包與 Steam build 需在重新打包後再更新 checksum 或上傳。

## 部署

- Render Build Command：`npm ci && npm run build`
- Render Start Command：`npm start`
- 部署後檢查：`/api/health`、`/api/version`、首頁主選單與快速對戰。
