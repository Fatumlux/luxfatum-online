import { getActiveKey, getBattleTeams } from "../game.js";
import { THEME } from "./theme.js";
import { drawBattleBackground } from "./backgroundRenderer.js";
import { beginCardFrame, drawTeamCards, endCardFrame } from "./cardRenderer.js";
import { drawBattleHud } from "./hudRenderer.js";
import { syncBattleAnimations } from "./animations.js";

export function renderBattleScene(PIXI, handle, snapshot) {
  const { app, layers } = handle;
  const width = app.screen.width;
  const height = app.screen.height;

  if (handle.sceneSize !== `${width}x${height}`) {
    layers.backgroundLayer.removeChildren();
    layers.battleLayer.removeChildren();
    drawBattleBackground(PIXI, layers.backgroundLayer, width, height);
    drawBattleField(PIXI, layers.battleLayer, width, height);
    handle.sceneSize = `${width}x${height}`;
  }

  const teams = getBattleTeams(snapshot);
  const activeKey = getActiveKey(snapshot);
  beginCardFrame(layers.cardLayer);
  drawTeamCards(PIXI, layers.cardLayer, layers.fxLayer, teams.p2, "p2", activeKey, width, height);
  drawTeamCards(PIXI, layers.cardLayer, layers.fxLayer, teams.p1, "p1", activeKey, width, height);
  endCardFrame(layers.cardLayer);
  drawBattleHud(PIXI, layers.hudLayer, snapshot, width, height);
  syncBattleAnimations(PIXI, handle, snapshot);
}

function drawBattleField(PIXI, layer, width, height) {
  if (height < 520 || width < 900) {
    const hudBand = height < 150 ? 32 : 42;
    const laneGap = height < 150 ? 4 : 8;
    const laneHeight = Math.max(42, Math.min(86, (height - hudBand - 20 - laneGap) / 2));
    const inset = 12;
    const topY = hudBand;
    const bottomY = topY + laneHeight + laneGap;
    const topLane = new PIXI.Graphics()
      .roundRect(inset, topY - 3, width - inset * 2, laneHeight + 6, 10)
      .fill({ color: THEME.panel, alpha: 0.36 })
      .stroke({ width: 1, color: THEME.red, alpha: 0.28 });
    const bottomLane = new PIXI.Graphics()
      .roundRect(inset, bottomY - 3, width - inset * 2, laneHeight + 6, 10)
      .fill({ color: THEME.panel, alpha: 0.36 })
      .stroke({ width: 1, color: THEME.blue, alpha: 0.28 });

    layer.addChild(topLane, bottomLane);
    return;
  }

  const laneHeight = Math.max(84, height * 0.23);
  const topLane = new PIXI.Graphics()
    .roundRect(18, 18, width - 36, laneHeight, 16)
    .fill({ color: THEME.panel, alpha: 0.38 })
    .stroke({ width: 1, color: THEME.red, alpha: 0.34 });
  const bottomLane = new PIXI.Graphics()
    .roundRect(18, height - laneHeight - 18, width - 36, laneHeight, 16)
    .fill({ color: THEME.panel, alpha: 0.38 })
    .stroke({ width: 1, color: THEME.blue, alpha: 0.34 });

  layer.addChild(topLane, bottomLane);
}
