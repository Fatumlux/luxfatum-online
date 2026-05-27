import { GlowFilter } from "@pixi/filter-glow";
import { OutlineFilter } from "@pixi/filter-outline";
import { getCardView, getCardViews } from "./cardRenderer.js";
import { THEME } from "./theme.js";

const DAMAGE_COLOR = 0xff566b;
const HEAL_COLOR = 0x75f2a1;
const STATUS_COLOR = 0x9fc7ff;
const JUDGEMENT_COLOR = THEME.goldBright;

export async function syncBattleAnimations(PIXI, handle, snapshot) {
  if (!snapshot?.state || !handle?.layers?.cardLayer) return;
  const runtime = ensureRuntime(handle);

  playNewCardEntrances(PIXI, handle, runtime);
  playFxStamp(PIXI, handle, snapshot, runtime);
  playLogDrivenEffects(PIXI, handle, snapshot, runtime);
  updateKnockoutVisibility(PIXI, handle, snapshot, runtime);
}

export async function playCardToBattle(PIXI, handle, cardKey) {
  const view = getCardView(handle.layers.cardLayer, cardKey);
  if (!view?.layout) return;

  const target = { x: view.layout.centerX, y: view.layout.centerY };
  const fromY = view.side === "p1" ? view.layout.screenHeight + view.layout.height * 0.45 : -view.layout.height * 0.45;
  view.container.x = target.x;
  view.container.y = fromY;
  view.container.alpha = 0;
  view.container.scale.set(0.72);
  view.container.rotation = view.side === "p1" ? -0.06 : 0.06;

  const burstAt = { x: target.x, y: target.y + (view.side === "p1" ? -view.layout.height * 0.1 : view.layout.height * 0.1) };
  await Promise.all([
    springTo(handle.app, 520, value => {
      view.container.x = lerp(target.x, target.x, value);
      view.container.y = lerp(fromY, target.y, value);
      view.container.alpha = Math.min(1, value * 1.35);
      view.container.scale.set(lerp(0.72, 1, overshoot(value, 1.8)));
      view.container.rotation = lerp(view.side === "p1" ? -0.06 : 0.06, 0, value);
    }),
    sleep(180).then(() => particleBurst(PIXI, handle, burstAt.x, burstAt.y, JUDGEMENT_COLOR, 22, 420))
  ]);
}

export async function playSkillUse(PIXI, handle, cardKey, label = "技能") {
  window.LuxFatumAudio?.play?.("skill");
  const view = getCardView(handle.layers.cardLayer, cardKey);
  if (!view?.layout) return;
  const startY = view.container.y;
  await Promise.all([
    springTo(handle.app, 320, value => {
      const pulse = Math.sin(value * Math.PI);
      view.container.y = startY - pulse * 18;
      view.container.scale.set(1 + pulse * 0.08);
    }).then(() => {
      view.container.y = startY;
      view.container.scale.set(view.active ? 1.025 : 1);
    }),
    effectText(PIXI, handle, view.layout.centerX, view.layout.y - 8, label, JUDGEMENT_COLOR, 22, 560),
    particleBurst(PIXI, handle, view.layout.centerX, view.layout.centerY, JUDGEMENT_COLOR, 26, 460)
  ]);
}

export async function playImpactShake(handle, strength = 7, duration = 220) {
  const stage = handle.app.stage;
  const baseX = stage.x;
  const baseY = stage.y;
  await tween(handle.app, duration, progress => {
    const fade = 1 - progress;
    stage.x = baseX + (Math.random() * 2 - 1) * strength * fade;
    stage.y = baseY + (Math.random() * 2 - 1) * strength * fade;
  });
  stage.x = baseX;
  stage.y = baseY;
}

export async function playDamageNumber(PIXI, handle, cardKey, amountText) {
  const view = getCardView(handle.layers.cardLayer, cardKey);
  if (!view?.layout) return;
  await effectText(PIXI, handle, view.layout.centerX, view.layout.centerY - view.layout.height * 0.22, amountText, DAMAGE_COLOR, 26, 680, true);
}

export async function playHealNumber(PIXI, handle, cardKey, amountText) {
  const view = getCardView(handle.layers.cardLayer, cardKey);
  if (!view?.layout) return;
  await effectText(PIXI, handle, view.layout.centerX, view.layout.centerY - view.layout.height * 0.22, amountText, HEAL_COLOR, 25, 680, true);
}

export async function playResonance(PIXI, handle, cardKey) {
  window.LuxFatumAudio?.play?.("resonance");
  const view = getCardView(handle.layers.cardLayer, cardKey);
  if (!view?.layout) return;
  const ring = new PIXI.Graphics()
    .ellipse(0, 0, view.layout.width * 0.54, view.layout.height * 0.18)
    .stroke({ width: 3, color: JUDGEMENT_COLOR, alpha: 0.78 });
  ring.x = view.layout.centerX;
  ring.y = view.layout.y + 14;
  ring.filters = safeFilters(() => [new GlowFilter({ distance: 18, outerStrength: 2.2, color: JUDGEMENT_COLOR, quality: 0.14, alpha: 0.78 })]);
  handle.layers.fxLayer.addChild(ring);

  await Promise.all([
    effectText(PIXI, handle, view.layout.centerX, view.layout.y - 20, "共鳴", JUDGEMENT_COLOR, 28, 720),
    tween(handle.app, 720, progress => {
      ring.scale.set(lerp(0.55, 1.3, progress));
      ring.alpha = 1 - progress;
    })
  ]);
  ring.destroy();
}

export async function playStatusApplied(PIXI, handle, cardKey, status = "狀態") {
  const view = getCardView(handle.layers.cardLayer, cardKey);
  if (!view?.layout) return;

  const icon = statusIcon(PIXI, status);
  icon.x = view.layout.centerX;
  icon.y = view.layout.y - 38;
  icon.alpha = 0;
  handle.layers.fxLayer.addChild(icon);

  await Promise.all([
    tween(handle.app, 520, progress => {
      icon.y = lerp(view.layout.y - 58, view.layout.y + 20, progress);
      icon.alpha = progress < 0.22 ? progress / 0.22 : 1;
      icon.scale.set(1 + Math.sin(progress * Math.PI * 4) * 0.12);
    }),
    particleBurst(PIXI, handle, view.layout.centerX, view.layout.y + 12, STATUS_COLOR, 12, 360)
  ]);
  await tween(handle.app, 220, progress => {
    icon.alpha = 1 - progress;
  });
  icon.destroy({ children: true });
}

export async function playJudgement(PIXI, handle, cardKey, text = "裁定") {
  const view = getCardView(handle.layers.cardLayer, cardKey);
  const x = view?.layout?.centerX ?? handle.app.screen.width * 0.5;
  const y = view?.layout?.centerY ?? handle.app.screen.height * 0.5;
  await Promise.all([
    effectText(PIXI, handle, x, y - 72, text, JUDGEMENT_COLOR, 26, 720, true),
    particleBurst(PIXI, handle, x, y, JUDGEMENT_COLOR, 30, 520)
  ]);
}

export async function playKnockout(PIXI, handle, cardKey) {
  const view = getCardView(handle.layers.cardLayer, cardKey);
  if (!view?.layout) return;
  await Promise.all([
    particleBurst(PIXI, handle, view.layout.centerX, view.layout.centerY, 0xd9d4ff, 38, 680, 1.8),
    tween(handle.app, 620, progress => {
      view.container.alpha = lerp(1, 0.28, progress);
      view.container.rotation = lerp(0, view.side === "p1" ? -0.08 : 0.08, progress);
      view.container.scale.set(lerp(1, 0.92, progress));
    })
  ]);
}

export async function playJudgementGain(PIXI, handle, cardKey) {
  const view = getCardView(handle.layers.cardLayer, cardKey);
  if (!view?.layout) return;
  await effectText(PIXI, handle, view.layout.centerX, view.layout.centerY + view.layout.height * 0.2, "+1 裁定", JUDGEMENT_COLOR, 20, 760, true);
}

function ensureRuntime(handle) {
  if (!handle.animations) {
    handle.animations = {
      seenCards: new Set(),
      knockoutPlayed: new Set(),
      lastFxStamp: 0,
      lastHitStamp: 0,
      lastLogIndex: null,
      activeTasks: new Set()
    };
  }
  return handle.animations;
}

function playNewCardEntrances(PIXI, handle, runtime) {
  for (const { key } of getCardViews(handle.layers.cardLayer)) {
    if (runtime.seenCards.has(key)) continue;
    runtime.seenCards.add(key);
    queueAnimation(runtime, playCardToBattle(PIXI, handle, key));
  }
}

function playFxStamp(PIXI, handle, snapshot, runtime) {
  const fx = snapshot.state.fx;
  if (!fx?.stamp || fx.stamp === runtime.lastFxStamp) return;
  runtime.lastFxStamp = fx.stamp;

  const key = findCardKeyByText(snapshot, fx.sub) || findCardKeyByHit(snapshot) || activeKey(snapshot);
  if (fx.kind === "damage" || fx.kind === "skill") {
    const amount = extractSignedAmount(fx.sub, "-") || "-傷害";
    queueAnimation(runtime, Promise.all([
      playImpactShake(handle),
      playDamageNumber(PIXI, handle, key, amount)
    ]));
  } else if (fx.kind === "heal") {
    queueAnimation(runtime, playHealNumber(PIXI, handle, key, extractSignedAmount(fx.sub, "+") || "+HP"));
  } else if (fx.kind === "status") {
    queueAnimation(runtime, playStatusApplied(PIXI, handle, key, extractStatus(fx.sub)));
  }
}

function playLogDrivenEffects(PIXI, handle, snapshot, runtime) {
  const logs = snapshot.state.logs || [];
  if (runtime.lastLogIndex === null) {
    runtime.lastLogIndex = logs.length;
    return;
  }

  const newLogs = logs.slice(runtime.lastLogIndex);
  runtime.lastLogIndex = logs.length;
  for (const line of newLogs) {
    const key = findCardKeyByText(snapshot, line) || activeKey(snapshot);
    if (line.includes("使用「")) queueAnimation(runtime, playSkillUse(PIXI, handle, key, "技能"));
    if (line.includes("觸發共鳴")) queueAnimation(runtime, playResonance(PIXI, handle, key));
    if (line.includes("裁定：")) queueAnimation(runtime, playJudgement(PIXI, handle, key, "裁定"));
    if (line.includes("被擊倒")) {
      const knocked = findCardKeyByText(snapshot, line);
      if (knocked) {
        queueAnimation(runtime, playKnockout(PIXI, handle, knocked));
        queueAnimation(runtime, playJudgementGain(PIXI, handle, knocked));
      }
    }
    if (line.includes("獲得 1 裁定") || line.includes("立即獲得 1 裁定")) {
      const target = findCardKeyByText(snapshot, line) || key;
      queueAnimation(runtime, playJudgementGain(PIXI, handle, target));
    }
  }
}

function updateKnockoutVisibility(PIXI, handle, snapshot, runtime) {
  for (const { key, view } of getCardViews(handle.layers.cardLayer)) {
    if (!view.card || view.card.hpNow > 0 || runtime.knockoutPlayed.has(key)) continue;
    runtime.knockoutPlayed.add(key);
    queueAnimation(runtime, playKnockout(PIXI, handle, key));
  }
}

function queueAnimation(runtime, promise) {
  runtime.activeTasks.add(promise);
  promise.finally(() => runtime.activeTasks.delete(promise));
}

function findCardKeyByHit(snapshot) {
  const hit = snapshot.state.lastHit;
  return hit ? `${hit.owner}:${hit.id}` : "";
}

function activeKey(snapshot) {
  const active = snapshot.state.active;
  return active ? `${active.side}:${active.id}` : "";
}

function findCardKeyByText(snapshot, text = "") {
  if (!text) return "";
  const players = snapshot.state.players;
  if (!players) return "";
  for (const side of ["p1", "p2"]) {
    for (const card of players[side].team || []) {
      if (text.includes(card.name) || text.includes(card.id)) return `${side}:${card.id}`;
    }
  }
  return "";
}

function extractSignedAmount(text = "", sign) {
  const pattern = sign === "+" ? /\+\d+\s*HP|\+\d+/ : /-\d+\s*HP|-\d+/;
  const match = text.match(pattern);
  return match?.[0]?.replace(/\s+/g, " ") || "";
}

function extractStatus(text = "") {
  return ["封印", "觀測", "守護", "混亂", "遲緩", "防禦"].find(status => text.includes(status)) || "狀態";
}

function statusIcon(PIXI, status) {
  const root = new PIXI.Container();
  const isGood = status === "守護" || status === "防禦";
  const color = isGood ? JUDGEMENT_COLOR : STATUS_COLOR;
  const bg = new PIXI.Graphics()
    .circle(0, 0, 18)
    .fill({ color: 0x090711, alpha: 0.92 })
    .stroke({ width: 2, color, alpha: 0.9 });
  const text = new PIXI.Text({
    text: status.slice(0, 1),
    style: {
      fill: THEME.text,
      fontFamily: "Inter, 'Noto Sans TC', sans-serif",
      fontSize: 16,
      fontWeight: "900",
      dropShadow: { color: "#a98bff", alpha: 0.55, blur: 5, distance: 0 }
    }
  });
  text.anchor.set(0.5);
  root.filters = safeFilters(() => [new GlowFilter({ distance: 10, outerStrength: 1.2, color, quality: 0.16, alpha: 0.7 })]);
  root.addChild(bg, text);
  return root;
}

function effectText(PIXI, handle, x, y, text, color, fontSize, duration, bounce = false) {
  const label = new PIXI.Text({
    text,
    style: {
      fill: color,
      fontFamily: "Georgia, 'Noto Serif TC', serif",
      fontSize,
      fontWeight: "900",
      align: "center",
      dropShadow: { color: "#000000", alpha: 0.62, blur: 5, distance: 2 }
    }
  });
  label.anchor.set(0.5);
  label.x = x;
  label.y = y;
  label.filters = safeFilters(() => [
    new OutlineFilter(2, 0x090711, 0.24, 0.9),
    new GlowFilter({ distance: 12, outerStrength: 1.15, color, quality: 0.16, alpha: 0.78 })
  ]);
  handle.layers.fxLayer.addChild(label);

  return tween(handle.app, duration, progress => {
    const lift = bounce ? Math.sin(progress * Math.PI) * 18 : progress * 34;
    label.y = y - lift - progress * 24;
    label.alpha = progress < 0.72 ? 1 : 1 - (progress - 0.72) / 0.28;
    label.scale.set(1 + Math.sin(progress * Math.PI) * (bounce ? 0.28 : 0.12));
  }).then(() => label.destroy());
}

function particleBurst(PIXI, handle, x, y, color, count = 18, duration = 420, force = 1) {
  const particles = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.32;
    const speed = (36 + Math.random() * 96) * force;
    const size = 1.8 + Math.random() * 3.2;
    const particle = new PIXI.Graphics()
      .circle(0, 0, size)
      .fill({ color, alpha: 0.92 });
    particle.x = x;
    particle.y = y;
    handle.layers.fxLayer.addChild(particle);
    particles.push({ particle, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: (Math.random() - 0.5) * 0.16 });
  }

  return tween(handle.app, duration, progress => {
    const seconds = duration / 1000;
    for (const item of particles) {
      item.particle.x = x + item.vx * seconds * progress;
      item.particle.y = y + item.vy * seconds * progress + 28 * progress * progress;
      item.particle.rotation += item.spin;
      item.particle.alpha = 1 - progress;
      item.particle.scale.set(1 - progress * 0.45);
    }
  }).then(() => particles.forEach(item => item.particle.destroy()));
}

function tween(app, duration, update) {
  return new Promise(resolve => {
    let elapsed = 0;
    const tick = ticker => {
      elapsed += ticker.deltaMS;
      const progress = Math.min(1, elapsed / duration);
      update(easeOutCubic(progress), progress);
      if (progress >= 1) {
        app.ticker.remove(tick);
        resolve();
      }
    };
    app.ticker.add(tick);
  });
}

function springTo(app, duration, update) {
  return tween(app, duration, progress => update(progress));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function overshoot(t, amount) {
  const s = amount;
  t -= 1;
  return t * t * ((s + 1) * t + s) + 1;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function safeFilters(factory) {
  try {
    return factory();
  } catch {
    return [];
  }
}
