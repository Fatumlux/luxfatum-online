import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Howl } from "howler";
import { CHARACTERS, artFocus, byId, cardImage, slotFocus } from "./data/characters";
import {
  BASIC_ACTION_GUIDE,
  DRAFT_SEQUENCE_TEXT,
  JUDGEMENT_GUIDE,
  RULE_GUIDE_BLOCKS,
  STATUS_META,
  STATUS_RULE_ROWS
} from "./data/rulesGuide";
import type { RuleListBlock } from "./data/rulesGuide";
import versionInfo from "./config/version.json";
import { loadSettings, saveSettings, type AspectRatioMode, type GameSettings } from "./settings";
import { achievementsFor, loadMeta, recordMatchResult, recordTrainingStart, saveMeta, type LocalMeta } from "./progression";
import {
  STATUS,
  RULES,
  activeF as rulesActiveF,
  attack as rulesAttack,
  buildQueue as rulesBuildQueue,
  confusionTargets as rulesConfusionTargets,
  currentAtk,
  currentSpd,
  decideConfuseTarget,
  decideIno as rulesDecideIno,
  decideLiewuCombo as rulesDecideLiewuCombo,
  decideMirror as rulesDecideMirror,
  decideTianxunFocus as rulesDecideTianxunFocus,
  decideTimeTax as rulesDecideTimeTax,
  decideDebt as rulesDecideDebt,
  decideQihengBalance as rulesDecideQihengBalance,
  decideFengxingStar as rulesDecideFengxingStar,
  defend as rulesDefend,
  finishAction,
  judgement as rulesJudgement,
  requestAttack as rulesRequestAttack,
  rest as rulesRest,
  skillCost,
  skillFilter,
  skillTargetFilter,
  startBattle as rulesStartBattle,
  targetList as rulesTargetList,
  useSkill as rulesUseSkill
} from "./game";
import type { AiDifficulty, BattleFighterStats, CharacterCard, DialogType, Fighter, GameSnapshot, GameState, NetState, ObjectiveState, PendingBase, PendingConfuseAttack, PendingMirror, PendingTargetChoice, PlayerState, ReleaseState, RuleActionOptions, RuleActionResult, Side, TargetEntry, TargetPreview, ViewType } from "./types";

const APP_NAME = "LuxFatum：裁定對決";
const VERSION_INFO = versionInfo;
const APP_VERSION = VERSION_INFO.gameVersion;
const APP_VERSION_NUMBER = APP_VERSION.replace(/^v/i, "");
const ONLINE_URL = "https://luxfatum-online.onrender.com";
const THEME_SRC = "assets/audio/luxfatum-theme.mp3";
const APP_LOGO_SRC = "assets/ui/luxfatum-logo-rounded.png";
const DRAFT_SEQUENCE: Side[] = ["p1", "p2", "p2", "p1", "p1", "p2"];
const SIDES: Side[] = ["p1", "p2"];
const AI_SIDE: Side = "p2";
const TRAINING_P1 = ["tianxun", "ningyao", "baijian"];
const TRAINING_P2 = ["leiting", "yingli", "xuntian"];
const AI_DIFFICULTIES = [
  { key: "easy", label: "見習裁定", note: "簡單：偏隨機，偶爾失誤。" },
  { key: "normal", label: "標準裁定", note: "普通：會選擇低血量與可用技能。" },
  { key: "hard", label: "冷冽裁定", note: "困難：重視擊倒、控場與保命。" },
  { key: "impossible", label: "無赦命運", note: "不可能：高壓選角與最優先擊倒。" }
] as const satisfies readonly { key: AiDifficulty; label: string; note: string }[];
type AiPlan = { targetKey: string | null; opts?: RuleActionOptions };
const AI_THINK_MS = 520;
const AI_PROFILE: Record<AiDifficulty, { skillChance: number; resonanceChance: number; judgementChance: number; risk: number; mistake: number }> = {
  easy: { skillChance: 0.48, resonanceChance: 0.18, judgementChance: 0.16, risk: 0.25, mistake: 0.36 },
  normal: { skillChance: 0.66, resonanceChance: 0.36, judgementChance: 0.32, risk: 0.48, mistake: 0.16 },
  hard: { skillChance: 0.82, resonanceChance: 0.58, judgementChance: 0.52, risk: 0.68, mistake: 0.06 },
  impossible: { skillChance: 0.96, resonanceChance: 0.82, judgementChance: 0.72, risk: 0.9, mistake: 0 }
};
const AI_TEAM_NEEDS = [
  { key: "damage", tags: ["爆發", "技能傷害", "普攻", "收割", "傷害", "壓血"], min: 1 },
  { key: "control", tags: ["封印", "混亂", "遲緩", "冷卻", "欠條", "時間稅", "反制"], min: 1 },
  { key: "sustain", tags: ["治療", "守護", "減傷", "保命", "防線"], min: 1 },
  { key: "tempo", tags: ["速度", "能量", "規則", "紀錄", "複製"], min: 1 }
] as const;
const PixiBattle = lazy(() => import("./components/PixiBattle").then(module => ({ default: module.PixiBattle })));
const OpeningTrailer = lazy(() => import("./components/OpeningTrailer").then(module => ({ default: module.OpeningTrailer })));

const initialRoom = new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() || "";

type BattleStatMetric = keyof BattleFighterStats | "statusOps" | "mvp";
type CssVarName = `--${string}`;
type CssVarStyle = CSSProperties & Partial<Record<CssVarName, string | number>>;
type PendingChoice = PendingTargetChoice | PendingMirror | PendingConfuseAttack | null | undefined;
type UseSkillHandler = (key: string | null, opts?: RuleActionOptions) => void;

function cssVars(vars: CssVarStyle): CssVarStyle {
  return vars;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function freshState(): GameState {
  return {
    screen: "menu",
    round: 0,
    draftTurn: "p1",
    pickIndex: 0,
    p1Draft: [],
    p2Draft: [],
    players: null,
    queue: [],
    active: null,
    winner: null,
    logs: [`歡迎來到 LuxFatum ${APP_VERSION} TypeScript / React / PixiJS v8 版。`],
    lastSkill: null,
    lastCopyableSkill: { p1: null, p2: null },
    pendingSkill: null,
    pendingConfuseAttack: null,
    pendingMirror: null,
    pendingQihengBalance: null,
    pendingFengxingStar: null,
    pendingTianxunFocus: null,
    pendingTimeTax: null,
    pendingDebt: null,
    pendingLiewuCombo: null,
    ai: null,
    lowestFirst: false,
    tianAtkBuff: false,
    tianSkillDebuff: false,
    lastHit: null,
    battleStats: null,
    shakeStamp: 0,
    fx: null,
    fxQueue: []
  };
}

function rematchDraftState(ai: GameState["ai"] = null) {
  const next = freshState();
  next.screen = "draft";
  next.ai = ai ? { ...ai } : null;
  next.logs = ["再來一局：同房間保留，重新輪抽選角。"];
  return next;
}

function isDesktopAppRuntime() {
  return window.location.protocol === "file:" || new URLSearchParams(window.location.search).get("desktop") === "1";
}

function apiUrl(path: string) {
  return isDesktopAppRuntime() && path.startsWith("/api/") ? `${ONLINE_URL}${path}` : path;
}

function downloadUrl(path: string) {
  return isDesktopAppRuntime() ? `${ONLINE_URL}${path}` : path;
}

function sideName(side: Side | string | "") {
  const normalized = String(side || "").toLowerCase();
  if (normalized === "p1") return "P1";
  if (normalized === "p2") return "P2";
  if (side === "平手" || normalized === "draw") return "平手";
  return "";
}

function other(side: Side): Side {
  return side === "p1" ? "p2" : "p1";
}

function alive(team: Fighter[] = []) {
  return team.filter(fighter => fighter.hpNow > 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function fighterKey(side: Side, id: string) {
  return `${side}:${id}`;
}

function statValue(stat: BattleFighterStats, key: BattleStatMetric) {
  if (key === "statusOps") return stat.statusApplied + stat.statusRemoved;
  if (key === "mvp") return statScore(stat);
  return Number(stat[key] || 0);
}

function statScore(stat: BattleFighterStats) {
  return stat.damageDealt * 4
    + stat.knockouts * 28
    + stat.damageTaken * 2
    + stat.healingDone * 4
    + stat.protectCount * 14
    + stat.resonanceUsed * 9
    + (stat.statusApplied + stat.statusRemoved) * 7
    + stat.oneHpSaves * 20
    + stat.mirrorReflects * 18
    + stat.judgementUsed * 8
    + stat.timesTargeted;
}

function battleStatsRows(state: GameState) {
  const rows = Object.values(state.battleStats?.fighters || {});
  if (rows.length) return rows;
  if (!state.players) return [];
  return (["p1", "p2"] as Side[]).flatMap(side => state.players?.[side].team.map(fighter => ({
    id: fighter.id,
    side,
    name: fighter.name,
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
    healingReceived: 0,
    knockouts: 0,
    timesTargeted: 0,
    resonanceUsed: 0,
    statusApplied: 0,
    statusRemoved: 0,
    protectCount: 0,
    protectedDamage: 0,
    oneHpSaves: 0,
    mirrorReflects: 0,
    judgementUsed: 0
  } as BattleFighterStats)) || []);
}

function topBy(rows: BattleFighterStats[], key: BattleStatMetric) {
  return [...rows].sort((a, b) => statValue(b, key) - statValue(a, key) || statScore(b) - statScore(a) || a.name.localeCompare(b.name));
}

function findStat(rows: BattleFighterStats[], key?: string) {
  if (!key) return null;
  return rows.find(row => fighterKey(row.side, row.id) === key) || null;
}

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function snapshotFor(state: GameState): GameSnapshot {
  return { version: APP_VERSION, chars: CHARACTERS, state };
}

function parseTarget(state: GameState, key?: string | null) {
  if (!key || !state.players) return null;
  const [side, id] = key.split(":") as [Side, string];
  return state.players[side]?.team.find(fighter => fighter.id === id) || null;
}

function debtMarkName(fighter?: Fighter | null) {
  const mark = fighter?.flags?.debtMark;
  if (!mark) return "";
  return mark.level >= 2 ? "加重欠條" : "欠條";
}

function specialMarkNames(fighter?: Fighter | null) {
  const marks: string[] = [];
  const debt = debtMarkName(fighter);
  if (debt) marks.push(debt);
  if ((fighter?.flags?.nextDamageTakenReduction || 0) < 0) marks.push("代價負荷");
  if (fighter?.flags?.starLine) marks.push("星線");
  return marks;
}

function statusLabel(fighter: Fighter, status: string) {
  if (status === STATUS.CORROSION && fighter.flags?.corrosionStacks) return `腐蝕 ${fighter.flags.corrosionStacks}/2`;
  return status;
}

function compactStatusLabel(status: string, label = status) {
  const text = label || status;
  if (status === STATUS.SEAL || text.includes("封印")) return "封";
  if (status === STATUS.OBSERVE || text.includes("觀測")) return "觀";
  if (status === STATUS.CONFUSE || text.includes("混亂")) return "亂";
  if (status === STATUS.SLOW || text.includes("遲緩")) return "緩";
  if (status === STATUS.GUARD || text.includes("守護")) return "防";
  if (status === STATUS.TIME_TAX || text.includes("時間稅")) return "稅";
  if (status === STATUS.DELAY || text.includes("延滯")) return "延";
  if (status === STATUS.CORROSION || text.includes("腐蝕")) return text.match(/\d\/\d/) ? text.replace("腐蝕", "蝕") : "蝕";
  if (status === STATUS.STITCH || text.includes("縫線")) return "線";
  if (text.includes("欠條")) return "欠";
  if (text.includes("星線")) return "星";
  if (text.includes("代價")) return "荷";
  return text.length > 2 ? text.slice(0, 2) : text;
}

function targetPreview(key: string, fighter: Fighter, summary: string, tags: string[] = []): TargetPreview {
  return {
    key,
    side: fighter.owner,
    name: fighter.name,
    hp: `${fighter.hpNow}/${fighter.maxHp}`,
    stats: `ATK ${currentAtk(fighter)} / SPD ${currentSpd(fighter)}`,
    summary,
    tags: [...tags, ...specialMarkNames(fighter)].slice(0, 4)
  };
}

function pendingActor(state: GameState, pending: PendingChoice) {
  return pending?.actorSide && pending?.actorId ? state.players?.[pending.actorSide]?.team.find(fighter => fighter.id === pending.actorId) || null : null;
}

function deriveObjectiveState(snapshot: GameSnapshot): ObjectiveState {
  const state = snapshot.state;
  const settled = !!state.winner;
  if (settled) {
    return { phase: "settled", title: "戰鬥結算", detail: `${sideName(state.winner || "") || "平手"} 已產生，查看結算摘要或再開一局。`, controller: "", actorName: "", pendingKind: "settled", confirmLabel: "查看結算", targets: [] };
  }
  const fromTargets = (items: TargetEntry[], summary: (fighter: Fighter) => string, tags: string[] = []) => items.map(item => targetPreview(item.key || fighterKey(item.c.owner, item.c.id), item.c, summary(item.c), tags));
  if (state.pendingTianxunFocus) {
    const pending = state.pendingTianxunFocus;
    const actor = pendingActor(state, pending);
    const targets = alive(state.players?.[pending.actorSide as Side]?.team || []).map(fighter => targetPreview(fighterKey(fighter.owner, fighter.id), fighter, `SPD ${currentSpd(fighter)} → ${currentSpd(fighter) + 1}`, ["加速"]));
    return { phase: "pending", title: "待決：天訊加速", detail: "選擇 1 名我方角色，本回合 SPD +1，並立即影響行動順序。", controller: pending.actorSide, actorName: actor?.name || "天訊", pendingKind: "tianxun-focus", confirmLabel: "選擇加速目標", targets };
  }
  if (state.pendingQihengBalance) {
    const pending = state.pendingQihengBalance;
    const actor = pendingActor(state, pending);
    const pair = qihengBalancePairForUi(state, pending.actorSide);
    const targets = pair ? [
      targetPreview(fighterKey(pair.highest.owner, pair.highest.id), pair.highest, "失去 1 HP，不視為受到傷害", ["代價"]),
      targetPreview(fighterKey(pair.lowest.owner, pair.lowest.id), pair.lowest, "回復 1 HP", ["回復"])
    ] : [];
    return { phase: "pending", title: "待決：均衡刻度", detail: "若我方最高 HP 與最低 HP 差距 3 以上，可轉移 1 HP。", controller: pending.actorSide, actorName: actor?.name || "祈衡", pendingKind: "qiheng-balance", confirmLabel: "決定是否轉衡", targets };
  }
  if (state.pendingFengxingStar) {
    const pending = state.pendingFengxingStar;
    const actor = pendingActor(state, pending);
    const targets = alive(state.players?.[pending.actorSide as Side]?.team || []).map(fighter => targetPreview(fighterKey(fighter.owner, fighter.id), fighter, "被指定時反傷 2，觸發後移除", ["星線"]));
    return { phase: "pending", title: "待決：星線設置", detail: "選擇 1 名我方角色設置星線，可搭配共鳴讓觸發者額外遲緩。", controller: pending.actorSide, actorName: actor?.name || "縫星", pendingKind: "fengxing-star", confirmLabel: "指定星線目標", targets };
  }
  if (state.pendingDebt) {
    const pending = state.pendingDebt;
    const actor = pendingActor(state, pending);
    const targets = alive(state.players?.[other(pending.actorSide as Side)]?.team || []).map(fighter => targetPreview(fighterKey(fighter.owner, fighter.id), fighter, "若本回合未指定訟鴉，訟鴉方獲得 1 能量且目標受 2 傷害", ["欠條"]));
    return { phase: "pending", title: "待決：欠條指定", detail: "可賦予 1 名敵方角色欠條，也可以略過。欠條不是負面狀態。", controller: pending.actorSide, actorName: actor?.name || "訟鴉", pendingKind: "debt", confirmLabel: "指定或略過", targets };
  }
  if (state.pendingTimeTax) {
    const pending = state.pendingTimeTax;
    const actor = pendingActor(state, pending);
    const targets = alive(state.players?.[other(pending.actorSide as Side)]?.team || []).map(fighter => targetPreview(fighterKey(fighter.owner, fighter.id), fighter, "本回合首次技能成功後冷卻 +1 並受 1 傷害", ["時間稅"]));
    return { phase: "pending", title: "待決：時間稅", detail: "時間稅場上同時最多 1 個，回合結束必定移除。", controller: pending.actorSide, actorName: actor?.name || "刻律", pendingKind: "time-tax", confirmLabel: "指定時間稅目標", targets };
  }
  if (state.pendingLiewuCombo) {
    const pending = state.pendingLiewuCombo;
    const actor = pendingActor(state, pending);
    const target = parseTarget(state, pending.targetKey);
    const targets = target ? [targetPreview(pending.targetKey, target, "消耗 1 戰意可追加 1 傷害", ["連擊"])] : [];
    return { phase: "pending", title: "待決：戰意連段", detail: "裂舞普攻最多消耗 1 層戰意；普攻後對同一目標追加 1 傷害，不再追加完整普攻。", controller: pending.actorSide, actorName: actor?.name || "裂舞", pendingKind: "liewu-combo", confirmLabel: "消耗或保留戰意", targets };
  }
  if (state.pendingMirror) {
    const pending = state.pendingMirror;
    const actor = pendingActor(state, pending);
    const mirror = state.players?.[pending.mirrorSide as Side]?.team.find(fighter => fighter.id === pending.mirrorId);
    const targets = mirror ? [targetPreview(fighterKey(mirror.owner, mirror.id), mirror, `剩餘 ${Math.max(0, 2 - (mirror.flags?.mirrorReflectUsed || 0))}/2 次，每回合最多 1 次`, ["鏡返"])] : [];
    return { phase: "pending", title: "待決：全域鏡返", detail: `${actor?.name || "敵方角色"} 的${pending.action === "attack" ? "普攻" : "技能"}包含鏡刃，可取消我方傷害並最多反彈 2 傷害。`, controller: pending.mirrorSide, actorName: mirror?.name || "鏡刃", pendingKind: "mirror", confirmLabel: "發動或保留鏡返", targets };
  }
  if (state.pendingSkill) {
    const pending = state.pendingSkill;
    const actor = pendingActor(state, pending);
    const target = parseTarget(state, pending.targetKey);
    const targets = target ? [targetPreview(pending.targetKey, target, "技能原目標", ["技能"])] : [];
    return { phase: "pending", title: "待決：伊諾干涉", detail: `${actor?.name || "角色"} 正要施放技能，伊諾可使費用 +1；若仍成功，伊諾方獲得 1 能量且伊諾回復 1 HP。`, controller: other(pending.actorSide as Side), actorName: actor?.name || "", pendingKind: "ino", confirmLabel: "決定是否干涉", targets };
  }
  if (state.pendingConfuseAttack) {
    const pending = state.pendingConfuseAttack;
    const actor = pendingActor(state, pending);
    const targets = fromTargets(rulesConfusionTargets(snapshot, actor, pending.action), fighter => "混亂可改選的合法目標", ["混亂"]);
    return { phase: "pending", title: "待決：混亂目標", detail: `${actor?.name || "角色"} 的${pending.action === "skill" ? "技能" : "攻擊"}目標由對手指定。`, controller: other(pending.actorSide as Side), actorName: actor?.name || "", pendingKind: "confuse", confirmLabel: "指定混亂目標", targets };
  }
  const actor = rulesActiveF(snapshot) as Fighter | null;
  const targets = actor && state.players ? fromTargets(rulesTargetList(snapshot, actor.statuses.includes(STATUS.CONFUSE) ? "all" : "enemy"), fighter => `可被 ${actor.name} 普攻指定`, ["合法目標"]) : [];
  return { phase: actor ? "action" : "round-start", title: actor ? "行動目標" : "回合準備", detail: actor ? `${sideName(actor.owner)} ${actor.name} 可以攻擊、使用技能、防禦、休息或裁定。` : "正在處理回合開始與行動順序。", controller: actor?.owner || "", actorName: actor?.name || "", pendingKind: actor ? "action" : "round-start", confirmLabel: actor ? "選擇行動" : "等待流程", targets };
}

function appendLog(state: GameState, message: string) {
  state.logs.push(message);
  if (state.logs.length > RULES.LOG_MAX) state.logs.splice(0, state.logs.length - RULES.LOG_MAX);
}

function aiDifficultyMeta(difficulty?: string) {
  return AI_DIFFICULTIES.find(item => item.key === difficulty) || AI_DIFFICULTIES[1];
}

function randomOf<T>(items: T[]) {
  return items.length ? items[Math.floor(Math.random() * items.length)] : null;
}

function weightedRandom<T>(items: T[], weightOf: (item: T) => number) {
  const weights = items.map(item => Math.max(0.01, weightOf(item)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;
  for (let index = 0; index < items.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return items[index];
  }
  return items[items.length - 1] || null;
}

function aiTargetKey(fighter?: Fighter | null) {
  return fighter ? `${fighter.owner}:${fighter.id}` : "";
}

function aiHpRatio(fighter: Fighter) {
  return fighter.maxHp > 0 ? fighter.hpNow / fighter.maxHp : 0;
}

function aiControlled(state: GameState, side: Side | string | undefined) {
  return !!state.ai?.enabled && state.ai.side === side;
}

function aiDecisionSide(state: GameState): Side | "" {
  if (!state.ai?.enabled || state.winner) return "";
  if (state.screen === "draft") return state.draftTurn;
  if (state.pendingQihengBalance) return state.pendingQihengBalance.actorSide;
  if (state.pendingFengxingStar) return state.pendingFengxingStar.actorSide;
  if (state.pendingTianxunFocus) return state.pendingTianxunFocus.actorSide;
  if (state.pendingDebt) return state.pendingDebt.actorSide;
  if (state.pendingTimeTax) return state.pendingTimeTax.actorSide;
  if (state.pendingLiewuCombo) return state.pendingLiewuCombo.actorSide;
  if (state.pendingMirror) return state.pendingMirror.mirrorSide;
  if (state.pendingSkill) return other(state.pendingSkill.actorSide);
  if (state.pendingConfuseAttack) return other(state.pendingConfuseAttack.actorSide);
  return state.active?.side || "";
}

function aiNeedsStep(state: GameState) {
  return aiControlled(state, aiDecisionSide(state));
}

function aiAvailableDraftIds(state: GameState) {
  const taken = new Set([...(state.p1Draft || []), ...(state.p2Draft || [])]);
  return CHARACTERS.filter(card => !taken.has(card.id));
}

function aiTagSet(card: Pick<CharacterCard, "tags" | "role" | "shortDesc">) {
  return new Set([...(card.tags || []), card.role || "", card.shortDesc || ""].filter(Boolean));
}

function aiMatchesNeed(card: CharacterCard, need: typeof AI_TEAM_NEEDS[number]) {
  const text = `${card.role || ""} ${(card.tags || []).join(" ")} ${card.shortDesc || ""}`;
  return need.tags.some(tag => text.includes(tag));
}

function aiTeamCoverage(cards: CharacterCard[], need: typeof AI_TEAM_NEEDS[number]) {
  return cards.filter(card => aiMatchesNeed(card, need)).length;
}

function aiDraftNeedScore(card: CharacterCard, picked: CharacterCard[], enemyPicked: CharacterCard[]) {
  let score = 0;
  for (const need of AI_TEAM_NEEDS) {
    if (!aiMatchesNeed(card, need)) continue;
    const owned = aiTeamCoverage(picked, need);
    score += owned < need.min ? 9 : Math.max(1.5, 4 - owned);
  }
  const tags = aiTagSet(card);
  if (enemyPicked.some(enemy => (enemy.tags || []).some(tag => ["治療", "守護", "保命"].includes(tag))) && tags.has("治療反制")) score += 6;
  if (enemyPicked.some(enemy => (enemy.tags || []).some(tag => ["爆發", "收割", "技能傷害"].includes(tag))) && (tags.has("減傷") || tags.has("守護") || tags.has("反制"))) score += 5;
  if (picked.some(ally => (ally.tags || []).includes("腐蝕")) && (tags.has("治療") || tags.has("群補"))) score -= 2;
  if (picked.some(ally => (ally.tags || []).includes("紀錄")) && tags.has("技能傷害")) score += 3;
  if (picked.some(ally => (ally.tags || []).includes("戰意")) && card.skill.cd <= 1) score += 2;
  return score;
}

function aiCardThreatValue(card: CharacterCard) {
  const tags = aiTagSet(card);
  let value = card.hp * 1.7 + card.atk * 3.6 + card.spd * 2.7;
  value += Math.max(0, 4 - card.skill.cost) * 2.6;
  value += Math.max(0, 3 - card.skill.cd) * 2.1;
  if (tags.has("技能傷害") || tags.has("爆發") || tags.has("收割")) value += 5;
  if (tags.has("封印") || tags.has("混亂") || tags.has("冷卻") || tags.has("欠條")) value += 4;
  if (tags.has("治療") || tags.has("守護") || tags.has("減傷") || tags.has("保命")) value += 3.5;
  if (tags.has("速度") || tags.has("能量") || tags.has("規則")) value += 3;
  return value;
}

function aiDraftScore(card: CharacterCard, state: GameState, difficulty: AiDifficulty) {
  const picked = state.p2Draft.map(id => byId(id)).filter(Boolean) as CharacterCard[];
  const enemyPicked = state.p1Draft.map(id => byId(id)).filter(Boolean) as CharacterCard[];
  const base = aiCardThreatValue(card);
  let synergy = aiDraftNeedScore(card, picked, enemyPicked);
  if (picked.some(item => (item.tags || []).includes("代價")) && card.hp >= 8) synergy += 3;
  if (picked.some(item => (item.tags || []).includes("星線")) && card.spd >= 3) synergy += 2;
  if (picked.some(item => (item.tags || []).includes("欠條")) && aiMatchesNeed(card, AI_TEAM_NEEDS[1])) synergy += 2;
  const complexity = card.complexity || 3;
  const complexityBias = difficulty === "easy" ? -Math.max(0, complexity - 3) * 1.5 : Math.max(0, complexity - 2) * 1.1;
  const profile = AI_PROFILE[difficulty];
  return base + synergy + complexityBias + (Math.random() - 0.5) * 16 * profile.mistake;
}

function aiChooseDraftPick(state: GameState, difficulty: AiDifficulty) {
  const available = aiAvailableDraftIds(state);
  if (!available.length) return "";
  if (difficulty === "easy" && Math.random() < 0.32) return randomOf(available)?.id || "";

  const scored = available
    .map(card => ({ card, score: aiDraftScore(card, state, difficulty) }))
    .sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name));
  const poolSize = ({ easy: 8, normal: 6, hard: 5, impossible: 4 } as Record<AiDifficulty, number>)[difficulty];
  const temperature = ({ easy: 12, normal: 8, hard: 5, impossible: 3.5 } as Record<AiDifficulty, number>)[difficulty];
  const pool = scored.slice(0, Math.min(poolSize, scored.length));
  const best = pool[0]?.score || 0;
  const picked = weightedRandom(pool, item => Math.exp((item.score - best) / temperature) + 0.08);
  return picked?.card.id || scored[0]?.card.id || "";
}

function aiEnemies(state: GameState) {
  return alive(state.players?.[other(AI_SIDE)]?.team || []);
}

function aiAllies(state: GameState) {
  return alive(state.players?.[AI_SIDE]?.team || []);
}

function aiThreatScore(fighter: Fighter) {
  const text = `${fighter.role || ""} ${(fighter.tags || []).join(" ")} ${fighter.shortDesc || ""}`;
  let score = currentAtk(fighter) * 4 + currentSpd(fighter) * 2.2 - fighter.hpNow * 0.8;
  score += fighter.cd <= 0 ? Math.max(3, 8 - skillCost(fighter, false)) : Math.max(0, 3 - fighter.cd);
  if (text.includes("爆發") || text.includes("收割") || text.includes("技能傷害")) score += 5;
  if (text.includes("封印") || text.includes("混亂") || text.includes("冷卻") || text.includes("欠條")) score += 4;
  if (text.includes("治療") || text.includes("守護") || text.includes("保命")) score += 3;
  if (fighter.statuses.includes(STATUS.OBSERVE)) score += 3;
  if (fighter.statuses.includes(STATUS.SEAL)) score -= 3;
  if (fighter.statuses.includes(STATUS.SLOW)) score -= 1;
  return score;
}

function aiChooseEnemy(state: GameState, difficulty: AiDifficulty, enemies = aiEnemies(state)) {
  if (!enemies.length) return null;
  if (difficulty === "easy" && Math.random() < AI_PROFILE.easy.mistake) return randomOf(enemies);
  return [...enemies].sort((a, b) =>
    ((b.hpNow <= 2 ? 8 : 0) + aiThreatScore(b) - ((a.hpNow <= 2 ? 8 : 0) + aiThreatScore(a)))
    || (a.hpNow - b.hpNow)
    || a.name.localeCompare(b.name)
  )[0];
}

function aiChooseThreat(state: GameState, difficulty: AiDifficulty, enemies = aiEnemies(state)) {
  if (!enemies.length) return null;
  if (difficulty === "easy" && Math.random() < AI_PROFILE.easy.mistake) return randomOf(enemies);
  return [...enemies].sort((a, b) => aiThreatScore(b) - aiThreatScore(a) || a.hpNow - b.hpNow || a.name.localeCompare(b.name))[0];
}

function aiChooseAlly(state: GameState, difficulty: AiDifficulty, allies = aiAllies(state), preferDamaged = true) {
  const candidates = preferDamaged ? allies.filter(fighter => fighter.hpNow < fighter.maxHp) : allies;
  const list = candidates.length ? candidates : allies;
  if (!list.length) return null;
  if (difficulty === "easy" && Math.random() < AI_PROFILE.easy.mistake) return randomOf(list);
  return [...list].sort((a, b) => aiHpRatio(a) - aiHpRatio(b) || a.hpNow - b.hpNow || a.name.localeCompare(b.name))[0];
}

function aiChooseTempoAlly(state: GameState, difficulty: AiDifficulty, allies = aiAllies(state)) {
  if (!allies.length) return null;
  if (difficulty === "easy" && Math.random() < AI_PROFILE.easy.mistake) return randomOf(allies);
  return [...allies].sort((a, b) =>
    (aiThreatScore(b) + (b.cd <= 0 ? 4 : 0)) - (aiThreatScore(a) + (a.cd <= 0 ? 4 : 0))
    || b.hpNow - a.hpNow
    || a.name.localeCompare(b.name)
  )[0];
}

function aiCanResonate(state: GameState, actor: Fighter, cost: number) {
  const player = state.players?.[actor.owner];
  return !!player
    && player.resUsed < RULES.RESONANCE_PER_ROUND
    && player.energy >= cost
    && alive(player.team).some(member => member.id !== actor.id);
}

function aiShouldResonate(snapshot: GameSnapshot, actor: Fighter, difficulty: AiDifficulty) {
  const cost = skillCost(actor, true);
  if (!aiCanResonate(snapshot.state, actor, cost)) return false;
  if (difficulty === "impossible") return true;
  return Math.random() < AI_PROFILE[difficulty].resonanceChance;
}

function aiSkillPlan(snapshot: GameSnapshot, actor: Fighter, difficulty: AiDifficulty, resonance: boolean): AiPlan | null {
  const state = snapshot.state;
  const enemies = rulesTargetList(snapshot, "enemy").map(item => item.c);
  const allies = rulesTargetList(snapshot, "ally").map(item => item.c);
  const enemy = aiChooseEnemy(state, difficulty, enemies);
  const threat = aiChooseThreat(state, difficulty, enemies);
  const ally = aiChooseAlly(state, difficulty, allies);
  const opts = { res: resonance };

  if (actor.id === "baidengling") return { targetKey: null, opts };
  if (actor.id === "tianxun") {
    const choices = resonance
      ? (difficulty === "impossible" ? ["skill", "atk"] : ["spd", enemies.length ? "skill" : "atk"])
      : [enemies.some(target => target.hpNow <= currentAtk(actor) + 2) ? "atk" : "spd"];
    return { targetKey: null, opts: { ...opts, choices } };
  }
  if (actor.id === "jingren" || actor.id === "liewu") return { targetKey: aiTargetKey(actor), opts };
  if (actor.id === "dengzhen") {
    const urgentAlly = allies.filter(item => item.hpNow < item.maxHp).sort((a, b) => aiHpRatio(a) - aiHpRatio(b))[0];
    const target = urgentAlly && (urgentAlly.hpNow <= Math.ceil(urgentAlly.maxHp * 0.7) || difficulty !== "easy") ? urgentAlly : (threat || enemy || ally);
    if (!target) return null;
    const mode = target.owner === actor.owner ? "up" : "down";
    return { targetKey: aiTargetKey(target), opts: { ...opts, mode } };
  }
  if (actor.id === "qiheng") {
    const sources = allies.filter(source => source.hpNow > 1);
    const target = enemy;
    if (!sources.length || !target) return null;
    const source = [...sources].sort((a, b) => b.hpNow - a.hpNow || b.maxHp - a.maxHp || a.name.localeCompare(b.name))[0];
    const maxLoss = Math.min(3, source.hpNow - 1);
    const killLoss = [1, 2, 3].find(loss => loss <= maxLoss && target.hpNow <= 2 + loss);
    const loss = difficulty === "easy"
      ? Math.max(1, Math.ceil(Math.random() * maxLoss))
      : (killLoss || (difficulty === "normal" ? Math.min(2, maxLoss) : maxLoss));
    return { targetKey: aiTargetKey(target), opts: { ...opts, qihengSourceKey: aiTargetKey(source), qihengLoss: loss } };
  }
  if (["baijian", "weixiang"].includes(actor.id)) {
    const target = ally;
    if (!target || (difficulty !== "easy" && target.hpNow >= target.maxHp)) return null;
    return { targetKey: aiTargetKey(target), opts };
  }
  if (actor.id === "yiaiqian") {
    if (!state.lastSkill || (actor.flags.records || 0) < 1) return enemy ? { targetKey: aiTargetKey(enemy), opts } : null;
    const target = state.lastSkill.kind === "heal" ? ally : enemy;
    return target ? { targetKey: aiTargetKey(target), opts } : null;
  }
  if (actor.id === "huiyin") {
    const copy = state.lastCopyableSkill?.[actor.owner];
    const target = copy?.kind === "heal" ? ally : enemy;
    return target ? { targetKey: aiTargetKey(target), opts } : null;
  }

  const filter = skillTargetFilter(snapshot, actor);
  if (filter === "none") return { targetKey: null, opts };
  if (filter === "ally") return ally ? { targetKey: aiTargetKey(ally), opts } : null;
  if (filter === "self") return { targetKey: aiTargetKey(actor), opts };
  if (filter === "all") return (enemy || ally) ? { targetKey: aiTargetKey(enemy || ally), opts } : null;
  return (threat || enemy) ? { targetKey: aiTargetKey(threat || enemy), opts } : null;
}

function aiTryJudgement(snapshot: GameSnapshot, actor: Fighter, difficulty: AiDifficulty) {
  const state = snapshot.state;
  const player = state.players?.[actor.owner];
  if (!player || player.judgementUsed || player.marks < 1 || Math.random() > AI_PROFILE[difficulty].judgementChance) return false;
  const enemies = aiEnemies(state);
  const allies = aiAllies(state);
  const lowAlly = aiChooseAlly(state, difficulty, allies);
  const killTarget = enemies.find(enemy => enemy.hpNow <= currentAtk(actor) + 1);
  if (killTarget && player.marks >= 1) return !!rulesJudgement(snapshot, "atk", undefined)?.ok;
  if (lowAlly && lowAlly.hpNow <= Math.ceil(lowAlly.maxHp * 0.42) && player.marks >= 2) return !!rulesJudgement(snapshot, "heal", aiTargetKey(lowAlly))?.ok;
  if ((difficulty === "hard" || difficulty === "impossible") && player.marks >= 3) {
    const threat = aiChooseThreat(state, difficulty, enemies);
    if (threat) return !!rulesJudgement(snapshot, "seal", aiTargetKey(threat))?.ok;
  }
  if (actor.hpNow <= Math.ceil(actor.maxHp * 0.35) && player.marks >= 1) return !!rulesJudgement(snapshot, "def", undefined)?.ok;
  return false;
}

function aiQihengBalancePair(state: GameState, side: Side) {
  const team = alive(state.players?.[side]?.team || []);
  const highest = [...team].sort((a, b) => b.hpNow - a.hpNow || b.maxHp - a.maxHp || a.id.localeCompare(b.id))[0];
  const lowest = [...team].sort((a, b) => a.hpNow - b.hpNow || a.maxHp - b.maxHp || a.id.localeCompare(b.id))[0];
  if (!highest || !lowest || highest.id === lowest.id || highest.hpNow - lowest.hpNow < 3 || highest.hpNow <= 1 || lowest.hpNow >= lowest.maxHp) return null;
  return { highest, lowest };
}

function aiApplyResult(snapshot: GameSnapshot, result: RuleActionResult | null | undefined) {
  if (result?.actionSpent) finishAction(snapshot);
  return !!result?.ok;
}

function aiChooseConfuseTarget(targets: TargetEntry[], actor: Fighter | undefined | null, difficulty: AiDifficulty) {
  if (!targets.length) return null;
  if (difficulty === "easy") return randomOf(targets);
  return [...targets].sort((a, b) => {
    const aBadForActor = a.c.owner === actor?.owner ? -10 : a.c.hpNow;
    const bBadForActor = b.c.owner === actor?.owner ? -10 : b.c.hpNow;
    return aBadForActor - bBadForActor || a.c.name.localeCompare(b.c.name);
  })[0];
}

function aiResolveEmptyConfuse(snapshot: GameSnapshot, actor?: Fighter | null) {
  const state = snapshot.state;
  state.pendingConfuseAttack = null;
  if (!actor) return true;
  actor.statuses = actor.statuses.filter(status => status !== STATUS.CONFUSE);
  actor.flags.confuseDamageCap = false;
  appendLog(state, `${actor.name} 的混亂沒有合法目標，該次行動落空。`);
  finishAction(snapshot);
  return true;
}

function aiResolvePending(snapshot: GameSnapshot, difficulty: AiDifficulty) {
  const state = snapshot.state;
  if (state.pendingQihengBalance?.actorSide === AI_SIDE) {
    const pair = aiQihengBalancePair(state, AI_SIDE);
    const use = !!pair && (difficulty !== "easy" || Math.random() > AI_PROFILE.easy.mistake);
    rulesDecideQihengBalance(snapshot, use);
    return true;
  }
  if (state.pendingFengxingStar?.actorSide === AI_SIDE) {
    const actor = state.players?.[AI_SIDE]?.team.find(fighter => fighter.id === state.pendingFengxingStar.actorId);
    const target = aiChooseAlly(state, difficulty, aiAllies(state), false);
    if (actor && target) rulesDecideFengxingStar(snapshot, aiTargetKey(target), aiShouldResonate(snapshot, actor, difficulty));
    return true;
  }
  if (state.pendingTianxunFocus?.actorSide === AI_SIDE) {
    const target = aiChooseTempoAlly(state, difficulty);
    if (target) rulesDecideTianxunFocus(snapshot, aiTargetKey(target));
    return true;
  }
  if (state.pendingDebt?.actorSide === AI_SIDE) {
    const target = aiChooseThreat(state, difficulty);
    rulesDecideDebt(snapshot, aiTargetKey(target), !target);
    return true;
  }
  if (state.pendingTimeTax?.actorSide === AI_SIDE) {
    const target = aiChooseThreat(state, difficulty);
    if (target) rulesDecideTimeTax(snapshot, aiTargetKey(target));
    return true;
  }
  if (state.pendingLiewuCombo?.actorSide === AI_SIDE) {
    const actor = state.players?.[AI_SIDE]?.team.find(fighter => fighter.id === state.pendingLiewuCombo.actorId);
    const target = parseTarget(state, state.pendingLiewuCombo.targetKey);
    const intent = actor?.flags?.battleIntent || 0;
    const base = actor ? currentAtk(actor) : 0;
    const use = difficulty === "impossible" || (intent > 0 && !!target && (target.hpNow <= base + 1 || Math.random() < AI_PROFILE[difficulty].risk));
    aiApplyResult(snapshot, rulesDecideLiewuCombo(snapshot, use));
    return true;
  }
  if (state.pendingMirror?.mirrorSide === AI_SIDE) {
    const use = difficulty !== "easy" || Math.random() > AI_PROFILE.easy.mistake;
    aiApplyResult(snapshot, rulesDecideMirror(snapshot, use));
    return true;
  }
  if (state.pendingSkill && other(state.pendingSkill.actorSide) === AI_SIDE) {
    const actor = state.players?.[state.pendingSkill.actorSide as Side]?.team.find(fighter => fighter.id === state.pendingSkill.actorId);
    const use = difficulty === "impossible" || (!!actor && aiThreatScore(actor) > 13) || Math.random() < AI_PROFILE[difficulty].risk;
    aiApplyResult(snapshot, rulesDecideIno(snapshot, use));
    return true;
  }
  if (state.pendingConfuseAttack && other(state.pendingConfuseAttack.actorSide) === AI_SIDE) {
    const actor = state.players?.[state.pendingConfuseAttack.actorSide as Side]?.team.find(fighter => fighter.id === state.pendingConfuseAttack.actorId);
    const targets = rulesConfusionTargets(snapshot, actor, state.pendingConfuseAttack.action);
    const chosen = aiChooseConfuseTarget(targets, actor, difficulty);
    if (!chosen) return aiResolveEmptyConfuse(snapshot, actor);
    return aiApplyResult(snapshot, decideConfuseTarget(snapshot, chosen.key));
  }
  return false;
}

function aiRunBattleStep(snapshot: GameSnapshot, difficulty: AiDifficulty) {
  const state = snapshot.state;
  if (!state.players || state.winner) return false;
  if (aiResolvePending(snapshot, difficulty)) return true;
  const actor = rulesActiveF(snapshot) as Fighter | null;
  if (!actor || actor.owner !== AI_SIDE || actor.hpNow <= 0) return false;
  const player = state.players[actor.owner];
  if (aiTryJudgement(snapshot, actor, difficulty)) return true;

  const canSkill = actor.cd <= 0
    && !actor.statuses.includes(STATUS.SEAL)
    && player.energy >= skillCost(actor, false)
    && (actor.id !== "liewu" || (actor.flags.battleIntent || 0) >= 2);
  const confused = actor.statuses.includes(STATUS.CONFUSE);
  const confusedSkillHasTargets = !confused || skillFilter(actor) === "none" || rulesConfusionTargets(snapshot, actor, "skill").length > 0;
  const resonance = canSkill && aiShouldResonate(snapshot, actor, difficulty);
  const plan = canSkill && confusedSkillHasTargets ? aiSkillPlan(snapshot, actor, difficulty, resonance) : null;
  const lowHp = actor.hpNow < actor.maxHp && actor.hpNow <= Math.ceil(actor.maxHp * (difficulty === "easy" ? 0.24 : 0.34));
  const shouldSkill = !!plan && (difficulty === "impossible" || Math.random() < AI_PROFILE[difficulty].skillChance);

  if (lowHp && !shouldSkill && Math.random() < 0.58) {
    return aiApplyResult(snapshot, actor.hpNow <= 2 ? rulesDefend(snapshot) : rulesRest(snapshot));
  }
  if (shouldSkill && plan) {
    const result = rulesUseSkill(snapshot, plan.targetKey, plan.opts || {});
    if (result?.ok) {
      aiApplyResult(snapshot, result);
      return true;
    }
    if (result?.actionSpent) {
      aiApplyResult(snapshot, result);
      return true;
    }
    appendLog(state, `${actor.name} 的技能選擇不合法，AI 放棄本次行動。`);
    finishAction(snapshot);
    return true;
  }
  if (confused) {
    const confusedAttackTargets = rulesConfusionTargets(snapshot, actor, "attack");
    if (confusedAttackTargets.length) {
      rulesRequestAttack(snapshot);
      return true;
    }
    return aiApplyResult(snapshot, actor.hpNow < actor.maxHp ? rulesRest(snapshot) : rulesDefend(snapshot));
  }
  const target = aiChooseEnemy(state, difficulty);
  if (target) return aiApplyResult(snapshot, rulesAttack(snapshot, aiTargetKey(target)));
  return aiApplyResult(snapshot, rulesDefend(snapshot));
}

export default function App() {
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [localMeta, setLocalMeta] = useState<LocalMeta>(() => loadMeta());
  const [gameState, setGameState] = useState<GameState>(() => freshState());
  const [net, setNet] = useState<NetState>({
    mode: "local",
    room: "",
    seat: "",
    rev: 0,
    polling: false,
    status: initialRoom ? `收到房間邀請：${initialRoom}` : "離線"
  });
  const [view, setView] = useState<ViewType>(null);
  const [dialog, setDialog] = useState<DialogType>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [draftPreviewId, setDraftPreviewId] = useState("ningyao");
  const [combatPanelOpen, setCombatPanelOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [releaseState, setReleaseState] = useState<ReleaseState>({ checked: false, checking: false, data: null, error: "" });
  const [musicOn, setMusicOn] = useState(false);
  const [sfxOn, setSfxOn] = useState(true);
  const [toast, setToast] = useState("");
  const [devMode, setDevMode] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const enabled = params.get("dev") === "1" || params.get("debug") === "1" || window.localStorage.getItem("luxfatumDevTools") === "true";
      if (params.get("dev") === "1" || params.get("debug") === "1") window.localStorage.setItem("luxfatumDevTools", "true");
      return enabled;
    } catch {
      return false;
    }
  });
  const [introVisible, setIntroVisible] = useState(() => {
    return !initialRoom && !settings.hasSeenTutorial;
  });

  const stateRef = useRef(gameState);
  const metaRef = useRef(localMeta);
  const netRef = useRef(net);
  const settingsRef = useRef(settings);
  const themeRef = useRef<Howl | null>(null);
  const sfxRef = useRef(sfxOn);
  const pollTimerRef = useRef<number | null>(null);
  const aiTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const recordedMatchRef = useRef("");

  const snapshot = useMemo(() => snapshotFor(gameState), [gameState]);
  const active = rulesActiveF(snapshot) as Fighter | null;

  useEffect(() => { stateRef.current = gameState; }, [gameState]);
  useEffect(() => { metaRef.current = localMeta; }, [localMeta]);
  useEffect(() => { netRef.current = net; }, [net]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { sfxRef.current = sfxOn; }, [sfxOn]);

  useEffect(() => {
    window.LuxFatumGameSnapshot = () => snapshotFor(stateRef.current);
    window.commit = async () => syncState(stateRef.current);
    window.closeDialog = () => setDialog(null);
    window.LuxFatumDevTools = {
      enable: () => {
        try { window.localStorage.setItem("luxfatumDevTools", "true"); } catch {}
        setDevMode(true);
      },
      disable: () => {
        try { window.localStorage.removeItem("luxfatumDevTools"); } catch {}
        setDevMode(false);
      },
      check: () => collectRuleWarnings(stateRef.current)
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 420);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    const onFullscreen = () => {
      const active = !!document.fullscreenElement;
      setFullscreen(active);
      updateSettings({ fullscreen: active });
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  useEffect(() => {
    if (themeRef.current) themeRef.current.volume(settings.masterVolume * settings.bgmVolume);
  }, [settings.masterVolume, settings.bgmVolume]);

  useEffect(() => {
    document.body.classList.toggle("battle-lock", !view && gameState.screen === "battle");
  }, [view, gameState.screen]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [view, gameState.screen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const openDetails = Array.from(document.querySelectorAll("details[open]")) as HTMLDetailsElement[];
      if (dialog) {
        event.preventDefault();
        setDialog(null);
        return;
      }
      if (openDetails.length) {
        event.preventDefault();
        openDetails.forEach(item => { item.open = false; });
        return;
      }
      if (combatPanelOpen) {
        event.preventDefault();
        setCombatPanelOpen(false);
        return;
      }
      if (view) {
        event.preventDefault();
        setView(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialog, combatPanelOpen, view]);

  useEffect(() => {
    if (!canUseNetworkFeatures()) {
      setReleaseState(prev => prev.checked ? prev : { ...prev, checked: true, checking: false });
      return;
    }
    if (!releaseState.checked && !releaseState.checking) {
      const timer = window.setTimeout(() => void checkForUpdates(false), 250);
      return () => window.clearTimeout(timer);
    }
  }, [releaseState.checked, releaseState.checking]);

  useEffect(() => {
    if (!net.polling || net.mode !== "online" || !net.room) return;
    const tick = async () => {
      try {
        const res = await fetch(apiUrl(`/api/state?room=${encodeURIComponent(netRef.current.room)}`), { cache: "no-store" });
        const data = await res.json();
        if (data.ok && data.rev > netRef.current.rev) {
          stateRef.current = data.state || freshState();
          setGameState(stateRef.current);
          setNet(prev => ({ ...prev, rev: data.rev, status: "已同步最新戰況" }));
        }
      } catch {
        setNet(prev => ({ ...prev, status: "同步中斷，稍後重試" }));
      }
    };
    pollTimerRef.current = window.setInterval(tick, 850);
    void tick();
    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    };
  }, [net.mode, net.polling, net.room]);

  const canControl = useCallback((side: Side) => {
    if (netRef.current.mode === "online") return netRef.current.seat === side;
    return !aiControlled(stateRef.current, side);
  }, []);

  function canUseNetworkFeatures() {
    return window.location.protocol !== "file:" && navigator.onLine !== false;
  }

  function notify(message: string) {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2600);
  }

  function updateSettings(next: Partial<GameSettings> | ((current: GameSettings) => GameSettings)) {
    setSettings(current => {
      const updated = typeof next === "function" ? next(current) : { ...current, ...next };
      saveSettings(updated);
      settingsRef.current = updated;
      return updated;
    });
  }

  function rememberRecentTeam(ids: string[]) {
    const team = ids.filter(Boolean).slice(0, RULES.TEAM_SIZE);
    if (team.length !== RULES.TEAM_SIZE) return;
    updateSettings(current => {
      const key = team.join("|");
      const recentTeams = [team, ...current.recentTeams.filter(item => item.join("|") !== key)].slice(0, 5);
      return { ...current, recentTeams };
    });
  }

  function updateLocalMeta(next: LocalMeta | ((current: LocalMeta) => LocalMeta)) {
    setLocalMeta(current => {
      const updated = typeof next === "function" ? next(current) : next;
      saveMeta(updated);
      metaRef.current = updated;
      return updated;
    });
  }

  useEffect(() => {
    if (gameState.screen !== "battle" || !gameState.winner) return;
    const stamp = `${gameState.battleStats?.startedAt || 0}:${gameState.winner}:${gameState.battleStats?.totalRounds || gameState.round}:${gameState.logs.length}`;
    if (recordedMatchRef.current === stamp) return;
    recordedMatchRef.current = stamp;
    const mode = gameState.ai?.training ? "training" : gameState.ai?.enabled ? "ai" : net.mode;
    updateLocalMeta(current => recordMatchResult(current, gameState, mode));
  }, [gameState.winner, gameState.battleStats?.totalRounds, gameState.logs.length, net.mode]);

  useEffect(() => {
    if (!gameState.ai?.enabled || net.mode !== "local" || !aiNeedsStep(gameState)) return;
    const delay = gameState.screen === "draft" ? AI_THINK_MS : AI_THINK_MS + 180;
    aiTimerRef.current = window.setTimeout(() => runAiStep(), delay);
    return () => {
      if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    };
  }, [gameState, net.mode]);

  function play(kind: "ui" | "pick" | "skill" | "hit" | "heal" | "guard" | "rest" | "win" = "ui") {
    if (!sfxRef.current) return;
    const sfxVolume = settingsRef.current.masterVolume * settingsRef.current.sfxVolume;
    if (sfxVolume <= 0.01) return;
    const frequencies = { ui: 520, pick: 660, skill: 880, hit: 180, heal: 720, guard: 300, rest: 410, win: 980 };
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequencies[kind];
    osc.type = kind === "hit" ? "sawtooth" : "sine";
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime((kind === "hit" ? 0.18 : 0.12) * sfxVolume, ctx.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  }

  function finishIntro() {
    updateSettings({ hasSeenTutorial: true });
    setIntroVisible(false);
  }

  function replayIntro() {
    play("ui");
    setIntroVisible(true);
  }

  async function toggleMusic() {
    if (!themeRef.current) {
      const { Howl } = await import("howler");
      themeRef.current = new Howl({ src: [THEME_SRC], loop: true, volume: settingsRef.current.masterVolume * settingsRef.current.bgmVolume, html5: true });
    }
    if (musicOn) {
      themeRef.current.pause();
      setMusicOn(false);
    } else {
      themeRef.current.play();
      setMusicOn(true);
    }
  }

  async function api(path: string, body?: unknown) {
    try {
      const res = await fetch(apiUrl(path), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body || {})
      });
      return await res.json();
    } catch (error) {
      return { ok: false, error: errorMessage(error, "連線失敗") };
    }
  }

  async function syncState(nextState: GameState) {
    const current = netRef.current;
    if (current.mode !== "online" || !current.room) return;
    const res = await api("/api/state", { room: current.room, rev: current.rev, state: nextState });
    if (res.ok) {
      netRef.current = { ...netRef.current, rev: res.rev, status: "已同步" };
      setNet(netRef.current);
    } else if (res.state) {
      stateRef.current = res.state;
      setGameState(res.state);
      netRef.current = { ...netRef.current, rev: res.rev, status: "已拉回最新狀態" };
      setNet(netRef.current);
    } else {
      setNet(prev => ({ ...prev, status: res.error || "同步失敗" }));
    }
  }

  function commitGame(mutator: (state: GameState, snapshot: GameSnapshot) => void, sync = true) {
    const next = cloneState(stateRef.current);
    const snap = snapshotFor(next);
    mutator(next, snap);
    stateRef.current = next;
    setGameState(next);
    if (sync) void syncState(next);
    return next;
  }

  function runAction(fn: (snapshot: GameSnapshot) => RuleActionResult | null | undefined, close = true) {
    let result: RuleActionResult | null | undefined = null;
    let message = "";
    commitGame((_, snap) => {
      const before = snap.state.logs.length;
      result = fn(snap);
      if (result?.actionSpent) finishAction(snap);
      if (result && !result.ok) message = snap.state.logs[before] || snap.state.logs.at(-1) || "目前不能執行這個行動。";
    });
    if (result && !result.ok) notify(message);
    if (close) setDialog(null);
  }

  function resetToMenu() {
    play("ui");
    recordedMatchRef.current = "";
    setView(null);
    setDialog(null);
    setSelectedKey("");
    setDraftPreviewId("ningyao");
    const next = freshState();
    stateRef.current = next;
    setGameState(next);
    setNet({ mode: "local", room: "", seat: "", rev: 0, polling: false, status: "待機" });
  }

  function startLocal() {
    play("ui");
    recordedMatchRef.current = "";
    setView(null);
    setDialog(null);
    setSelectedKey("");
    setDraftPreviewId("ningyao");
    const next = freshState();
    next.screen = "draft";
    stateRef.current = next;
    setGameState(next);
    setNet({ mode: "local", room: "", seat: "", rev: 0, polling: false, status: "本機雙人" });
  }

  function startAi(difficulty: AiDifficulty) {
    play("ui");
    recordedMatchRef.current = "";
    const meta = aiDifficultyMeta(difficulty);
    setView(null);
    setDialog(null);
    setSelectedKey("");
    setDraftPreviewId("ningyao");
    const next = freshState();
    next.screen = "draft";
    next.ai = { enabled: true, side: AI_SIDE, difficulty, label: meta.label };
    next.logs = [`AI 對戰開始：P1 對上 ${meta.label}。`];
    stateRef.current = next;
    setGameState(next);
    setNet({ mode: "local", room: "", seat: "", rev: 0, polling: false, status: `AI 對戰：${meta.label}` });
  }

  function startTraining() {
    play("ui");
    recordedMatchRef.current = "";
    setView(null);
    setDialog(null);
    setSelectedKey("");
    setDraftPreviewId(TRAINING_P1[0]);
    setIntroVisible(false);
    updateSettings({ hasSeenTutorial: true });
    updateLocalMeta(current => recordTrainingStart(current));
    const next = freshState();
    next.p1Draft = [...TRAINING_P1];
    next.p2Draft = [...TRAINING_P2];
    next.ai = { enabled: true, side: AI_SIDE, difficulty: "easy", label: "訓練裁定", training: true };
    next.logs = ["訓練對戰開始：依提示完成速度、目標、攻擊、技能、休息與裁定。"];
    rulesStartBattle(snapshotFor(next));
    stateRef.current = next;
    setGameState(next);
    setNet({ mode: "local", room: "", seat: "", rev: 0, polling: false, status: "訓練模式" });
  }

  function runAiStep() {
    const current = stateRef.current;
    if (!current.ai?.enabled || netRef.current.mode !== "local" || current.winner || !aiNeedsStep(current)) return;
    const difficulty = (current.ai.difficulty || "normal") as AiDifficulty;
    const meta = aiDifficultyMeta(difficulty);
    if (current.screen === "draft" && current.draftTurn === AI_SIDE) {
      commitGame((state, snap) => {
        if (state.screen !== "draft" || state.draftTurn !== AI_SIDE) return;
        const id = aiChooseDraftPick(state, difficulty);
        if (!id) return;
        state.p2Draft.push(id);
        appendLog(state, `${meta.label} 選擇 ${byId(id)?.name || id}。`);
        state.pickIndex += 1;
        const nextPreview = CHARACTERS.find(card => !state.p1Draft.includes(card.id) && !state.p2Draft.includes(card.id));
        if (nextPreview) setDraftPreviewId(nextPreview.id);
        if (state.pickIndex >= RULES.TEAM_SIZE * 2) {
          rulesStartBattle(snap);
        } else {
          state.draftTurn = DRAFT_SEQUENCE[state.pickIndex];
        }
      });
      return;
    }
    if (current.screen === "battle") {
      commitGame((_, snap) => {
        if (aiRunBattleStep(snap, difficulty)) appendLog(snap.state, `${meta.label} 已完成自動裁定。`);
      });
    }
  }

  async function createRoom() {
    play("ui");
    recordedMatchRef.current = "";
    if (!canUseNetworkFeatures()) {
      notify("目前是離線或 file 模式，線上開房暫不可用；本機與 AI 對戰仍可遊玩。");
      return;
    }
    const next = freshState();
    next.screen = "draft";
    const res = await api("/api/create", { state: next });
    if (!res.ok) return notify(res.error || "建立失敗。");
    stateRef.current = next;
    setGameState(next);
    setView(null);
    setSelectedKey("");
    setDraftPreviewId("ningyao");
    setNet({ mode: "online", room: res.room, seat: "p1", rev: res.rev, polling: true, status: "已建立房間" });
    window.history.replaceState(null, "", window.location.pathname);
  }

  async function joinRoom(roomOverride?: string) {
    play("ui");
    recordedMatchRef.current = "";
    if (!canUseNetworkFeatures()) {
      notify("目前是離線或 file 模式，不能加入線上房間。");
      return;
    }
    const room = (roomOverride || (document.querySelector("#roomInput") as HTMLInputElement | null)?.value || "").trim().toUpperCase();
    if (!room) return notify("請輸入房號。");
    const res = await api("/api/join", { room });
    if (!res.ok) return notify(res.error || "加入失敗。");
    stateRef.current = res.state || freshState();
    setGameState(stateRef.current);
    setView(null);
    setSelectedKey("");
    setDraftPreviewId("ningyao");
    setNet({ mode: "online", room: res.room, seat: "p2", rev: res.rev, polling: true, status: "已加入房間" });
    window.history.replaceState(null, "", window.location.pathname);
  }

  async function forceSync() {
    if (netRef.current.mode !== "online" || !netRef.current.room) return;
    if (!canUseNetworkFeatures()) {
      notify("目前離線，無法重新同步線上房間。");
      return;
    }
    try {
      const res = await fetch(apiUrl(`/api/state?room=${encodeURIComponent(netRef.current.room)}`), { cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        stateRef.current = data.state || freshState();
        setGameState(stateRef.current);
        setNet(prev => ({ ...prev, rev: data.rev, status: "已重新同步" }));
      } else {
        setNet(prev => ({ ...prev, status: data.error || "重新同步失敗" }));
      }
    } catch {
      setNet(prev => ({ ...prev, status: "連線中斷，請再按一次重新同步" }));
    }
  }

  async function checkForUpdates(manual = false) {
    if (releaseState.checking) return;
    if (!canUseNetworkFeatures()) {
      setReleaseState(prev => ({ ...prev, checked: true, checking: false, error: manual ? "離線模式不檢查線上更新。" : "" }));
      if (manual) notify("離線模式不檢查線上更新。");
      return;
    }
    setReleaseState(prev => ({ ...prev, checking: true, error: "" }));
    try {
      const res = await fetch(apiUrl(`/api/version?client=${encodeURIComponent(APP_VERSION_NUMBER)}`), { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "版本檢查失敗");
      setReleaseState({ checked: true, checking: false, data, error: "" });
    } catch (error) {
      setReleaseState(prev => ({ ...prev, checked: true, checking: false, error: manual ? errorMessage(error, "版本檢查失敗") : "" }));
    }
  }

  function inviteLink() {
    if (!net.room) return window.location.href;
    const base = window.location.protocol === "file:" || window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost" ? ONLINE_URL : window.location.origin;
    const path = window.location.protocol === "file:" ? "/" : window.location.pathname;
    return `${base}${path}?room=${encodeURIComponent(net.room)}`;
  }

  async function copyText(text: string, fallbackTitle: string, status: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNet(prev => ({ ...prev, status }));
    } catch {
      window.prompt(fallbackTitle, text);
    }
  }

  function pick(id: string) {
    play("pick");
    if (gameState.screen !== "draft") return notify("目前不在選角階段。");
    if (!canControl(gameState.draftTurn)) return notify("現在輪到對方或 AI 選角。");
    if (gameState.p1Draft.includes(id) || gameState.p2Draft.includes(id)) return notify("這名角色已經被選走。");
    const next = commitGame((state, snap) => {
      state[`${state.draftTurn}Draft`].push(id);
      appendLog(state, `${sideName(state.draftTurn)} 選擇 ${byId(id)?.name || id}。`);
      state.pickIndex += 1;
      const nextPreview = CHARACTERS.find(card => !state.p1Draft.includes(card.id) && !state.p2Draft.includes(card.id));
      if (nextPreview) setDraftPreviewId(nextPreview.id);
      if (state.pickIndex >= RULES.TEAM_SIZE * 2) {
        rulesStartBattle(snap);
      } else {
        state.draftTurn = DRAFT_SEQUENCE[state.pickIndex];
      }
    });
    if (next.p1Draft.length === RULES.TEAM_SIZE) rememberRecentTeam(next.p1Draft);
  }

  function requestAttack() {
    play("ui");
    let shouldOpen = false;
    let message = "";
    commitGame((_, snap) => {
      const before = snap.state.logs.length;
      const result = rulesRequestAttack(snap);
      shouldOpen = !!result?.openDialog;
      if (result && !result.ok) message = snap.state.logs[before] || snap.state.logs.at(-1) || "目前不能攻擊。";
    });
    if (message) notify(message);
    if (shouldOpen) setDialog("attack");
  }

  function openDialog(type: DialogType) {
    play("ui");
    setDialog(type);
  }

  function closeDialog() {
    setDialog(null);
  }

  function attackTarget(targetKey: string, opts: RuleActionOptions = {}) {
    play("hit");
    runAction(snap => rulesAttack(snap, targetKey, opts));
  }

  function decideConfuseAttack(targetKey: string) {
    runAction(snap => decideConfuseTarget(snap, targetKey));
  }

  function useSkillTarget(targetKey: string | null, opts: RuleActionOptions = {}) {
    play("skill");
    runAction(snap => rulesUseSkill(snap, targetKey, opts));
  }

  function decideIno(useInterference: boolean) {
    runAction(snap => rulesDecideIno(snap, useInterference));
  }

  function decideMirror(useReflect: boolean) {
    runAction(snap => rulesDecideMirror(snap, useReflect));
  }

  function decideTimeTax(targetKey: string) {
    commitGame((_, snap) => { rulesDecideTimeTax(snap, targetKey); });
  }

  function decideDebt(targetKey: string | null, skip = false) {
    commitGame((_, snap) => { rulesDecideDebt(snap, targetKey, skip); });
  }

  function decideQihengBalance(useBalance: boolean) {
    commitGame((_, snap) => { rulesDecideQihengBalance(snap, useBalance); });
  }

  function decideFengxingStar(targetKey: string, useResonance = false) {
    commitGame((_, snap) => { rulesDecideFengxingStar(snap, targetKey, useResonance); });
  }

  function decideTianxunFocus(targetKey: string) {
    commitGame((_, snap) => { rulesDecideTianxunFocus(snap, targetKey); });
  }

  function decideLiewuCombo(useCombo: boolean) {
    runAction(snap => rulesDecideLiewuCombo(snap, useCombo));
  }

  function defend() {
    play("guard");
    runAction(snap => rulesDefend(snap));
  }

  function rest() {
    play("rest");
    runAction(snap => rulesRest(snap));
  }

  function judgement(type: string, targetKey?: string) {
    play("skill");
    runAction(snap => rulesJudgement(snap, type, targetKey));
  }

  function surrender(side: Side) {
    play("ui");
    commitGame(state => {
      const winner = other(side);
      state.winner = winner;
      state.battleStats = state.battleStats || { fighters: {} };
      state.battleStats.winner = winner;
      state.battleStats.totalRounds = state.round || 0;
      state.battleStats.victoryMethod = `${sideName(side)} 投降`;
      appendLog(state, `${sideName(side)} 投降，${sideName(other(side))} 勝利。`);
    });
  }

  function playAgain() {
    play("ui");
    recordedMatchRef.current = "";
    setView(null);
    setDialog(null);
    setSelectedKey("");
    setDraftPreviewId("ningyao");
    const next = rematchDraftState(gameState.ai?.enabled ? gameState.ai : null);
    stateRef.current = next;
    setGameState(next);
    const current = netRef.current;
    if (current.mode === "online" && current.room) {
      const nextNet = { ...current, polling: true, status: "同房再來一局" };
      netRef.current = nextNet;
      setNet(nextNet);
      void syncState(next);
    } else {
      const nextNet = { mode: "local" as const, room: "", seat: "" as const, rev: 0, polling: false, status: "本機再來一局" };
      netRef.current = nextNet;
      setNet(nextNet);
    }
  }

  async function toggleFullscreen() {
    play("ui");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      notify("此環境不允許切換全螢幕。");
    }
  }

  function requestExit() {
    play("ui");
    notify("網頁版無法直接關閉視窗；未來桌面版會接到 Electron 的離開遊戲。");
  }

  function selectedFighter() {
    if (selectedKey && gameState.players) {
      const [side, id] = selectedKey.split(":") as [Side, string];
      const found = gameState.players[side]?.team.find(fighter => fighter.id === id);
      if (found) return found;
    }
    return active;
  }

  const battleMode = !view && gameState.screen === "battle";
  const settledMode = battleMode && !!gameState.winner;
  const appClass = `app ${gameState.shakeStamp && Date.now() - gameState.shakeStamp < 600 ? "shake" : ""} ${battleMode ? "battle-app" : ""} ${battleMode && fullscreen ? "immersive-app" : ""} ${settledMode ? "settled-app" : ""} ${settings.highValueMode ? "high-value-mode" : ""} ${settings.reducedMotion ? "reduced-motion" : ""} ${settings.showBattleHints ? "" : "hints-off"} aspect-${settings.aspectRatio.replace(":", "-")}`;

  return (
    <div className={appClass}>
      <TopBar
        net={net}
        view={view}
        state={gameState}
        musicOn={musicOn}
        sfxOn={sfxOn}
        combatPanelOpen={combatPanelOpen}
        fullscreen={fullscreen}
        onToggleCombat={() => { play("ui"); setCombatPanelOpen(value => !value); }}
        onToggleFullscreen={toggleFullscreen}
        onDownloadInstaller={() => {
          play("ui");
          if (!canUseNetworkFeatures()) return notify("離線模式不提供下載入口。");
          window.location.href = downloadUrl(releaseState.data?.installerUrl || releaseState.data?.downloadUrl || "/download/installer.exe");
        }}
        onRules={() => { play("ui"); setView(view === "rules" ? null : "rules"); setDialog(null); }}
        onCodex={() => { play("ui"); setView(view === "codex" ? null : "codex"); setDialog(null); }}
        onSettings={() => { play("ui"); setView(view === "settings" ? null : "settings"); setDialog(null); }}
        onToggleMusic={toggleMusic}
        onToggleSfx={() => { play("ui"); setSfxOn(value => !value); }}
        onReset={resetToMenu}
      />
      <main className="wrap">
        <RoomBanner net={net} inviteLink={inviteLink()} onCopyRoom={() => copyText(net.room, "複製房號", "已複製房號")} onCopyInvite={() => copyText(`LuxFatum 對戰房號：${net.room}\n直接加入：${inviteLink()}`, "複製邀請資訊", "已複製邀請連結")} onForceSync={forceSync} />
        {battleMode ? null : <ReleaseBanner releaseState={releaseState} onCheck={() => checkForUpdates(true)} />}
        {view === "rules" ? <RulesPage onClose={() => setView(null)} onStartLocal={startLocal} /> : view === "codex" ? (
          <CodexPage onClose={() => setView(null)} />
        ) : view === "patch" ? (
          <PatchNotesPage onClose={() => setView(null)} />
        ) : view === "credits" ? (
          <CreditsPage onClose={() => setView(null)} />
        ) : view === "settings" ? (
          <SettingsPage
            settings={settings}
            fullscreen={fullscreen}
            musicOn={musicOn}
            sfxOn={sfxOn}
            onChange={updateSettings}
            onToggleFullscreen={toggleFullscreen}
            onToggleMusic={toggleMusic}
            onToggleSfx={() => { play("ui"); setSfxOn(value => !value); }}
            onBack={() => setView(null)}
          />
        ) : (
          gameState.screen === "menu"
            ? <Menu settings={settings} localMeta={localMeta} onQuickBattle={() => startAi("normal")} onStartTraining={startTraining} onStartLocal={startLocal} onStartAi={startAi} onCreateRoom={createRoom} onJoinRoom={joinRoom} onWatchIntro={replayIntro} onRules={() => setView("rules")} onCodex={() => setView("codex")} onSettings={() => setView("settings")} onPatchNotes={() => setView("patch")} onCredits={() => setView("credits")} onExit={requestExit} networkReady={canUseNetworkFeatures()} />
            : gameState.screen === "draft"
              ? <Draft state={gameState} draftPreviewId={draftPreviewId} canControl={canControl} onPreview={setDraftPreviewId} onPick={pick} />
              : <Battle
                  snapshot={snapshot}
                  state={gameState}
                  net={net}
                  combatPanelOpen={combatPanelOpen}
                  selected={selectedFighter()}
                  canControl={canControl}
                  onSelect={key => { play("ui"); setSelectedKey(key); }}
                  onRequestAttack={requestAttack}
                  onOpenDialog={openDialog}
                  onDefend={defend}
                  onRest={rest}
                  onSurrender={surrender}
                  onPlayAgain={playAgain}
                  onReturnMenu={resetToMenu}
                  onDecideTimeTax={decideTimeTax}
                  onDecideDebt={decideDebt}
                  onDecideQihengBalance={decideQihengBalance}
                  onDecideFengxingStar={decideFengxingStar}
                  onDecideTianxunFocus={decideTianxunFocus}
                  onDecideLiewuCombo={decideLiewuCombo}
                  onDecideMirror={decideMirror}
                  onDecideIno={decideIno}
                  onDecideConfuse={decideConfuseAttack}
                  devMode={devMode}
                  showBattleHints={settings.showBattleHints}
                />
        )}
      </main>
      {introVisible && !loading ? (
        <Suspense fallback={<div className="opening-trailer"><div className="opening-caption"><span>Opening Trailer</span><p>裁定場正在展開。</p></div></div>}>
          <OpeningTrailer onFinish={finishIntro} />
        </Suspense>
      ) : null}
      <Dialog
        type={dialog}
        snapshot={snapshot}
        onClose={closeDialog}
        onAttack={attackTarget}
        onUseSkill={useSkillTarget}
        onJudgement={judgement}
      />
      <UpdateGate releaseState={releaseState} onCheck={() => checkForUpdates(true)} />
      {toast ? <div className="toast" role="status">{toast}</div> : null}
      {loading ? <div className="unity-loading" aria-label="Loading"><div className="loading-panel"><div className="fate-wheel" /><div><div className="loading-title">命運光輪啟動</div><div className="loading-sub">載入 React、PixiJS 與規則系統</div></div></div></div> : null}
    </div>
  );
}

function TopBar(props: {
  net: NetState;
  view: ViewType;
  state: GameState;
  musicOn: boolean;
  sfxOn: boolean;
  combatPanelOpen: boolean;
  fullscreen: boolean;
  onToggleCombat: () => void;
  onToggleFullscreen: () => void;
  onDownloadInstaller: () => void;
  onRules: () => void;
  onCodex: () => void;
  onSettings: () => void;
  onToggleMusic: () => void;
  onToggleSfx: () => void;
  onReset: () => void;
}) {
  const meta = props.net.mode === "online"
    ? `${APP_VERSION} / 線上 ${props.net.room} / ${props.net.seat.toUpperCase()} / ${props.net.status}`
    : `${APP_VERSION} / ${props.net.status}`;
  const inBattle = !props.view && props.state.screen === "battle";
  return (
    <header className={`top ${inBattle ? "battle-top" : ""}`}>
      <div className="brand">
        <img className="brand-logo" src={APP_LOGO_SRC} alt="" aria-hidden="true" />
        <div className="brand-text">
          <h1>LuxFatum 裁定對決 {APP_VERSION}</h1>
          <p>{meta}</p>
        </div>
      </div>
      <div className="top-actions">
        {inBattle ? (
          <>
            <button className="tool-button" onClick={props.onToggleCombat}>{props.combatPanelOpen ? "收起紀錄" : "戰況紀錄"}</button>
            <details className="system-menu">
              <summary>系統</summary>
              <div className="system-menu-panel">
                <button onClick={props.onToggleFullscreen}>{props.fullscreen ? "退出全螢幕" : "全螢幕"}</button>
                <button onClick={props.onRules}>{props.view === "rules" ? "回遊戲" : "規則書"}</button>
                <button onClick={props.onToggleMusic}>{props.musicOn ? "主題曲開" : "主題曲關"}</button>
                <button onClick={props.onToggleSfx}>{props.sfxOn ? "音效開" : "音效關"}</button>
                <button onClick={props.onReset}>回主選單</button>
              </div>
            </details>
          </>
        ) : (
          <>
            <button onClick={props.onDownloadInstaller}>下載</button>
            <button onClick={props.onRules}>{props.view === "rules" ? "回遊戲" : "規則"}</button>
            <button onClick={props.onCodex}>{props.view === "codex" ? "回遊戲" : "百科"}</button>
            <button onClick={props.onSettings}>{props.view === "settings" ? "回遊戲" : "設定"}</button>
            <button onClick={props.onToggleMusic}>{props.musicOn ? "主題曲開" : "主題曲關"}</button>
            <button onClick={props.onToggleSfx}>{props.sfxOn ? "音效開" : "音效關"}</button>
            <button onClick={props.onReset}>回主選單</button>
          </>
        )}
      </div>
    </header>
  );
}

function RoomBanner({ net, inviteLink, onCopyRoom, onCopyInvite, onForceSync }: { net: NetState; inviteLink: string; onCopyRoom: () => void; onCopyInvite: () => void; onForceSync: () => void }) {
  if (net.mode !== "online" || !net.room) return null;
  return (
    <section className="room-banner">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="subtle">線上房間 · 你的座位 {net.seat.toUpperCase()}</div>
          <div className="room-code">{net.room}</div>
        </div>
        <div className="row">
          <button onClick={onCopyRoom}>複製房號</button>
          <button onClick={onCopyInvite}>複製邀請連結</button>
          <button onClick={onForceSync}>重新同步</button>
        </div>
      </div>
      <div className="invite-link">{inviteLink}</div>
    </section>
  );
}

function ReleaseBanner({ releaseState, onCheck }: { releaseState: ReleaseState; onCheck: () => void }) {
  const data = releaseState.data;
  if (releaseState.checking) return <section className="release-banner"><div><strong>正在檢查更新</strong><p>確認目前版本與下載資訊。</p></div></section>;
  if (releaseState.error) return <section className="release-banner"><div><strong>更新檢查暫時失敗</strong><p>{releaseState.error}</p></div><div className="release-actions"><button onClick={onCheck}>重試</button></div></section>;
  if (!data || (!data.updateAvailable && !data.forceUpdate)) return null;
  return (
    <section className={`release-banner ${data.forceUpdate ? "force" : ""}`}>
      <div><strong>{data.forceUpdate ? "需要更新才能繼續線上對戰" : "有新版本可下載"}</strong><p>目前 {APP_VERSION}，最新 {data.latestVersion}。{data.message || ""}</p></div>
      <div className="release-actions">
        <button onClick={() => { window.location.href = downloadUrl(data.installerUrl || data.downloadUrl || "/download/installer.exe"); }}>下載安裝檔</button>
        <button onClick={() => { window.location.href = downloadUrl(data.windowsZipUrl || "/download/windows.zip"); }}>免安裝 zip</button>
        <button onClick={() => { window.location.href = downloadUrl("/download/package.zip"); }}>Render/GitHub 包</button>
      </div>
    </section>
  );
}

function UpdateGate({ releaseState, onCheck }: { releaseState: ReleaseState; onCheck: () => void }) {
  const data = releaseState.data;
  if (!data?.forceUpdate) return null;
  return (
    <div className="update-gate">
      <section className="update-gate-panel">
        <h2>必須更新</h2>
        <p>{data.message || "此版本已不支援線上對戰，請下載最新版本。"}</p>
        <div className="release-actions">
          <button onClick={() => { window.location.href = downloadUrl(data.installerUrl || data.downloadUrl || "/download/installer.exe"); }}>下載安裝檔</button>
          <button onClick={() => { window.location.href = downloadUrl(data.windowsZipUrl || "/download/windows.zip"); }}>免安裝 zip</button>
          <button onClick={onCheck}>重新檢查</button>
        </div>
      </section>
    </div>
  );
}

function Menu({ settings, localMeta, onQuickBattle, onStartTraining, onStartLocal, onStartAi, onCreateRoom, onJoinRoom, onWatchIntro, onRules, onCodex, onSettings, onPatchNotes, onCredits, onExit, networkReady }: {
  settings: GameSettings;
  localMeta: LocalMeta;
  onQuickBattle: () => void;
  onStartTraining: () => void;
  onStartLocal: () => void;
  onStartAi: (difficulty: AiDifficulty) => void;
  onCreateRoom: () => void;
  onJoinRoom: (room?: string) => void;
  onWatchIntro: () => void;
  onRules: () => void;
  onCodex: () => void;
  onSettings: () => void;
  onPatchNotes: () => void;
  onCredits: () => void;
  onExit: () => void;
  networkReady: boolean;
}) {
  const featured = ["ningyao", "jingren", "liewu", "tianxun"].map(id => byId(id)).filter(Boolean) as CharacterCard[];
  const recentTeams = settings.recentTeams.slice(0, 3).map(team => team.map(id => byId(id)?.name || id).join(" / "));
  const achievements = achievementsFor(localMeta);
  const unlocked = achievements.filter(item => item.unlocked);
  return (
    <section className="menu-shell" data-smoke="menu">
      <section className="commercial-menu-hero">
        <div className="hero-copy">
          <img className="app-hero-logo" src={APP_LOGO_SRC} alt="LuxFatum 裁定對決 logo" />
          <span className="pill gold">{VERSION_INFO.versionName}</span>
          <h2>LuxFatum</h2>
          <p>3v3 裁定競技。輪抽三名角色，用能量、共鳴、狀態與裁定把每一次目標選擇推成勝負分水嶺。</p>
          <div className="hero-actions">
            <button className="primary-command" data-smoke="quick-battle" onClick={onQuickBattle}>快速對戰</button>
            <button data-smoke="training" onClick={onStartTraining}>訓練</button>
            <button data-smoke="local-draft" onClick={onStartLocal}>本機 3v3</button>
            <button onClick={onCreateRoom} disabled={!networkReady}>線上開房</button>
          </div>
        </div>
        <div className="hero-character-stack" aria-label="代表角色">
          {featured.map((character, index) => <img key={character.id} src={cardImage(character.id)} alt={character.name} style={cssVars({ "--focus": artFocus(character.id), "--tilt": `${(index - 1.5) * 4}deg` })} />)}
        </div>
      </section>
      {!networkReady ? <p className="offline-note">目前為離線 / 本機檔案模式：本機雙人與 AI 對戰可正常遊玩，線上開房與下載更新入口會暫停。</p> : null}
      <section className="menu-dashboard">
        <div className="mode-panel">
          <div className="mode-panel-head">
            <div>
              <span className="pill blue">開始遊戲</span>
              <h2>選擇你的對戰入口</h2>
            </div>
            <p>最快 2 次點擊進戰鬥；進階資訊退到側欄與系統頁。</p>
          </div>
          <div className="menu-start-strip">
            <button className="primary-command" onClick={onQuickBattle}><b>立即開戰</b><span>P1 vs 標準 AI，跳過房間設定。</span></button>
            <button onClick={onStartTraining}><b>首局訓練</b><span>固定隊伍開局，逐步提示裁定、技能與待決。</span></button>
            <button onClick={onStartLocal}><b>輪抽練習</b><span>本機雙人完整驗證選角與規則。</span></button>
          </div>
          <div className="menu-section-title"><span>模式</span><i /></div>
          <div className="mode-grid">
            <button className="mode-card featured" onClick={onQuickBattle}><b>快速對戰</b><span>直接進入 P1 vs 普通 AI，適合驗證新平衡。</span></button>
            <button className="mode-card training" onClick={onStartTraining}><b>訓練</b><span>固定隊伍與戰鬥提示，第一局就能學會主要操作。</span></button>
            <button className="mode-card" onClick={onStartLocal}><b>本機雙人</b><span>同裝置輪流操作，完整 3v3 輪抽。</span></button>
            <button className="mode-card" onClick={() => onStartAi("hard")}><b>AI 挑戰</b><span>高壓 AI 自動輪抽、待決與行動。</span></button>
            <button className="mode-card" onClick={onCreateRoom} disabled={!networkReady}><b>線上開房</b><span>建立房號與邀請連結。</span></button>
          </div>
          <div className="menu-section-title"><span>AI 難度</span><i /></div>
          <div className="ai-difficulty-grid menu-ai-grid">{AI_DIFFICULTIES.map(item => <button key={item.key} onClick={() => onStartAi(item.key)}><span className="command-label">{item.label}</span><span className="command-note">{item.note}</span></button>)}</div>
        </div>
        <aside className="menu-side-panel">
          {initialRoom ? <div className="menu-mini-card invite"><span className="pill gold">邀請房</span><b>{initialRoom}</b><button onClick={() => onJoinRoom(initialRoom)}>加入</button></div> : null}
          <div className="menu-mini-card">
            <span className="pill">輸入房號</span>
            <div className="row"><input id="roomInput" defaultValue={initialRoom} placeholder="例如 ABC23" /><button onClick={() => onJoinRoom()}>加入</button></div>
          </div>
          <div className="menu-mini-card">
            <span className="pill">最近隊伍</span>
            {recentTeams.length ? recentTeams.map(team => <small key={team}>{team}</small>) : <small>尚未保存隊伍，完成選角後會自動記錄。</small>}
          </div>
          <div className="menu-mini-card meta-card">
            <span className="pill gold">本機戰績</span>
            <div className="meta-stats"><b>{localMeta.matches}</b><small>場次</small><b>{localMeta.wins}</b><small>P1 勝</small><b>{localMeta.trainingRuns}</b><small>訓練</small></div>
            <small>{localMeta.recentResults[0] ? `最近：${sideName(localMeta.recentResults[0].winner)} / ${localMeta.recentResults[0].rounds} 回合` : "尚無結算紀錄。"}</small>
          </div>
          <div className="menu-mini-card achievement-card">
            <span className="pill">成就</span>
            {achievements.slice(0, 4).map(item => <small key={item.id} className={item.unlocked ? "achievement unlocked" : "achievement"}>{item.unlocked ? "已解鎖" : "未解鎖"}｜{item.title}</small>)}
            <small>{unlocked.length}/{achievements.length} 已解鎖</small>
          </div>
          <div className="menu-mini-card patch">
            <span className="pill gold">{APP_VERSION}</span>
            <b>GitHub Render 與 App 正式版</b>
            <small>線上部署、下載版、訓練入口與本機戰績完成正式版收斂。</small>
          </div>
        </aside>
      </section>
      <nav className="secondary-menu-commands system-shortcuts" aria-label="系統功能">
        <button onClick={onRules}>規則</button>
        <button onClick={onCodex}>百科</button>
        <button onClick={onPatchNotes}>更新紀錄</button>
        <button onClick={onCredits}>製作名單</button>
        <button onClick={onSettings}>設定</button>
        <button onClick={onWatchIntro}>前導</button>
        <button className="disabled-command" onClick={onExit}>離開</button>
      </nav>
      <section className="commercial-completion-strip">
        <div><b>首次教學</b><span>{settings.hasSeenTutorial ? "已完成" : "下次進入會播放前導教學"}</span></div>
        <div><b>規則覆蓋</b><span>裁定 / 共鳴 / 狀態 / 待決流程使用同一份 UI 規則資料</span></div>
        <div><b>線上狀態</b><span>{networkReady ? "可開房與加入房間" : "離線模式"}</span></div>
      </section>
      <div className="menu-version-corner">{APP_NAME} {APP_VERSION}</div>
    </section>
  );
}

function VersionInfoCard() {
  return (
    <div className="card version-info-card">
      <h2>版本資訊</h2>
      <dl className="version-info-grid">
        <div><dt>遊戲版本</dt><dd>{VERSION_INFO.gameVersion}</dd></div>
        <div><dt>規則版本</dt><dd>{VERSION_INFO.rulesetVersion}</dd></div>
        <div><dt>Build 日期</dt><dd>{VERSION_INFO.buildDate}</dd></div>
        <div><dt>Build 類型</dt><dd>{VERSION_INFO.buildType}</dd></div>
      </dl>
    </div>
  );
}

function PatchNotesPage({ onClose }: { onClose: () => void }) {
  return (
    <section className="info-page">
      <header className="page-hero compact-page-hero">
        <div>
          <span className="pill gold">{APP_VERSION}</span>
          <h2>更新紀錄</h2>
          <p>本次更新集中在 GitHub/Render 線上版、Windows App 下載版與正式版入口整理。</p>
        </div>
        <button onClick={onClose}>返回主選單</button>
      </header>
      <section className="info-grid">
        <article className="card"><h3>線上正式版</h3><p>Render 部署保留房間、版本、健康檢查與下載入口，方便從 GitHub 直接發行。</p></article>
        <article className="card"><h3>App 下載版</h3><p>Windows App 可離線遊玩本機與 AI 對戰，也能連到 Render 房間與更新檢查。</p></article>
        <article className="card"><h3>正式節奏</h3><p>保留 3v3、25 角色、裁定、共鳴與勝負判定，並下修起始能量、開戰 HP +1，讓一局更有鋪陳。</p></article>
      </section>
    </section>
  );
}

function CreditsPage({ onClose }: { onClose: () => void }) {
  return (
    <section className="info-page">
      <header className="page-hero compact-page-hero">
        <div>
          <span className="pill gold">LuxFatum Team</span>
          <h2>製作名單</h2>
          <p>此頁保留可公開展示的本機製作資訊，方便未來接 Steam / 桌面版包裝。</p>
        </div>
        <button onClick={onClose}>返回主選單</button>
      </header>
      <section className="info-grid credits-grid">
        <article className="card"><h3>Game Design</h3><p>3v3、裁定、共鳴、狀態與 25 角色平衡。</p></article>
        <article className="card"><h3>Engineering</h3><p>React、TypeScript、PixiJS v8、線上房間與本機桌面化準備。</p></article>
        <article className="card"><h3>Art Direction</h3><p>角色肖像、裁定舞台、暗色高對比 UI 與戰鬥資訊密度調整。</p></article>
      </section>
    </section>
  );
}

function SettingsPage({ settings, fullscreen, musicOn, sfxOn, onChange, onToggleFullscreen, onToggleMusic, onToggleSfx, onBack }: {
  settings: GameSettings;
  fullscreen: boolean;
  musicOn: boolean;
  sfxOn: boolean;
  onChange: (next: Partial<GameSettings> | ((current: GameSettings) => GameSettings)) => void;
  onToggleFullscreen: () => void;
  onToggleMusic: () => void;
  onToggleSfx: () => void;
  onBack: () => void;
}) {
  const recentTeams = settings.recentTeams.map(team => team.map(id => byId(id)?.name || id).join(" / "));
  return (
    <section className="settings-page">
      <header className="page-hero compact-page-hero">
        <div>
          <span className="pill gold">localStorage 保存</span>
          <h2>設定</h2>
          <p>這些設定會保存在本機，未來 Electron 桌面版也可直接沿用同一套設定資料。</p>
        </div>
        <button onClick={onBack}>返回主選單</button>
      </header>
      <section className="settings-grid">
        <div className="card settings-card">
          <h3>畫面</h3>
          <div className="setting-row">
            <div><b>全螢幕</b><span>{fullscreen ? "目前啟用" : "目前關閉"}</span></div>
            <button onClick={onToggleFullscreen}>{fullscreen ? "退出全螢幕" : "切換全螢幕"}</button>
          </div>
          <label className="setting-row">
            <div><b>畫面比例</b><span>桌面視窗可固定構圖比例</span></div>
            <select value={settings.aspectRatio} onChange={event => onChange({ aspectRatio: event.target.value as AspectRatioMode })}>
              <option value="auto">自動</option>
              <option value="16:9">16:9</option>
              <option value="16:10">16:10</option>
              <option value="4:3">4:3</option>
            </select>
          </label>
          <label className="setting-row">
            <div><b>高數值顯示模式</b><span>加大 HP / ATK / SPD 與資源文字</span></div>
            <input type="checkbox" checked={settings.highValueMode} onChange={event => onChange({ highValueMode: event.target.checked })} />
          </label>
          <label className="setting-row">
            <div><b>減少動態效果</b><span>關閉非必要動畫與畫面震動，適合長時間對戰與實況擷取</span></div>
            <input type="checkbox" checked={settings.reducedMotion} onChange={event => onChange({ reducedMotion: event.target.checked })} />
          </label>
          <label className="setting-row">
            <div><b>戰鬥提示</b><span>顯示行動建議、狀態解釋與角色專屬提醒</span></div>
            <input type="checkbox" checked={settings.showBattleHints} onChange={event => onChange({ showBattleHints: event.target.checked })} />
          </label>
        </div>
        <div className="card settings-card">
          <h3>音量</h3>
          <VolumeSlider label="主音量" value={settings.masterVolume} onChange={value => onChange({ masterVolume: value })} />
          <VolumeSlider label="音效音量" value={settings.sfxVolume} onChange={value => onChange({ sfxVolume: value })} />
          <VolumeSlider label="BGM 音量" value={settings.bgmVolume} onChange={value => onChange({ bgmVolume: value })} />
          <div className="setting-actions">
            <button onClick={onToggleMusic}>{musicOn ? "暫停 BGM" : "播放 BGM"}</button>
            <button onClick={onToggleSfx}>{sfxOn ? "關閉音效" : "開啟音效"}</button>
          </div>
        </div>
        <div className="card settings-card">
          <h3>存檔</h3>
          <label className="setting-row">
            <div><b>已看過教學 / 前導</b><span>關閉後下次進主選單會再播放</span></div>
            <input type="checkbox" checked={settings.hasSeenTutorial} onChange={event => onChange({ hasSeenTutorial: event.target.checked })} />
          </label>
          <div className="setting-stack">
            <b>最近使用隊伍</b>
            {recentTeams.length ? recentTeams.map(team => <span key={team} className="pill">{team}</span>) : <span className="subtle">尚未保存隊伍。</span>}
          </div>
        </div>
        <div className="card settings-card">
          <h3>版本</h3>
          <dl className="version-info-grid">
            <div><dt>遊戲版本</dt><dd>{VERSION_INFO.gameVersion}</dd></div>
            <div><dt>規則版本</dt><dd>{VERSION_INFO.rulesetVersion}</dd></div>
            <div><dt>Build 日期</dt><dd>{VERSION_INFO.buildDate}</dd></div>
            <div><dt>Build 類型</dt><dd>{VERSION_INFO.buildType}</dd></div>
          </dl>
        </div>
      </section>
    </section>
  );
}

function VolumeSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="volume-slider">
      <span>{label}</span>
      <input type="range" min="0" max="100" value={Math.round(value * 100)} onChange={event => onChange(Number(event.target.value) / 100)} />
      <b>{Math.round(value * 100)}%</b>
    </label>
  );
}

function CodexPage({ onClose }: { onClose: () => void }) {
  const [selectedId, setSelectedId] = useState(CHARACTERS[0]?.id || "");
  const selected = byId(selectedId) || CHARACTERS[0];
  return (
    <section className="codex-page">
      <header className="page-hero compact-page-hero">
        <div>
          <span className="pill gold">角色百科</span>
          <h2>角色百科</h2>
          <p>集中查看角色立繪、基礎數值、技能、共鳴與狀態關鍵字。此頁只做說明，不改動規則。</p>
        </div>
        <button onClick={onClose}>返回主選單</button>
      </header>
      <section className="codex-layout">
        <div className="codex-list">
          {CHARACTERS.map(character => (
            <button key={character.id} className={`codex-list-item ${character.id === selected.id ? "active" : ""}`} onClick={() => setSelectedId(character.id)}>
              <img src={cardImage(character.id)} alt="" style={cssVars({ "--slot-focus": slotFocus(character.id) })} />
              <span>{character.name}</span>
              <small>HP {character.hp} / ATK {character.atk} / SPD {character.spd}</small>
            </button>
          ))}
        </div>
        <CharacterDetail character={selected} />
      </section>
    </section>
  );
}

function CharacterDetail({ character }: { character: CharacterCard }) {
  const detail = SKILL_DETAILS[character.id];
  return (
    <article className="character-detail">
      <div className="character-detail-art" style={cssVars({ backgroundImage: `url('${cardImage(character.id)}')`, "--focus": artFocus(character.id) })} />
      <div className="character-detail-body">
        <div className="row">
          <h3>{character.name}</h3>
          <span className="pill gold">HP {character.hp}</span>
          <span className="pill red">ATK {character.atk}</span>
          <span className="pill blue">SPD {character.spd}</span>
        </div>
        <p><b className="hi-gold">被動</b>｜{character.passive}</p>
        <p><b className="hi-blue">{character.skill.name}</b>｜費用 {character.skill.cost}｜冷卻 {character.skill.cd}<br />{character.skill.desc}</p>
        <p><b className="hi-gold">共鳴 {character.res.name}</b>｜{character.res.desc}</p>
        {detail ? (
          <div className="skill-detail-grid">
            <SkillDetailBlock title="目標" items={[detail.target]} />
            <SkillDetailBlock title="命中效果" items={detail.effects} />
            <SkillDetailBlock title="影響" items={detail.impact} />
            <SkillDetailBlock title="共鳴" items={detail.resonance} />
          </div>
        ) : null}
        <StatusGlossary />
      </div>
    </article>
  );
}

function StatusGlossary() {
  const names = Object.keys(STATUS_META);
  return (
    <section className="status-glossary">
      <h4>狀態關鍵字</h4>
      <div className="status-keywords">
        {names.map(name => <StatusPill key={name} status={name} />)}
      </div>
    </section>
  );
}

function RulesPage({ onClose, onStartLocal }: { onClose: () => void; onStartLocal: () => void }) {
  const hero = ["jingren", "kelu", "liewu"].map(id => byId(id)).filter(Boolean) as CharacterCard[];
  const [activeStatusName, setActiveStatusName] = useState(STATUS_RULE_ROWS[0].name);
  const activeStatus = STATUS_RULE_ROWS.find(row => row.name === activeStatusName) || STATUS_RULE_ROWS[0];
  return (
    <section className="rules-page" data-smoke="rules">
      <section className="rules-hero">
        <div>
          <div className="rules-version">
            <span className="pill">{APP_VERSION} PixiJS 演出版</span>
            <p>規則版本：{VERSION_INFO.rulesetVersion}</p>
            <p>版本名稱：{VERSION_INFO.versionName}</p>
          </div>
          <h2>規則書</h2>
          <p>雙方各選 <span className="hi-gold">3 名角色</span>，用攻擊、技能、共鳴、狀態與裁定標記擊倒對手全部角色。此頁保留完整角色圖鑑與規則速查。</p>
          <div className="row"><button onClick={onClose}>回到遊戲</button><button onClick={onStartLocal}>本機開局</button></div>
        </div>
        <div className="rules-art-stack">{hero.map(character => <img key={character.id} src={cardImage(character.id)} alt={character.name} style={cssVars({ "--focus": artFocus(character.id) })} />)}</div>
      </section>
      <section className="rules-grid">
        {RULE_GUIDE_BLOCKS.map(block => <RuleListCard key={block.title} block={block} />)}
        <RuleListCard block={BASIC_ACTION_GUIDE} />
        <article className="rule-card"><h3>裂舞戰意</h3><ul><li>任一角色成功使用技能後，裂舞獲得 <span className="hi-red">1 層戰意</span>。</li><li>戰意最多 <span className="hi-red">3/3</span>，角色卡、技能面板與行動提示都會顯示目前層數。</li><li>普攻時最多消耗 1 層戰意，對同一目標追加 1 傷害，不再追加完整普攻。</li><li>收勢護身需要 <span className="hi-red">2 層戰意</span> 才能施放。</li></ul></article>
        <article className="rule-card status-rule-card"><h3>狀態 / 特殊標記</h3><div className="status-tabs">{STATUS_RULE_ROWS.map(({ name }) => <button key={name} className={name === activeStatus.name ? "active" : ""} onClick={() => setActiveStatusName(name)}>{name}</button>)}</div><div className="status-card selected"><span className="pill">{activeStatus.name}</span><p>{activeStatus.desc}</p></div></article>
      </section>
      <section className="codex-section">
        <div className="card"><h2>角色圖鑑</h2><p>美術圖、基礎數值、技能消耗與冷卻集中在同一張卡上，選角和對戰時都能快速判斷角色定位。</p></div>
        <div className="codex">{CHARACTERS.map(character => <CodexCard key={character.id} character={character} />)}</div>
      </section>
    </section>
  );
}

function RuleListCard({ block }: { block: RuleListBlock }) {
  return (
    <article className="rule-card">
      <h3>{block.title}</h3>
      <ul>{block.items.map(item => <li key={item}>{item}</li>)}</ul>
    </article>
  );
}

function CodexCard({ character }: { character: CharacterCard }) {
  return (
    <article className="codex-card">
      <div className="codex-art" style={cssVars({ backgroundImage: `url('${cardImage(character.id)}')`, "--focus": artFocus(character.id) })}><h3>{character.name}</h3></div>
      <div className="codex-body">
        <div className="stats"><span className="pill gold">HP {character.hp}</span><span className="pill red">ATK {character.atk}</span><span className="pill blue">SPD {character.spd}</span><span className="pill">{character.role}</span><span className="pill">難度 {character.complexity}/5</span></div>
        <div className="stats">{(character.tags || []).map(tag => <span key={tag} className="pill">{tag}</span>)}</div>
        <p><b className="hi-gold">戰術摘要</b>｜{character.shortDesc}</p>
        <p><b className="hi-blue">操作提示</b>｜{character.battleTip}</p>
        <p><b className="hi-gold">被動</b>｜{character.passive}</p>
        <p><b className="hi-blue">{character.skill.name}</b>｜<span className="hi-blue">費用 {character.skill.cost}</span>｜<span className="hi-gold">冷卻 {character.skill.cd}</span><br />{character.skill.desc}</p>
        <p><b className="hi-gold">共鳴 {character.res.name}</b>｜{character.res.desc}</p>
      </div>
    </article>
  );
}

function Draft({ state, draftPreviewId, canControl, onPreview, onPick }: { state: GameState; draftPreviewId: string; canControl: (side: Side) => boolean; onPreview: (id: string) => void; onPick: (id: string) => void }) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const preview = byId(draftPreviewId) || CHARACTERS[0];
  const locked = !canControl(state.draftTurn);
  const aiPicking = aiControlled(state, state.draftTurn);
  const draftOwner = (id: string): Side | "" => state.p1Draft.includes(id) ? "p1" : state.p2Draft.includes(id) ? "p2" : "";
  const previewOwner = draftOwner(preview.id);
  const detailCharacter = detailId ? byId(detailId) : null;
  const detailOwner = detailCharacter ? draftOwner(detailCharacter.id) : "";
  const canPickDetail = !!detailCharacter && !locked && !detailOwner;
  const openDetail = (id: string) => {
    onPreview(id);
    setDetailId(id);
  };
  return (
    <section className="draft-shell" data-smoke="draft">
      <header className="draft-command">
        <div>
          <span className={`pill ${state.draftTurn}`}>{sideName(state.draftTurn)} PICK</span>
          <h2>輪抽選角</h2>
          <p className="notice">{aiPicking ? `${state.ai?.label || "AI"} 正在選角；仍可點角色查看介紹。` : locked ? `等待 ${sideName(state.draftTurn)} 選角；仍可點角色查看介紹。` : `輪到 ${sideName(state.draftTurn)}。點角色開啟介紹，進彈窗後再鎖定。`}</p>
          <div className="row"><span className="pill gold">已選 {state.pickIndex}/{RULES.TEAM_SIZE * 2}</span><span className="pill">順序 {DRAFT_SEQUENCE_TEXT}</span></div>
        </div>
        <div className="draft-sequence" aria-label="選角順序">
          {DRAFT_SEQUENCE.map((side, index) => <span key={`${side}:${index}`} className={`draft-step ${index < state.pickIndex ? "done" : ""} ${index === state.pickIndex ? "active" : ""}`}>{index + 1} {sideName(side)}</span>)}
        </div>
      </header>
      <div className="draft-squads">
        <DraftSquad side="p1" ids={state.p1Draft} />
        <DraftSquad side="p2" ids={state.p2Draft} />
      </div>
      <div className="draft-layout">
        <article className="draft-preview">
          <div className="draft-preview-art" style={cssVars({ backgroundImage: `url('${cardImage(preview.id)}')`, "--focus": artFocus(preview.id) })} />
          <div className="draft-preview-copy">
            <span className="pill gold">{previewOwner ? `${sideName(previewOwner)} 已選` : "預覽"}</span>
            <h2>{preview.name}</h2>
            <div className="stats"><span className="pill">HP {preview.hp}</span><span className="pill">ATK {preview.atk}</span><span className="pill">SPD {preview.spd}</span><span className="pill">耗 {preview.skill.cost} / CD {preview.skill.cd}</span><span className="pill gold">{preview.role}</span><span className="pill">難度 {preview.complexity}/5</span></div>
            <div className="stats">{(preview.tags || []).map(tag => <span key={tag} className="pill">{tag}</span>)}</div>
            <p>{preview.shortDesc || preview.passive}</p>
            <p><b className="hi-blue">戰術</b>：{preview.battleTip}</p>
            <p><b className="hi-gold">{preview.skill.name}</b>：{preview.skill.desc}</p>
            <button className="draft-pick-button" onClick={() => openDetail(preview.id)}>{previewOwner ? "查看介紹" : locked ? "查看介紹" : `查看介紹 / 鎖定 ${preview.name}`}</button>
          </div>
        </article>
        <div className="draft-pool">{CHARACTERS.map(character => {
          const owner = draftOwner(character.id);
          return (
            <button key={character.id} type="button" data-character-id={character.id} className={`draft-card ${owner ? "selected" : ""} ${character.id === preview.id ? "previewing" : ""} ${locked ? "locked" : ""}`} aria-pressed={character.id === preview.id} onMouseEnter={() => onPreview(character.id)} onFocus={() => onPreview(character.id)} onClick={() => openDetail(character.id)}>
              {owner ? <span className={`draft-owner ${owner}`}>{sideName(owner)}</span> : null}
              <div className="draft-art" style={cssVars({ backgroundImage: `url('${cardImage(character.id)}')`, "--focus": artFocus(character.id) })}><h3>{character.name}</h3></div>
              <div className="draft-body">
                <div className="stats"><span className="pill">HP {character.hp}</span><span className="pill">ATK {character.atk}</span><span className="pill">SPD {character.spd}</span></div>
                <p className="desc">{character.shortDesc || character.passive}</p>
              </div>
            </button>
          );
        })}</div>
      </div>
      {detailCharacter ? (
        <DraftCharacterModal
          character={detailCharacter}
          owner={detailOwner}
          locked={locked}
          canPick={canPickDetail}
          onClose={() => setDetailId(null)}
          onPick={() => {
            onPick(detailCharacter.id);
            setDetailId(null);
          }}
        />
      ) : null}
    </section>
  );
}

function DraftCharacterModal({ character, owner, locked, canPick, onClose, onPick }: { character: CharacterCard; owner: Side | ""; locked: boolean; canPick: boolean; onClose: () => void; onPick: () => void }) {
  const lockText = owner ? `${sideName(owner)} 已鎖定` : locked ? "等待目前玩家鎖定" : `鎖定 ${character.name}`;
  return (
    <Modal title={character.name} onClose={onClose}>
      <div className="draft-intro-modal">
        <div className="draft-intro-art" style={cssVars({ backgroundImage: `url('${cardImage(character.id)}')`, "--focus": artFocus(character.id) })} />
        <div className="draft-intro-copy">
          <div className="row"><span className="pill gold">角色介紹</span>{owner ? <span className={`pill ${owner}`}>{sideName(owner)} 已選</span> : <span className="pill">可選</span>}</div>
          <div className="stats"><span className="pill">HP {character.hp}</span><span className="pill">ATK {character.atk}</span><span className="pill">SPD {character.spd}</span><span className="pill">耗 {character.skill.cost} / CD {character.skill.cd}</span><span className="pill gold">{character.role}</span><span className="pill">難度 {character.complexity}/5</span></div>
          <div className="stats">{(character.tags || []).map(tag => <span key={tag} className="pill">{tag}</span>)}</div>
          <section><h3>戰術摘要</h3><p>{character.shortDesc}</p><p className="desc">{character.battleTip}</p></section>
          <section><h3>被動</h3><p>{character.passive}</p></section>
          <section><h3>技能</h3><p><b className="hi-gold">{character.skill.name}</b>：{character.skill.desc}</p></section>
          <section><h3>共鳴</h3><p><b className="hi-blue">{character.res.name}</b>：{character.res.desc}</p></section>
          <button className="draft-pick-button" disabled={!canPick} onClick={onPick}>{lockText}</button>
        </div>
      </div>
    </Modal>
  );
}

function DraftSquad({ side, ids }: { side: Side; ids: string[] }) {
  const picks = Array.from({ length: RULES.TEAM_SIZE }, (_, index) => ids[index] ? byId(ids[index]) : undefined);
  return (
    <section className={`draft-squad ${side}`}>
      <div className="draft-squad-head"><span>{sideName(side)}</span><b>{ids.length}/{RULES.TEAM_SIZE}</b></div>
      <div className="draft-slots">
        {picks.map((character, index) => (
          <div key={`${side}:${index}`} className={`draft-slot ${character ? "" : "empty"}`}>
            {character ? <><img src={cardImage(character.id)} alt={character.name} style={cssVars({ "--focus": artFocus(character.id), "--slot-focus": slotFocus(character.id) })} /><span>{character.name}</span></> : <span>{index + 1}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

type BattleProps = {
  snapshot: GameSnapshot;
  state: GameState;
  net: NetState;
  combatPanelOpen: boolean;
  selected: Fighter | null;
  canControl: (side: Side) => boolean;
  onSelect: (key: string) => void;
  onRequestAttack: () => void;
  onOpenDialog: (type: DialogType) => void;
  onDefend: () => void;
  onRest: () => void;
  onSurrender: (side: Side) => void;
  onPlayAgain: () => void;
  onReturnMenu: () => void;
  onDecideTimeTax: (key: string) => void;
  onDecideDebt: (key: string | null, skip?: boolean) => void;
  onDecideQihengBalance: (use: boolean) => void;
  onDecideFengxingStar: (key: string, useResonance?: boolean) => void;
  onDecideTianxunFocus: (key: string) => void;
  onDecideLiewuCombo: (use: boolean) => void;
  onDecideMirror: (use: boolean) => void;
  onDecideIno: (use: boolean) => void;
  onDecideConfuse: (key: string) => void;
  devMode: boolean;
  showBattleHints: boolean;
};

function hasPendingDecision(state: GameState) {
  return !!(
    state.pendingQihengBalance ||
    state.pendingFengxingStar ||
    state.pendingTianxunFocus ||
    state.pendingDebt ||
    state.pendingTimeTax ||
    state.pendingLiewuCombo ||
    state.pendingMirror ||
    state.pendingSkill ||
    state.pendingConfuseAttack
  );
}

function Battle(props: BattleProps) {
  if (!props.state.players) return null;
  const settled = !!props.state.winner;
  const pending = hasPendingDecision(props.state);
  return (
    <section className={`battle-table unity-hud tactical-battle ${settled ? "settlement-mode" : ""}`} data-smoke="battle">
      {props.combatPanelOpen ? <CombatDrawer state={props.state} /> : null}
      <TurnFlow state={props.state} />
      {settled ? (
        <SettlementScreen state={props.state} net={props.net} onPlayAgain={props.onPlayAgain} onReturnMenu={props.onReturnMenu} />
      ) : (
        <>
          <div className="battle-core">
            <div className="core-stage">
              <Suspense fallback={<div className="battle-render-loading">戰鬥舞台載入中</div>}>
                <PixiBattle snapshot={props.snapshot} onSelect={props.onSelect} />
              </Suspense>
              <SkillBurst state={props.state} />
              {props.showBattleHints ? <TrainingGuide state={props.state} /> : null}
            </div>
            <div className="core-command">
              <CombatRoster state={props.state} selected={props.selected} onSelect={props.onSelect} />
              {!pending ? <ObjectivePanel snapshot={props.snapshot} canControl={props.canControl} /> : null}
              <PendingPanels {...props} />
              <div className="battle-control-stack">
                <Actions {...props} />
                {!pending ? <SurrenderPanel state={props.state} net={props.net} onSurrender={props.onSurrender} /> : null}
              </div>
            </div>
          </div>
          <div className="battle-bottom-panels">
            <SkillPanel fighter={props.selected} state={props.state} />
            <BattleLogDock state={props.state} />
            {props.devMode ? <DeveloperRulesPanel state={props.state} /> : null}
          </div>
        </>
      )}
    </section>
  );
}

function TrainingGuide({ state }: { state: GameState }) {
  if (!state.ai?.training) return null;
  const activeName = state.active ? byId(state.active.id)?.name || state.active.id : "";
  const steps = [
    state.pendingTianxunFocus ? "先選一名我方角色獲得 SPD +1，觀察行動序如何改變。" : "",
    state.pendingFengxingStar || state.pendingDebt || state.pendingTimeTax || state.pendingQihengBalance ? "處理待決效果；每個待決都會標出操作者、合法目標與結果。" : "",
    state.pendingMirror || state.pendingSkill || state.pendingConfuseAttack || state.pendingLiewuCombo ? "這是反制或改目標待決，先看預覽再確認。" : "",
    state.active ? `${activeName} 行動中：試著先攻擊，再找下一輪使用技能、休息與裁定。` : "",
    !state.active && !state.winner ? "等待回合開始待決完成後，系統會建立行動序。" : "",
    state.winner ? "訓練已結算；可以再來一局或回主選單查看本機戰績。" : ""
  ].find(Boolean) || "跟著右側指令台完成這一回合。";
  return (
    <aside className="training-guide" data-smoke="training-guide">
      <span className="pill gold">訓練</span>
      <b>首局指引</b>
      <p>{steps}</p>
    </aside>
  );
}

function MatchResultPanel({ state, net, onPlayAgain }: { state: GameState; net: NetState; onPlayAgain: () => void }) {
  const winner = sideName(state.winner || "");
  return (
    <section className="actions match-result">
      <span className="pill gold">戰鬥結束</span>
      <h2>{winner ? `${winner} 勝利` : "平手"}</h2>
      <p>{net.mode === "online" ? "不用重新開房，按下後同一個房號會回到輪抽選角。" : "立即回到輪抽選角，重新組隊再打一局。"}</p>
      <button className="draft-pick-button" onClick={onPlayAgain}>再來一局</button>
    </section>
  );
}

function SettlementScreen({ state, net, onPlayAgain, onReturnMenu }: { state: GameState; net: NetState; onPlayAgain: () => void; onReturnMenu: () => void }) {
  const rows = battleStatsRows(state);
  const topMvp = topBy(rows, "mvp")[0] || rows[0];
  const mvp = topMvp && statScore(topMvp) > 0 ? topMvp : rows.find(row => row.side === state.winner) || topMvp;
  const last = state.battleStats?.lastKnockout;
  const lastKiller = findStat(rows, last?.actorKey);
  const tank = topBy(rows, "damageTaken")[0];
  const healer = topBy(rows, "healingDone")[0];
  const focus = topBy(rows, "timesTargeted")[0];
  const finalClause = lastKiller || last?.actorName
    ? `最終由${lastKiller?.name || last?.actorName}完成最後擊倒。`
    : `勝利方式為${state.battleStats?.victoryMethod || "戰鬥結束"}。`;
  const summary = rows.length
    ? `本場戰鬥中，${mvp?.name || "無名角色"}成為戰場核心，${tank?.damageTaken ? tank.name : "沒有角色"}承受最多傷害，${healer?.healingDone ? healer.name : "沒有角色"}提供最多治癒，${finalClause}`
    : "本場戰鬥資料不足，仍已記錄勝利結果。";
  const rankCards: [string, BattleStatMetric, string][] = [
    ["最高傷害", "damageDealt", "傷害"],
    ["最高承傷", "damageTaken", "承傷"],
    ["最高治癒", "healingDone", "治癒"],
    ["最多擊倒", "knockouts", "擊倒"],
    ["最多被指定", "timesTargeted", "次"],
    ["最多共鳴", "resonanceUsed", "次"],
    ["最多狀態操作", "statusOps", "次"],
    ["最多保護隊友", "protectCount", "次"]
  ];
  const badges = settlementBadges(rows, mvp, lastKiller);
  const winner = sideName(state.winner || "");
  const victoryMethod = state.battleStats?.victoryMethod || (state.winner === "平手" ? "同歸於盡" : "全滅勝利");

  return (
    <section className="settlement-screen" data-smoke="settlement">
      <div className="settlement-hero">
        <div className="settlement-copy">
          <span className="pill gold">戰鬥結算</span>
          <h2>{winner ? `${winner} 勝利` : "平手"}</h2>
          <div className="settlement-meta">
            <span>勝利方式 <b>{victoryMethod}</b></span>
            <span>總回合 <b>{state.battleStats?.totalRounds || state.round || 0}</b></span>
            <span>最後擊倒 <b>{lastKiller?.name || last?.actorName || "無"}</b></span>
            <span>{net.mode === "online" ? "線上對戰" : "本機對戰"}</span>
          </div>
          <p>{summary}</p>
        </div>
        {mvp ? <MvpCard stat={mvp} /> : null}
      </div>
      <div className="settlement-grid">
        <section className="ranking-panel">
          <h3>數據排行</h3>
          <div className="rank-card-grid">
            {rankCards.map(([title, key, unit]) => <RankCard key={key} title={title} stat={topBy(rows, key)[0]} metric={key} unit={unit} />)}
          </div>
        </section>
        <section className="badge-panel">
          <h3>特殊稱號</h3>
          <div className="badge-list">
            {badges.map(badge => <span key={`${badge.title}:${badge.name}`} className="title-badge"><b>{badge.title}</b>{badge.name}</span>)}
          </div>
        </section>
      </div>
      <div className="settlement-actions">
        <button onClick={() => window.print()}>截圖分享</button>
        <button onClick={onReturnMenu}>返回主選單</button>
        <button className="draft-pick-button" onClick={onPlayAgain}>再來一局</button>
      </div>
    </section>
  );
}

function MvpCard({ stat }: { stat: BattleFighterStats }) {
  return (
    <article className="mvp-card">
      <div className="mvp-art" style={cssVars({ backgroundImage: `url(${cardImage(stat.id)})`, "--focus": artFocus(stat.id) })} />
      <div className="mvp-body">
        <span className={`pill ${stat.side}`}>{sideName(stat.side)} MVP</span>
        <h3>{stat.name}</h3>
        <div className="mvp-score">貢獻值 {statScore(stat)}</div>
        <div className="mvp-stats">
          <span>傷害 <b>{stat.damageDealt}</b></span>
          <span>承傷 <b>{stat.damageTaken}</b></span>
          <span>治癒 <b>{stat.healingDone}</b></span>
          <span>擊倒 <b>{stat.knockouts}</b></span>
        </div>
      </div>
    </article>
  );
}

function RankCard({ title, stat, metric, unit }: { title: string; stat?: BattleFighterStats; metric: BattleStatMetric; unit: string }) {
  const value = stat ? statValue(stat, metric) : 0;
  const hasValue = value > 0;
  return (
    <article className="rank-card">
      <span>{title}</span>
      <strong>{hasValue ? stat?.name || "無" : "無"}</strong>
      <em>{value} {unit}</em>
    </article>
  );
}

function settlementBadges(rows: BattleFighterStats[], mvp?: BattleFighterStats, lastKiller?: BattleFighterStats | null) {
  const badges: { title: string; name: string }[] = [];
  const push = (title: string, stat?: BattleFighterStats | null, min = 1, key: BattleStatMetric = "mvp") => {
    if (!stat) return;
    if (key !== "mvp" && statValue(stat, key) < min) return;
    badges.push({ title, name: stat.name });
  };
  push("最終執行者", lastKiller, 0);
  push("戰場核心", mvp, 0);
  push("守護核心", topBy(rows, "protectCount")[0], 1, "protectCount");
  push("破口製造者", topBy(rows, "statusOps")[0], 1, "statusOps");
  push("仍未墜落", topBy(rows, "oneHpSaves")[0], 1, "oneHpSaves");
  push("鏡面裁決", topBy(rows, "mirrorReflects")[0], 1, "mirrorReflects");
  push("荒謬設定王", topBy(rows, "judgementUsed")[0], 1, "judgementUsed");
  push("最危險焦點", topBy(rows, "timesTargeted")[0], 1, "timesTargeted");
  push("治癒支點", topBy(rows, "healingDone")[0], 1, "healingDone");
  return badges.length ? badges : [{ title: "戰場核心", name: mvp?.name || "無" }];
}

function CombatDrawer({ state }: { state: GameState }) {
  return <aside className="combat-drawer open"><div className="combat-drawer-panel"><div className="combat-drawer-head"><h2>完整戰況</h2></div><Queue state={state} /><Log state={state} /></div></aside>;
}

function TurnFlow({ state }: { state: GameState }) {
  const steps = state.queue.slice(0, 5);
  return (
    <div className="turn-flow" aria-label="行動順序">
      <span className="flow-step round">第 {state.round} 回合</span>
      {state.ai?.enabled ? <span className="flow-step p2">AI {state.ai.label}</span> : null}
      {steps.map((item, index) => (
        <span key={`${item.side}:${item.id}:${index}`} className={`flow-step ${index === 0 ? "active" : item.side}`}>
          {index === 0 ? "目前 " : `${index + 1} `}
          {sideName(item.side)} {byId(item.id)?.name || item.id}
        </span>
      ))}
      {!steps.length ? <span className="flow-step active">等待結算</span> : null}
      {state.winner ? <span className="flow-step active">{sideName(state.winner)} 勝利</span> : null}
    </div>
  );
}

function CombatRoster({ state, selected, onSelect }: { state: GameState; selected: Fighter | null; onSelect: (key: string) => void }) {
  return (
    <section className="combat-roster" aria-label="角色狀態">
      <CombatRosterSide side="p2" state={state} selected={selected} onSelect={onSelect} />
      <CombatRosterSide side="p1" state={state} selected={selected} onSelect={onSelect} />
    </section>
  );
}

function CombatRosterSide({ side, state, selected, onSelect }: { side: Side; state: GameState; selected: Fighter | null; onSelect: (key: string) => void }) {
  const player = state.players![side];
  const openingDefenseActive = state.round === 1 && !player.openingDefenseUsed;
  return (
    <div className={`roster-side ${side}`}>
      <header><b>{sideName(side)}</b><span>能量 {player.energy}/{RULES.ENERGY_MAX}</span><span>裁定 {player.marks}/3</span><span>共鳴 {player.resUsed}/{RULES.RESONANCE_PER_ROUND}</span></header>
      {state.round === 1 ? (
        <div className={`opening-defense-chip ${openingDefenseActive ? "ready" : "spent"}`}>
          開局防線：{openingDefenseActive ? "待命，首個實際承傷 -1" : "已觸發"}
        </div>
      ) : null}
      <div className="roster-chips">
        {player.team.map(fighter => {
          const hpPct = clamp((fighter.hpNow / fighter.maxHp) * 100, 0, 100);
          const active = state.active?.side === fighter.owner && state.active?.id === fighter.id;
          const isSelected = selected?.owner === fighter.owner && selected?.id === fighter.id;
          const fullStatus = specialMarkNames(fighter)[0] || (fighter.statuses.length ? statusLabel(fighter, fighter.statuses[0]) : "無狀態");
          const status = compactStatusLabel(fullStatus, fullStatus);
          return (
            <button
              key={`${side}:${fighter.id}`}
              type="button"
              className={`roster-chip ${active ? "active" : ""} ${isSelected ? "selected" : ""} ${fighter.hpNow <= 0 ? "dead" : ""}`}
              onClick={() => onSelect(`${fighter.owner}:${fighter.id}`)}
            >
              <img src={cardImage(fighter.id)} alt="" style={cssVars({ "--slot-focus": slotFocus(fighter.id) })} />
              <span className="roster-name">{fighter.name}</span>
              <span className="roster-hp">HP {fighter.hpNow}/{fighter.maxHp}</span>
              <span className="roster-stat">ATK {currentAtk(fighter)} / SPD {currentSpd(fighter)}</span>
              <span className="roster-status" title={fullStatus}>{status}</span>
              <i style={cssVars({ "--hp": `${hpPct}%` })} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Team({ side, state, selected, onSelect }: { side: Side; state: GameState; selected: Fighter | null; onSelect: (key: string) => void }) {
  const player = state.players![side];
  return (
    <section className={`team ${side}-side`}>
      <div className="team-head"><h2 className={side}>{sideName(side)}</h2><TeamResource player={player} /></div>
      <div className="team-roster">{player.team.map(fighter => <FighterCard key={`${side}:${fighter.id}`} fighter={fighter} state={state} selected={selected} onSelect={onSelect} />)}</div>
    </section>
  );
}

function TeamResource({ player }: { player: PlayerState }) {
  const energyPct = clamp((player.energy / RULES.ENERGY_MAX) * 100, 0, 100);
  return <div className="team-resource"><div className="energy-meter" title={`能量 ${player.energy}/6`}><div className="energy-fill" style={cssVars({ "--energy": `${energyPct}%` })} /></div><div className="judgement-slots" title={`裁定 ${player.marks}/3`}>{[0, 1, 2].map(i => <span key={i} className={`judgement-slot ${i < player.marks ? "filled" : ""}`} />)}</div><span className="pill">本回合共鳴 {player.resUsed}/2</span></div>;
}

function FighterCard({ fighter, state, selected, onSelect }: { fighter: Fighter; state: GameState; selected: Fighter | null; onSelect: (key: string) => void }) {
  const active = state.active?.side === fighter.owner && state.active?.id === fighter.id;
  const isSelected = selected?.owner === fighter.owner && selected?.id === fighter.id;
  const hit = state.lastHit?.owner === fighter.owner && state.lastHit?.id === fighter.id && Date.now() - state.lastHit.stamp < 800;
  const hpPct = clamp((fighter.hpNow / fighter.maxHp) * 100, 0, 100);
  const intent = fighter.flags?.battleIntent || 0;
  const marks = specialMarkNames(fighter);
  return (
    <article className={`fighter ${active ? "active" : ""} ${isSelected ? "selected" : ""} ${fighter.hpNow <= 0 ? "dead" : ""} ${hit ? "hit" : ""}`} onClick={() => onSelect(`${fighter.owner}:${fighter.id}`)}>
      <div className="fighter-main">
        <img className="fighter-art" src={cardImage(fighter.id)} alt={fighter.name} style={cssVars({ "--focus": artFocus(fighter.id) })} />
        <div className="fighter-info">
          <h3><span className="fighter-name">{fighter.name}</span><span className="pill">CD {fighter.cd}</span></h3>
          <div className="hpbar"><div className="hpfill" style={{ width: `${hpPct}%` }} /></div>
          <div className="stats"><span className="pill">HP {fighter.hpNow}/{fighter.maxHp}</span><span className="pill">ATK {currentAtk(fighter)}</span><span className="pill">SPD {currentSpd(fighter)}</span><span className="pill">耗 {fighter.skill.cost} / CD {fighter.skill.cd}</span>{marks.map(mark => <StatusPill key={mark} status={mark} compact />)}{fighter.flags.records ? <span className="pill gold">紀錄 {fighter.flags.records}</span> : null}{fighter.id === "liewu" ? <span className="pill red">戰意 {intent}/3</span> : null}</div>
          {fighter.id === "liewu" ? <div className="intent-meter" aria-label={`裂舞戰意 ${intent}/3`}><span>戰意</span><b>{intent}/3</b><i className={intent > 0 ? "filled" : ""} /><i className={intent > 1 ? "filled" : ""} /><i className={intent > 2 ? "filled" : ""} /></div> : null}
          <div className="statuses"><StatusLine fighter={fighter} /></div>
        </div>
      </div>
      <div className="record-board"><RecordRow label="技能"><b>{fighter.skill.name}</b>：{fighter.skill.desc}</RecordRow><RecordRow label="共鳴"><b>{fighter.res.name}</b>：{fighter.res.desc}</RecordRow><RecordRow label="被動">{fighter.passive}</RecordRow></div>
    </article>
  );
}

function RecordRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="record-row"><span className="record-label">{label}</span><p>{children}</p></div>;
}

function StatusLine({ fighter }: { fighter: Fighter }) {
  const marks = specialMarkNames(fighter);
  if (!fighter.statuses.length && !marks.length) return <span className="pill">無狀態</span>;
  return <>{marks.map(mark => <StatusPill key={mark} status={mark} compact />)}{fighter.statuses.map(status => <StatusPill key={status} status={status} label={statusLabel(fighter, status)} compact />)}</>;
}

function StatusPill({ status, label, compact = false }: { status: string; label?: string; compact?: boolean }) {
  const meta = STATUS_META[status] || { icon: status.slice(0, 1), tone: "bad" as const, desc: status };
  const text = label || status;
  const display = compact ? compactStatusLabel(status, text) : text;
  return <span className={`pill ${meta.tone} status-pill ${compact ? "compact-status" : ""}`} title={`${text} - ${meta.desc}`}><span className="status-icon">{meta.icon}</span><span className="status-text">{display}</span></span>;
}

const NEGATIVE_STATUS_ORDER = [STATUS.SEAL, STATUS.OBSERVE, STATUS.CONFUSE, STATUS.SLOW, STATUS.TIME_TAX, STATUS.DELAY, STATUS.CORROSION, STATUS.STITCH];

function negativeEffectRows(fighter: Fighter) {
  const rows: { name: string; desc: string }[] = [];
  for (const status of NEGATIVE_STATUS_ORDER) {
    if (fighter.statuses.includes(status)) rows.push({ name: statusLabel(fighter, status), desc: STATUS_META[status]?.desc || status });
  }
  const flags = fighter.flags;
  if ((flags.nextDamageTakenReduction || 0) < 0) rows.push({ name: "代價負荷（特殊標記）", desc: STATUS_META["代價負荷"].desc });
  if (flags.starLine) rows.push({ name: "星線（我方標記）", desc: STATUS_META["星線"].desc });
  if ((flags.damageTakenMod || 0) > 0) rows.push({ name: `受傷 +${flags.damageTakenMod}`, desc: `本回合受到的傷害增加 ${flags.damageTakenMod}。` });
  if ((flags.atkMod || 0) < 0) rows.push({ name: `ATK ${flags.atkMod}`, desc: `本回合攻擊力降低 ${Math.abs(flags.atkMod)}。` });
  if ((flags.spdMod || 0) < 0) rows.push({ name: `SPD ${flags.spdMod}`, desc: `本回合速度降低 ${Math.abs(flags.spdMod)}，可能影響行動順序。` });
  if ((flags.nextRoundAtkMod || 0) < 0) rows.push({ name: `下回合 ATK ${flags.nextRoundAtkMod}`, desc: `下回合攻擊力降低 ${Math.abs(flags.nextRoundAtkMod)}。` });
  if ((flags.nextRoundSpdMod || 0) < 0) rows.push({ name: `下回合 SPD ${flags.nextRoundSpdMod}`, desc: `下回合速度降低 ${Math.abs(flags.nextRoundSpdMod)}。` });
  if ((flags.skillCostUp || 0) > 0) rows.push({ name: `技能費用 +${flags.skillCostUp}`, desc: `下一次使用技能時，能量費用增加 ${flags.skillCostUp}。` });
  if (flags.noAttack) rows.push({ name: "不能攻擊", desc: "本次行動不能選擇普通攻擊。" });
  if (flags.noDefend) rows.push({ name: "不能防禦", desc: "本回合不能選擇防禦行動。" });
  if (flags.cannotAttackYingli) rows.push({ name: "不能指定映璃", desc: "本回合下一次攻擊不能選擇映璃作為目標。" });
  return rows;
}

function NegativeEffectPanel({ fighter }: { fighter: Fighter }) {
  const rows = negativeEffectRows(fighter);
  return (
    <section className={`negative-effect-panel ${rows.length ? "" : "empty"}`}>
      <div className="negative-effect-head">
        <h3>受到的負面效果</h3>
        <span>{rows.length ? `${rows.length} 項` : "無"}</span>
      </div>
      {rows.length ? (
        <div className="negative-effect-list">
          {rows.map(row => (
            <div key={`${row.name}:${row.desc}`} className="negative-effect-row">
              <b>{row.name}</b>
              <span>{row.desc}</span>
            </div>
          ))}
        </div>
      ) : <p>目前沒有封印、觀測、混亂、遲緩、時間稅或其他負面修正。</p>}
    </section>
  );
}

const SKILL_DETAILS: Record<string, { target: string; effects: string[]; impact: string[]; resonance: string[] }> = {
  ningyao: { target: "敵方 1 名", effects: ["造成 2 傷害並給予封印。", "若目標在此技能結算前已持有封印，額外造成 1 傷害。"], impact: ["封印會讓目標下次行動不能使用技能。", "額外傷害只看結算前是否已有封印，不看本技能新給的封印。"], resonance: ["技能後寧曜回復 1 HP。"] },
  hengshuo: { target: "我方 1 名", effects: ["目標本回合受傷 -2。", "移除目標身上的觀測。"], impact: ["若目標後續真的承傷且減傷成功，衡朔回復 1 HP。", "這是防護型效果，不會改變角色規則或仇恨。"], resonance: ["目標獲得守護；守護會優先於衡朔被動承傷。"] },
  youming: { target: "敵方 1 名", effects: ["造成 2 傷害。", "命中後給予遲緩。"], impact: ["遲緩會讓目標下回合 SPD -1。", "幽冥自身每回合首次受傷仍會 -1。"], resonance: ["目標 ATK -1，持續到該目標下次行動結束。"] },
  leiting: { target: "敵方 1 名", effects: ["造成 2 傷害。"], impact: ["雷霆改回普攻破口定位，技能是低費補壓。"], resonance: ["目標獲得觀測；下一次受傷 +1。"] },
  baijian: { target: "我方 1 名", effects: ["回復 2 HP。", "移除 1 個負面狀態。"], impact: ["若目標是目前 HP 最低的我方角色，額外回復 1 HP。", "回合結束被動改為白繭本回合未使用技能才補 1 HP。"], resonance: ["目標獲得守護。"] },
  dengzhen: { target: "任意 1 名角色", effects: ["本回合 SPD +2 或 -2。"], impact: ["會立即重排本回合行動順序。", "若目標是我方，額外回復 3 HP。"], resonance: ["目標本回合受傷 -1。"] },
  ino: { target: "敵方 1 名", effects: ["若目標沒有觀測，造成 1 傷害並給予觀測。", "若目標已有觀測，改為造成 3 傷害並移除觀測。"], impact: ["觀測會讓目標下一次受傷 +1。"], resonance: ["目標本回合受傷 +1。"] },
  aila: { target: "敵方 1 名", effects: ["造成 2 傷害並給予封印。", "若目標已有觀測，額外造成 2 傷害。"], impact: ["封印會限制目標下次使用技能。"], resonance: ["艾菈方獲得 1 能量。"] },
  leiyouxi: { target: "敵方 1 名", effects: ["造成 3 傷害。"], impact: ["若我方落後，額外給予混亂。", "若雷幽曦有擊倒後增傷，會套用在這次傷害。"], resonance: ["只有我方落後時，本次技能傷害 +1。"] },
  baidengling: { target: "我方全體", effects: ["我方全體各回復 1 HP。", "HP 最低的我方額外回復 1 HP。"], impact: ["若我方落後，額外獲得 1 裁定。"], resonance: ["HP 最低的我方移除 1 個負面狀態。"] },
  yiaiqian: { target: "依被複製技能而定", effects: ["消耗 1 紀錄。", "複製上一個成功結算技能的基礎傷害或治癒值 +1。", "若沒有紀錄，對 1 敵造成 2 傷害。"], impact: ["只複製數值，不改寫原技能的完整附加規則。", "紀錄最多 3 個。"], resonance: ["獲得 1 能量；若消耗最後 1 個紀錄，額外獲得 1 能量。"] },
  weixiang: { target: "我方 1 名", effects: ["目標獲得守護。", "目標回復 1 HP。"], impact: ["守護可代替其他我方角色承傷一次。"], resonance: ["目標本回合下次受傷額外 -1。"] },
  xiaomo: { target: "敵方 1 名", effects: ["擲硬幣。", "正面：造成 4 傷害。", "反面：目標混亂，不造成傷害。"], impact: ["混亂會讓下一次指定目標由對手決定。", "反面不造成傷害且不觸發「下注」的遲緩追加。"], resonance: ["「下注」的遲緩追加不會在反面觸發。"] },
  huiyin: { target: "依複製技能而定", effects: ["複製我方上一個可複製且成功結算的技能，數值 +1。", "若沒有可複製技能，改為對 1 敵造成 2 傷害。"], impact: ["可被複製的內容以最後記錄的傷害或治癒數值為準。"], resonance: ["此技能費用 -1。"] },
  yingli: { target: "敵方 1 名", effects: ["造成 1 傷害並給予混亂。"], impact: ["若目標已有混亂，額外造成 2 傷害。"], resonance: ["映璃本回合受傷 -1。"] },
  tianxun: { target: "選擇規則效果", effects: ["可選普攻傷害 +1、技能傷害 +1、我方全體 SPD +1、最低 SPD 先行動。"], impact: ["未共鳴最多選 1 項。", "回合開始被動會先由操作者選 1 名我方角色 SPD +1。"], resonance: ["可選 2 項，但天訊本回合不能防禦。"] },
  xuntian: { target: "敵方 1 名", effects: ["造成 3 傷害。"], impact: ["下回合訊天使用技能費用 +1。"], resonance: ["若目標技能後 HP 為 2 以下，額外造成 1 傷害。"] },
  zuozhe: { target: "敵方 1 名", effects: ["造成 2 傷害並擲硬幣。", "正面：給予混亂。", "反面：目標本回合與下回合 ATK / SPD -1。"], impact: ["混亂與數值降低都會寫入戰鬥紀錄。"], resonance: ["技能後額外給予觀測。"] },
  jingren: { target: "自身", effects: ["自身獲得守護。", "下回合 SPD 變為 4。"], impact: ["守護可代替我方承傷一次。", "全域鏡返每場 2 次、每回合最多 1 次，反彈傷害上限 2。"], resonance: ["鏡返節奏更穩定，但每回合仍只能發動 1 次。"] },
  kelu: { target: "敵方 1 名", effects: ["造成 2 傷害。", "若目標技能正在冷卻，冷卻 +1。", "若目標有時間稅，改為冷卻 +2 並移除時間稅。", "若目標沒有技能冷卻，給予延滯。"], impact: ["時間稅於回合結束必定移除。", "時間稅成功觸發時，目標冷卻 +1 並受到 1 傷害。", "延滯不因回合結束移除，直到目標下次成功使用技能後移除。"], resonance: ["若這次讓目標冷卻增加，刻律獲得 1 能量；每回合最多 1 次。"] },
  songya: { target: "敵方 1 名", effects: ["賦予欠條。", "若目標已經有欠條，升級為加重欠條。"], impact: ["欠條不是負面狀態，不能被移除負面狀態的效果移除。", "帶欠條者本回合第一次行動後檢查是否指定訟鴉。", "若沒有指定訟鴉，訟鴉方獲得 1 能量且該角色受到 2 傷害；加重欠條還會讓該角色獲得延滯。", "防禦或休息視為沒有指定訟鴉。"], resonance: ["技能後若場上存在欠條或加重欠條，訟鴉回復 1 HP；每回合最多 1 次。"] },
  qiheng: { target: "我方 1 名代價來源 + 敵方 1 名", effects: ["代價來源失去 1～3 HP，不能因此被擊倒。", "敵方目標受到 2＋失去 HP 數量的傷害。", "若代價來源失去 3 HP，來源本回合下次受傷 +1。"], impact: ["代價失去 HP 不視為受到傷害，不觸發受傷、守護、觀測、裁定減傷或開局防線。", "受傷 +1 是一次性修正，會在下次實際受到傷害後移除。"], resonance: ["失去 1 HP：HP 最低我方回復 1 HP。", "失去 2 HP：祈衡回復 1 HP。", "失去 3 HP：不觸發共鳴治癒。"] },
  shili: { target: "敵方 1 名", effects: ["造成 2 傷害。", "給予 1 層腐蝕。", "若目標本回合曾受到治療，額外造成 1 傷害。"], impact: ["腐蝕是負面狀態，最多 2 層。", "帶有腐蝕者受到治療時，該次治療量 -1；治療後移除 1 層。", "腐蝕不可把治療量降到 0。"], resonance: ["若技能目標帶有腐蝕，給予另一名敵方角色 1 層腐蝕。"] },
  fengxing: { target: "敵方 1 名", effects: ["給予縫線。", "帶有縫線者本回合第一次造成傷害後，若指定的是縫星方 HP 最低角色，自己受到 1 傷害。"], impact: ["星線是我方標記，不是守護，不會改變攻擊目標。", "星線被指定時反傷 2；縫線維持反傷 1。", "縫線是負面狀態；未觸發時於回合結束移除。"], resonance: ["設置星線時可使用共鳴「童話打結」；星線觸發時攻擊者額外獲得遲緩。"] },
  liewu: { target: "自身", effects: ["消耗 2 層戰意。", "本回合首次受到傷害時，該次傷害 -2。"], impact: ["戰意不足 2 層時不能施放。", "裂舞普攻時最多消耗 1 層戰意，對同一目標追加 1 傷害，不再追加完整普攻。"], resonance: ["技能後裂舞回復 1 HP。"] }
};

function SkillBreakdown({ fighter, player, previewResonance = false }: { fighter: Fighter; player?: PlayerState | null; previewResonance?: boolean }) {
  const detail = SKILL_DETAILS[fighter.id] || { target: "依技能文字", effects: [fighter.skill.desc], impact: ["效果會依戰鬥紀錄逐步結算。"], resonance: [fighter.res.desc] };
  const used = player?.resUsed ?? 0;
  const limit = RULES.RESONANCE_PER_ROUND;
  const after = Math.min(limit, used + (previewResonance ? 1 : 0));
  return (
    <div className="skill-breakdown">
      <div className="skill-detail-grid">
        <SkillDetailBlock title="目標" items={[detail.target]} />
        <SkillDetailBlock title="命中效果" items={detail.effects} />
        <SkillDetailBlock title="影響" items={detail.impact} />
        <SkillDetailBlock title={`共鳴 ${used}/${limit}`} items={[...detail.resonance, `本回合已使用 ${used}/${limit} 次${previewResonance ? `，本次使用後 ${after}/${limit} 次。` : "。"}每回合上限 2 次。`]} />
      </div>
    </div>
  );
}

function SkillDetailBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="skill-detail-block">
      <h4>{title}</h4>
      <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>
    </section>
  );
}

function Queue({ state }: { state: GameState }) {
  return <div className="card queue-card"><h2>行動順序</h2><div className="row">{state.queue.map((item, index) => <span key={`${item.side}:${item.id}:${index}`} className={`pill ${index === 0 ? "queue-current" : item.side}`}>{index === 0 ? "目前：" : ""}{sideName(item.side)} {byId(item.id)?.name || item.id}</span>)}</div></div>;
}

function ActiveSpotlight({ state }: { state: GameState }) {
  const snap = snapshotFor(state);
  const active = rulesActiveF(snap) as Fighter | null;
  if (!active) return <section className="active-spotlight"><div><span className="pill">等待</span><h2>等待行動</h2><p>回合開始效果或決策結算中。</p></div></section>;
  return <section className="active-spotlight"><div><span className={`pill ${active.owner}`}>{sideName(active.owner)}</span><h2>{active.name}</h2><div className="turn-hud"><span className="pill">HP {active.hpNow}/{active.maxHp}</span><span className="pill">ATK {currentAtk(active)}</span><span className="pill">SPD {currentSpd(active)}</span>{active.id === "liewu" ? <span className="pill red">戰意 {active.flags.battleIntent || 0}/3</span> : null}</div><p>{active.passive}</p><p className="spotlight-res"><b>{active.skill.name}</b>：{active.skill.desc}</p></div><div className="spotlight-frame" style={cssVars({ "--focus": artFocus(active.id) })}><img className="spotlight-art" src={cardImage(active.id)} alt={active.name} /></div></section>;
}

function SkillBurst({ state }: { state: GameState }) {
  if (!state.fx || Date.now() - state.fx.stamp > 2200) return null;
  const rune = ({ skill: "技", skillCast: "技", skillDamage: "斬", damage: "傷", attack: "攻", heal: "癒", status: "態", support: "輔", guard: "護", resonance: "鳴", judgement: "裁" } as Record<string, string>)[state.fx.kind] || "裁";
  return <section className={`skill-burst ${state.fx.kind}`}><span className="fx-rune">{rune}</span><div className="fx-copy"><strong>{state.fx.title}</strong><span>{state.fx.sub}</span></div></section>;
}

function StatChips({ fighter, compact = false }: { fighter: Fighter; compact?: boolean }) {
  return (
    <div className={`stat-chips ${compact ? "compact" : ""}`}>
      <span className="pill">HP {fighter.hpNow}/{fighter.maxHp}</span>
      <span className="pill">ATK {currentAtk(fighter)}</span>
      <span className="pill">SPD {currentSpd(fighter)}</span>
    </div>
  );
}

function ObjectivePanel({ snapshot, canControl }: { snapshot: GameSnapshot; canControl: (side: Side) => boolean }) {
  const objective = deriveObjectiveState(snapshot);
  const controlling = objective.controller ? sideName(objective.controller) : "";
  const isMine = objective.controller ? canControl(objective.controller) : false;
  return (
    <section className={`objective-panel ${objective.phase}`}>
      <div className="objective-head">
        <div>
          <span className="pill gold">{objective.phase === "pending" ? "待決" : objective.phase === "action" ? "行動" : objective.phase === "settled" ? "結算" : "流程"}</span>
          <h2>{objective.title}</h2>
        </div>
        <span className={`pill ${isMine ? "good" : objective.controller ? "bad" : ""}`}>{controlling ? `${controlling}${isMine ? " 操作中" : " 決策中"}` : "系統"}</span>
      </div>
      <p>{objective.detail}</p>
      <div className="objective-meta">
        {objective.actorName ? <span className="pill">角色 {objective.actorName}</span> : null}
        <span className="pill blue">{objective.confirmLabel}</span>
        {objective.targets.length ? <span className="pill">{objective.targets.length} 個合法目標</span> : null}
      </div>
      {objective.targets.length ? (
        <div className="target-preview-grid">
          {objective.targets.slice(0, 4).map(target => (
            <div key={target.key} className="target-preview-card">
              <div className="target-preview-title"><b>{sideName(target.side)} {target.name}</b><span>{target.hp}</span></div>
              <small>{target.stats}</small>
              <p>{target.summary}</p>
              <div className="target-preview-tags">{target.tags.map(tag => <span key={tag} className="pill" title={tag}>{compactStatusLabel(tag, tag)}</span>)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PendingPanels(props: BattleProps) {
  const { state } = props;
  return <>{state.pendingQihengBalance ? <PendingQihengBalance {...props} /> : null}{state.pendingFengxingStar ? <PendingFengxingStar {...props} /> : null}{state.pendingTianxunFocus ? <PendingTianxunFocus {...props} /> : null}{state.pendingDebt ? <PendingDebt {...props} /> : null}{state.pendingTimeTax ? <PendingTimeTax {...props} /> : null}{state.pendingLiewuCombo ? <PendingLiewuCombo {...props} /> : null}{state.pendingMirror ? <PendingMirror {...props} /> : null}{state.pendingSkill ? <PendingIno {...props} /> : null}{state.pendingConfuseAttack ? <PendingConfuse {...props} /> : null}</>;
}

function qihengBalancePairForUi(state: GameState, side: Side) {
  const team = alive(state.players?.[side]?.team || []);
  const highest = [...team].sort((a, b) => b.hpNow - a.hpNow || b.maxHp - a.maxHp || a.id.localeCompare(b.id))[0];
  const lowest = [...team].sort((a, b) => a.hpNow - b.hpNow || a.maxHp - b.maxHp || a.id.localeCompare(b.id))[0];
  if (!highest || !lowest || highest.id === lowest.id) return null;
  return { highest, lowest, diff: highest.hpNow - lowest.hpNow };
}

function PendingQihengBalance({ state, canControl, onDecideQihengBalance }: BattleProps) {
  const pending = state.pendingQihengBalance;
  const actor = state.players[pending.actorSide]?.team.find((fighter: Fighter) => fighter.id === pending.actorId);
  const pair = qihengBalancePairForUi(state, pending.actorSide);
  const canDecide = canControl(pending.actorSide);
  return <section className="actions pending"><h2>均衡刻度</h2><p>{actor?.name || "祈衡"} 可讓 HP 最高的我方失去 1 HP，並使 HP 最低的我方回復 1 HP。</p>{pair ? <div className="choice-grid"><div className="choice"><span className="choice-title">代價來源：{pair.highest.name}</span><StatChips fighter={pair.highest} compact /><p className="desc">失去 1 HP，不視為受到傷害，不能低於 1。</p></div><div className="choice"><span className="choice-title">回復目標：{pair.lowest.name}</span><StatChips fighter={pair.lowest} compact /><p className="desc">回復 1 HP，不能超過上限。HP 差距 {pair.diff}。</p></div></div> : <p className="desc">目前沒有可轉衡的 HP 差距。</p>}{canDecide ? <div className="action-grid"><button onClick={() => onDecideQihengBalance(true)} disabled={!pair || pair.diff < 3}>使用均衡刻度</button><button onClick={() => onDecideQihengBalance(false)}>本回合不使用</button></div> : <p className="notice">等待 {sideName(pending.actorSide)} 決定祈衡被動。</p>}</section>;
}

function PendingFengxingStar({ state, canControl, onDecideFengxingStar }: BattleProps) {
  const pending = state.pendingFengxingStar;
  const actor = state.players[pending.actorSide]?.team.find((fighter: Fighter) => fighter.id === pending.actorId);
  const player = state.players[pending.actorSide];
  const targets = actor ? alive(player.team) : [];
  const [useRes, setUseRes] = useState(false);
  const canDecide = canControl(pending.actorSide);
  const resDisabled = !player || player.resUsed >= RULES.RESONANCE_PER_ROUND || !targets.some((fighter: Fighter) => fighter.id !== actor?.id);
  return <section className="actions pending"><h2>星線設置</h2><p>{actor?.name || "縫星"} 選擇 1 名我方角色設置星線。敵方第一次指定該角色為普攻或技能目標時，攻擊者受到 2 傷害。</p>{canDecide ? <><label className="row resonance-toggle"><input type="checkbox" disabled={resDisabled} checked={useRes} onChange={event => setUseRes(event.target.checked)} style={{ width: "auto" }} /> 使用共鳴「童話打結」：星線觸發時攻擊者額外獲得遲緩（本回合共鳴 {player.resUsed}/{RULES.RESONANCE_PER_ROUND}）</label><div className="choice-grid">{targets.map((target: Fighter) => <button key={`${target.owner}:${target.id}`} className="choice" onClick={() => onDecideFengxingStar(`${target.owner}:${target.id}`, useRes)}><span className="choice-title">{sideName(target.owner)} {target.name}</span><StatChips fighter={target} compact />{specialMarkNames(target).map(mark => <StatusPill key={mark} status={mark} compact />)}</button>)}</div></> : <p className="notice">等待 {sideName(pending.actorSide)} 設置星線。</p>}</section>;
}

function PendingTianxunFocus({ state, canControl, onDecideTianxunFocus }: BattleProps) {
  const pending = state.pendingTianxunFocus;
  const actor = state.players[pending.actorSide]?.team.find((fighter: Fighter) => fighter.id === pending.actorId);
  const targets = alive(state.players?.[pending.actorSide]?.team || []);
  const canDecide = canControl(pending.actorSide);
  return <section className="actions pending"><h2>天訊加速</h2><p>{actor?.name || "天訊"} 選擇 1 名我方角色，本回合 SPD +1。</p><p className="desc">這會立即重排行動順序，適合讓關鍵角色搶先出手或避開收割。</p>{canDecide ? <div className="choice-grid">{targets.map((target: Fighter) => <button key={`${target.owner}:${target.id}`} className="choice" onClick={() => onDecideTianxunFocus(`${target.owner}:${target.id}`)}><span className="choice-title">{sideName(target.owner)} {target.name}</span><StatChips fighter={target} compact /><span className="pill">調整後 SPD {currentSpd(target) + 1}</span></button>)}</div> : <p className="notice">等待 {sideName(pending.actorSide)} 指定加速目標。</p>}</section>;
}

function PendingDebt({ state, canControl, onDecideDebt }: BattleProps) {
  const pending = state.pendingDebt;
  const actor = state.players[pending.actorSide]?.team.find((fighter: Fighter) => fighter.id === pending.actorId);
  const targets = actor ? alive(state.players[other(actor.owner)].team) : [];
  const canDecide = canControl(pending.actorSide);
  return <section className="actions pending"><h2>欠條</h2><p>{actor?.name || "訟鴉"} 可選擇 1 名敵方角色賦予欠條。</p><p className="desc">欠條是特殊標記，不是負面狀態。目標本回合第一次行動後，若沒有指定訟鴉，訟鴉方獲得 1 能量且目標受到 2 傷害；若指定訟鴉，欠條移除。</p>{canDecide ? <><div className="choice-grid">{targets.map(target => <button key={`${target.owner}:${target.id}`} className="choice" onClick={() => onDecideDebt(`${target.owner}:${target.id}`)}><span className="choice-title">{sideName(target.owner)} {target.name}</span><StatChips fighter={target} compact /></button>)}</div><button className="secondary-action" onClick={() => onDecideDebt(null, true)}>本回合不賦予欠條</button></> : <p className="notice">等待 {sideName(pending.actorSide)} 決定是否賦予欠條。</p>}</section>;
}

function PendingTimeTax({ state, canControl, onDecideTimeTax }: BattleProps) {
  const pending = state.pendingTimeTax;
  const actor = state.players[pending.actorSide]?.team.find((fighter: Fighter) => fighter.id === pending.actorId);
  const targets = actor ? alive(state.players[other(actor.owner)].team) : [];
  const canDecide = canControl(pending.actorSide);
  return <section className="actions pending"><h2>時間稅</h2><p>{actor?.name || "刻律"} 選擇 1 名敵方角色賦予時間稅。</p><p className="desc">該角色本回合第一次成功使用技能後，技能冷卻 +1、受到 1 傷害，然後移除時間稅。場上同時最多 1 個時間稅。</p>{canDecide ? <div className="choice-grid">{targets.map(target => <button key={`${target.owner}:${target.id}`} className="choice" onClick={() => onDecideTimeTax(`${target.owner}:${target.id}`)}><span className="choice-title">{sideName(target.owner)} {target.name}</span><StatChips fighter={target} compact /><span className="pill">目前 CD {target.cd}</span></button>)}</div> : <p className="notice">等待 {sideName(pending.actorSide)} 指定時間稅目標。</p>}</section>;
}

function PendingLiewuCombo({ state, canControl, onDecideLiewuCombo }: BattleProps) {
  const pending = state.pendingLiewuCombo;
  const actor = state.players[pending.actorSide]?.team.find((fighter: Fighter) => fighter.id === pending.actorId);
  const target = parseTarget(state, pending.targetKey);
  const intent = actor?.flags?.battleIntent || 0;
  const canDecide = canControl(pending.actorSide);
  return <section className="actions pending"><h2>戰意連段</h2><p>{actor?.name || "裂舞"} 目前戰意 <b className="hi-red">{intent}/3</b>，可消耗 1 層戰意，對 {target?.name || "同一目標"} 追加 1 傷害。</p><p className="desc">追加傷害會在普攻後結算；不再追加完整普攻，也不會再次觸發追加普攻。</p>{canDecide ? <div className="action-grid"><button onClick={() => onDecideLiewuCombo(true)}>消耗 1 層</button><button onClick={() => onDecideLiewuCombo(false)}>不消耗</button></div> : <p className="notice">等待 {sideName(pending.actorSide)} 決定是否消耗戰意。</p>}</section>;
}

function PendingMirror({ state, canControl, onDecideMirror }: BattleProps) {
  const pending = state.pendingMirror;
  const actor = state.players[pending.actorSide]?.team.find((fighter: Fighter) => fighter.id === pending.actorId);
  const mirror = state.players[pending.mirrorSide]?.team.find((fighter: Fighter) => fighter.id === pending.mirrorId);
  const canDecide = canControl(pending.mirrorSide);
  return <section className="actions pending"><h2>全域鏡返</h2><p>{actor?.name || "敵方角色"} 的{pending.action === "attack" ? "普攻" : "技能"}包含 {mirror?.name || "鏡刃"} 作為目標。</p><p className="desc">發動後，該次攻擊不會對我方角色造成傷害，並最多反彈 2 傷害給攻擊者。每場剩餘 {Math.max(0, 2 - (mirror?.flags?.mirrorReflectUsed || 0))}/2 次，且每回合最多 1 次。</p>{canDecide ? <div className="action-grid"><button onClick={() => onDecideMirror(true)}>發動鏡返</button><button onClick={() => onDecideMirror(false)}>不發動</button></div> : <p className="notice">等待 {sideName(pending.mirrorSide)} 決定是否發動鏡刃。</p>}</section>;
}

function PendingIno({ state, canControl, onDecideIno }: BattleProps) {
  const pending = state.pendingSkill;
  const actor = state.players[pending.actorSide]?.team.find((fighter: Fighter) => fighter.id === pending.actorId);
  const defender = other(pending.actorSide);
  const canDecide = canControl(defender);
  return <section className="actions pending"><h2>伊諾干涉判定</h2><p>{sideName(pending.actorSide)} 的 {actor?.name || "角色"} 正要施放技能。</p><p className="desc">伊諾可使該技能費用 +1；若技能仍成功結算，伊諾方獲得 1 能量且伊諾回復 1 HP。</p>{canDecide ? <div className="action-grid"><button onClick={() => onDecideIno(true)}>干涉：費用 +1</button><button onClick={() => onDecideIno(false)}>不干涉</button></div> : <p className="notice">等待 {sideName(defender)} 操作伊諾。</p>}</section>;
}

function PendingConfuse({ state, canControl, onDecideConfuse }: BattleProps) {
  const pending = state.pendingConfuseAttack;
  const snap = snapshotFor(state);
  const actor = state.players[pending.actorSide]?.team.find((fighter: Fighter) => fighter.id === pending.actorId);
  const defender = other(pending.actorSide);
  const canDecide = canControl(defender);
  const targets = rulesConfusionTargets(snap, actor, pending.action);
  return <section className="actions pending"><h2>混亂目標</h2><p>{actor?.name || "角色"} 的{pending.action === "skill" ? "技能" : "攻擊"}由 {sideName(defender)} 指定目標。</p><p className="desc">普通攻擊只能改選敵方目標；技能只可改成該技能原本合法的目標。</p>{canDecide ? <div className="choice-grid">{targets.map(target => <button key={target.key} className="choice" onClick={() => onDecideConfuse(target.key)}><span className="choice-title">{sideName(target.side)} {target.c.name}</span><StatChips fighter={target.c} compact /></button>)}</div> : <p className="notice">等待 {sideName(defender)} 選擇目標。</p>}</section>;
}

function Actions({ snapshot, state, canControl, onRequestAttack, onOpenDialog, onDefend, onRest, showBattleHints = true }: BattleProps) {
  if (hasPendingDecision(state)) return null;
  const actor = rulesActiveF(snapshot) as Fighter | null;
  if (!actor || !state.players) return null;
  const own = canControl(actor.owner);
  const liewuIntent = actor.id === "liewu" ? (actor.flags.battleIntent || 0) : 0;
  const liewuCanSkill = actor.id !== "liewu" || liewuIntent >= 2;
  const canSkill = actor.cd <= 0 && !actor.statuses.includes(STATUS.SEAL) && state.players[actor.owner].energy >= skillCost(actor, false) && liewuCanSkill;
  const skillHint = actor.statuses.includes(STATUS.SEAL) ? "封印中" : (actor.cd > 0 ? `冷卻 ${actor.cd}` : (!liewuCanSkill ? `戰意不足 ${liewuIntent}/3` : `耗 ${skillCost(actor, false)}`));
  const player = state.players[actor.owner];
  return (
    <section className="actions command-console">
      <h2>輪到 <span className={actor.owner}>{sideName(actor.owner)} {actor.name}</span></h2>
      <div className="action-grid">
        <button data-smoke="action-attack" aria-keyshortcuts="A" onClick={onRequestAttack} disabled={!own || actor.flags.noAttack}><span className="command-label">攻擊</span><span className="command-note">指定敵方，造成 ATK {currentAtk(actor)} 傷害{actor.id === "liewu" ? `｜戰意 ${liewuIntent}/3 最多消耗 1` : ""}</span></button>
        <button data-smoke="action-skill" aria-keyshortcuts="S" onClick={() => onOpenDialog("skill")} disabled={!own || !canSkill}><span className="command-label">技能</span><span className="command-note">{actor.skill.name}｜{skillHint}</span></button>
        <button data-smoke="action-defend" aria-keyshortcuts="D" onClick={onDefend} disabled={!own || actor.flags.noDefend}><span className="command-label">防禦</span><span className="command-note">本次受傷 -2，並免疫下一個負面狀態</span></button>
        <button data-smoke="action-rest" aria-keyshortcuts="R" onClick={onRest} disabled={!own}><span className="command-label">休息</span><span className="command-note">回復 1 HP，移除 1 個負面狀態</span></button>
        <button data-smoke="action-judgement" aria-keyshortcuts="J" className="judgement-action" onClick={() => onOpenDialog("judgement")} disabled={!own || player.judgementUsed || player.marks < 1}><span className="command-label">裁定</span><span className="command-note">目前 {player.marks}/3，可補傷害、提速或救場</span></button>
      </div>
      {showBattleHints ? <p className="quick-tip">{own ? actionHint(actor) : "等待對方操作，這邊會自動同步最新戰況。"}</p> : null}
      {showBattleHints ? <StatusHelp fighter={actor} /> : null}
    </section>
  );
}

function SkillPanel({ fighter, state }: { fighter: Fighter | null; state: GameState }) {
  if (!fighter) return <div className="skill-panel"><div className="skill-panel-head"><span>技能面板</span></div><p className="desc">選擇角色後顯示技能、共鳴與被動。</p></div>;
  const player = state.players?.[fighter.owner];
  const currentCost = fighter.hpNow > 0 ? skillCost(fighter, false) : fighter.skill.cost;
  return (
    <div className="skill-panel">
      <div className="skill-panel-head">
        <span>{fighter.name} 技能面板</span>
        <span className={`pill ${fighter.owner}`}>{sideName(fighter.owner)}</span>
      </div>
      <div className="skill-list">
        <div className="skill-entry skill-entry-main">
          <div className="row">
            <strong>{fighter.skill.name}</strong>
            <span className="pill">HP {fighter.hpNow}/{fighter.maxHp}</span>
            <span className="pill red">ATK {currentAtk(fighter)}</span>
            <span className="pill blue">SPD {currentSpd(fighter)}</span>
            <span className="pill blue">費用 {currentCost}</span>
            <span className="pill gold">冷卻 {fighter.cd}/{fighter.skill.cd}</span>
            {player ? <span className="pill">能量 {player.energy}/6</span> : null}
            {player ? <span className="pill gold">共鳴 {player.resUsed}/{RULES.RESONANCE_PER_ROUND}</span> : null}
            {fighter.id === "liewu" ? <span className="pill red">目前戰意 {fighter.flags.battleIntent || 0}/3</span> : null}
          </div>
          <SkillBreakdown fighter={fighter} player={player} />
          <NegativeEffectPanel fighter={fighter} />
        </div>
        <div className="skill-entry passive-entry">
          <div className="row"><strong>被動</strong><span className="pill">常駐</span></div>
          <p>{fighter.passive}</p>
        </div>
      </div>
    </div>
  );
}

function StatusHelp({ fighter }: { fighter: Fighter }) {
  const rows = fighter.statuses.map(status => [statusLabel(fighter, status), STATUS_META[status]?.desc || status]);
  for (const mark of specialMarkNames(fighter).reverse()) rows.unshift([mark, STATUS_META[mark]?.desc || "特殊標記。"]);
  if (fighter.flags.defended) rows.unshift(["防禦", "本回合受傷 -2，並免疫下一個負面狀態。"]);
  if (fighter.flags.liewuGuardReady) rows.unshift(["收勢護身", "本回合首次受到傷害時，該次傷害 -2。"]);
  if (fighter.id === "liewu") rows.unshift(["戰意", `目前 ${fighter.flags.battleIntent || 0}/3。2 層可施放收勢護身；普攻時最多消耗 1 層，對同一目標追加 1 傷害。`]);
  if (fighter.id === "qiheng") rows.unshift(["代價轉衡", "技能需同時選擇我方代價來源與敵方目標；代價失去 HP 不視為受到傷害，也不能擊倒來源。"]);
  if (fighter.id === "shili") rows.unshift(["腐蝕", "腐蝕是負面狀態，最多 2 層；受到治療時治療量 -1，治療後移除 1 層。"]);
  if (fighter.id === "fengxing") rows.unshift(["星線 / 縫線", "星線是我方標記，不改變目標；縫線是負面狀態，會懲罰指定 HP 最低角色造成傷害的敵人。"]);
  if (fighter.flags.noAttack) rows.unshift(["禁攻", "本次行動不能攻擊。"]);
  if (!rows.length) return null;
  return <div className="status-help">{rows.map(([name, desc]) => <div key={name} className="status-help-row"><b>{name}</b><span>{desc}</span></div>)}</div>;
}

function actionHint(actor: Fighter) {
  const tips: string[] = [];
  if (actor.hpNow <= Math.ceil(actor.maxHp / 3)) tips.push("HP 偏低，可考慮防禦、休息或使用治癒技能。");
  if (actor.id === "liewu") tips.push(`裂舞目前戰意 ${actor.flags.battleIntent || 0}/3；2 層可施放收勢護身，普攻最多消耗 1 層追加 1 傷害。`);
  if (actor.id === "qiheng") tips.push("祈衡技能要先選代價來源與失去 HP，再指定敵方目標；失去 3 HP 會使代價來源本回合下次受傷 +1。");
  if (actor.id === "shili") tips.push("蝕璃適合壓制治療角色；腐蝕會讓治療量 -1 並逐層移除。");
  if (actor.id === "fengxing") tips.push("縫星靠星線預判敵方集火，技能縫線會懲罰打我方最低 HP 的敵人。");
  if (actor.cd <= 0) tips.push("技能可用時，先確認能量與共鳴次數。");
  else tips.push(`技能冷卻 ${actor.cd}，可用普攻、防禦或休息推進回合。`);
  return tips.join(" ");
}

function battleFightersForCheck(state: GameState) {
  if (!state.players) return [];
  return SIDES.flatMap(side => state.players?.[side].team || []);
}

function collectRuleWarnings(state: GameState) {
  const warnings: { level: "warn" | "error"; title: string; detail: string }[] = [];
  const push = (level: "warn" | "error", title: string, detail: string) => warnings.push({ level, title, detail });
  if (state.screen !== "battle" || !state.players) return warnings;

  const fighters = battleFightersForCheck(state);
  for (const side of SIDES) {
    const player = state.players[side];
    if (!player) {
      push("error", `${sideName(side)} missing`, "Player state is missing.");
      continue;
    }
    if (player.team.length !== RULES.TEAM_SIZE) push("error", `${sideName(side)} team size`, `Expected ${RULES.TEAM_SIZE}, got ${player.team.length}.`);
    if (player.energy < 0 || player.energy > RULES.ENERGY_MAX) push("error", `${sideName(side)} energy`, `Energy out of range: ${player.energy}/${RULES.ENERGY_MAX}.`);
    if (player.marks < 0 || player.marks > RULES.JUDGEMENT_MAX) push("error", `${sideName(side)} judgement`, `Judgement mark out of range: ${player.marks}/${RULES.JUDGEMENT_MAX}.`);
    if (player.resUsed < 0 || player.resUsed > RULES.RESONANCE_PER_ROUND) push("warn", `${sideName(side)} resonance`, `Resonance count is ${player.resUsed}/${RULES.RESONANCE_PER_ROUND}.`);
  }

  const validStatuses = new Set(Object.values(STATUS));
  const debtHolders = fighters.filter(fighter => fighter.flags?.debtMark);
  if (debtHolders.length > 1) push("error", "Debt marker count", `Only one debt marker may exist, found ${debtHolders.length}.`);
  const songyaAlive = fighters.some(fighter => fighter.id === "songya" && fighter.hpNow > 0);
  if (!songyaAlive && debtHolders.length) push("error", "Debt after Songya KO", "Debt markers must be removed when Songya is knocked out.");
  const starHolders = fighters.filter(fighter => fighter.flags?.starLine);
  if (starHolders.length > 1) push("error", "Star line count", `Only one star line may exist, found ${starHolders.length}.`);

  for (const fighter of fighters) {
    if (fighter.hpNow < 0 || fighter.hpNow > fighter.maxHp) push("error", fighter.name, `HP out of range: ${fighter.hpNow}/${fighter.maxHp}.`);
    if (fighter.cd < 0) push("error", fighter.name, `Cooldown is negative: ${fighter.cd}.`);
    if (fighter.id === "liewu" && ((fighter.flags.battleIntent || 0) < 0 || (fighter.flags.battleIntent || 0) > 3)) push("error", fighter.name, `Battle intent out of range: ${fighter.flags.battleIntent}/3.`);
    if ((fighter.flags.corrosionStacks || 0) > 2) push("error", fighter.name, `Corrosion stacks out of range: ${fighter.flags.corrosionStacks}/2.`);
    if ((fighter.flags.corrosionStacks || 0) > 0 && !fighter.statuses.includes(STATUS.CORROSION)) push("warn", fighter.name, "Corrosion stacks exist without corrosion status.");
    if (fighter.statuses.includes(STATUS.STITCH) && !fighter.flags.stitchMark) push("warn", fighter.name, "Stitch status exists without stitch marker metadata.");
    const uniqueStatuses = new Set(fighter.statuses);
    if (uniqueStatuses.size !== fighter.statuses.length) push("warn", fighter.name, "Duplicate statuses detected.");
    for (const status of fighter.statuses) {
      if (!validStatuses.has(status)) push("error", fighter.name, `Unknown status: ${status}.`);
    }
    if (fighter.hpNow <= 0 && fighter.statuses.length) push("warn", fighter.name, "Knocked-out fighter still has statuses.");
  }

  const aliveKeys = new Set(fighters.filter(fighter => fighter.hpNow > 0).map(fighter => fighterKey(fighter.owner, fighter.id)));
  const queueKeys = state.queue.map(item => fighterKey(item.side, item.id));
  for (const key of queueKeys) {
    if (!aliveKeys.has(key)) push("warn", "Queue reference", `Queue references non-active fighter ${key}.`);
  }
  if (new Set(queueKeys).size !== queueKeys.length) push("warn", "Queue duplicate", "The action queue contains duplicate fighter entries.");

  const pendingCount = [
    state.pendingDebt,
    state.pendingQihengBalance,
    state.pendingFengxingStar,
    state.pendingTianxunFocus,
    state.pendingTimeTax,
    state.pendingLiewuCombo,
    state.pendingMirror,
    state.pendingSkill,
    state.pendingConfuseAttack
  ].filter(Boolean).length;
  if (pendingCount > 1) push("error", "Pending decisions", `Multiple pending decisions are active: ${pendingCount}.`);
  return warnings;
}

function pendingLabel(state: GameState) {
  if (state.pendingQihengBalance) return "祈衡均衡刻度";
  if (state.pendingFengxingStar) return "縫星星線設置";
  if (state.pendingTianxunFocus) return "天訊加速指定";
  if (state.pendingDebt) return "欠條指定";
  if (state.pendingTimeTax) return "時間稅指定";
  if (state.pendingLiewuCombo) return "裂舞戰意連段";
  if (state.pendingMirror) return "鏡刃全域鏡返";
  if (state.pendingSkill) return "伊諾干涉";
  if (state.pendingConfuseAttack) return "混亂目標";
  return "";
}

function resolutionSteps(state: GameState) {
  const activeName = state.active ? byId(state.active.id)?.name || state.active.id : "";
  const pending = pendingLabel(state);
  const winner = sideName(state.winner || "");
  return [
    { title: "回合開始", detail: `回合 ${state.round || 0}：能量、冷卻、共鳴次數重置。`, active: !state.active && !pending && !state.winner },
    { title: "行動者確認", detail: activeName ? `${sideName(state.active!.side)} ${activeName}` : "目前沒有行動者。", active: !!state.active && !pending },
    { title: "待決選擇", detail: pending || "沒有待決選擇。", active: !!pending },
    { title: "目標與替代承傷", detail: "指定目標後依序檢查守護、衡朔替代、鏡刃鏡返與混亂目標。", active: false },
    { title: "數值修正", detail: "傷害依序套用觀測、一次性受傷修正、防禦、裁定減傷、開局防線與特殊上限；治癒會先檢查腐蝕。", active: false },
    { title: "狀態 / 擊倒 / 行動後", detail: "套用狀態、治癒、擊倒、欠條、星線與縫線結算，然後推進下一名行動者。", active: false },
    { title: "勝利檢查", detail: winner ? `${winner} 已勝利。` : "雙方仍有存活角色。", active: !!state.winner }
  ];
}

function DeveloperRulesPanel({ state }: { state: GameState }) {
  const warnings = collectRuleWarnings(state);
  const steps = resolutionSteps(state);
  return (
    <section className="dev-rules-panel" aria-label="Developer rule checker">
      <div className="dev-panel-head">
        <div><span className="pill gold">DEV ONLY</span><h2>開發者規則檢查器</h2></div>
        <span className={`pill ${warnings.length ? "red" : "good"}`}>{warnings.length ? `${warnings.length} warnings` : "clean"}</span>
      </div>
      <div className="dev-grid">
        <div className="dev-check-list">
          <h3>違規警告</h3>
          {warnings.length ? warnings.map((warning, index) => (
            <article key={`${warning.title}:${index}`} className={`dev-warning ${warning.level}`}>
              <b>{warning.title}</b><p>{warning.detail}</p>
            </article>
          )) : <p className="dev-empty">目前沒有偵測到規則狀態異常。</p>}
        </div>
        <div className="resolution-visualizer">
          <h3>結算順序可視化</h3>
          <div className="resolution-steps">
            {steps.map((step, index) => (
              <article key={step.title} className={`resolution-step ${step.active ? "active" : ""}`}>
                <span>{index + 1}</span><div><b>{step.title}</b><p>{step.detail}</p></div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SurrenderPanel({ state, net, onSurrender }: { state: GameState; net: NetState; onSurrender: (side: Side) => void }) {
  if (net.mode === "online") return <details className="danger-zone"><summary>對戰控制</summary><div className="surrender-grid"><button className="bad surrender-button" onClick={() => onSurrender(net.seat as Side)} disabled={!net.seat}><span>{net.seat ? `${net.seat.toUpperCase()} 投降` : "尚未入座"}</span><small>線上座位</small></button></div></details>;
  const activeSide = state.active?.side || "p1";
  const otherSide = other(activeSide);
  return <details className="danger-zone"><summary>對戰控制</summary><div className="surrender-grid"><button className="bad surrender-button" onClick={() => onSurrender(activeSide)}><span>{sideName(activeSide)} 投降</span><small>當前方</small></button><button className="bad surrender-button" onClick={() => onSurrender(otherSide)}><span>{sideName(otherSide)} 投降</span><small>另一方</small></button></div></details>;
}

function Log({ state }: { state: GameState }) {
  return <section className="log"><h2>戰鬥紀錄</h2>{battleLogLines(state).slice().reverse().map((line, index) => <div key={`${index}:${line}`} className={`log-line ${isImpactLog(line) ? "impact" : ""}`}>{line}</div>)}</section>;
}

function battleLogStartIndex(logs: string[]) {
  const battleStart = logs.findIndex(line => line.includes("戰鬥開始"));
  if (battleStart >= 0) return battleStart;
  const firstRound = logs.findIndex(line => /第\s*1\s*回合開始/.test(line));
  return firstRound >= 0 ? firstRound : 0;
}

function isBattleMetaLog(line: string) {
  return line.includes("已完成自動裁定") || line.includes("自動裁定完成");
}

function battleLogLines(state: GameState) {
  if (state.screen !== "battle") return state.logs;
  return state.logs.slice(battleLogStartIndex(state.logs)).filter(line => !isBattleMetaLog(line));
}

function isImpactLog(line: string) {
  return /造成|擊倒|混亂發作|戰意|裁定|共鳴/.test(line);
}

function BattleLogDock({ state }: { state: GameState }) {
  const [expanded, setExpanded] = useState(false);
  const currentLogs = battleLogLines(state);
  const lines = currentLogs.map((line, index) => ({ line, number: index + 1 })).reverse();
  const visibleLines = expanded ? lines : lines.slice(0, 8);
  return (
    <section className={`battle-log-dock ${expanded ? "expanded" : ""}`} aria-label="戰鬥紀錄">
      <div className="battle-log-head">
        <h2>戰鬥紀錄</h2>
        <div className="battle-log-tools">
          <span>{state.logs.length ? `${expanded ? "完整" : "最近"} ${visibleLines.length}/${state.logs.length} 筆` : "尚無紀錄"}</span>
          <button onClick={() => setExpanded(value => !value)}>{expanded ? "收合" : "展開"}</button>
        </div>
      </div>
      <div className="battle-log-list">
        {visibleLines.map(({ line, number }) => (
          <div key={`${number}:${line}`} className={`battle-log-item ${isImpactLog(line) ? "impact" : ""}`}>
            <span className="battle-log-number">{number}</span>
            <p>{line}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Dialog({ type, snapshot, onClose, onAttack, onUseSkill, onJudgement }: { type: DialogType; snapshot: GameSnapshot; onClose: () => void; onAttack: (key: string) => void; onUseSkill: UseSkillHandler; onJudgement: (type: string, key?: string) => void }) {
  const actor = rulesActiveF(snapshot) as Fighter | null;
  if (!type || !actor) return null;
  if (type === "attack") return <Modal title="選擇攻擊目標" onClose={onClose}><div className="choice-grid">{rulesTargetList(snapshot, actor.statuses.includes(STATUS.CONFUSE) ? "all" : "enemy").map(target => <button key={target.key} className="choice" onClick={() => onAttack(target.key)}><span className="choice-title">{sideName(target.side)} {target.c.name}</span><StatChips fighter={target.c} compact />{specialMarkNames(target.c).map(mark => <StatusPill key={mark} status={mark} compact />)}</button>)}</div></Modal>;
  if (type === "judgement") return <JudgementDialog snapshot={snapshot} onClose={onClose} onJudgement={onJudgement} />;
  return <SkillDialog actor={actor} snapshot={snapshot} onClose={onClose} onUseSkill={onUseSkill} />;
}

function JudgementDialog({ snapshot, onClose, onJudgement }: { snapshot: GameSnapshot; onClose: () => void; onJudgement: (type: string, key?: string) => void }) {
  const actor = rulesActiveF(snapshot) as Fighter | null;
  const player = actor ? snapshot.state.players?.[actor.owner] : null;
  const renderButton = (guide: typeof JUDGEMENT_GUIDE[number], target?: TargetEntry) => {
    const disabled = !player || player.marks < guide.cost;
    const name = target?.c?.name;
    const title = guide.scope === "self" ? `${guide.cost} 裁定：${guide.label}` : `${guide.cost} 裁定：${name} ${guide.label}`;
    return (
      <button key={`${guide.type}:${target?.key || "self"}`} className="choice judgement-choice" disabled={disabled} onClick={() => onJudgement(guide.type, target?.key)}>
        <span className="choice-title">{title}</span>
        {target?.c ? <StatChips fighter={target.c} compact /> : null}
        <p className="desc">{guide.desc}</p>
      </button>
    );
  };
  return (
    <Modal title="裁定" onClose={onClose}>
      <div className="dialog-section judgement-primer">
        <h3>本回合裁定</h3>
        <p className="desc">目前 {sideName(actor?.owner || "")} 裁定 {player?.marks ?? 0}/{RULES.JUDGEMENT_MAX}。每方每回合最多使用 1 次裁定。</p>
      </div>
      <div className="choice-grid">
        {JUDGEMENT_GUIDE.filter(guide => guide.scope === "self").map(guide => renderButton(guide))}
        {JUDGEMENT_GUIDE.filter(guide => guide.scope === "ally").flatMap(guide => rulesTargetList(snapshot, "ally").map(target => renderButton(guide, target)))}
        {JUDGEMENT_GUIDE.filter(guide => guide.scope === "enemy").flatMap(guide => rulesTargetList(snapshot, "enemy").map(target => renderButton(guide, target)))}
      </div>
    </Modal>
  );
}

function SkillDialog({ actor, snapshot, onClose, onUseSkill }: { actor: Fighter; snapshot: GameSnapshot; onClose: () => void; onUseSkill: UseSkillHandler }) {
  const [res, setRes] = useState(false);
  const [choices, setChoices] = useState<string[]>([]);
  const player = snapshot.state.players?.[actor.owner];
  const resDisabled = !player || player.resUsed >= RULES.RESONANCE_PER_ROUND || !alive(player.team).some(fighter => fighter.id !== actor.id);
  const filter = skillTargetFilter(snapshot, actor);
  const targets = rulesTargetList(snapshot, filter);
  const allyTargets = rulesTargetList(snapshot, "ally");
  const enemyTargets = rulesTargetList(snapshot, "enemy");
  const firstCostSource = allyTargets.find(target => target.c.hpNow > 1)?.key || "";
  const [qihengSourceKey, setQihengSourceKey] = useState(firstCostSource);
  const [qihengEnemyKey, setQihengEnemyKey] = useState(enemyTargets[0]?.key || "");
  const [qihengLoss, setQihengLoss] = useState(1);
  const qihengSource = allyTargets.find(target => target.key === qihengSourceKey)?.c;
  const qihengMaxLoss = qihengSource ? Math.min(3, qihengSource.hpNow - 1) : 0;
  const qihengSafeLoss = Math.min(qihengLoss, Math.max(0, qihengMaxLoss));
  const resReason = resDisabled ? (player?.resUsed >= RULES.RESONANCE_PER_ROUND ? "本回合共鳴次數已達上限。" : "需要至少 1 名其他我方角色存活。") : `勾選後技能總費用：${skillCost(actor, true)} 能量。`;
  const toggleChoice = (value: string) => setChoices(prev => prev.includes(value) ? prev.filter(item => item !== value) : [...prev, value]);
  const maxQihengLossFor = (fighter: Fighter) => Math.min(3, Math.max(0, fighter.hpNow - 1));
  const chooseQihengSource = (target: TargetEntry) => {
    const nextMax = maxQihengLossFor(target.c);
    setQihengSourceKey(target.key);
    setQihengLoss(current => Math.min(Math.max(1, current), Math.max(1, nextMax)));
  };
  useEffect(() => {
    if (actor.id !== "qiheng") return;
    setQihengLoss(current => Math.min(Math.max(1, current), Math.max(1, qihengMaxLoss)));
  }, [actor.id, qihengMaxLoss]);

  return (
    <Modal title={actor.skill.name} onClose={onClose}>
      <div className="dialog-section"><h3>技能資訊</h3><div className="skill-meta"><span className="pill">消耗 {skillCost(actor, false)} 能量</span><span className="pill">冷卻 {actor.skill.cd}</span><span className="pill">目前能量 {player?.energy ?? 0}/6</span><span className="pill gold">本回合共鳴 {player?.resUsed ?? 0}/{RULES.RESONANCE_PER_ROUND}</span>{actor.id === "liewu" ? <span className="pill red">目前戰意 {actor.flags.battleIntent || 0}/3</span> : null}</div></div>
      <div className="dialog-section skill-overview"><h3>效果解析</h3><SkillBreakdown fighter={actor} player={player} previewResonance={res} />{actor.id === "liewu" ? <NegativeEffectPanel fighter={actor} /> : null}</div>
      {actor.id === "jingren" ? <button onClick={() => onUseSkill(`${actor.owner}:${actor.id}`, {})}>施放影步守勢</button> : null}
      {actor.id !== "jingren" ? <div className="dialog-section resonance-box"><h3>共鳴</h3><label className="row"><input type="checkbox" disabled={resDisabled} checked={res} onChange={event => setRes(event.target.checked)} style={{ width: "auto" }} /> 使用共鳴：{actor.res.name}</label><p className="skill-desc"><b>{actor.res.name}</b>：{actor.res.desc}</p><p className="desc">{resReason}</p></div> : null}
      {actor.id === "tianxun" ? <><div className="dialog-section"><h3>選擇效果</h3><div className="choice-grid">{[["atk", "普攻傷害 +1"], ["skill", "技能傷害 +1"], ["spd", "我方全體 SPD +1"], ["low", "最低 SPD 先行動"]].map(([value, label]) => <label key={value} className="choice"><input type="checkbox" checked={choices.includes(value)} onChange={() => toggleChoice(value)} /> <span className="choice-title">{label}</span></label>)}</div></div><button onClick={() => onUseSkill(null, { res, choices })}>施放</button></> : null}
      {actor.id === "baidengling" ? <button onClick={() => onUseSkill(null, { res })}>施放希望微光</button> : null}
      {actor.id === "dengzhen" ? <div className="dialog-section"><h3>選擇目標</h3><div className="choice-grid">{targets.map(target => <div key={target.key} className="choice"><span className="choice-title">{sideName(target.side)} {target.c.name}</span><StatChips fighter={target.c} compact /><div className="row" style={{ marginTop: 12 }}><button onClick={() => onUseSkill(target.key, { mode: "up", res })}>SPD +2</button><button onClick={() => onUseSkill(target.key, { mode: "down", res })}>SPD -2</button></div></div>)}</div></div> : null}
      {actor.id === "qiheng" ? (
        <div className="dialog-section qiheng-skill-builder">
          <section className="qiheng-step">
            <h3>代價來源</h3>
            <p className="desc">選擇我方角色失去 1～3 HP；代價不視為受到傷害，且不能使來源被擊倒。</p>
            <div className="choice-grid qiheng-choice-grid">
              {allyTargets.map(target => (
                <button key={target.key} type="button" aria-pressed={qihengSourceKey === target.key} className={`choice ${qihengSourceKey === target.key ? "selected" : ""}`} disabled={target.c.hpNow <= 1} onClick={() => chooseQihengSource(target)}>
                  {qihengSourceKey === target.key ? <span className="choice-check">已選</span> : null}
                  <span className="choice-title">{sideName(target.side)} {target.c.name}</span>
                  <StatChips fighter={target.c} compact />
                </button>
              ))}
            </div>
          </section>
          <section className="qiheng-step">
            <div className="qiheng-step-head"><h3>失去 HP</h3><span>目前選擇：失去 {qihengSafeLoss || qihengLoss} HP</span></div>
            <div className="qiheng-loss-grid">
              {[1, 2, 3].map(loss => (
                <button key={loss} type="button" disabled={loss > qihengMaxLoss} aria-pressed={qihengSafeLoss === loss} className={`qiheng-loss-button ${qihengSafeLoss === loss ? "selected" : ""}`} onClick={() => setQihengLoss(loss)}>
                  {qihengSafeLoss === loss ? <span className="choice-check">已選</span> : null}
                  <span>失去 {loss} HP</span>
                  {loss > qihengMaxLoss ? <small>來源血量不足</small> : loss === 3 ? <small>來源下次受傷 +1</small> : null}
                </button>
              ))}
            </div>
          </section>
          <section className="qiheng-step">
            <h3>敵方目標</h3>
            <div className="choice-grid qiheng-choice-grid">
              {enemyTargets.map(target => (
                <button key={target.key} type="button" aria-pressed={qihengEnemyKey === target.key} className={`choice ${qihengEnemyKey === target.key ? "selected" : ""}`} onClick={() => setQihengEnemyKey(target.key)}>
                  {qihengEnemyKey === target.key ? <span className="choice-check">已選</span> : null}
                  <span className="choice-title">{sideName(target.side)} {target.c.name}</span>
                  <StatChips fighter={target.c} compact />
                </button>
              ))}
            </div>
          </section>
          <div className="qiheng-submit-row">
            <button type="button" disabled={!qihengSource || !qihengEnemyKey || qihengSafeLoss < 1} onClick={() => onUseSkill(qihengEnemyKey, { res, qihengSourceKey, qihengLoss: qihengSafeLoss })}>施放代價轉衡</button>
          </div>
        </div>
      ) : null}
      {!["jingren", "tianxun", "baidengling", "dengzhen", "qiheng"].includes(actor.id) ? <div className="dialog-section"><h3>選擇目標</h3><div className="choice-grid">{targets.length ? targets.map(target => <button key={target.key} className="choice" onClick={() => onUseSkill(target.key, { res })}><span className="choice-title">{sideName(target.side)} {target.c.name}</span><StatChips fighter={target.c} compact />{specialMarkNames(target.c).map(mark => <StatusPill key={mark} status={mark} />)}</button>) : <button onClick={() => onUseSkill(null, { res })}>不需目標，直接施放</button>}</div></div> : null}
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") || []).filter(item => !item.hasAttribute("disabled"));
    window.requestAnimationFrame(() => {
      const first = focusable()[0];
      first?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [onClose]);
  return <div className="modal" role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog" role="dialog" aria-modal="true" aria-label={title} data-smoke="modal" ref={dialogRef}><div className="row dialog-head"><h2>{title}</h2><button onClick={onClose}>關閉</button></div><div className="dialog-body">{children}</div></section></div>;
}
