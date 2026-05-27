import { THEME } from "./theme.js";

export function drawBattleHud(PIXI, layer, snapshot, width, height) {
  const round = snapshot?.state?.round || 0;
  const active = snapshot?.state?.active;
  const label = active ? `${active.side.toUpperCase()} ACTIVE` : "BATTLEFIELD";
  const compact = height < 320;
  const panelWidth = compact
    ? Math.min(230, Math.max(174, width * 0.3))
    : Math.min(310, Math.max(230, width * 0.34));

  if (!layer._hud) {
    layer._hud = {
      panel: new PIXI.Graphics(),
      text: new PIXI.Text({
        text: "",
        style: {
          fill: THEME.goldBright,
          fontFamily: "Inter, 'Noto Sans TC', sans-serif",
          fontSize: 14,
          fontWeight: "700",
          letterSpacing: 1,
          dropShadow: { color: "#a98bff", alpha: 0.5, blur: 5, distance: 0 }
        }
      })
    };
    layer._hud.text.x = 28;
    layer._hud.text.y = 19;
    layer.addChild(layer._hud.panel, layer._hud.text);
  }

  const panelX = compact ? 12 : 14;
  const panelY = compact ? 8 : 12;
  const panelH = compact ? 24 : 32;
  layer._hud.panel.clear()
    .roundRect(panelX, panelY, panelWidth, panelH, compact ? 12 : 16)
    .fill({ color: 0x090711, alpha: 0.72 })
    .stroke({ width: 1, color: THEME.gold, alpha: 0.35 });
  layer._hud.text.x = compact ? 22 : 28;
  layer._hud.text.y = compact ? 12 : 19;
  layer._hud.text.style.fontSize = compact ? 12 : 14;
  layer._hud.text.text = `ROUND ${round}  |  ${label}`;
}
