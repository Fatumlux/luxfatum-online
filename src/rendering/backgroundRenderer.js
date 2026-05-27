import { THEME } from "./theme.js";

export function drawBattleBackground(PIXI, layer, width, height) {
  const backdrop = new PIXI.Graphics()
    .roundRect(0, 0, width, height, 18)
    .fill({ color: THEME.void, alpha: 0.94 })
    .stroke({ width: 1, color: THEME.gold, alpha: 0.34 });
  layer.addChild(backdrop);

  const aura = new PIXI.Graphics()
    .ellipse(width * 0.5, height * 0.46, width * 0.38, height * 0.42)
    .fill({ color: THEME.plum, alpha: 0.26 });
  layer.addChild(aura);

  const manaWell = new PIXI.Graphics()
    .ellipse(width * 0.5, height * 0.5, width * 0.22, height * 0.24)
    .stroke({ width: 2, color: THEME.gold, alpha: 0.2 })
    .fill({ color: THEME.indigo, alpha: 0.18 });
  layer.addChild(manaWell);

  const horizon = new PIXI.Graphics()
    .rect(width * 0.08, height * 0.5, width * 0.84, 2)
    .fill({ color: THEME.gold, alpha: 0.32 });
  layer.addChild(horizon);

  drawConstellationDust(PIXI, layer, width, height);
}

function drawConstellationDust(PIXI, layer, width, height) {
  const dust = new PIXI.Graphics();
  const count = Math.max(18, Math.floor(width / 34));

  for (let index = 0; index < count; index += 1) {
    const x = (index * 73) % Math.max(width, 1);
    const y = 18 + ((index * 47) % Math.max(height - 36, 1));
    const size = index % 5 === 0 ? 1.8 : 1.1;
    dust.circle(x, y, size).fill({ color: THEME.goldBright, alpha: index % 3 === 0 ? 0.36 : 0.18 });
  }

  layer.addChild(dust);
}
