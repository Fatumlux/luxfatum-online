import { useEffect, useRef } from "react";
import { Application, Assets, Container, Graphics, Sprite, Text, Texture, type ContainerChild, type TextStyleOptions } from "pixi.js";
import { CHARACTERS, artFocus, cardImage } from "../data/characters";
import { STATUS, currentAtk, currentSpd } from "../game";
import type { Fighter, GameSnapshot, Side } from "../types";

type Props = {
  snapshot: GameSnapshot;
  onSelect?: (key: string) => void;
};

type CardView = {
  key: string;
  fighter: Fighter;
  root: Container;
  baseX: number;
  baseY: number;
  glow: Graphics;
  frame: Graphics;
  hpFill: Graphics;
};

type Effect = {
  node: ContainerChild;
  age: number;
  duration: number;
  update: (progress: number, delta: number) => void;
};

const UI_FONT = "\"Noto Sans TC\", \"Microsoft JhengHei UI\", \"Microsoft JhengHei\", \"PingFang TC\", \"Segoe UI\", sans-serif";
const SIDE_COLOR: Record<Side, number> = { p1: 0x5aa7ff, p2: 0xff6c7a };
const GOLD = 0xfff0b8;
const GOLD_DEEP = 0xd6a644;
const RED = 0xff6c7a;
const GREEN = 0x7ddc9a;
const VIOLET = 0xb798ff;
const STATUS_BADGES: Record<string, { text: string; color: number; fill: number }> = {
  [STATUS.SEAL]: { text: "封", color: 0xffc3cc, fill: 0x3a1019 },
  [STATUS.OBSERVE]: { text: "測", color: 0xfff0b8, fill: 0x34250c },
  [STATUS.CONFUSE]: { text: "亂", color: 0xd7c5ff, fill: 0x25153b },
  [STATUS.SLOW]: { text: "緩", color: 0xb9d8ff, fill: 0x11243a },
  [STATUS.GUARD]: { text: "護", color: 0xb8ffd0, fill: 0x123321 },
  [STATUS.TIME_TAX]: { text: "稅", color: 0xfff0b8, fill: 0x3a270d },
  [STATUS.DELAY]: { text: "延", color: 0xd7c5ff, fill: 0x25153b },
  [STATUS.CORROSION]: { text: "蝕", color: 0xff9aa6, fill: 0x3a1019 },
  [STATUS.STITCH]: { text: "縫", color: 0xffd0f2, fill: 0x341239 },
  欠條: { text: "欠", color: 0xfff0b8, fill: 0x3a270d },
  加重欠條: { text: "重", color: 0xffd0f2, fill: 0x341239 },
  裂衡: { text: "衡", color: 0xffc3cc, fill: 0x3a1019 },
  星線: { text: "星", color: 0xb8ffd0, fill: 0x123321 },
  防: { text: "防", color: 0xb8ffd0, fill: 0x123321 }
};

function fighterKey(fighter: Fighter) {
  return `${fighter.owner}:${fighter.id}`;
}

function activeKey(snapshot: GameSnapshot) {
  const active = snapshot.state.active;
  return active ? `${active.side}:${active.id}` : "";
}

function allFighters(snapshot: GameSnapshot) {
  const players = snapshot.state.players;
  if (!players) return [];
  return [...players.p2.team, ...players.p1.team];
}

function makeText(text: string, size: number, fill = 0xfff8e8, weight: TextStyleOptions["fontWeight"] = "800") {
  const node = new Text({
    text,
    style: {
      fontFamily: UI_FONT,
      fontSize: size,
      fontWeight: weight,
      fill,
      stroke: { color: 0x05060a, width: Math.max(2, Math.round(size / 8)) }
    } satisfies Partial<TextStyleOptions>
  });
  node.resolution = Math.max(2, window.devicePixelRatio || 1);
  return node;
}

function fitText(node: Text, maxWidth: number, minScale = 0.68) {
  if (node.width <= maxWidth) return;
  const scale = Math.max(minScale, maxWidth / node.width);
  node.scale.set(scale);
}

function rect(x: number, y: number, width: number, height: number, color: number, alpha = 1, radius = 0) {
  const g = new Graphics();
  if (radius) g.roundRect(x, y, width, height, radius);
  else g.rect(x, y, width, height);
  g.fill({ color, alpha });
  return g;
}

function ring(radius: number, color: number, alpha: number, width = 2) {
  return new Graphics().circle(0, 0, radius).stroke({ color, alpha, width });
}

function line(fromX: number, fromY: number, toX: number, toY: number, color: number, alpha: number, width = 4) {
  return new Graphics()
    .moveTo(fromX, fromY)
    .lineTo(toX, toY)
    .stroke({ color, alpha, width });
}

function focusPoint(focus: string) {
  const parts = String(focus || "").split(/\s+/);
  const xPart = parts[0] || "center";
  const yPart = parts[1] || "50%";
  const parse = (part: string, center: number) => {
    if (part === "left" || part === "top") return 0;
    if (part === "right" || part === "bottom") return 1;
    if (part === "center") return center;
    if (part.endsWith("%")) return Math.max(0, Math.min(1, Number.parseFloat(part) / 100));
    return center;
  };
  return { x: parse(xPart, 0.5), y: parse(yPart, 0.5) };
}

function coverSprite(texture: Texture, width: number, height: number, focus = "center 50%") {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  const sourceW = texture.width || width;
  const sourceH = texture.height || height;
  const scale = Math.max(width / sourceW, height / sourceH);
  sprite.scale.set(scale);
  const drawnW = sourceW * scale;
  const drawnH = sourceH * scale;
  const point = focusPoint(focus);
  sprite.x = (0.5 - point.x) * Math.max(0, drawnW - width);
  sprite.y = (0.5 - point.y) * Math.max(0, drawnH - height);
  return sprite;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutBack(t: number) {
  const c1 = 1.70158;
  const c2 = c1 * 1.525;
  return t < 0.5
    ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
}

export function PixiBattle({ snapshot, onSelect }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const snapshotRef = useRef(snapshot);
  const onSelectRef = useRef(onSelect);
  const cardsRef = useRef(new Map<string, CardView>());
  const texturesRef = useRef<Record<string, Texture>>({});
  const effectsRef = useRef<Effect[]>([]);
  const ambientRef = useRef<{ node: ContainerChild; speed: number; drift?: number }[]>([]);
  const sceneRef = useRef<Container | null>(null);
  const fxLayerRef = useRef<Container | null>(null);
  const damageLayerRef = useRef<Container | null>(null);
  const renderRef = useRef<(next: GameSnapshot) => void>(() => undefined);
  const lastFxStampRef = useRef(0);
  const lastHitStampRef = useRef(0);
  const shakeRef = useRef({ until: 0, strength: 0 });

  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    let disposed = false;
    const host = hostRef.current;
    if (!host) return;

    async function boot() {
      const app = new Application();
      await app.init({
        resizeTo: host,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.max(1, window.devicePixelRatio || 1),
        preference: "webgl"
      });
      if (disposed) {
        app.destroy(true);
        return;
      }
      appRef.current = app;
      host.appendChild(app.canvas);

      const assets = [
        "assets/images/luxfatum-arena-bg.png",
        ...CHARACTERS.map(character => cardImage(character.id))
      ];
      const loaded = await Assets.load(assets);
      if (disposed) return;
      texturesRef.current = loaded as Record<string, Texture>;

      app.ticker.add(ticker => tick(ticker.deltaMS || 16));
      render(snapshotRef.current);
    }

    function clearContainer(container: Container) {
      const children = container.removeChildren();
      for (const child of children) child.destroy({ children: true });
    }

    function render(next: GameSnapshot) {
      const app = appRef.current;
      if (!app) return;

      clearContainer(app.stage);
      effectsRef.current = [];
      cardsRef.current.clear();
      ambientRef.current = [];

      const scene = new Container();
      const bgLayer = new Container();
      const glowLayer = new Container();
      const cardLayer = new Container();
      const statusLayer = new Container();
      const fxLayer = new Container();
      const damageLayer = new Container();
      const uiLayer = new Container();
      scene.addChild(bgLayer, glowLayer, cardLayer, statusLayer, fxLayer, damageLayer, uiLayer);
      app.stage.addChild(scene);
      sceneRef.current = scene;
      fxLayerRef.current = fxLayer;
      damageLayerRef.current = damageLayer;

      drawBackground(bgLayer);
      if (!next.state.players) {
        drawEmpty(uiLayer);
        return;
      }
      drawStage(glowLayer);
      drawCards(cardLayer, statusLayer, next);
      drawActivePanel(uiLayer, next);
      playSnapshotFx(next);
    }

    function drawBackground(layer: Container) {
      const app = appRef.current;
      if (!app) return;
      const w = app.screen.width;
      const h = app.screen.height;
      layer.addChild(rect(0, 0, w, h, 0x05060a, 1));

      const bgTexture = texturesRef.current["assets/images/luxfatum-arena-bg.png"];
      if (bgTexture) {
        const bg = coverSprite(bgTexture, w, h);
        bg.x = w / 2;
        bg.y = h / 2;
        bg.alpha = 0.46;
        layer.addChild(bg);
      }

      layer.addChild(rect(0, 0, w, h, 0x05060a, 0.34));
      const vignette = new Graphics()
        .rect(0, 0, w, h)
        .fill({ color: 0x020308, alpha: 0.18 });
      layer.addChild(vignette);

      for (let i = 0; i < 3; i += 1) {
        const r = Math.min(w, h) * (0.28 + i * 0.11);
        const geo = ring(r, i === 1 ? GOLD : 0x6b5cff, i === 1 ? 0.18 : 0.1, 1.5);
        geo.x = w / 2;
        geo.y = h / 2;
        geo.scale.y = 0.44;
        layer.addChild(geo);
        ambientRef.current.push({ node: geo, speed: (i % 2 ? -1 : 1) * (0.00012 + i * 0.00004) });
      }

      for (let i = 0; i < 42; i += 1) {
        const p = new Graphics()
          .circle(0, 0, 1.2 + Math.random() * 2.6)
          .fill({ color: Math.random() > 0.5 ? GOLD : 0x9ecbff, alpha: 0.18 + Math.random() * 0.28 });
        p.x = Math.random() * w;
        p.y = Math.random() * h;
        layer.addChild(p);
        ambientRef.current.push({ node: p, speed: 0, drift: 0.15 + Math.random() * 0.4 });
      }
    }

    function drawEmpty(layer: Container) {
      const app = appRef.current;
      if (!app) return;
      const t = makeText("等待戰鬥資料", 24, GOLD);
      t.anchor.set(0.5);
      t.x = app.screen.width / 2;
      t.y = app.screen.height / 2;
      layer.addChild(t);
    }

    function drawStage(layer: Container) {
      const app = appRef.current;
      if (!app) return;
      const w = app.screen.width;
      const h = app.screen.height;
      const floor = new Graphics()
        .ellipse(w / 2, h / 2 + h * 0.08, w * 0.36, h * 0.19)
        .stroke({ color: GOLD_DEEP, alpha: 0.34, width: 2 })
        .ellipse(w / 2, h / 2 + h * 0.08, w * 0.26, h * 0.12)
        .stroke({ color: 0x9ecbff, alpha: 0.12, width: 1 });
      layer.addChild(floor);
      ambientRef.current.push({ node: floor, speed: 0.00008 });

      const horizon = line(w * 0.1, h * 0.5, w * 0.9, h * 0.5, GOLD, 0.1, 2);
      layer.addChild(horizon);
    }

    function drawCards(cardLayer: Container, statusLayer: Container, next: GameSnapshot) {
      const app = appRef.current;
      if (!app || !next.state.players) return;
      const w = app.screen.width;
      const h = app.screen.height;
      const cardW = Math.max(86, Math.min(128, w / 8.2));
      const cardH = cardW * 1.42;
      const gap = Math.max(16, Math.min(36, w * 0.036));
      const p2Y = Math.max(cardH / 2 + 44, h * 0.27);
      const p1Y = Math.min(h - cardH / 2 - 44, h * 0.75);

      drawSideCards(cardLayer, statusLayer, next.state.players.p2.team, "p2", p2Y, cardW, cardH, gap, next);
      drawSideCards(cardLayer, statusLayer, next.state.players.p1.team, "p1", p1Y, cardW, cardH, gap, next);
    }

    function drawSideCards(
      cardLayer: Container,
      statusLayer: Container,
      team: Fighter[],
      side: Side,
      y: number,
      cardW: number,
      cardH: number,
      gap: number,
      next: GameSnapshot
    ) {
      const app = appRef.current;
      if (!app) return;
      const total = team.length * cardW + Math.max(0, team.length - 1) * gap;
      let x = app.screen.width / 2 - total / 2 + cardW / 2;
      for (const fighter of team) {
        const view = createCard(fighter, Math.round(x), Math.round(y), cardW, cardH, fighterKey(fighter) === activeKey(next));
        cardLayer.addChild(view.root);
        cardsRef.current.set(view.key, view);
        drawStatusIcons(statusLayer, fighter, x, y - cardH / 2 + 20, cardW);
        x += cardW + gap;
      }
    }

    function createCard(fighter: Fighter, x: number, y: number, cardW: number, cardH: number, active: boolean) {
      const root = new Container();
      root.x = x;
      root.y = y;
      root.eventMode = "static";
      root.cursor = "pointer";
      root.on("pointertap", () => onSelectRef.current?.(fighterKey(fighter)));

      const dead = fighter.hpNow <= 0;
      const sideColor = SIDE_COLOR[fighter.owner];
      const glow = new Graphics()
        .roundRect(-cardW / 2 - 8, -cardH / 2 - 8, cardW + 16, cardH + 16, 8)
        .stroke({ color: active ? GOLD : sideColor, alpha: active ? 0.62 : 0.18, width: active ? 4 : 2 });
      glow.alpha = active ? 1 : 0.44;

      const shadow = rect(-cardW / 2 + 4, -cardH / 2 + 10, cardW, cardH, 0x000000, dead ? 0.22 : 0.5, 8);
      const card = new Graphics()
        .roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 8)
        .fill({ color: 0x0d1018, alpha: dead ? 0.5 : 0.94 })
        .stroke({ color: active ? GOLD : sideColor, alpha: active ? 0.88 : 0.46, width: active ? 3 : 2 });

      const texture = texturesRef.current[cardImage(fighter.id)];
      const mask = new Graphics()
        .roundRect(-cardW / 2 + 7, -cardH / 2 + 7, cardW - 14, cardH - 34, 6)
        .fill({ color: 0xffffff, alpha: 1 });
      const portrait = texture ? coverSprite(texture, cardW - 14, cardH - 34, artFocus(fighter.id)) : new Sprite(Texture.WHITE);
      portrait.alpha = dead ? 0.34 : 0.9;
      portrait.mask = mask;

      const sideTag = rect(-cardW / 2 + 8, -cardH / 2 + 8, 11, 11, sideColor, dead ? 0.34 : 1, 2);
      const textX = -cardW / 2 + 10;
      const textMaxWidth = cardW - 20;
      const infoHeight = Math.max(54, cardH * 0.32);
      const infoTop = cardH / 2 - infoHeight - 8;
      const hpHeight = 6;
      const hpY = cardH / 2 - 17;
      const lowerShade = rect(-cardW / 2 + 7, infoTop, cardW - 14, cardH / 2 - infoTop - 7, 0x02040a, 0.82, 4);
      const hpBack = rect(textX, hpY, textMaxWidth, hpHeight, 0x07080c, 0.95, 999);
      const hpPct = Math.max(0, Math.min(1, fighter.hpNow / fighter.maxHp));
      const hpFill = rect(textX, hpY, Math.max(2, textMaxWidth * hpPct), hpHeight, sideColor, 1, 999);

      const name = makeText(fighter.name, Math.max(12, Math.min(16, cardW * 0.12)), 0xfff8e8, "900");
      name.x = textX;
      name.y = infoTop + 8;
      fitText(name, textMaxWidth, 0.72);

      const stat = makeText(`HP ${fighter.hpNow}/${fighter.maxHp}   ATK ${currentAtk(fighter)}   SPD ${currentSpd(fighter)}`, Math.max(7, Math.min(9, cardW * 0.055)), 0xded8ea, "800");
      stat.x = textX;
      stat.y = Math.min(hpY - 15, name.y + Math.max(18, name.height + 4));
      fitText(stat, textMaxWidth, 0.62);

      root.addChild(shadow, glow, card, portrait, mask, lowerShade, sideTag, hpBack, hpFill, name, stat);
      if (dead) {
        root.rotation = -0.05;
        root.alpha = 0.58;
      }
      return { key: fighterKey(fighter), fighter, root, baseX: x, baseY: y, glow, frame: card, hpFill } satisfies CardView;
    }

    function drawStatusIcons(layer: Container, fighter: Fighter, x: number, y: number, cardW: number) {
      const items = [...fighter.statuses];
      if (fighter.flags.debtMark) items.unshift(fighter.flags.debtMark.level >= 2 ? "加重欠條" : "欠條");
      if (fighter.flags.qihengRift) items.unshift("裂衡");
      if (fighter.flags.starLine) items.unshift("星線");
      if (fighter.flags.defended) items.unshift("防");
      if (!items.length) return;
      const maxItems = cardW < 110 ? 2 : 3;
      const visible = items.slice(0, maxItems);
      if (items.length > maxItems) visible.push(`+${items.length - maxItems}`);
      const pillW = 32;
      const pillH = 22;
      const gap = 5;
      const totalW = visible.length * pillW + Math.max(0, visible.length - 1) * gap;
      visible.forEach((status, index) => {
        const meta = STATUS_BADGES[status] || { text: String(status).slice(0, 1), color: 0xfff0b8, fill: 0x171926 };
        const icon = new Container();
        icon.x = x - totalW / 2 + pillW / 2 + index * (pillW + gap);
        icon.y = y;
        icon.addChild(new Graphics()
          .roundRect(-pillW / 2, -pillH / 2, pillW, pillH, 6)
          .fill({ color: meta.fill, alpha: 0.96 })
          .stroke({ color: meta.color, alpha: 0.92, width: 1.5 }));
        const label = makeText(meta.text, 12, meta.color, "900");
        label.anchor.set(0.5);
        icon.addChild(label);
        layer.addChild(icon);
      });
    }

    function drawActivePanel(layer: Container, next: GameSnapshot) {
      const app = appRef.current;
      const active = next.state.active;
      const players = next.state.players;
      if (!app || !active || !players) return;
      const fighter = players[active.side].team.find(item => item.id === active.id);
      if (!fighter) return;
      const w = app.screen.width;
      const panel = new Container();
      panel.x = w - 186;
      panel.y = app.screen.height / 2 - 30;
      panel.addChild(new Graphics().roundRect(0, 0, 164, 64, 6).fill({ color: 0x05060a, alpha: 0.78 }).stroke({ color: GOLD, alpha: 0.32, width: 1 }));
      const top = makeText("目前行動", 12, 0xb7b1a2, "800");
      top.anchor.set(0.5, 0);
      top.x = 82;
      top.y = 10;
      const name = makeText(fighter.name, 25, GOLD, "900");
      name.anchor.set(0.5, 0);
      name.x = 82;
      name.y = 28;
      panel.addChild(top, name);
      layer.addChild(panel);
    }

    function playSnapshotFx(next: GameSnapshot) {
      const events = Array.isArray(next.state.fxQueue) && next.state.fxQueue.length
        ? next.state.fxQueue
        : (next.state.fx ? [next.state.fx] : []);
      const fresh = events
        .filter(event => event && event.stamp > lastFxStampRef.current)
        .sort((a, b) => a.stamp - b.stamp);
      fresh.forEach((event, index) => {
        playFx(event, next, index);
        lastFxStampRef.current = event.stamp;
      });
      const hit = next.state.lastHit;
      if (hit && hit.stamp !== lastHitStampRef.current) {
        lastHitStampRef.current = hit.stamp;
      }
    }

    function addEffect(node: ContainerChild, duration: number, update: Effect["update"]) {
      effectsRef.current.push({ node, duration, age: 0, update });
      return node;
    }

    function fxLane(index = 0) {
      return Math.max(0, Math.min(4, Math.floor(index)));
    }

    function laneNudge(index = 0) {
      const lane = fxLane(index);
      const pair = Math.ceil(lane / 2);
      return {
        x: lane === 0 ? 0 : (lane % 2 === 0 ? -1 : 1) * pair * 18,
        titleY: lane * 58,
        floatY: lane * 18
      };
    }

    function playFx(event: NonNullable<GameSnapshot["state"]["fx"]>, next: GameSnapshot, lane = 0) {
      const fxLayer = fxLayerRef.current;
      if (!fxLayer) return;
      const { kind, title, sub } = event;
      const activeView = cardsRef.current.get(activeKey(next));
      const hit = next.state.lastHit;
      const actorView = event.actorKey ? cardsRef.current.get(event.actorKey) : null;
      const targetView = event.targetKey ? cardsRef.current.get(event.targetKey) : null;
      const hitView = hit ? cardsRef.current.get(`${hit.owner}:${hit.id}`) : null;
      const primary = targetView || hitView || actorView || activeView;

      if (kind === "damage" || kind === "attack") {
        playAttackFx(actorView || activeView, targetView || hitView, title, sub, lane);
      } else if (kind === "skillDamage") {
        playSkillDamageFx(actorView || activeView, targetView || hitView, title, sub, lane);
      } else if (kind === "skill" || kind === "skillCast") {
        playSkillFx(actorView || activeView, title, sub, 0xfff0b8, lane);
      } else if (kind === "heal") {
        playHealFx(primary || activeView, title, sub, lane);
      } else if (kind === "guard") {
        playGuardFx(actorView || activeView, title, lane);
      } else if (kind === "resonance") {
        playResonanceFx(actorView || activeView, title, next, lane);
      } else if (kind === "judgement") {
        playJudgementFx(actorView || activeView, title, sub, lane);
      } else if (kind === "support") {
        playSupportFx(primary || activeView, title, sub, lane);
      } else {
        playStatusFx(primary || activeView, title, sub, lane);
      }
    }

    function playSkillDamageFx(actor?: CardView | null, target?: CardView | null, title = "技能攻擊", sub = "", lane = 0) {
      playSkillFx(actor || null, title, sub, RED, lane);
      if (target) playAttackFx(actor || null, target, title, sub, lane);
    }

    function playAttackFx(actor?: CardView | null, target?: CardView | null, title = "攻擊", sub = "", lane = 0) {
      if (!target) return playSkillFx(actor || null, title, sub, RED, lane);
      screenShake(15, 380);
      if (actor) {
        const startX = actor.root.x;
        const startY = actor.root.y;
        const dirX = Math.sign(target.root.x - actor.root.x) || 1;
        const dirY = Math.sign(target.root.y - actor.root.y) || 0;
        addEffect(actor.root, 340, progress => {
          const p = progress < 0.45 ? easeOutCubic(progress / 0.45) : 1 - easeOutCubic((progress - 0.45) / 0.55);
          actor.root.x = startX + dirX * 58 * p;
          actor.root.y = startY + dirY * 24 * p;
          actor.root.scale.set(1 + 0.08 * p);
          if (progress >= 1) {
            actor.root.x = startX;
            actor.root.y = startY;
            actor.root.scale.set(1);
          }
        });
      }
      const slash = new Container();
      slash.x = target.root.x;
      slash.y = target.root.y;
      slash.rotation = -0.45;
      const blade = new Graphics()
        .moveTo(-80, 0)
        .lineTo(80, 0)
        .stroke({ color: 0xffffff, alpha: 1, width: 8 })
        .moveTo(-70, 9)
        .lineTo(70, -9)
        .stroke({ color: RED, alpha: 0.82, width: 4 });
      slash.addChild(blade);
      fxLayerRef.current?.addChild(slash);
      addEffect(slash, 360, progress => {
        slash.alpha = 1 - progress;
        slash.scale.set(0.72 + progress * 0.9, 1 + progress * 0.25);
      });
      const nudge = laneNudge(lane);
      popDamageNumber(target.root.x + nudge.x, target.root.y - 36 - nudge.floatY, sub, lane);
      burstParticles(target.root.x, target.root.y, RED, 24, 92);
      shakeCard(target);
    }

    function playSkillFx(actor: CardView | null | undefined, title: string, sub: string, color: number, lane = 0) {
      const app = appRef.current;
      const fxLayer = fxLayerRef.current;
      if (!app || !fxLayer) return;
      screenShake(8, 420);
      if (fxLane(lane) === 0) {
        const overlay = rect(0, 0, app.screen.width, app.screen.height, 0x02030a, 0.0);
        fxLayer.addChild(overlay);
        addEffect(overlay, 640, progress => { overlay.alpha = progress < 0.45 ? progress * 0.24 : (1 - progress) * 0.32; });
      }

      if (actor) {
        const sx = actor.root.scale.x;
        addEffect(actor.root, 720, progress => {
          const p = Math.sin(progress * Math.PI);
          actor.root.scale.set(sx + p * 0.18);
          actor.glow.alpha = 0.75 + p * 0.25;
          if (progress >= 1) actor.root.scale.set(1);
        });
      }

      const cut = new Container();
      const nudge = laneNudge(lane);
      const rowGap = Math.max(50, Math.min(62, app.screen.height * 0.085));
      const stackTop = Math.max(54, Math.min(92, app.screen.height * 0.14));
      const plateWidth = Math.min(430, Math.max(260, app.screen.width * 0.34));
      const plateHeight = sub ? 54 : 46;
      const laneY = stackTop + fxLane(lane) * rowGap;
      cut.x = app.screen.width / 2;
      cut.y = Math.min(app.screen.height - plateHeight - 28, laneY);
      const plate = new Graphics()
        .roundRect(-plateWidth / 2, -plateHeight / 2, plateWidth, plateHeight, 10)
        .fill({ color: 0x05060a, alpha: 0.72 })
        .stroke({ color, alpha: 0.42, width: 1.5 });
      const accent = new Graphics()
        .roundRect(-plateWidth / 2 + 8, -plateHeight / 2 + 8, 5, plateHeight - 16, 999)
        .fill({ color, alpha: 0.9 });
      const textLeft = -plateWidth / 2 + 24;
      const textMaxWidth = plateWidth - 42;
      const label = makeText(title, 19, color, "900");
      label.anchor.set(0, 0.5);
      label.x = textLeft;
      label.y = sub ? -9 : 0;
      fitText(label, textMaxWidth, 0.64);
      const subtitle = makeText(sub, 12, 0xe6dfce, "800");
      subtitle.anchor.set(0, 0.5);
      subtitle.x = textLeft;
      subtitle.y = 13;
      fitText(subtitle, textMaxWidth, 0.68);
      cut.addChild(plate, accent, label);
      if (sub) cut.addChild(subtitle);
      fxLayer.addChild(cut);
      addEffect(cut, 920, progress => {
        const p = easeOutCubic(progress);
        cut.alpha = progress > 0.72 ? (1 - progress) / 0.28 : 1;
        cut.x = app.screen.width / 2 + nudge.x * (1 - p);
        cut.scale.set(0.96 + p * 0.04);
      });
      magicCircle(app.screen.width / 2, app.screen.height / 2, color, 112, 980);
      burstParticles(app.screen.width / 2, app.screen.height / 2, color, 44, 150);
    }

    function playGuardFx(actor: CardView | null | undefined, title: string, lane = 0) {
      if (!actor) return;
      screenShake(4, 220);
      const shield = new Container();
      shield.x = actor.root.x;
      shield.y = actor.root.y;
      shield.addChild(ring(58, 0x9ecbff, 0.82, 4), ring(76, GOLD, 0.44, 2));
      fxLayerRef.current?.addChild(shield);
      addEffect(shield, 780, progress => {
        shield.alpha = 1 - progress;
        shield.scale.set(0.8 + progress * 0.52);
      });
      const nudge = laneNudge(lane);
      popFloatingText(actor.root.x + nudge.x, actor.root.y - 90 - nudge.floatY, title || "防禦", 0x9ecbff, 22, lane);
    }

    function playHealFx(actor: CardView | null | undefined, title: string, sub: string, lane = 0) {
      if (!actor) return;
      const aura = new Container();
      aura.x = actor.root.x;
      aura.y = actor.root.y;
      aura.addChild(ring(44, GREEN, 0.72, 3), ring(66, GREEN, 0.32, 2));
      fxLayerRef.current?.addChild(aura);
      addEffect(aura, 920, progress => {
        aura.alpha = 1 - progress;
        aura.scale.set(0.8 + progress * 0.7);
        aura.rotation += 0.04;
      });
      burstParticles(actor.root.x, actor.root.y + 18, GREEN, 24, 82, -1);
      const nudge = laneNudge(lane);
      popFloatingText(actor.root.x + nudge.x, actor.root.y - 88 - nudge.floatY, sub || title, GREEN, 22, lane);
    }

    function playResonanceFx(actor: CardView | null | undefined, title: string, next: GameSnapshot, lane = 0) {
      if (!actor) return;
      playSkillFx(actor, title || "共鳴", "雙層裁定同步", GOLD, lane);
      const allies = allFighters(next).filter(fighter => fighter.owner === actor.fighter.owner && fighter.id !== actor.fighter.id && fighter.hpNow > 0);
      for (const ally of allies) {
        const allyView = cardsRef.current.get(fighterKey(ally));
        if (!allyView) continue;
        const beam = line(actor.root.x, actor.root.y, allyView.root.x, allyView.root.y, GOLD, 0.5, 3);
        fxLayerRef.current?.addChild(beam);
        addEffect(beam, 760, progress => { beam.alpha = 1 - progress; });
      }
    }

    function playJudgementFx(actor: CardView | null | undefined, title: string, sub: string, lane = 0) {
      const app = appRef.current;
      if (!app) return;
      screenShake(10, 500);
      const x = actor?.root.x ?? app.screen.width / 2;
      const y = actor?.root.y ?? app.screen.height / 2;
      magicCircle(x, y, GOLD, 96, 920, true);
      const nudge = laneNudge(lane);
      popFloatingText(x + nudge.x, y - 108 - nudge.floatY, title || "裁定", GOLD, 22, lane);
      if (sub) popFloatingText(x + nudge.x, y - 78 - nudge.floatY, sub, 0xe6dfce, 14, lane);
    }

    function playStatusFx(actor: CardView | null | undefined, title: string, sub: string, lane = 0) {
      if (!actor) return;
      magicCircle(actor.root.x, actor.root.y, VIOLET, 62, 700);
      burstParticles(actor.root.x, actor.root.y, VIOLET, 20, 72);
      const nudge = laneNudge(lane);
      popFloatingText(actor.root.x + nudge.x, actor.root.y - 88 - nudge.floatY, sub || title, VIOLET, 22, lane);
    }

    function playSupportFx(actor: CardView | null | undefined, title: string, sub: string, lane = 0) {
      if (!actor) return;
      magicCircle(actor.root.x, actor.root.y, 0x9ecbff, 70, 780);
      burstParticles(actor.root.x, actor.root.y, 0x9ecbff, 18, 72);
      const nudge = laneNudge(lane);
      popFloatingText(actor.root.x + nudge.x, actor.root.y - 88 - nudge.floatY, sub || title, 0x9ecbff, 18, lane);
    }

    function magicCircle(x: number, y: number, color: number, size: number, duration: number, geometric = false) {
      const circle = new Container();
      circle.x = x;
      circle.y = y;
      circle.addChild(ring(size, color, 0.62, 3), ring(size * 0.68, color, 0.36, 2));
      if (geometric) {
        for (let i = 0; i < 6; i += 1) {
          const a = (Math.PI * 2 * i) / 6;
          circle.addChild(line(Math.cos(a) * size * 0.32, Math.sin(a) * size * 0.32, Math.cos(a) * size, Math.sin(a) * size, color, 0.34, 2));
        }
      }
      fxLayerRef.current?.addChild(circle);
      addEffect(circle, duration, progress => {
        circle.alpha = 1 - progress;
        circle.rotation += 0.035;
        circle.scale.set(0.62 + progress * 0.62);
      });
    }

    function popDamageNumber(x: number, y: number, sub: string, lane = 0) {
      const match = sub.match(/-\s*(\d+)/);
      popFloatingText(x, y, match ? `-${match[1]}` : sub || "HIT", RED, 30, lane);
    }

    function popFloatingText(x: number, y: number, value: string, color: number, size = 22, lane = 0) {
      const text = makeText(value, size, color, "900");
      text.anchor.set(0.5);
      text.x = x;
      text.y = y;
      const screenWidth = appRef.current?.screen.width ?? 900;
      fitText(text, Math.min(screenWidth * 0.3, 280), 0.62);
      const baseScale = text.scale.x;
      damageLayerRef.current?.addChild(text);
      addEffect(text, 820, progress => {
        const p = easeOutCubic(progress);
        text.y = y - p * (46 + fxLane(lane) * 4);
        text.alpha = progress > 0.7 ? (1 - progress) / 0.3 : 1;
        text.scale.set(baseScale * (0.84 + Math.sin(Math.min(1, progress * 1.8) * Math.PI) * 0.24));
      });
    }

    function burstParticles(x: number, y: number, color: number, count: number, radius: number, up = 0) {
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const dist = radius * (0.35 + Math.random() * 0.65);
        const dot = new Graphics().circle(0, 0, 1.8 + Math.random() * 3.4).fill({ color, alpha: 0.8 });
        dot.x = x;
        dot.y = y;
        fxLayerRef.current?.addChild(dot);
        addEffect(dot, 620 + Math.random() * 320, progress => {
          const p = easeOutCubic(progress);
          dot.x = x + Math.cos(angle) * dist * p;
          dot.y = y + Math.sin(angle) * dist * p + up * p * 46;
          dot.alpha = 1 - progress;
          dot.scale.set(1 - progress * 0.4);
        });
      }
    }

    function shakeCard(view: CardView) {
      const startX = view.root.x;
      addEffect(view.root, 320, progress => {
        view.root.x = startX + Math.sin(progress * Math.PI * 10) * (1 - progress) * 9;
        if (progress >= 1) view.root.x = startX;
      });
    }

    function screenShake(strength: number, duration: number) {
      shakeRef.current = { until: performance.now() + duration, strength };
    }

    function tick(deltaMS: number) {
      const app = appRef.current;
      const scene = sceneRef.current;
      if (!app || !scene) return;
      const now = performance.now();
      const t = now / 1000;
      for (const card of cardsRef.current.values()) {
        const active = card.key === activeKey(snapshotRef.current);
        const bob = Math.sin(t * 1.8 + card.baseX * 0.01) * (active ? 4 : 1.8);
        if (!effectsRef.current.some(effect => effect.node === card.root)) {
          card.root.y = card.baseY + bob;
          card.root.scale.set(active ? 1.04 + Math.sin(t * 3) * 0.012 : 1);
        }
        card.glow.alpha = active ? 0.72 + Math.sin(t * 4) * 0.22 : 0.4;
      }

      for (const item of ambientRef.current) {
        if (item.speed) item.node.rotation += item.speed * deltaMS;
        if (item.drift) {
          item.node.y -= item.drift * deltaMS * 0.03;
          if (item.node.y < -10) item.node.y = app.screen.height + 10;
        }
      }

      if (now < shakeRef.current.until) {
        const power = ((shakeRef.current.until - now) / Math.max(1, shakeRef.current.until - (shakeRef.current.until - 500))) || 1;
        scene.x = (Math.random() - 0.5) * shakeRef.current.strength * power;
        scene.y = (Math.random() - 0.5) * shakeRef.current.strength * power;
      } else {
        scene.x = 0;
        scene.y = 0;
      }

      effectsRef.current = effectsRef.current.filter(effect => {
        effect.age += deltaMS;
        const progress = Math.min(1, effect.age / effect.duration);
        effect.update(progress, deltaMS);
        if (progress >= 1) {
          const cardRoot = [...cardsRef.current.values()].some(card => card.root === effect.node);
          if (!cardRoot && effect.node.parent) effect.node.parent.removeChild(effect.node);
          if (!cardRoot) {
            effect.node.destroy?.({ children: true });
          }
          return false;
        }
        return true;
      });
    }

    renderRef.current = render;
    boot();

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => render(snapshotRef.current));
    });
    resizeObserver.observe(host);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      clearContainer(appRef.current?.stage || new Container());
      appRef.current?.destroy(true);
      appRef.current = null;
      renderRef.current = () => undefined;
      effectsRef.current = [];
      cardsRef.current.clear();
      ambientRef.current = [];
    };
  }, []);

  useEffect(() => {
    renderRef.current(snapshot);
  }, [snapshot]);

  return <div ref={hostRef} className="phaser-root pixi-battle-root" aria-label="PixiJS battle scene" />;
}
