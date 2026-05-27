import { GlowFilter } from "@pixi/filter-glow";
import { OutlineFilter } from "@pixi/filter-outline";
import { currentAtk, currentSpd } from "../game.js";
import { THEME } from "./theme.js";

const CARD_RATIO = 1.36;
const TEXT_GLOW = {
  color: "#a98bff",
  alpha: 0.55,
  blur: 5,
  distance: 0
};

export function beginCardFrame(layer) {
  layer.sortableChildren = true;
  layer._seenCardKeys = new Set();
  if (!layer._cardViews) layer._cardViews = new Map();
}

export function drawTeamCards(PIXI, layer, tooltipLayer, team, side, activeKey, width, height) {
  if (!team?.length) return;

  tooltipLayer.sortableChildren = true;
  const compact = height < 520 || width < 900;
  const compactHudBand = height < 150 ? 32 : 42;
  const compactLaneGap = height < 150 ? 4 : 8;
  const compactLaneHeight = Math.max(42, Math.min(86, (height - compactHudBand - 20 - compactLaneGap) / 2));
  const compactGap = Math.min(14, Math.max(6, width * 0.018));
  const cardWidth = compact
    ? Math.min(210, Math.max(92, (width - 40 - compactGap * (team.length - 1)) / team.length))
    : Math.min(190, Math.max(128, (width - 112) / 3.35));
  const cardHeight = compact ? compactLaneHeight : Math.round(cardWidth * CARD_RATIO);
  const gap = compact
    ? compactGap
    : Math.min(28, Math.max(12, (width - cardWidth * team.length) / (team.length + 1)));
  const total = cardWidth * team.length + gap * (team.length - 1);
  const startX = Math.max(22, (width - total) / 2);
  const y = compact
    ? (side === "p2" ? compactHudBand : compactHudBand + compactLaneHeight + compactLaneGap)
    : side === "p2" ? 28 : Math.max(28, height - cardHeight - 28);

  team.forEach((card, index) => {
    const key = `${side}:${card.id}`;
    const x = startX + index * (cardWidth + gap);
    layer._seenCardKeys.add(key);

    let view = layer._cardViews.get(key);
    if (!view) {
      view = createCharacterCardView(PIXI, card, side, tooltipLayer);
      layer._cardViews.set(key, view);
      layer.addChild(view.container);
    }

    updateCharacterCardView(PIXI, view, card, {
      key,
      side,
      active: key === activeKey,
      x,
      y,
      width: cardWidth,
      height: cardHeight,
      compact,
      screenWidth: width,
      screenHeight: height
    });
  });
}

export function endCardFrame(layer) {
  if (!layer._cardViews || !layer._seenCardKeys) return;
  for (const [key, view] of layer._cardViews) {
    if (layer._seenCardKeys.has(key)) continue;
    view.tooltip?.destroy({ children: true });
    view.container.destroy({ children: true });
    layer._cardViews.delete(key);
  }
}

export function getCardView(layer, key) {
  return layer?._cardViews?.get(key) || null;
}

export function getCardViews(layer) {
  return [...(layer?._cardViews?.entries() || [])].map(([key, view]) => ({ key, view }));
}

function createCharacterCardView(PIXI, card, side, tooltipLayer) {
  const container = new PIXI.Container();
  container.eventMode = "static";
  container.cursor = "pointer";
  container.sortableChildren = true;

  const frame = new PIXI.Graphics();
  const innerFrame = new PIXI.Graphics();
  const artSprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
  const artShade = new PIXI.Graphics();
  const hpBack = new PIXI.Graphics();
  const hpFill = new PIXI.Graphics();
  const activeRing = new PIXI.Graphics();
  const statusContainer = new PIXI.Container();

  const nameText = makeText(PIXI, card.name || card.id, 22, THEME.text, "Georgia, 'Noto Serif TC', serif", 800);
  const hpText = makeText(PIXI, "HP", 13, THEME.text, "Inter, 'Noto Sans TC', sans-serif", 800);
  const atkText = makeText(PIXI, "ATK", 12, THEME.muted, "Inter, 'Noto Sans TC', sans-serif", 700);
  const spdText = makeText(PIXI, "SPD", 12, THEME.muted, "Inter, 'Noto Sans TC', sans-serif", 700);

  container.addChild(frame, artSprite, artShade, innerFrame, activeRing, nameText, hpBack, hpFill, hpText, atkText, spdText, statusContainer);

  const tooltip = createTooltip(PIXI);
  tooltip.visible = false;
  tooltip.zIndex = 1000;
  tooltipLayer.addChild(tooltip);
  loadPortraitTexture(PIXI, artSprite, card.id);

  const view = {
    side,
    container,
    frame,
    innerFrame,
    artSprite,
    artShade,
    activeRing,
    hpBack,
    hpFill,
    nameText,
    hpText,
    atkText,
    spdText,
    statusContainer,
    tooltip,
    hover: false,
    sizeKey: "",
    statusKey: "",
    tooltipKey: "",
    filterKey: ""
  };

  container.on("pointerover", () => {
    view.hover = true;
    view.tooltip.visible = true;
    applyScaleAndFilters(view);
  });
  container.on("pointerout", () => {
    view.hover = false;
    view.tooltip.visible = false;
    applyScaleAndFilters(view);
  });

  return view;
}

function updateCharacterCardView(PIXI, view, card, layout) {
  const hpNow = card.hpNow ?? card.hp ?? card.maxHp ?? 1;
  const maxHp = card.maxHp ?? card.hp ?? hpNow;
  const hpPct = Math.max(0, Math.min(1, hpNow / Math.max(1, maxHp)));
  const sizeKey = `${Math.round(layout.width)}x${Math.round(layout.height)}:${layout.side}:${layout.compact ? "compact" : "full"}`;

  view.key = layout.key;
  view.card = card;
  view.layout = {
    ...layout,
    centerX: layout.x + layout.width / 2,
    centerY: layout.y + layout.height / 2,
    hpNow,
    maxHp
  };
  view.container.pivot.set(layout.width / 2, layout.height / 2);
  view.container.x = layout.x + layout.width / 2;
  view.container.y = layout.y + layout.height / 2;
  view.container.alpha = hpNow <= 0 ? 0.48 : 1;
  view.container.zIndex = layout.active || view.hover ? 20 : layout.side === "p1" ? 3 : 2;
  view.container.visible = true;

  if (view.sizeKey !== sizeKey) {
    layoutCardView(PIXI, view, layout);
    view.sizeKey = sizeKey;
  }

  view.nameText.text = card.name || card.id;
  view.hpText.text = layout.compact && layout.width < 150 ? `HP ${hpNow}` : `HP ${hpNow}/${maxHp}`;
  view.atkText.text = layout.compact ? `A${currentAtk(card)}` : `ATK ${currentAtk(card)}`;
  view.spdText.text = layout.compact ? `S${currentSpd(card)}` : `SPD ${currentSpd(card)}`;

  drawHpBar(view, layout, hpPct);
  updateStatusRow(PIXI, view, card, layout);
  updateTooltip(view, card, layout);

  view.active = layout.active;
  applyScaleAndFilters(view);
}

function layoutCardView(PIXI, view, layout) {
  const { width, height, side } = layout;
  if (layout.compact) {
    layoutCompactCardView(view, layout);
    return;
  }

  const border = side === "p1" ? THEME.blue : THEME.red;
  const artX = 10;
  const artY = 10;
  const artW = width - 20;
  const artH = height * 0.56;

  view.frame.clear()
    .roundRect(0, 0, width, height, 14)
    .fill({ color: THEME.panel, alpha: 0.96 })
    .stroke({ width: 2, color: border, alpha: 0.72 });

  view.innerFrame.clear()
    .roundRect(artX - 1, artY - 1, artW + 2, artH + 2, 11)
    .stroke({ width: 1, color: THEME.gold, alpha: 0.42 });

  view.artSprite.x = artX;
  view.artSprite.y = artY;
  view.artSprite.width = artW;
  view.artSprite.height = artH;

  view.artShade.clear()
    .roundRect(artX, artY, artW, artH, 10)
    .fill({ color: side === "p1" ? THEME.indigo : THEME.plum, alpha: 0.16 })
    .rect(artX, artY + artH * 0.55, artW, artH * 0.45)
    .fill({ color: THEME.void, alpha: 0.38 });

  view.activeRing.clear()
    .roundRect(5, 5, width - 10, height - 10, 12)
    .stroke({ width: 2, color: THEME.goldBright, alpha: 0.68 });

  view.nameText.x = 14;
  view.nameText.y = artY + artH + 9;
  view.nameText.style.fontSize = Math.max(19, width * 0.13);

  view.hpText.x = 14;
  view.hpText.y = height - 56;
  view.hpText.style.fontSize = Math.max(12, width * 0.072);

  view.atkText.x = 14;
  view.atkText.y = height - 33;
  view.atkText.style.fontSize = Math.max(11, width * 0.068);

  view.spdText.x = width * 0.55;
  view.spdText.y = height - 33;
  view.spdText.style.fontSize = Math.max(11, width * 0.068);
  view.spdText.visible = true;

  view.statusContainer.x = 14;
  view.statusContainer.y = height - 78;
  view.statusContainer.visible = true;
}

function layoutCompactCardView(view, layout) {
  const { width, height, side } = layout;
  const border = side === "p1" ? THEME.blue : THEME.red;
  const artSize = Math.max(28, Math.min(46, height - 10));
  const artX = 8;
  const artY = Math.max(5, (height - artSize) / 2);
  const textX = artX + artSize + 8;
  const statY = Math.max(22, height - 21);

  view.frame.clear()
    .roundRect(0, 0, width, height, 9)
    .fill({ color: THEME.panel, alpha: 0.94 })
    .stroke({ width: 1.5, color: border, alpha: 0.68 });

  view.innerFrame.clear()
    .roundRect(artX - 1, artY - 1, artSize + 2, artSize + 2, 7)
    .stroke({ width: 1, color: THEME.gold, alpha: 0.34 });

  view.artSprite.x = artX;
  view.artSprite.y = artY;
  view.artSprite.width = artSize;
  view.artSprite.height = artSize;

  view.artShade.clear()
    .roundRect(artX, artY, artSize, artSize, 7)
    .fill({ color: side === "p1" ? THEME.indigo : THEME.plum, alpha: 0.12 });

  view.activeRing.clear()
    .roundRect(4, 4, width - 8, height - 8, 8)
    .stroke({ width: 2, color: THEME.goldBright, alpha: 0.7 });

  view.nameText.x = textX;
  view.nameText.y = 6;
  view.nameText.style.fontSize = Math.max(11, Math.min(15, height * 0.28));
  view.nameText.scale.set(1);

  view.hpText.x = textX;
  view.hpText.y = statY;
  view.hpText.style.fontSize = Math.max(9, Math.min(11, height * 0.22));
  view.hpText.scale.set(1);

  view.atkText.x = Math.min(width - 58, textX + (width > 160 ? 64 : 48));
  view.atkText.y = statY;
  view.atkText.style.fontSize = Math.max(9, Math.min(11, height * 0.22));
  view.atkText.scale.set(1);

  view.spdText.x = Math.min(width - 30, view.atkText.x + (width > 160 ? 42 : 32));
  view.spdText.y = statY;
  view.spdText.style.fontSize = Math.max(9, Math.min(11, height * 0.22));
  view.spdText.visible = width > 118;
  view.spdText.scale.set(1);

  view.statusContainer.visible = false;
}

function drawHpBar(view, layout, hpPct) {
  if (layout.compact) {
    const artSize = Math.max(28, Math.min(46, layout.height - 10));
    const barX = 8 + artSize + 8;
    const barY = layout.height - 9;
    const barW = Math.max(24, layout.width - barX - 8);
    const barH = 4;
    const fillColor = hpPct > 0.5 ? 0x76f1a0 : hpPct > 0.25 ? THEME.goldBright : 0xff6378;

    view.hpBack.clear()
      .roundRect(barX, barY, barW, barH, 3)
      .fill({ color: 0x080912, alpha: 1 })
      .stroke({ width: 1, color: 0xffffff, alpha: 0.12 });

    view.hpFill.clear()
      .roundRect(barX, barY, Math.max(2, barW * hpPct), barH, 3)
      .fill({ color: fillColor, alpha: 1 });
    return;
  }

  const barX = 14;
  const barY = layout.height - 40;
  const barW = layout.width - 28;
  const barH = 10;
  const fillColor = hpPct > 0.5 ? 0x76f1a0 : hpPct > 0.25 ? THEME.goldBright : 0xff6378;

  view.hpBack.clear()
    .roundRect(barX, barY, barW, barH, 6)
    .fill({ color: 0x080912, alpha: 1 })
    .stroke({ width: 1, color: 0xffffff, alpha: 0.14 });

  view.hpFill.clear()
    .roundRect(barX, barY, Math.max(3, barW * hpPct), barH, 6)
    .fill({ color: fillColor, alpha: 1 });
}

function updateStatusRow(PIXI, view, card, layout) {
  const statuses = [...(card.statuses || [])];
  if (card.flags?.defended) statuses.unshift("防禦");
  if (card.flags?.noAttack) statuses.unshift("禁攻");

  const key = statuses.join("|");
  if (key === view.statusKey) return;
  view.statusKey = key;
  view.statusContainer.removeChildren().forEach(child => child.destroy({ children: true }));

  statuses.slice(0, 5).forEach((status, index) => {
    const icon = new PIXI.Container();
    const tone = status === "守護" || status === "防禦" ? THEME.gold : 0xff6b86;
    const bg = new PIXI.Graphics()
      .circle(8, 8, 8)
      .fill({ color: 0x080912, alpha: 0.88 })
      .stroke({ width: 1, color: tone, alpha: 0.78 });
    const label = makeText(PIXI, status.slice(0, 1), 10, THEME.text, "Inter, 'Noto Sans TC', sans-serif", 900);
    label.anchor.set(0.5);
    label.x = 8;
    label.y = 7;
    icon.x = index * 19;
    icon.addChild(bg, label);
    view.statusContainer.addChild(icon);
  });
}

function updateTooltip(view, card, layout) {
  const key = `${card.id}:${card.skill?.name}:${card.skill?.cost}:${card.skill?.cd}:${card.passive}:${card.skill?.desc}:${card.res?.name}:${card.res?.desc}`;
  const tooltipWidth = 320;

  if (view.tooltipKey !== key) {
    view.tooltipKey = key;
    view.tooltip.title.text = card.name || card.id;
    view.tooltip.body.text = [
      `技能｜${card.skill?.name || "-"}  費用 ${card.skill?.cost ?? "-"} / 冷卻 ${card.skill?.cd ?? "-"}`,
      card.skill?.desc || "-",
      `被動｜${card.passive || "-"}`,
      `共鳴｜${card.res?.name || "-"}：${card.res?.desc || "-"}`
    ].join("\n");
    const bodyHeight = Math.max(88, view.tooltip.body.height);
    view.tooltip.bg.clear()
      .roundRect(0, 0, tooltipWidth, bodyHeight + 58, 8)
      .fill({ color: 0x090711, alpha: 0.96 })
      .stroke({ width: 1, color: THEME.gold, alpha: 0.62 });
  }

  const rightX = layout.x + layout.width + 14;
  const leftX = layout.x - tooltipWidth - 14;
  view.tooltip.x = rightX + tooltipWidth < layout.screenWidth ? rightX : Math.max(12, leftX);
  view.tooltip.y = Math.min(Math.max(12, layout.y + layout.height * 0.18), layout.screenHeight - view.tooltip.height - 12);
}

function createTooltip(PIXI) {
  const tooltip = new PIXI.Container();
  tooltip.bg = new PIXI.Graphics();
  tooltip.title = makeText(PIXI, "", 18, THEME.goldBright, "Georgia, 'Noto Serif TC', serif", 900);
  tooltip.body = makeText(PIXI, "", 13, THEME.text, "Inter, 'Noto Sans TC', sans-serif", 650, 288);
  tooltip.title.x = 16;
  tooltip.title.y = 12;
  tooltip.body.x = 16;
  tooltip.body.y = 42;
  tooltip.addChild(tooltip.bg, tooltip.title, tooltip.body);
  return tooltip;
}

function makeText(PIXI, text, fontSize, fill, fontFamily, fontWeight, wordWrapWidth = 0) {
  return new PIXI.Text({
    text,
    style: {
      fill,
      fontFamily,
      fontSize,
      fontWeight,
      lineHeight: Math.round(fontSize * 1.35),
      wordWrap: wordWrapWidth > 0,
      wordWrapWidth,
      dropShadow: TEXT_GLOW
    }
  });
}

function loadPortraitTexture(PIXI, sprite, id) {
  const path = portraitPath(id);
  if (!PIXI.Assets?.load) {
    sprite.texture = PIXI.Texture.from(path);
    return;
  }

  PIXI.Assets.load(path)
    .then(texture => {
      if (!sprite.destroyed) sprite.texture = texture;
    })
    .catch(error => {
      console.warn(`Portrait could not be loaded: ${path}`, error);
    });
}

function applyScaleAndFilters(view) {
  const targetScale = view.hover ? 1.085 : view.active ? 1.025 : 1;
  view.container.scale.set(targetScale);
  view.activeRing.visible = !!view.active || !!view.hover;
  view.container.zIndex = view.hover ? 50 : view.active ? 30 : view.side === "p1" ? 3 : 2;

  const filterKey = `${view.side}:${view.active ? "a" : "n"}:${view.hover ? "h" : "n"}`;
  if (view.filterKey === filterKey) return;
  view.filterKey = filterKey;

  const color = view.active || view.hover ? THEME.goldBright : view.side === "p1" ? THEME.blue : THEME.red;
  try {
    view.container.filters = [
      new OutlineFilter(view.active || view.hover ? 3 : 2, color, 0.32, view.active || view.hover ? 0.9 : 0.55),
      new GlowFilter({
        distance: view.active || view.hover ? 15 : 9,
        outerStrength: view.active || view.hover ? 1.65 : 0.62,
        innerStrength: 0.08,
        color,
        quality: 0.14,
        alpha: view.active || view.hover ? 0.72 : 0.38
      })
    ];
  } catch {
    view.container.filters = [];
  }
}

function portraitPath(id) {
  return `assets/portraits/${id}.jpg`;
}
