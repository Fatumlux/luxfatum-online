import type { CharacterCard, Fighter, GameSnapshot, GameState, RuleActionKind, RuleActionOptions, RuleActionResult, RuleSource, Side, SkillFilter, TargetEntry } from "./types";

type RuleSnapshot = GameSnapshot | { state: GameState } | null | undefined;
type DamageOptions = RuleActionOptions & { label?: string; attack?: boolean; skill?: boolean; stitchTrap?: boolean; zuozhePassive?: boolean; mirrorReflect?: boolean };
type KnockoutContext = { marksBeforeDamage?: number; mirrorReflect?: boolean; zuozhePassive?: boolean };

export const STATUS = {
  SEAL: "封印",
  OBSERVE: "觀測",
  CONFUSE: "混亂",
  SLOW: "遲緩",
  GUARD: "守護",
  TIME_TAX: "時間稅",
  DELAY: "延滯",
  CORROSION: "腐蝕",
  STITCH: "縫線"
};

export const NEGATIVE_STATUSES = [STATUS.SEAL, STATUS.OBSERVE, STATUS.CONFUSE, STATUS.SLOW, STATUS.TIME_TAX, STATUS.DELAY, STATUS.CORROSION, STATUS.STITCH];

export const RULES = {
  TEAM_SIZE: 3,
  ENERGY_START: 1,
  ENERGY_MAX: 6,
  ENERGY_PER_ROUND: 2,
  BATTLE_HP_BONUS: 1,
  JUDGEMENT_START: 0,
  JUDGEMENT_MAX: 3,
  RESONANCE_PER_ROUND: 2,
  LOG_MAX: 2000
};

const SIDES: Side[] = ["p1", "p2"];
const CONFUSE_FRIENDLY_DAMAGE_CAP = 2;

export function readGameSnapshot() {
  if (typeof window.LuxFatumGameSnapshot !== "function") return null;
  return window.LuxFatumGameSnapshot();
}

export function getBattleTeams(snapshot) {
  const players = snapshot?.state?.players;
  if (players?.p1?.team && players?.p2?.team) {
    return {
      p1: players.p1.team,
      p2: players.p2.team
    };
  }

  const chars = snapshot?.chars || [];
  return {
    p1: chars.slice(0, RULES.TEAM_SIZE).map(card => createFighter(card, "p1")),
    p2: chars.slice(RULES.TEAM_SIZE, RULES.TEAM_SIZE * 2).map(card => createFighter(card, "p2"))
  };
}

export function getActiveKey(snapshot) {
  const active = snapshot?.state?.active;
  return active ? `${active.side}:${active.id}` : "";
}

export function installRulesBridge() {
  if (typeof window === "undefined" || window.LuxFatumRules?.version === "5.0.0-rules") return;

  const bridge = {
    version: "5.0.0-rules",
    STATUS,
    RULES,
    startBattle: () => {
      const result = startBattle(readGameSnapshot());
      commitBridge(result);
    },
    nextRound: () => {
      nextRound(readGameSnapshot());
      commitBridge({ ok: true });
    },
    buildQueue: () => buildQueue(readGameSnapshot()),
    afterAction: () => {
      finishAction(readGameSnapshot());
      commitBridge({ ok: true });
    },
    endRound: () => {
      endRound(readGameSnapshot());
      commitBridge({ ok: true });
    },
    requestAttack: () => {
      const result = requestAttack(readGameSnapshot());
      if (result.openDialog) window.openDialog?.("attack");
      else commitBridge(result);
    },
    attack: targetKey => {
      const result = attack(readGameSnapshot(), targetKey);
      if (result.actionSpent) finishAction(readGameSnapshot());
      closeAndCommit(result);
    },
    decideConfuseAttack: targetKey => {
      const result = decideConfuseTarget(readGameSnapshot(), targetKey);
      if (result.actionSpent) finishAction(readGameSnapshot());
      closeAndCommit(result);
    },
    decideMirror: useReflect => {
      const result = decideMirror(readGameSnapshot(), useReflect);
      if (result.actionSpent) finishAction(readGameSnapshot());
      closeAndCommit(result);
    },
    decideTimeTax: targetKey => {
      const result = decideTimeTax(readGameSnapshot(), targetKey);
      closeAndCommit(result);
    },
    decideDebt: (targetKey, skip = false) => {
      const result = decideDebt(readGameSnapshot(), targetKey, skip);
      closeAndCommit(result);
    },
    decideQihengBalance: useBalance => {
      const result = decideQihengBalance(readGameSnapshot(), useBalance);
      closeAndCommit(result);
    },
    decideFengxingStar: (targetKey, useResonance = false) => {
      const result = decideFengxingStar(readGameSnapshot(), targetKey, useResonance);
      closeAndCommit(result);
    },
    decideLiewuCombo: useCombo => {
      const result = decideLiewuCombo(readGameSnapshot(), useCombo);
      if (result.actionSpent) finishAction(readGameSnapshot());
      closeAndCommit(result);
    },
    useSkill: (targetKey, opts = {}) => {
      const result = useSkill(readGameSnapshot(), targetKey, opts);
      if (result.pending) commitBridge(result);
      else if (result.actionSpent) finishAction(readGameSnapshot());
      closeAndCommit(result);
    },
    decideIno: useInterference => {
      const result = decideIno(readGameSnapshot(), useInterference);
      if (result.actionSpent) finishAction(readGameSnapshot());
      closeAndCommit(result);
    },
    defend: () => {
      const result = defend(readGameSnapshot());
      if (result.actionSpent) finishAction(readGameSnapshot());
      closeAndCommit(result);
    },
    rest: () => {
      const result = rest(readGameSnapshot());
      if (result.actionSpent) finishAction(readGameSnapshot());
      closeAndCommit(result);
    },
    judgement: (type, targetKey) => {
      const result = judgement(readGameSnapshot(), type, targetKey);
      closeAndCommit(result);
    },
    skillCost: (actor, resonance = false) => skillCost(actor, resonance),
    skillCostWithResonance: actor => skillCost(actor, true),
    activeF: () => activeF(readGameSnapshot()),
    currentAtk,
    currentSpd,
    targetList: filter => targetList(readGameSnapshot(), filter),
    skillFilter,
    confusionTargets: (actor, action) => confusionTargets(readGameSnapshot(), actor, action),
    heal: (target, amount, source) => heal(readGameSnapshot(), target, amount, source),
    damage: (source, target, amount, opts = {}) => damage(readGameSnapshot(), source, target, amount, opts),
    addStatus: (source, target, status) => addStatus(readGameSnapshot(), source, target, status)
  };

  window.LuxFatumRules = bridge;
  for (const key of [
    "startBattle",
    "nextRound",
    "buildQueue",
    "afterAction",
    "endRound",
    "requestAttack",
    "attack",
    "decideConfuseAttack",
    "decideMirror",
    "decideTimeTax",
    "decideDebt",
    "decideQihengBalance",
    "decideFengxingStar",
    "decideLiewuCombo",
    "useSkill",
    "decideIno",
    "defend",
    "rest",
    "judgement",
    "skillCost",
    "activeF",
    "currentAtk",
    "currentSpd",
    "targetList",
    "skillFilter",
    "confusionTargets"
  ]) {
    window[key] = bridge[key];
  }
}

function closeAndCommit(result) {
  if (result?.closeDialog !== false) window.closeDialog?.();
  commitBridge(result);
}

function commitBridge(result) {
  if (!result) return;
  if (typeof window.commit === "function") window.commit();
  else if (typeof window.render === "function") window.render();
}

export function startBattle(snapshot) {
  const state = getState(snapshot);
  const chars = snapshot?.chars || [];
  if (!state) return { ok: false, reason: "no-state" };

  const p1Draft = uniqueIds(state.p1Draft).slice(0, RULES.TEAM_SIZE);
  const p2Draft = uniqueIds(state.p2Draft).slice(0, RULES.TEAM_SIZE);
  if (p1Draft.length !== RULES.TEAM_SIZE || p2Draft.length !== RULES.TEAM_SIZE) {
    log(state, `規則錯誤：雙方必須各選 ${RULES.TEAM_SIZE} 名角色才能開戰。`);
    return { ok: false, reason: "invalid-team-size" };
  }

  state.players = {
    p1: createPlayer("p1", p1Draft, chars),
    p2: createPlayer("p2", p2Draft, chars)
  };
  state.screen = "battle";
  state.round = 0;
  state.winner = null;
  state.queue = [];
  state.active = null;
  state.pendingSkill = null;
  state.pendingConfuseAttack = null;
  state.pendingMirror = null;
  state.pendingTianxunFocus = null;
  state.pendingQihengBalance = null;
  state.pendingFengxingStar = null;
  state.pendingTimeTax = null;
  state.pendingDebt = null;
  state.pendingLiewuCombo = null;
  state.lastSkill = null;
  state.lastCopyableSkill = { p1: null, p2: null };
  state.battleStats = null;
  state.lowestFirst = false;
  state.tianAtkBuff = false;
  state.tianSkillDebuff = false;
  ensureBattleStats(state);
  log(state, `戰鬥開始：P1 / P2 各 ${RULES.TEAM_SIZE} 名角色，起始能量 ${RULES.ENERGY_START}，裁定 ${RULES.JUDGEMENT_START}。`);
  nextRound(snapshot);
  return { ok: true };
}

export function nextRound(snapshot) {
  const state = normalizeBattleState(snapshot);
  if (!state || state.winner) return { ok: false };

  state.round = (state.round || 0) + 1;
  state.lowestFirst = false;
  state.tianAtkBuff = false;
  state.tianSkillDebuff = false;
  state.pendingSkill = null;
  state.pendingConfuseAttack = null;
  state.pendingTianxunFocus = null;
  state.pendingQihengBalance = null;
  state.pendingFengxingStar = null;
  state.pendingTimeTax = null;
  state.pendingDebt = null;
  state.pendingLiewuCombo = null;

  log(state, `第 ${state.round} 回合開始。`);
  for (const side of SIDES) {
    const player = state.players[side];
    const before = player.energy;
    player.energy = clamp(player.energy + RULES.ENERGY_PER_ROUND, 0, RULES.ENERGY_MAX);
    player.judgementUsed = false;
    player.resUsed = 0;
    if (state.round === 1) player.openingDefenseUsed = false;
    log(state, `${sideName(side)} 能量 ${before} → ${player.energy}，共鳴次數重置為 0/${RULES.RESONANCE_PER_ROUND}。`);

    for (const fighter of alive(player.team)) {
      startRoundForFighter(state, fighter);
    }
  }

  applyRoundStartPassives(snapshot);
  if (queueTianxunFocusPrompt(state)) return { ok: true, pending: "tianxun-focus" };
  if (queueQihengBalancePrompt(state)) return { ok: true, pending: "qiheng-balance" };
  if (queueFengxingStarPrompt(state)) return { ok: true, pending: "fengxing-star" };
  if (queueDebtPrompt(state)) return { ok: true, pending: "debt" };
  if (queueTimeTaxPrompt(state)) return { ok: true, pending: "time-tax" };
  finalizeRoundStart(snapshot);
  return { ok: true };
}

function finalizeRoundStart(snapshot) {
  const state = normalizeBattleState(snapshot);
  buildQueue(snapshot);
  clearSlowAfterQueue(state);
  setActiveFromQueue(snapshot);
}

export function buildQueue(snapshot) {
  const state = normalizeBattleState(snapshot);
  if (!state?.players) return [];

  const list = [];
  for (const side of SIDES) {
    for (const fighter of alive(state.players[side].team)) {
      list.push({ side, id: fighter.id, spd: currentSpd(fighter), hp: fighter.hpNow });
    }
  }

  list.sort((a, b) => {
    if (state.lowestFirst) return a.spd - b.spd || a.hp - b.hp || tieBreakBySide(state, a, b);
    return b.spd - a.spd || a.hp - b.hp || tieBreakBySide(state, a, b);
  });
  state.queue = list;
  log(state, `行動順序：${list.map(item => `${sideName(item.side)} ${getFighter(state, item.side, item.id)?.name || item.id}(SPD ${item.spd}, HP ${item.hp})`).join(" → ") || "無"}`);
  return list;
}

function allBattleFighters(state) {
  if (!state?.players) return [];
  return SIDES.flatMap(side => state.players[side]?.team || []);
}

function fighterKey(fighter) {
  return fighter ? `${fighter.owner}:${fighter.id}` : "";
}

function ensureBattleStats(state) {
  if (!state?.players) return null;
  const stats = state.battleStats && typeof state.battleStats === "object"
    ? state.battleStats
    : { startedAt: Date.now(), winner: null, victoryMethod: "", totalRounds: 0, lastKnockout: null, fighters: {} };
  if (!stats.fighters || typeof stats.fighters !== "object") stats.fighters = {};
  for (const fighter of allBattleFighters(state)) ensureFighterStats(stats, fighter);
  state.battleStats = stats;
  return stats;
}

function ensureFighterStats(stats, fighter) {
  if (!stats || !fighter) return null;
  const key = fighterKey(fighter);
  if (!stats.fighters[key]) {
    stats.fighters[key] = {
      id: fighter.id,
      side: fighter.owner,
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
    };
  }
  stats.fighters[key].name = fighter.name;
  stats.fighters[key].side = fighter.owner;
  return stats.fighters[key];
}

function addFighterStat(state, fighter, field, amount = 1) {
  if (!fighter || !amount) return;
  const stats = ensureBattleStats(state);
  const row = ensureFighterStats(stats, fighter);
  if (!row) return;
  row[field] = Math.max(0, numberOr(row[field], 0) + amount);
}

function actorFromSource(snapshot: RuleSnapshot, source: RuleSource) {
  if (source && typeof source === "object" && "actor" in source && source.actor) return source.actor;
  if (source && typeof source === "object" && "owner" in source && "id" in source) return source as Fighter;
  const state = getState(snapshot);
  const actor = activeF(snapshot);
  if (!actor) return null;
  const label = sourceLabel(source);
  if (
    label.includes(actor.name)
    || label.includes(actor.skill?.name || "\u0000")
    || label.includes(actor.res?.name || "\u0000")
  ) return actor;
  return null;
}

function sourceLabel(source: RuleSource, fallback = "效果") {
  if (source && typeof source === "object" && "label" in source && source.label) return source.label;
  if (source && typeof source === "object" && "name" in source && source.name) return source.name;
  return String(source || fallback);
}

function recordTargeted(state, source, target) {
  if (!state || !source || !target || source.owner === target.owner) return;
  addFighterStat(state, target, "timesTargeted", 1);
}

function recordDamageEvent(state, source, target, amount) {
  if (!state || !target || amount <= 0) return;
  addFighterStat(state, target, "damageTaken", amount);
  if (source && source.owner !== target.owner) addFighterStat(state, source, "damageDealt", amount);
}

function recordHealEvent(state, source, target, amount) {
  if (!state || !target || amount <= 0) return;
  addFighterStat(state, target, "healingReceived", amount);
  if (source) addFighterStat(state, source, "healingDone", amount);
}

function recordStatusApplied(state, source, target) {
  if (!state || !target) return;
  if (source) addFighterStat(state, source, "statusApplied", 1);
  if (source && source.owner !== target.owner) addFighterStat(state, target, "timesTargeted", 1);
}

function recordStatusRemoved(state, source) {
  if (!state || !source) return;
  addFighterStat(state, source, "statusRemoved", 1);
}

function recordProtection(state, protector, target, preventedDamage = 0) {
  if (!state || !protector || !target || protector.id === target.id) return;
  addFighterStat(state, protector, "protectCount", 1);
  addFighterStat(state, protector, "protectedDamage", Math.max(0, preventedDamage));
}

function recordOneHpSave(state, fighter) {
  addFighterStat(state, fighter, "oneHpSaves", 1);
}

function recordKnockout(state, source, target) {
  if (!state || !target) return;
  const stats = ensureBattleStats(state);
  const actor = source && source.owner !== target.owner ? source : null;
  if (actor) addFighterStat(state, actor, "knockouts", 1);
  stats.lastKnockout = {
    actorKey: actor ? fighterKey(actor) : "",
    actorName: actor?.name || "未知來源",
    targetKey: fighterKey(target),
    targetName: target.name,
    round: state.round || 0
  };
}

function clearTimeTax(state) {
  for (const fighter of allBattleFighters(state)) {
    removeStatus(fighter, STATUS.TIME_TAX);
    fighter.flags.timeTaxMark = null;
  }
}

function addTimeTax(snapshot, source, target) {
  const state = normalizeBattleState(snapshot);
  if (!state || !target) return false;
  clearTimeTax(state);
  const ok = addStatus(snapshot, source, target, STATUS.TIME_TAX);
  const actor = actorFromSource(snapshot, source);
  if (ok && actor) target.flags.timeTaxMark = { owner: actor.owner, actorId: actor.id };
  return ok;
}

function qihengBalancePair(state, side) {
  const team = alive(state.players?.[side]?.team || []);
  if (team.length < 2) return null;
  const highest = [...team].sort((a, b) => b.hpNow - a.hpNow || b.maxHp - a.maxHp || a.id.localeCompare(b.id))[0];
  const lowest = [...team].sort((a, b) => a.hpNow - b.hpNow || a.maxHp - b.maxHp || a.id.localeCompare(b.id))[0];
  if (!highest || !lowest || highest.id === lowest.id) return null;
  if (highest.hpNow - lowest.hpNow < 3) return null;
  if (highest.hpNow <= 1 || lowest.hpNow >= lowest.maxHp) return null;
  return { highest, lowest };
}

function loseHpAsCost(state, fighter, amount, label) {
  if (!state || !fighter || amount <= 0) return 0;
  const before = fighter.hpNow;
  fighter.hpNow = Math.max(1, fighter.hpNow - amount);
  const lost = before - fighter.hpNow;
  if (lost > 0) {
    log(state, `${label}：${fighter.name} 失去 ${lost} HP（${before} → ${fighter.hpNow}）。此失去 HP 不視為受到傷害。`);
    setFx(state, "status", label, `${fighter.name} -${lost} HP`, fighter, fighter);
  }
  return lost;
}

function corrosionStacks(fighter) {
  return clamp(numberOr(fighter?.flags?.corrosionStacks, 0), 0, 2);
}

function addCorrosion(snapshot, source, target) {
  const state = normalizeBattleState(snapshot);
  if (!state || !target || target.hpNow <= 0) return false;
  let sourceActor = actorFromSource(snapshot, source);
  const label = sourceLabel(source, "腐蝕");

  const huiyin = alive(state.players[target.owner].team).find(fighter => fighter.id === "huiyin" && fighter.id !== target.id && !fighter.flags.huiyinUsed);
  if (huiyin) {
    huiyin.flags.huiyinUsed = true;
    log(state, `迴音被動：將 ${target.name} 的腐蝕轉移給自己。`);
    target = huiyin;
  }

  if (target.flags.immuneNextDebuff) {
    target.flags.immuneNextDebuff = false;
    log(state, `${target.name} 的防禦免疫了腐蝕。`);
    return false;
  }

  const before = corrosionStacks(target);
  if (before >= 2) {
    log(state, `${target.name} 腐蝕已達 2 層，${label} 未再增加。`);
    return false;
  }

  target.flags.corrosionStacks = before + 1;
  if (!hasStatus(target, STATUS.CORROSION)) target.statuses.push(STATUS.CORROSION);
  recordStatusApplied(state, sourceActor, target);
  log(state, `${label}：${target.name} 獲得腐蝕 ${target.flags.corrosionStacks}/2。受到治療時治療量 -1，治療後移除 1 層。`);
  setFx(state, "status", "腐蝕", `${target.name} 腐蝕 ${target.flags.corrosionStacks}/2`, sourceActor, target);
  return true;
}

function removeCorrosionLayer(state, target, reason = "治療") {
  const before = corrosionStacks(target);
  if (before <= 0) return false;
  target.flags.corrosionStacks = before - 1;
  if (target.flags.corrosionStacks <= 0) {
    target.flags.corrosionStacks = 0;
    removeStatus(target, STATUS.CORROSION);
  }
  log(state, `${target.name} 的腐蝕因${reason}移除 1 層（${before} → ${target.flags.corrosionStacks}）。`);
  return true;
}

function shiliPassiveAfterHeal(snapshot, target) {
  const state = normalizeBattleState(snapshot);
  if (!state || !target || target.hpNow <= 0) return;
  for (const side of SIDES) {
    if (side === target.owner) continue;
    const shili = alive(state.players[side].team).find(fighter => fighter.id === "shili" && fighter.flags.shiliPassiveRound !== state.round);
    if (!shili) continue;
    shili.flags.shiliPassiveRound = state.round || 0;
    if (corrosionStacks(target) > 0) {
      log(state, `${shili.name}「傷口不會說謊」：${target.name} 已帶有腐蝕，改為受到 1 傷害。`);
      damage(snapshot, shili, target, 1, { label: `${shili.name}「傷口不會說謊」`, passive: true, noShiliPassive: true });
    } else {
      log(state, `${shili.name}「傷口不會說謊」：${target.name} 本回合首次受到治療，獲得 1 層腐蝕。`);
      addCorrosion(snapshot, { actor: shili, label: `${shili.name}「傷口不會說謊」` }, target);
    }
  }
}

function clearStarLines(state, reason = "") {
  for (const fighter of allBattleFighters(state)) {
    if (!fighter.flags?.starLine) continue;
    const mark = fighter.flags.starLine;
    fighter.flags.starLine = null;
    const owner = getFighter(state, mark.owner, mark.actorId);
    if (owner) addFighterStat(state, owner, "statusRemoved", 1);
    if (reason) log(state, `${fighter.name} 的星線移除：${reason}。`);
  }
}

function applyStarLine(state, source, target, useResonance = false) {
  if (!state || !source || !target || source.owner !== target.owner || target.hpNow <= 0) return false;
  clearStarLines(state);
  target.flags.starLine = { owner: source.owner, actorId: source.id, round: state.round || 0, resonance: !!useResonance };
  source.flags.fengxingStarPromptedRound = state.round || 0;
  addFighterStat(state, source, "statusApplied", 1);
  log(state, `${source.name} 設置星線於 ${target.name}${useResonance ? "，並預置共鳴「童話打結」" : ""}。敵方本回合第一次指定其為普攻或技能目標時，攻擊者受到 2 傷害。`);
  setFx(state, "status", "星線", `${target.name} 被星線保護`, source, target);
  return true;
}

function triggerStarLineOnTarget(snapshot, actor, target, action) {
  const state = normalizeBattleState(snapshot);
  if (!state || !actor || !target || actor.owner === target.owner || !target.flags?.starLine) return false;
  const mark = target.flags.starLine;
  const fengxing = getFighter(state, mark.owner, mark.actorId);
  target.flags.starLine = null;
  if (!fengxing || fengxing.hpNow <= 0) return false;
  log(state, `${fengxing.name}「別踩到線」：${actor.name} 指定 ${target.name} 觸發星線，攻擊者受到 2 傷害。`);
  damage(snapshot, fengxing, actor, 2, { label: `${fengxing.name}「星線」`, passive: true, starLine: true });
  if (mark.resonance && actor.hpNow > 0) {
    addStatus(snapshot, { actor: fengxing, label: fengxing.res.name }, actor, STATUS.SLOW);
    addFighterStat(state, fengxing, "resonanceUsed", 1);
  }
  return true;
}

function applyStitch(snapshot, source, target) {
  const state = normalizeBattleState(snapshot);
  if (!state || !source || !target || source.owner === target.owner || target.hpNow <= 0) return false;
  const label = `${source.name}「${source.skill.name}」`;
  const huiyin = alive(state.players[target.owner].team).find(fighter => fighter.id === "huiyin" && fighter.id !== target.id && !fighter.flags.huiyinUsed);
  if (huiyin) {
    huiyin.flags.huiyinUsed = true;
    log(state, `迴音被動：將 ${target.name} 的縫線轉移給自己。`);
    target = huiyin;
  }
  if (target.flags.immuneNextDebuff) {
    target.flags.immuneNextDebuff = false;
    log(state, `${target.name} 的防禦免疫了縫線。`);
    return false;
  }
  if (hasStatus(target, STATUS.STITCH)) {
    log(state, `${target.name} 已有縫線。`);
    return false;
  }
  target.statuses.push(STATUS.STITCH);
  recordStatusApplied(state, source, target);
  target.flags.stitchMark = { owner: source.owner, actorId: source.id, round: state.round || 0, checked: false };
  setFx(state, "status", "縫線", `${target.name} 被縫線標記`, source, target);
  log(state, `${target.name} 的縫線：本回合第一次造成傷害後，若指定的是 ${sideName(source.owner)} HP 最低角色，自己受到 1 傷害。`);
  return true;
}

function resolveStitchAfterDamage(snapshot, sourceActor, chosenTarget, actualDamage, precheck = null) {
  const state = normalizeBattleState(snapshot);
  const mark = sourceActor?.flags?.stitchMark;
  if (!state || !sourceActor || !mark || !hasStatus(sourceActor, STATUS.STITCH) || mark.checked || actualDamage <= 0) return;
  mark.checked = true;
  const fengxing = getFighter(state, mark.owner, mark.actorId);
  const protectedTeam = alive(state.players[mark.owner]?.team || []);
  const lowestHp = precheck?.lowestHpBefore ?? (protectedTeam.length ? Math.min(...protectedTeam.map(fighter => fighter.hpNow)) : 999);
  const targetHp = precheck?.targetHpBefore ?? chosenTarget?.hpNow ?? 999;
  const targetOwner = precheck?.targetOwner ?? chosenTarget?.owner;
  const hitLowest = targetOwner === mark.owner && targetHp <= lowestHp;
  if (hitLowest && fengxing && fengxing.hpNow > 0) {
    removeStatus(sourceActor, STATUS.STITCH);
    sourceActor.flags.stitchMark = null;
    log(state, `${fengxing.name}「縫線」：${sourceActor.name} 傷害指定了 HP 最低的 ${chosenTarget.name}，縫線觸發。`);
    damage(snapshot, fengxing, sourceActor, 1, { label: `${fengxing.name}「縫線」`, passive: true, stitchTrap: true });
  } else {
    log(state, `${sourceActor.name} 的縫線已檢查：本次傷害未指定 ${sideName(mark.owner)} HP 最低角色，將於回合結束移除。`);
  }
}

function debtLabel(level = 1) {
  return level >= 2 ? "加重欠條" : "欠條";
}

function debtTarget(state) {
  return allBattleFighters(state).find(fighter => fighter.hpNow > 0 && fighter.flags?.debtMark) || null;
}

function clearDebtMarks(state, reason = "") {
  for (const fighter of allBattleFighters(state)) {
    if (!fighter.flags?.debtMark) continue;
    const mark = fighter.flags.debtMark;
    fighter.flags.debtMark = null;
    fighter.flags.actionTargetedSongya = false;
    const owner = getFighter(state, mark.owner, mark.actorId);
    if (owner) addFighterStat(state, owner, "statusRemoved", 1);
    if (reason) log(state, `${fighter.name} 的${debtLabel(mark.level)}移除：${reason}。`);
  }
}

function clearSongyaDebts(state, songya) {
  if (!songya) return;
  for (const fighter of allBattleFighters(state)) {
    const mark = fighter.flags?.debtMark;
    if (mark && mark.owner === songya.owner && mark.actorId === songya.id) {
      fighter.flags.debtMark = null;
      fighter.flags.actionTargetedSongya = false;
      log(state, `${songya.name} 被擊倒，${fighter.name} 的${debtLabel(mark.level)}立即移除。`);
    }
  }
}

function applyDebtMark(state, source, target, upgraded = false) {
  if (!state || !source || !target || source.owner === target.owner || target.hpNow <= 0) return false;
  const previous = target.flags.debtMark;
  const level = upgraded || previous ? 2 : 1;
  clearDebtMarks(state);
  target.flags.debtMark = { owner: source.owner, actorId: source.id, level, round: state.round || 0 };
  target.flags.actionTargetedSongya = false;
  source.flags.debtPromptedRound = state.round || 0;
  addFighterStat(state, source, "statusApplied", 1);
  log(state, `${source.name} 賦予 ${target.name}「${debtLabel(level)}」：本回合第一次行動後檢查是否指定訟鴉。`);
  setFx(state, "status", debtLabel(level), `${target.name} 被記帳`, source, target);
  return true;
}

function markDebtTargeting(state, actor, target) {
  if (!state || !actor || !target) return;
  const mark = actor.flags?.debtMark;
  if (!mark) return;
  const songya = getFighter(state, mark.owner, mark.actorId);
  if (songya && target.owner === songya.owner && target.id === songya.id) {
    actor.flags.actionTargetedSongya = true;
  }
}

function resolveDebtAfterAction(snapshot, actor) {
  const state = normalizeBattleState(snapshot);
  const mark = actor?.flags?.debtMark;
  if (!state || !actor || !mark) return;
  const songya = getFighter(state, mark.owner, mark.actorId);
  actor.flags.debtMark = null;
  if (!songya || songya.hpNow <= 0) {
    actor.flags.actionTargetedSongya = false;
    return;
  }

  if (actor.flags.actionTargetedSongya) {
    log(state, `${actor.name} 本次行動指定了 ${songya.name}，${debtLabel(mark.level)}移除。`);
    actor.flags.actionTargetedSongya = false;
    addFighterStat(state, songya, "statusRemoved", 1);
    return;
  }

  const player = state.players[songya.owner];
  const before = player.energy;
  player.energy = clamp(player.energy + 1, 0, RULES.ENERGY_MAX);
  log(state, `${songya.name}「不找我就記帳」：${actor.name} 未指定訟鴉，${sideName(songya.owner)} 能量 ${before} → ${player.energy}。`);
  damage(snapshot, songya, actor, 2, { label: `${songya.name}「欠條」`, passive: true });
  if (mark.level >= 2) addStatus(snapshot, { actor: songya, label: "加重欠條" }, actor, STATUS.DELAY);
  setFx(state, "status", debtLabel(mark.level), `${songya.name} 收據成立`, songya, actor);
  actor.flags.actionTargetedSongya = false;
}

function queueDebtPrompt(state) {
  if (!state?.players || debtTarget(state)) return false;
  for (const side of SIDES) {
    const songya = alive(state.players[side].team).find(fighter => fighter.id === "songya" && fighter.flags.debtPromptedRound !== state.round);
    if (!songya) continue;
    if (!alive(state.players[other(side)].team).length) continue;
    state.pendingDebt = { actorSide: side, actorId: songya.id };
    log(state, `訟鴉「不找我就記帳」：${sideName(side)} 可選擇 1 名敵方角色賦予欠條，也可以略過。`);
    return true;
  }
  return false;
}

function queueTianxunFocusPrompt(state) {
  if (!state?.players) return false;
  for (const side of SIDES) {
    const tianxun = alive(state.players[side].team).find(fighter => fighter.id === "tianxun" && fighter.flags.tianxunFocusPromptedRound !== state.round);
    if (!tianxun) continue;
    if (!alive(state.players[side].team).length) continue;
    state.pendingTianxunFocus = { actorSide: side, actorId: tianxun.id };
    log(state, `天訊「嘴賤主持」：${sideName(side)} 選擇 1 名我方角色 SPD +1。`);
    return true;
  }
  return false;
}

function queueQihengBalancePrompt(state) {
  if (!state?.players) return false;
  for (const side of SIDES) {
    const qiheng = alive(state.players[side].team).find(fighter => fighter.id === "qiheng" && fighter.flags.qihengBalancePromptedRound !== state.round);
    if (!qiheng) continue;
    const pair = qihengBalancePair(state, side);
    if (!pair) continue;
    state.pendingQihengBalance = { actorSide: side, actorId: qiheng.id };
    log(state, `祈衡「均衡刻度」：${pair.highest.name} 與 ${pair.lowest.name} HP 相差 ${pair.highest.hpNow - pair.lowest.hpNow}，可選擇轉移 1 HP。`);
    return true;
  }
  return false;
}

function queueFengxingStarPrompt(state) {
  if (!state?.players) return false;
  for (const side of SIDES) {
    const fengxing = alive(state.players[side].team).find(fighter => fighter.id === "fengxing" && fighter.flags.fengxingStarPromptedRound !== state.round);
    if (!fengxing) continue;
    if (!alive(state.players[side].team).length) continue;
    state.pendingFengxingStar = { actorSide: side, actorId: fengxing.id };
    log(state, `縫星「別踩到線」：${sideName(side)} 選擇 1 名我方角色設置星線。`);
    return true;
  }
  return false;
}

function queueTimeTaxPrompt(state) {
  if (!state?.players) return false;
  for (const side of SIDES) {
    const kelu = alive(state.players[side].team).find(fighter => fighter.id === "kelu");
    if (!kelu) continue;
    if (!alive(state.players[other(side)].team).length) continue;
    state.pendingTimeTax = { actorSide: side, actorId: kelu.id };
    log(state, `刻律「時間稅」：${sideName(side)} 選擇 1 名敵方角色。`);
    return true;
  }
  return false;
}

export function requestAttack(snapshot: RuleSnapshot): RuleActionResult {
  const state = normalizeBattleState(snapshot);
  const actor = activeF(snapshot);
  if (!actor) return { ok: false };
  if (actor.flags.noAttack) {
    log(state, `${actor.name} 本回合不能攻擊。`);
    return { ok: false };
  }
  if (hasStatus(actor, STATUS.CONFUSE)) {
    const targets = confusionTargets(snapshot, actor, "attack");
    if (!targets.length) {
      log(state, `${actor.name} 受到混亂影響，但目前沒有合法攻擊目標。`);
      return { ok: false, closeDialog: false };
    }
    state.pendingConfuseAttack = { actorSide: actor.owner, actorId: actor.id, action: "attack" };
    log(state, `${actor.name} 受到混亂影響，等待對手指定攻擊目標。`);
    return { ok: true, pending: "confuse" };
  }
  return { ok: true, openDialog: true };
}

function queueLiewuComboPrompt(state: GameState | null, actor: Fighter | null, targetKey: string | null, opts: RuleActionOptions = {}) {
  if (!state || !actor || actor.id !== "liewu" || opts.liewuComboDecision || (actor.flags.battleIntent || 0) <= 0) return false;
  state.pendingLiewuCombo = { actorSide: actor.owner, actorId: actor.id, targetKey, opts };
  log(state, `裂舞可以消耗 1 層戰意追加 1 傷害。`);
  return true;
}

export function attack(snapshot: RuleSnapshot, targetKey: string | null, opts: RuleActionOptions = {}): RuleActionResult {
  const state = normalizeBattleState(snapshot);
  const actor = activeF(snapshot);
  const target = parseTarget(state, targetKey);
  if (!actor || !target) return { ok: false };
  if (actor.flags.noAttack) {
    log(state, `${actor.name} 本回合不能攻擊。`);
    return { ok: false };
  }
  if (actor.flags.cannotAttackYingli && target.id === "yingli") {
    log(state, `${actor.name} 不能指定映璃。`);
    return { ok: false };
  }
  if (queueLiewuComboPrompt(state, actor, targetKey, opts)) return { ok: true, pending: "liewu-combo" };
  if (queueMirrorPrompt(state, actor, target, "attack", targetKey, opts)) return { ok: true, pending: "mirror" };
  triggerStarLineOnTarget(snapshot, actor, target, "attack");
  if (actor.hpNow <= 0) {
    clearActionEndSeal(state, actor);
    return { ok: true, actionSpent: true };
  }
  performAttack(snapshot, actor, target, !!opts.confused, opts);
  clearActionEndSeal(state, actor);
  return { ok: true, actionSpent: true };
}

export function decideConfuseTarget(snapshot: RuleSnapshot, targetKey: string): RuleActionResult {
  const state = normalizeBattleState(snapshot);
  const pending = state?.pendingConfuseAttack;
  if (!pending) return { ok: false };

  const actor = getFighter(state, pending.actorSide, pending.actorId);
  const target = parseTarget(state, targetKey);
  if (!actor || !target) {
    state.pendingConfuseAttack = null;
    return { ok: false };
  }
  if (!confusionTargets(snapshot, actor, pending.action).some(item => item.c === target)) {
    log(state, `${actor.name} 的混亂目標不合法，請重新選擇。`);
    return { ok: false, closeDialog: false };
  }
  if (actor.flags.cannotAttackYingli && target.id === "yingli") {
    log(state, `${actor.name} 的混亂目標不能指定映璃。`);
    return { ok: false, closeDialog: false };
  }

  state.pendingConfuseAttack = null;
  if (pending.action === "skill") {
    return useSkill(snapshot, targetKey, { ...pending.opts, actorId: pending.actorId, confuseTargetChosen: true });
  }
  return attack(snapshot, targetKey, { confused: true });
}

export function useSkill(snapshot: RuleSnapshot, targetKey: string | null, opts: RuleActionOptions = {}): RuleActionResult {
  const state = normalizeBattleState(snapshot);
  const actor = activeF(snapshot);
  if (!actor || actor.hpNow <= 0) return { ok: false };
  if (opts.actorId && actor.id !== opts.actorId) return { ok: false };
  if (actor.cd > 0) {
    log(state, `${actor.name} 技能仍在冷卻：${actor.cd}。`);
    return { ok: false };
  }
  if (hasStatus(actor, STATUS.SEAL)) {
    log(state, `${actor.name} 被封印，不能使用技能。`);
    clearActionEndSeal(state, actor);
    return { ok: false, actionSpent: true };
  }
  if (actor.flags.noSkill) {
    log(state, `${actor.name} 本次行動不能使用技能。`);
    return { ok: false };
  }
  if (actor.id === "liewu" && (actor.flags.battleIntent || 0) < 2) {
    log(state, `裂舞戰意不足 2 層，不能使用收勢護身。`);
    return { ok: false };
  }

  let resonance = !!opts.res;
  const player = state.players[actor.owner];
  if (resonance && player.resUsed >= RULES.RESONANCE_PER_ROUND) {
    log(state, `${sideName(actor.owner)} 本回合共鳴已達 ${RULES.RESONANCE_PER_ROUND} 次上限。`);
    return { ok: false };
  }
  if (resonance && !alive(player.team).some(member => member.id !== actor.id)) {
    log(state, `${actor.name} 沒有其他我方存活角色，不能共鳴。`);
    return { ok: false };
  }
  if (actor.flags.noResNextSkill && resonance) {
    actor.flags.noResNextSkill = false;
    resonance = false;
    log(state, `裁定封殺：${actor.name} 本次技能不能觸發共鳴。`);
  }

  const qihengLoss = actor.id === "qiheng" ? numberOr(opts.qihengLoss, 0) : 0;
  const qihengCostSource = actor.id === "qiheng" ? parseTarget(state, opts.qihengSourceKey) : null;
  if (actor.id === "qiheng") {
    if (!qihengCostSource || qihengCostSource.owner !== actor.owner || qihengCostSource.hpNow <= 0) {
      log(state, "祈衡需要選擇 1 名存活我方角色作為代價來源。");
      return { ok: false, closeDialog: false };
    }
    if (![1, 2, 3].includes(qihengLoss)) {
      log(state, "祈衡代價必須選擇失去 1～3 HP。");
      return { ok: false, closeDialog: false };
    }
    if (qihengCostSource.hpNow - qihengLoss < 1) {
      log(state, `${qihengCostSource.name} 不能因祈衡技能代價被擊倒，請降低代價。`);
      return { ok: false, closeDialog: false };
    }
  }

  if (!tianChoicesOk(state, actor, resonance, opts.choices || [])) return { ok: false, closeDialog: false };
  if (hasStatus(actor, STATUS.CONFUSE) && skillFilter(actor) !== "none" && !opts.confuseTargetChosen) {
    const targets = confusionTargets(snapshot, actor, "skill");
    if (!targets.length) {
      log(state, `${actor.name} 受到混亂影響，但目前沒有合法技能目標。`);
      return { ok: false, closeDialog: false };
    }
    state.pendingConfuseAttack = { actorSide: actor.owner, actorId: actor.id, action: "skill", targetKey, opts: { ...opts, res: resonance } };
    log(state, `${actor.name} 受到混亂影響，等待對手指定技能目標。`);
    return { ok: true, pending: "confuse" };
  }

  const enemyIno = enemyInoFor(state, actor);
  if (enemyIno && opts.inoDecision === undefined) {
    state.pendingSkill = { actorSide: actor.owner, actorId: actor.id, targetKey, opts: { ...opts, res: resonance } };
    log(state, `${enemyIno.name} 可以干涉 ${actor.name} 的技能費用。`);
    return { ok: true, pending: "ino" };
  }

  return executeSkill(snapshot, targetKey, { ...opts, res: resonance });
}

export function decideIno(snapshot: RuleSnapshot, useInterference: boolean): RuleActionResult {
  const state = normalizeBattleState(snapshot);
  const pending = state?.pendingSkill;
  if (!pending) return { ok: false };
  state.pendingSkill = null;
  return executeSkill(snapshot, pending.targetKey, { ...pending.opts, actorId: pending.actorId, inoDecision: !!useInterference });
}

export function decideMirror(snapshot: RuleSnapshot, useReflect: boolean): RuleActionResult {
  const state = normalizeBattleState(snapshot);
  const pending = state?.pendingMirror;
  if (!pending) return { ok: false };
  state.pendingMirror = null;

  const actor = getFighter(state, pending.actorSide, pending.actorId);
  const target = parseTarget(state, pending.targetKey);
  if (!actor || !target) return { ok: false };

  const opts = { ...pending.opts, mirrorDecision: true, mirrorReflect: !!useReflect, mirrorDeclined: !useReflect };
  log(state, `鏡刃選擇${useReflect ? "發動" : "不發動"}「全域鏡返」。`);
  if (pending.action === "attack") {
    return attack(snapshot, pending.targetKey, opts);
  }
  return executeSkill(snapshot, pending.targetKey, { ...opts, actorId: pending.actorId });
}

export function decideTimeTax(snapshot: RuleSnapshot, targetKey: string): RuleActionResult {
  const state = normalizeBattleState(snapshot);
  const pending = state?.pendingTimeTax;
  if (!pending) return { ok: false };

  const actor = getFighter(state, pending.actorSide, pending.actorId);
  const target = parseTarget(state, targetKey);
  if (!actor || !target || target.owner === actor.owner) return { ok: false, closeDialog: false };

  state.pendingTimeTax = null;
  addTimeTax(snapshot, actor, target);
  finalizeRoundStart(snapshot);
  return { ok: true };
}

export function decideDebt(snapshot: RuleSnapshot, targetKey: string | null, skip = false): RuleActionResult {
  const state = normalizeBattleState(snapshot);
  const pending = state?.pendingDebt;
  if (!pending) return { ok: false };

  const actor = getFighter(state, pending.actorSide, pending.actorId);
  if (!actor || actor.hpNow <= 0) {
    state.pendingDebt = null;
    if (queueDebtPrompt(state)) return { ok: true, pending: "debt" };
    if (queueTimeTaxPrompt(state)) return { ok: true, pending: "time-tax" };
    finalizeRoundStart(snapshot);
    return { ok: true };
  }

  state.pendingDebt = null;
  actor.flags.debtPromptedRound = state.round || 0;
  if (skip) {
    log(state, `${actor.name} 本回合不賦予欠條。`);
  } else {
    const target = parseTarget(state, targetKey);
    if (!target || target.owner === actor.owner) {
      state.pendingDebt = { actorSide: actor.owner, actorId: actor.id };
      return { ok: false, closeDialog: false };
    }
    applyDebtMark(state, actor, target);
  }

  if (queueDebtPrompt(state)) return { ok: true, pending: "debt" };
  if (queueTimeTaxPrompt(state)) return { ok: true, pending: "time-tax" };
  finalizeRoundStart(snapshot);
  return { ok: true };
}

export function decideTianxunFocus(snapshot: RuleSnapshot, targetKey: string): RuleActionResult {
  const state = normalizeBattleState(snapshot);
  const pending = state?.pendingTianxunFocus;
  if (!pending) return { ok: false };

  const actor = getFighter(state, pending.actorSide, pending.actorId);
  const target = parseTarget(state, targetKey);
  if (!actor || actor.hpNow <= 0) {
    state.pendingTianxunFocus = null;
    if (queueTianxunFocusPrompt(state)) return { ok: true, pending: "tianxun-focus" };
    if (queueQihengBalancePrompt(state)) return { ok: true, pending: "qiheng-balance" };
    if (queueFengxingStarPrompt(state)) return { ok: true, pending: "fengxing-star" };
    if (queueDebtPrompt(state)) return { ok: true, pending: "debt" };
    if (queueTimeTaxPrompt(state)) return { ok: true, pending: "time-tax" };
    finalizeRoundStart(snapshot);
    return { ok: true };
  }
  if (!target || target.owner !== actor.owner || target.hpNow <= 0) {
    log(state, "天訊只能選擇存活的我方角色。");
    return { ok: false, closeDialog: false };
  }

  state.pendingTianxunFocus = null;
  actor.flags.tianxunFocusPromptedRound = state.round || 0;
  target.flags.spdMod += 1;
  log(state, `天訊被動：${target.name} 本回合 SPD +1。`);

  if (queueTianxunFocusPrompt(state)) return { ok: true, pending: "tianxun-focus" };
  if (queueQihengBalancePrompt(state)) return { ok: true, pending: "qiheng-balance" };
  if (queueFengxingStarPrompt(state)) return { ok: true, pending: "fengxing-star" };
  if (queueDebtPrompt(state)) return { ok: true, pending: "debt" };
  if (queueTimeTaxPrompt(state)) return { ok: true, pending: "time-tax" };
  finalizeRoundStart(snapshot);
  return { ok: true };
}

export function decideQihengBalance(snapshot: RuleSnapshot, useBalance = false): RuleActionResult {
  const state = normalizeBattleState(snapshot);
  const pending = state?.pendingQihengBalance;
  if (!pending) return { ok: false };

  const actor = getFighter(state, pending.actorSide, pending.actorId);
  state.pendingQihengBalance = null;
  if (!actor || actor.hpNow <= 0) {
    if (queueQihengBalancePrompt(state)) return { ok: true, pending: "qiheng-balance" };
    if (queueFengxingStarPrompt(state)) return { ok: true, pending: "fengxing-star" };
    if (queueDebtPrompt(state)) return { ok: true, pending: "debt" };
    if (queueTimeTaxPrompt(state)) return { ok: true, pending: "time-tax" };
    finalizeRoundStart(snapshot);
    return { ok: true };
  }

  actor.flags.qihengBalancePromptedRound = state.round || 0;
  const pair = qihengBalancePair(state, actor.owner);
  if (useBalance && pair) {
    const lost = loseHpAsCost(state, pair.highest, 1, "祈衡「均衡刻度」");
    if (lost > 0) heal(snapshot, pair.lowest, 1, { actor, label: "祈衡「均衡刻度」" });
  } else {
    log(state, `${actor.name} 本回合不使用「均衡刻度」。`);
  }

  if (queueQihengBalancePrompt(state)) return { ok: true, pending: "qiheng-balance" };
  if (queueFengxingStarPrompt(state)) return { ok: true, pending: "fengxing-star" };
  if (queueDebtPrompt(state)) return { ok: true, pending: "debt" };
  if (queueTimeTaxPrompt(state)) return { ok: true, pending: "time-tax" };
  finalizeRoundStart(snapshot);
  return { ok: true };
}

export function decideFengxingStar(snapshot: RuleSnapshot, targetKey: string, useResonance = false): RuleActionResult {
  const state = normalizeBattleState(snapshot);
  const pending = state?.pendingFengxingStar;
  if (!pending) return { ok: false };

  const actor = getFighter(state, pending.actorSide, pending.actorId);
  if (!actor || actor.hpNow <= 0) {
    state.pendingFengxingStar = null;
    if (queueFengxingStarPrompt(state)) return { ok: true, pending: "fengxing-star" };
    if (queueDebtPrompt(state)) return { ok: true, pending: "debt" };
    if (queueTimeTaxPrompt(state)) return { ok: true, pending: "time-tax" };
    finalizeRoundStart(snapshot);
    return { ok: true };
  }

  const target = parseTarget(state, targetKey);
  if (!target || target.owner !== actor.owner || target.hpNow <= 0) return { ok: false, closeDialog: false };
  const player = state.players[actor.owner];
  const canResonate = !!useResonance
    && player.resUsed < RULES.RESONANCE_PER_ROUND
    && alive(player.team).some(member => member.id !== actor.id);
  state.pendingFengxingStar = null;
  if (canResonate) player.resUsed += 1;
  applyStarLine(state, actor, target, canResonate);
  if (useResonance && !canResonate) log(state, `${actor.name} 無法使用共鳴設置星線，改為一般星線。`);

  if (queueFengxingStarPrompt(state)) return { ok: true, pending: "fengxing-star" };
  if (queueDebtPrompt(state)) return { ok: true, pending: "debt" };
  if (queueTimeTaxPrompt(state)) return { ok: true, pending: "time-tax" };
  finalizeRoundStart(snapshot);
  return { ok: true };
}

export function decideLiewuCombo(snapshot: RuleSnapshot, useCombo: boolean): RuleActionResult {
  const state = normalizeBattleState(snapshot);
  const pending = state?.pendingLiewuCombo;
  if (!pending) return { ok: false };

  state.pendingLiewuCombo = null;
  return attack(snapshot, pending.targetKey, {
    ...pending.opts,
    liewuComboDecision: true,
    liewuUseCombo: !!useCombo
  });
}

export function defend(snapshot: RuleSnapshot): RuleActionResult {
  const state = normalizeBattleState(snapshot);
  const actor = activeF(snapshot);
  if (!actor) return { ok: false };
  if (actor.flags.noDefend) {
    log(state, `${actor.name} 本回合不能防禦。`);
    return { ok: false };
  }
  actor.flags.defended = true;
  actor.flags.immuneNextDebuff = true;
  log(state, `${actor.name} 進入防禦：受傷 -2，並免疫下一個負面狀態。`);
  setFx(state, "guard", "防禦姿態", `${actor.name} 展開護盾`, actor, actor);
  clearActionEndSeal(state, actor);
  return { ok: true, actionSpent: true };
}

export function rest(snapshot: RuleSnapshot): RuleActionResult {
  const state = normalizeBattleState(snapshot);
  const actor = activeF(snapshot);
  if (!actor) return { ok: false };
  heal(snapshot, actor, 1, { actor, label: "休息" });
  removeNegativeStatus(state, actor);
  clearActionEndSeal(state, actor);
  return { ok: true, actionSpent: true };
}

export function judgement(snapshot: RuleSnapshot, type: string, targetKey?: string): RuleActionResult {
  const state = normalizeBattleState(snapshot);
  const actor = activeF(snapshot);
  if (!state || !actor) return { ok: false };
  const player = state.players[actor.owner];
  if (player.judgementUsed) {
    log(state, `${sideName(actor.owner)} 本回合已使用過裁定。`);
    return { ok: false };
  }

  const cost = { atk: 1, def: 1, spd: 1, heal: 2, seal: 3 }[type];
  const target = parseTarget(state, targetKey);
  if (!cost || player.marks < cost) {
    log(state, `${sideName(actor.owner)} 裁定不足：需要 ${cost || "?"}，目前 ${player.marks}。`);
    return { ok: false };
  }
  if ((type === "spd" || type === "heal") && (!target || target.owner !== actor.owner)) return { ok: false };
  if (type === "seal" && (!target || target.owner === actor.owner)) return { ok: false };

  player.marks = clamp(player.marks - cost, 0, RULES.JUDGEMENT_MAX);
  player.judgementUsed = true;
  addFighterStat(state, actor, "judgementUsed", 1);

  if (type === "atk") {
    actor.flags.judgementDamageBonus += 1;
    log(state, `裁定：${actor.name} 下一次造成傷害 +1。`);
  } else if (type === "def") {
    actor.flags.nextDamageTakenReduction += 1;
    log(state, `裁定：${actor.name} 下一次受到傷害 -1。`);
  } else if (type === "spd") {
    target.flags.spdMod += 1;
    log(state, `裁定：${target.name} 本回合 SPD +1。`);
    buildQueue(snapshot);
  } else if (type === "heal") {
    target.cd = Math.max(0, target.cd - 1);
    heal(snapshot, target, 1, { actor, label: "裁定" });
    log(state, `裁定：${target.name} 技能冷卻 -1。`);
  } else if (type === "seal") {
    target.flags.noResNextSkill = true;
    addStatus(snapshot, "裁定封殺", target, STATUS.SLOW);
    log(state, `裁定：${target.name} 下一次技能共鳴被取消，並獲得遲緩。`);
  }
  setFx(state, "judgement", "裁定", {
    atk: `${actor.name} 傷害加權`,
    def: `${actor.name} 防線加權`,
    spd: `${target?.name || actor.name} 速度加權`,
    heal: `${target?.name || actor.name} 回復校準`,
    seal: `${target?.name || "目標"} 共鳴封殺`
  }[type] || "裁定完成", actor, target || actor);
  return { ok: true, actionSpent: true };
}

export function finishAction(snapshot: RuleSnapshot): RuleActionResult {
  const state = normalizeBattleState(snapshot);
  if (!state?.players) return { ok: false };
  const actor = activeF(snapshot);
  const spent = state.active ? { ...state.active } : (actor ? { side: actor.owner, id: actor.id } : null);
  if (actor) resolveDebtAfterAction(snapshot, actor);
  resolveWinner(state);
  if (state.winner) return { ok: true };

  if (spent && state.queue?.length) {
    const index = state.queue.findIndex(item => item.side === spent.side && item.id === spent.id);
    if (index >= 0) state.queue.splice(index, 1);
  } else if (state.queue?.length) {
    state.queue.shift();
  }
  state.queue = (state.queue || []).filter(item => getFighter(state, item.side, item.id)?.hpNow > 0);
  if (!state.queue.length) {
    endRound(snapshot);
  } else {
    setActiveFromQueue(snapshot);
  }
  return { ok: true };
}

export function endRound(snapshot) {
  const state = normalizeBattleState(snapshot);
  if (!state || state.winner) return { ok: false };

  for (const side of SIDES) {
    const player = state.players[side];
    const baijian = alive(player.team).find(fighter => fighter.id === "baijian");
    if (baijian && !baijian.flags.usedSkillThisRound) {
      const target = lowestHpAlly(player.team);
      if (target) heal(snapshot, target, 1, { actor: baijian, label: "白繭被動：本回合未使用技能" });
    }
  }
  clearStarLines(state, "回合結束未觸發");
  for (const fighter of allBattleFighters(state)) {
    if (hasStatus(fighter, STATUS.STITCH)) {
      removeStatus(fighter, STATUS.STITCH);
      log(state, `${fighter.name} 的縫線於回合結束移除。`);
    }
  }
  clearTimeTax(state);
  log(state, `第 ${state.round} 回合結束。`);
  nextRound(snapshot);
  return { ok: true };
}

export function currentAtk(fighter?: Fighter | null): number {
  return Math.max(0, (fighter?.atk || 0) + (fighter?.flags?.atkMod || 0));
}

export function currentSpd(fighter?: Fighter | null): number {
  return Math.max(0, (fighter?.spd || 0) + (fighter?.flags?.spdMod || 0) - (hasStatus(fighter, STATUS.SLOW) ? 1 : 0));
}

export function activeF(snapshot: RuleSnapshot): Fighter | null {
  const state = getState(snapshot);
  if (!state?.active || !state.players) return null;
  return getFighter(state, state.active.side, state.active.id);
}

export function targetList(snapshot: RuleSnapshot, filter: SkillFilter | "all" | string): TargetEntry[] {
  const state = normalizeBattleState(snapshot);
  const actor = activeF(snapshot);
  if (!state?.players || !actor) return [];
  const out: TargetEntry[] = [];
  for (const side of SIDES) {
    for (const fighter of alive(state.players[side].team)) {
      if (filter === "ally" && side !== actor.owner) continue;
      if (filter === "enemy" && side === actor.owner) continue;
      if (filter === "self" && fighter !== actor) continue;
      if (filter === "none") continue;
      out.push({ key: `${side}:${fighter.id}`, side, c: fighter });
    }
  }
  return out;
}

export function confusionTargets(snapshot: RuleSnapshot, actor?: Fighter | null, action: RuleActionKind = "attack"): TargetEntry[] {
  const state = normalizeBattleState(snapshot);
  if (!state?.players) return [];
  const out: TargetEntry[] = [];
  const filter = action === "skill" ? skillFilter(actor) : "enemy";
  for (const side of SIDES) {
    for (const fighter of alive(state.players[side].team)) {
      if (filter === "ally" && side !== actor?.owner) continue;
      if (filter === "enemy" && side === actor?.owner) continue;
      if (filter === "self" && fighter !== actor) continue;
      if (filter === "none") continue;
      if (actor?.flags?.cannotAttackYingli && fighter.id === "yingli") continue;
      out.push({ key: `${side}:${fighter.id}`, side, c: fighter });
    }
  }
  return out;
}

export function skillFilter(actor?: Fighter | null): SkillFilter {
  if (!actor) return "none";
  if (actor.id === "jingren" || actor.id === "liewu") return "self";
  if (["hengshuo", "baijian", "weixiang"].includes(actor.id)) return "ally";
  if (actor.id === "zuozhe") return "enemy";
  if (["dengzhen", "yiaiqian", "huiyin"].includes(actor.id)) return "all";
  if (["baidengling", "tianxun"].includes(actor.id)) return "none";
  return "enemy";
}

export function skillCost(actor, resonance = false) {
  if (!actor?.skill) return 0;
  let cost = actor.skill.cost + (actor.flags?.skillCostUp || 0);
  if (resonance && actor.skill.cost === 1) cost += 1;
  if (resonance && actor.id === "huiyin") cost -= 1;
  return Math.max(0, cost);
}

function applyPostSkillCooldownTaxes(state, actor) {
  if (!state || !actor) return 0;
  let extra = 0;
  if (hasStatus(actor, STATUS.TIME_TAX)) {
    const mark = actor.flags.timeTaxMark;
    const source = mark ? getFighter(state, mark.owner, mark.actorId) : null;
    removeStatus(actor, STATUS.TIME_TAX);
    actor.flags.timeTaxMark = null;
    extra += 1;
    log(state, `${actor.name} 的時間稅生效：技能冷卻 +1，並受到 1 傷害。`);
    if (source && source.hpNow > 0) damage({ state }, source, actor, 1, { label: `${source.name}「時間稅」`, passive: true });
  }
  if (hasStatus(actor, STATUS.DELAY)) {
    removeStatus(actor, STATUS.DELAY);
    extra += 1;
    log(state, `${actor.name} 的延滯生效：技能冷卻 +1。`);
  }
  if (extra > 0) actor.cd += extra;
  return extra;
}

function grantLiewuBattleIntent(state, skillUser) {
  if (!state?.players || !skillUser) return;
  for (const side of SIDES) {
    const liewu = alive(state.players[side].team).find(fighter => fighter.id === "liewu");
    if (!liewu) continue;
    const before = liewu.flags.battleIntent || 0;
    liewu.flags.battleIntent = clamp(before + 1, 0, 3);
    if (liewu.flags.battleIntent > before) {
      log(state, `裂舞「戰意連段」：${skillUser.name} 成功使用技能，裂舞獲得 1 層戰意（${liewu.flags.battleIntent}/3）。`);
    }
  }
}

export function heal(snapshot: RuleSnapshot, target: Fighter | null, amount: number, source: RuleSource = "治癒") {
  const state = normalizeBattleState(snapshot);
  if (!state || !target || target.hpNow <= 0 || amount <= 0) return 0;
  const sourceActor = actorFromSource(snapshot, source);
  const label = sourceLabel(source, "治癒");
  const originalAmount = amount;
  const corrosion = corrosionStacks(target);
  if (corrosion > 0) {
    amount = Math.max(1, amount - 1);
    log(state, `${target.name} 的腐蝕使 ${label} 治療量 -1（${originalAmount} → ${amount}）。`);
  }
  const before = target.hpNow;
  target.hpNow = clamp(target.hpNow + amount, 0, target.maxHp);
  const healed = target.hpNow - before;
  recordHealEvent(state, sourceActor, target, healed);
  target.flags.healedThisRound = true;
  log(state, `${label}：${target.name} 回復 ${healed} HP (${before} → ${target.hpNow})。`);
  setFx(state, "heal", label, healed > 0 ? `${target.name} +${healed} HP` : `${target.name} 已滿血`, sourceActor, target);
  if (corrosion > 0) removeCorrosionLayer(state, target, "受到治療");
  shiliPassiveAfterHeal(snapshot, target);
  return healed;
}

export function addStatus(snapshot: RuleSnapshot, source: RuleSource, target: Fighter | null, status: string) {
  const state = normalizeBattleState(snapshot);
  if (!state || !target || target.hpNow <= 0 || !Object.values(STATUS).includes(status)) return false;
  if (status === STATUS.CORROSION) return addCorrosion(snapshot, source, target);
  const sourceActor = actorFromSource(snapshot, source);
  const label = sourceLabel(source, "狀態");
  if (status === STATUS.OBSERVE && target.id === "yingli") {
    log(state, `映璃被動：不能被觀測，${label} 的觀測無效。`);
    return false;
  }
  if (NEGATIVE_STATUSES.includes(status)) {
    const huiyin = alive(state.players[target.owner].team).find(fighter => fighter.id === "huiyin" && fighter.id !== target.id && !fighter.flags.huiyinUsed);
    if (huiyin) {
      huiyin.flags.huiyinUsed = true;
      log(state, `迴音被動：將 ${target.name} 的 ${status} 轉移給自己。`);
      target = huiyin;
    }
  }
  if (NEGATIVE_STATUSES.includes(status) && target.flags.immuneNextDebuff) {
    target.flags.immuneNextDebuff = false;
    log(state, `${target.name} 的防禦免疫了 ${status}。`);
    return false;
  }
  if (hasStatus(target, status)) {
    log(state, `${target.name} 已有 ${status}，同名狀態不疊加。`);
    return false;
  }
  target.statuses.push(status);
  recordStatusApplied(state, sourceActor, target);
  log(state, `${label}：${target.name} 獲得 ${status}。`);
  setFx(state, "status", label, `${target.name} 獲得 ${status}`, sourceActor, target);
  return true;
}

function mirrorEnabled(source, opts) {
  return !!(opts?.mirrorReflect || (opts?.skill && source?.flags?.mirrorReflectCurrent));
}

function canMirrorReflect(source: Fighter | null, target: Fighter | null, opts: RuleActionOptions = {}) {
  return !!(
    mirrorEnabled(source, opts)
    && source
    && target
    && source.owner !== target.owner
    && target.id === "jingren"
    && target.hpNow > 0
    && (opts.attack || opts.skill)
    && (target.flags.mirrorReflectUsed || 0) < 2
  );
}

function mirrorReflectedByAction(source: Fighter | null, target: Fighter | null, opts: RuleActionOptions = {}) {
  return !!(
    mirrorEnabled(source, opts)
    && source?.flags?.mirrorReflectedThisAction
    && source.flags.mirrorReflectedOwner === target?.owner
    && (opts.attack || opts.skill)
  );
}

function triggerMirrorReflect(snapshot, source, mirror, amount, label) {
  const state = normalizeBattleState(snapshot);
  if (!state || !source || !mirror) return 0;

  if (mirror.flags.mirrorReflectRound === state.round) return 0;
  const reflected = Math.min(2, Math.max(1, amount));
  const sourcePlayer = state.players[source.owner];
  const marksBeforeDamage = sourcePlayer?.marks || 0;
  mirror.flags.mirrorReflectUsed = (mirror.flags.mirrorReflectUsed || 0) + 1;
  mirror.flags.mirrorReflectRound = state.round || 0;
  source.flags.mirrorReflectedThisAction = true;
  source.flags.mirrorReflectedOwner = mirror.owner;
  log(state, `鏡刃「全域鏡返」發動：取消 ${label} 對我方的傷害，並反彈 ${reflected} 傷害。`);

  const before = source.hpNow;
  source.hpNow = Math.max(0, source.hpNow - reflected);
  state.lastHit = { owner: source.owner, id: source.id, stamp: Date.now() };
  state.shakeStamp = Date.now();
  const dealt = before - source.hpNow;
  addFighterStat(state, mirror, "mirrorReflects", 1);
  recordDamageEvent(state, mirror, source, dealt);
  if (dealt > 0) setFx(state, "damage", "全域鏡返", `${source.name} -${dealt} HP`, mirror, source);
  if (source.hpNow <= 0) knockout(snapshot, source, mirror, { marksBeforeDamage, mirrorReflect: true });
  return dealt;
}

function mirrorCandidateFor(state, source, target) {
  if (!state || !source || !target || source.owner === target.owner) return null;
  const team = state.players[target.owner]?.team || [];
  const direct = target.id === "jingren" ? target : null;
  const guard = team.find(fighter =>
    fighter.id !== target.id
    && fighter.id === "jingren"
    && fighter.hpNow > 0
    && hasStatus(fighter, STATUS.GUARD)
  );
  const mirror = direct || guard;
  if (!mirror || mirror.hpNow <= 0 || (mirror.flags.mirrorReflectUsed || 0) >= 2 || mirror.flags.mirrorReflectRound === state.round) return null;
  return mirror;
}

function skillMayDamageMirror(state, actor, target) {
  if (!state || !actor || !target) return false;
  const damageSkills = ["ningyao", "youming", "leiting", "leiyouxi", "xiaomo", "xuntian", "zuozhe"];
  if (damageSkills.includes(actor.id)) return true;
  if (actor.id === "qiheng") return true;
  if (actor.id === "shili") return true;
  if (actor.id === "ino") return hasStatus(target, STATUS.OBSERVE);
  if (actor.id === "aila") return hasStatus(target, STATUS.OBSERVE);
  if (actor.id === "yiaiqian") return state.lastSkill?.kind === "damage";
  if (actor.id === "huiyin") return !state.lastCopyableSkill?.[actor.owner] || state.lastCopyableSkill[actor.owner].kind === "damage";
  if (actor.id === "yingli") return hasStatus(target, STATUS.CONFUSE);
  return false;
}

function queueMirrorPrompt(state: GameState | null, actor: Fighter | null, target: Fighter | null, action: RuleActionKind, targetKey: string | null, opts: RuleActionOptions = {}) {
  if (!state || opts.mirrorDecision || opts.mirrorReflect || opts.mirrorDeclined) return false;
  if (action === "skill" && !skillMayDamageMirror(state, actor, target)) return false;
  const mirror = mirrorCandidateFor(state, actor, target);
  if (!mirror) return false;

  state.pendingMirror = {
    actorSide: actor.owner,
    actorId: actor.id,
    targetKey,
    action,
    opts,
    mirrorSide: mirror.owner,
    mirrorId: mirror.id
  };
  log(state, `鏡刃可以選擇是否發動「全域鏡返」干擾 ${actor.name} 的${action === "attack" ? "普攻" : "技能"}。`);
  return true;
}

export function damage(snapshot: RuleSnapshot, source: RuleSource, target: Fighter | null, amount: number, opts: DamageOptions = {}) {
  const state = normalizeBattleState(snapshot);
  if (!state || !target || target.hpNow <= 0 || amount <= 0) return 0;
  const sourceActor = actorFromSource(snapshot, source);
  recordTargeted(state, sourceActor, target);

  const label = opts.label || sourceLabel(source, "傷害");
  let dmg = amount;
  const notes = [`基礎 ${amount}`];

  if (sourceActor?.flags?.judgementDamageBonus) {
    dmg += sourceActor.flags.judgementDamageBonus;
    notes.push(`裁定造成傷害 +${sourceActor.flags.judgementDamageBonus}`);
    sourceActor.flags.judgementDamageBonus = 0;
  }
  if (opts.skill && state.tianSkillDebuff) {
    dmg += 2;
    notes.push("天訊技能傷害 +2");
  }

  if (mirrorReflectedByAction(sourceActor, target, opts)) return 0;
  if (canMirrorReflect(sourceActor, target, opts)) return triggerMirrorReflect(snapshot, sourceActor, target, Math.max(1, dmg), label);

  let actual = redirectTarget(state, target, Math.max(1, dmg), sourceActor);
  if (actual !== target) notes.push(`由 ${actual.name} 承受`);

  if (mirrorReflectedByAction(sourceActor, actual, opts)) return 0;
  if (canMirrorReflect(sourceActor, actual, opts)) return triggerMirrorReflect(snapshot, sourceActor, actual, Math.max(1, dmg), label);

  if (hasStatus(actual, STATUS.OBSERVE) && actual.id !== "yingli") {
    dmg += 1;
    removeStatus(actual, STATUS.OBSERVE);
    notes.push(`${actual.name}觀測 +1`);
  }
  if (actual.flags.damageTakenMod) {
    const beforeMod = dmg;
    dmg += actual.flags.damageTakenMod;
    notes.push(`${actual.name}受傷修正 ${signed(actual.flags.damageTakenMod)}`);
    triggerHengshuoGuardHeal(state, actual, beforeMod, dmg);
  }
  if (opts.skill && actual.id === "aila" && !actual.statuses.some(status => NEGATIVE_STATUSES.includes(status))) {
    dmg -= 1;
    notes.push("艾菈無負面狀態，技能傷害 -1");
  }
  if (opts.skill && actual.id === "yingli" && !actual.flags.skillTargeted) {
    actual.flags.skillTargeted = true;
    dmg -= 1;
    notes.push("映璃首次成為技能目標，傷害 -1");
  }
  if (actual.id === "youming" && !actual.flags.firstDamageReduced) {
    actual.flags.firstDamageReduced = true;
    dmg -= 1;
    notes.push("幽冥首次受傷 -1");
  }

  const weixiang = alive(state.players[actual.owner].team).find(fighter => fighter.id === "weixiang");
  if (weixiang && amount >= 3 && !weixiang.flags.firstTeamDamageReduced) {
    weixiang.flags.firstTeamDamageReduced = true;
    dmg -= 1;
    notes.push("未響首次 3+ 傷害 -1");
  }
  if (actual.flags.defended) {
    dmg -= 2;
    notes.push("防禦 -2");
  }
  if (actual.id === "liewu" && actual.flags.liewuGuardReady) {
    actual.flags.liewuGuardReady = false;
    dmg -= 2;
    notes.push("收勢護身 -2");
  }
  if (actual.flags.nextDamageTakenReduction) {
    const mod = actual.flags.nextDamageTakenReduction;
    dmg -= mod;
    notes.push(mod > 0 ? `下次受傷 -${mod}` : `下次受傷 +${Math.abs(mod)}`);
    actual.flags.nextDamageTakenReduction = 0;
  }

  const actualPlayer = state.players[actual.owner];
  let openingDefenseApplied = false;
  if (state.round === 1 && !actualPlayer.openingDefenseUsed) {
    actualPlayer.openingDefenseUsed = true;
    openingDefenseApplied = true;
    dmg -= 1;
    notes.push("開局防線 -1");
  }
  if (sourceActor?.flags?.confuseDamageCap && actual.owner === sourceActor.owner) {
    dmg = Math.min(dmg, CONFUSE_FRIENDLY_DAMAGE_CAP);
    notes.push(`混亂打到己方，傷害最多 ${CONFUSE_FRIENDLY_DAMAGE_CAP}`);
  }

  dmg = Math.max(openingDefenseApplied ? 0 : 1, dmg);
  const stitchTeamBefore = sourceActor?.flags?.stitchMark ? alive(state.players[sourceActor.flags.stitchMark.owner]?.team || []) : [];
  const stitchPrecheck = sourceActor?.flags?.stitchMark && hasStatus(sourceActor, STATUS.STITCH) && target
    ? {
        targetOwner: target.owner,
        targetId: target.id,
        targetHpBefore: target.hpNow,
        lowestHpBefore: stitchTeamBefore.length ? Math.min(...stitchTeamBefore.map(fighter => fighter.hpNow)) : 999
      }
    : null;
  const before = actual.hpNow;
  const marksBeforeDamage = actualPlayer.marks;
  actual.hpNow = Math.max(0, actual.hpNow - dmg);
  if (actual.hpNow < before) actual.flags.tookDamage = true;
  state.lastHit = { owner: actual.owner, id: actual.id, stamp: Date.now() };
  state.shakeStamp = Date.now();
  log(state, `${label} 對 ${actual.name} 造成 ${before - actual.hpNow} 傷害 (${notes.join("，")}，實際 ${before - actual.hpNow})。`);
  setFx(state, opts.skill ? "skillDamage" : "damage", label, `${actual.name} -${before - actual.hpNow} HP`, sourceActor, actual);
  recordDamageEvent(state, sourceActor, actual, before - actual.hpNow);
  if (!opts.stitchTrap) resolveStitchAfterDamage(snapshot, sourceActor, target, before - actual.hpNow, stitchPrecheck);

  if (actual.hpNow <= 0) knockout(snapshot, actual, sourceActor, { marksBeforeDamage, zuozhePassive: !!opts.zuozhePassive });
  return before - actual.hpNow;
}

function triggerHengshuoGuardHeal(state, actual, beforeMod, afterMod) {
  if (actual.flags.hengshuoGuarded && !actual.flags.hengshuoGuardUsed) {
    actual.flags.hengshuoGuardUsed = true;
    const hengshuo = alive(state.players[actual.owner].team).find(fighter => fighter.id === "hengshuo");
    if (hengshuo && afterMod < beforeMod) heal({ state }, hengshuo, 1, "衡朔近身護衛");
  }
}

function executeSkill(snapshot: RuleSnapshot, targetKey: string | null, opts: RuleActionOptions = {}): RuleActionResult {
  const state = normalizeBattleState(snapshot);
  const actor = activeF(snapshot);
  if (!actor || actor.hpNow <= 0 || (opts.actorId && actor.id !== opts.actorId)) return { ok: false };
  const player = state.players[actor.owner];
  const target = parseTarget(state, targetKey);
  const resonance = !!opts.res;
  const enemyIno = enemyInoFor(state, actor);
  let cost = skillCost(actor, resonance);
  let inoApplied = false;

  if (opts.inoDecision && enemyIno) {
    cost += 1;
    enemyIno.flags.inoUsed += 1;
    enemyIno.flags.inoRoundUsed = state.round || 0;
    inoApplied = true;
    log(state, `伊諾干涉：${actor.name} 技能費用 +1。`);
  } else if (enemyIno) {
    log(state, `伊諾未干涉 ${actor.name}。`);
  }

  if (player.energy < cost) {
    log(state, `${actor.name} 能量不足，技能發動失敗並消耗本次行動（需要 ${cost}，目前 ${player.energy}）。`);
    clearActionEndSeal(state, actor);
    return { ok: false, actionSpent: true };
  }

  if (queueMirrorPrompt(state, actor, target, "skill", targetKey, opts)) {
    if (inoApplied && enemyIno) {
      enemyIno.flags.inoUsed = Math.max(0, enemyIno.flags.inoUsed - 1);
      if (enemyIno.flags.inoRoundUsed === state.round) enemyIno.flags.inoRoundUsed = 0;
    }
    return { ok: true, pending: "mirror" };
  }

  if (opts.confuseTargetChosen && target) {
    removeStatus(actor, STATUS.CONFUSE);
    actor.flags.confuseDamageCap = target.owner === actor.owner;
    log(state, `${actor.name} 混亂發作，技能被指定到 ${target.name}。`);
  }

  player.energy -= cost;
  actor.cd = actor.skill.cd;
  actor.flags.skillCostUp = 0;
  if (resonance) player.resUsed += 1;
  log(state, `${actor.name} 使用「${actor.skill.name}」${resonance ? `並觸發共鳴「${actor.res.name}」` : ""}：消耗 ${cost} 能量，冷卻 ${actor.cd}。`);

  const before = snapshotSkillRecord(state);
  const fxBefore = state.fx;
  const fxQueueBefore = Array.isArray(state.fxQueue) ? state.fxQueue.length : 0;
  setFx(state, "skillCast", actor.skill.name, `${actor.name} 發動`, actor, target || actor);
  actor.flags.mirrorReflectCurrent = !!opts.mirrorReflect;
  actor.flags.mirrorReflectedThisAction = false;
  actor.flags.mirrorReflectedOwner = "";
  actor.flags.actionTargetedSongya = false;
  if (target) markDebtTargeting(state, actor, target);
  if (target) {
    triggerStarLineOnTarget(snapshot, actor, target, "skill");
    if (actor.hpNow <= 0) {
      actor.flags.mirrorReflectCurrent = false;
      actor.flags.confuseDamageCap = false;
      clearActionEndSeal(state, actor);
      return { ok: true, actionSpent: true };
    }
  }
  actor.flags.keluIncreasedCdThisSkill = false;
  const ok = resolveSkill(snapshot, actor, target, resonance, opts);
  actor.flags.mirrorReflectCurrent = false;
  actor.flags.confuseDamageCap = false;

  if (!ok) {
    player.energy = clamp(player.energy + cost, 0, RULES.ENERGY_MAX);
    actor.cd = 0;
    if (resonance) player.resUsed = Math.max(0, player.resUsed - 1);
    if (inoApplied) {
      enemyIno.flags.inoUsed = Math.max(0, enemyIno.flags.inoUsed - 1);
      if (enemyIno.flags.inoRoundUsed === state.round) enemyIno.flags.inoRoundUsed = 0;
    }
    actor.flags.actionTargetedSongya = false;
    restoreSkillRecord(state, before);
    if (Array.isArray(state.fxQueue)) state.fxQueue.splice(fxQueueBefore);
    state.fx = state.fxQueue?.[state.fxQueue.length - 1] || fxBefore || null;
    log(state, `${actor.name} 技能目標或條件不合法，費用與冷卻已退回，未消耗行動。`);
    return { ok: false };
  }

  if (inoApplied && enemyIno) {
    state.players[enemyIno.owner].energy = clamp(state.players[enemyIno.owner].energy + 1, 0, RULES.ENERGY_MAX);
    heal(snapshot, enemyIno, 1, "伊諾干涉");
    log(state, `伊諾干涉後技能仍成功，伊諾方獲得 1 能量，伊諾回復 1 HP。`);
  }
  actor.flags.usedSkillThisRound = true;
  if (resonance) addFighterStat(state, actor, "resonanceUsed", 1);
  if (resonance) {
    setFx(state, "resonance", actor.res.name, `${actor.name} 共鳴發動`, actor, target || actor);
  }
  applyPostSkillCooldownTaxes(state, actor);
  grantLiewuBattleIntent(state, actor);
  recordYiaiqian(state);
  clearActionEndSeal(state, actor);
  return { ok: true, actionSpent: true };
}

function resolveSkill(snapshot: RuleSnapshot, actor: Fighter, target: Fighter | null, resonance: boolean, opts: RuleActionOptions) {
  const state = normalizeBattleState(snapshot);
  const label = `${actor.name}「${actor.skill.name}」`;
  let record = null;

  switch (actor.id) {
    case "ningyao":
      if (!isEnemy(actor, target)) return false;
      {
        const sealedBefore = hasStatus(target, STATUS.SEAL);
        damage(snapshot, actor, target, sealedBefore ? 3 : 2, { skill: true, label });
        if (sealedBefore) log(state, `${label}：目標在此技能結算前已持有封印，額外造成 1 傷害。`);
        record = { kind: "damage", amount: sealedBefore ? 3 : 2, name: actor.skill.name };
      }
      addStatus(snapshot, label, target, STATUS.SEAL);
      if (resonance) heal(snapshot, actor, 1, actor.res.name);
      break;
    case "hengshuo":
      if (!isAlly(actor, target)) return false;
      target.flags.damageTakenMod -= 2;
      target.flags.hengshuoGuarded = true;
      removeStatus(target, STATUS.OBSERVE);
      log(state, `${label}：${target.name} 本回合受傷 -2，並移除觀測。`);
      setFx(state, "guard", label, `${target.name} 受傷 -2`, actor, target);
      if (resonance) addStatus(snapshot, actor.res.name, target, STATUS.GUARD);
      break;
    case "youming":
      if (!isEnemy(actor, target)) return false;
      damage(snapshot, actor, target, 2, { skill: true, label });
      addStatus(snapshot, label, target, STATUS.SLOW);
      if (resonance) {
        target.flags.atkMod -= 1;
        target.flags.clearAtkDebuffOnActionEnd = true;
        log(state, `${actor.res.name}：${target.name} ATK -1，持續到該目標下次行動結束。`);
      }
      record = { kind: "damage", amount: 2, name: actor.skill.name };
      break;
    case "leiting":
      if (!isEnemy(actor, target)) return false;
      damage(snapshot, actor, target, 2, { skill: true, label });
      if (resonance) addStatus(snapshot, actor.res.name, target, STATUS.OBSERVE);
      record = { kind: "damage", amount: 2, name: actor.skill.name };
      break;
    case "baijian": {
      if (!isAlly(actor, target)) return false;
      const minHp = Math.min(...alive(state.players[actor.owner].team).map(member => member.hpNow));
      heal(snapshot, target, target.hpNow === minHp ? 3 : 2, label);
      removeNegativeStatus(state, target);
      if (resonance) addStatus(snapshot, actor.res.name, target, STATUS.GUARD);
      record = { kind: "heal", amount: 2, name: actor.skill.name };
      break;
    }
    case "dengzhen":
      if (!target) return false;
      target.flags.spdMod += opts.mode === "down" ? -2 : 2;
      log(state, `${label}：${target.name} 本回合 SPD ${opts.mode === "down" ? "-2" : "+2"}。`);
      setFx(state, "support", label, `${target.name} SPD ${opts.mode === "down" ? "-2" : "+2"}`, actor, target);
      if (target.owner === actor.owner) heal(snapshot, target, 3, label);
      if (resonance) {
        target.flags.damageTakenMod -= 1;
        log(state, `${actor.res.name}：${target.name} 本回合受傷 -1。`);
      }
      buildQueue(snapshot);
      break;
    case "ino":
      if (!isEnemy(actor, target)) return false;
      if (hasStatus(target, STATUS.OBSERVE)) {
        removeStatus(target, STATUS.OBSERVE);
        damage(snapshot, actor, target, 3, { skill: true, label });
        record = { kind: "damage", amount: 3, name: actor.skill.name };
      } else {
        damage(snapshot, actor, target, 1, { skill: true, label });
        addStatus(snapshot, label, target, STATUS.OBSERVE);
        record = { kind: "damage", amount: 1, name: actor.skill.name };
      }
      if (resonance) {
        target.flags.damageTakenMod += 1;
        log(state, `${actor.res.name}：${target.name} 本回合受傷 +1。`);
      }
      break;
    case "aila":
      if (!isEnemy(actor, target)) return false;
      {
        const hadObserve = hasStatus(target, STATUS.OBSERVE);
        damage(snapshot, actor, target, 2, { skill: true, label });
        addStatus(snapshot, label, target, STATUS.SEAL);
        if (hadObserve) {
          damage(snapshot, actor, target, 2, { skill: true, label });
        }
        record = { kind: "damage", amount: hadObserve ? 4 : 2, name: actor.skill.name };
      }
      if (resonance) {
        state.players[actor.owner].energy = clamp(state.players[actor.owner].energy + 1, 0, RULES.ENERGY_MAX);
        log(state, `${actor.res.name}：${sideName(actor.owner)} 獲得 1 能量。`);
      }
      break;
    case "leiyouxi":
      if (!isEnemy(actor, target)) return false;
      damage(snapshot, actor, target, resonance && trailing(state, actor.owner) ? 4 : 3, { skill: true, label });
      if (trailing(state, actor.owner)) addStatus(snapshot, label, target, STATUS.CONFUSE);
      record = { kind: "damage", amount: 3, name: actor.skill.name };
      break;
    case "baidengling": {
      for (const ally of alive(state.players[actor.owner].team)) heal(snapshot, ally, 1, label);
      const low = lowestHpAlly(state.players[actor.owner].team);
      if (low) heal(snapshot, low, 1, "希望微光額外治癒");
      if (resonance && low) removeNegativeStatus(state, low);
      if (trailing(state, actor.owner)) {
        state.players[actor.owner].marks = clamp(state.players[actor.owner].marks + 1, 0, RULES.JUDGEMENT_MAX);
        log(state, `${label}：落後方額外獲得 1 裁定。`);
      }
      record = { kind: "heal", amount: 1, name: actor.skill.name };
      break;
    }
    case "yiaiqian":
      {
        const recordsBefore = actor.flags.records || 0;
        if (!state.lastSkill || recordsBefore < 1) {
          if (!isEnemy(actor, target)) return false;
          damage(snapshot, actor, target, 2, { skill: true, label });
          record = { kind: "damage", amount: 2, name: actor.skill.name };
        } else {
          actor.flags.records -= 1;
          const amount = state.lastSkill.amount + 1;
          if (state.lastSkill.kind === "damage") damage(snapshot, actor, target, amount, { skill: true, label });
          else heal(snapshot, target, amount, label);
          record = { kind: state.lastSkill.kind, amount, name: actor.skill.name };
        }
        if (resonance) {
          const gain = recordsBefore === 1 ? 2 : 1;
          state.players[actor.owner].energy = clamp(state.players[actor.owner].energy + gain, 0, RULES.ENERGY_MAX);
          log(state, `${actor.res.name}：${sideName(actor.owner)} 獲得 ${gain} 能量${recordsBefore === 1 ? "（消耗最後 1 個紀錄，額外 +1）" : ""}。`);
        }
      }
      break;
    case "weixiang":
      if (!isAlly(actor, target)) return false;
      addStatus(snapshot, label, target, STATUS.GUARD);
      heal(snapshot, target, 1, label);
      if (resonance) {
        target.flags.damageTakenMod -= 1;
        log(state, `${actor.res.name}：${target.name} 本回合下次受傷額外 -1。`);
      }
      record = { kind: "heal", amount: 1, name: actor.skill.name };
      break;
    case "xiaomo": {
      if (!isEnemy(actor, target)) return false;
      const heads = coin();
      log(state, `${label} 擲硬幣：${heads ? "正面" : "反面"}。`);
      if (heads) {
        damage(snapshot, actor, target, 4, { skill: true, label });
        record = { kind: "damage", amount: 4, name: actor.skill.name };
      } else {
        addStatus(snapshot, label, target, STATUS.CONFUSE);
        log(state, `${label}：反面不造成傷害且不觸發「下注」的遲緩追加。`);
      }
      break;
    }
    case "huiyin": {
      const copy = state.lastCopyableSkill?.[actor.owner];
      if (copy) {
        const amount = copy.amount + 1;
        if (copy.kind === "damage") damage(snapshot, actor, target, amount, { skill: true, label: `${label} 複製 ${copy.name}` });
        else heal(snapshot, target, amount, `${label} 複製 ${copy.name}`);
        record = { kind: copy.kind, amount, name: actor.skill.name };
      } else {
        if (!isEnemy(actor, target)) return false;
        damage(snapshot, actor, target, 2, { skill: true, label });
        record = { kind: "damage", amount: 2, name: actor.skill.name };
      }
      break;
    }
    case "yingli": {
      if (!isEnemy(actor, target)) return false;
      const hadConfuse = hasStatus(target, STATUS.CONFUSE);
      damage(snapshot, actor, target, 1, { skill: true, label });
      addStatus(snapshot, label, target, STATUS.CONFUSE);
      if (hadConfuse) damage(snapshot, actor, target, 2, { skill: true, label });
      record = { kind: "damage", amount: hadConfuse ? 3 : 1, name: actor.skill.name };
      if (resonance) {
        actor.flags.damageTakenMod -= 1;
        log(state, `${actor.res.name}：映璃本回合受傷 -1。`);
      }
      break;
    }
    case "tianxun": {
      const selected = (opts.choices || []).slice(0, resonance ? 2 : 1);
      if (!selected.length) return false;
      for (const choice of selected) {
        if (choice === "atk") state.tianAtkBuff = true;
        if (choice === "skill") state.tianSkillDebuff = true;
        if (choice === "spd") for (const ally of alive(state.players[actor.owner].team)) ally.flags.spdMod += 2;
        if (choice === "low") state.lowestFirst = true;
      }
      if (resonance) actor.flags.noDefend = true;
      log(state, `${label} 套用：${selected.join("、")}。`);
      setFx(state, "support", label, selected.join("、"), actor, actor);
      buildQueue(snapshot);
      break;
    }
    case "kelu": {
      if (!isEnemy(actor, target)) return false;
      let increased = false;
      damage(snapshot, actor, target, 2, { skill: true, label });
      if (target.cd > 0) {
        const bonus = hasStatus(target, STATUS.TIME_TAX) ? 2 : 1;
        target.cd += bonus;
        increased = true;
        if (hasStatus(target, STATUS.TIME_TAX)) {
          removeStatus(target, STATUS.TIME_TAX);
          target.flags.timeTaxMark = null;
        }
        log(state, `${label}：${target.name} 技能冷卻 +${bonus}。`);
        setFx(state, "status", label, `${target.name} 冷卻 +${bonus}`, actor, target);
      } else {
        addStatus(snapshot, label, target, STATUS.DELAY);
      }
      record = { kind: "damage", amount: 2, name: actor.skill.name };
      actor.flags.keluIncreasedCdThisSkill = increased;
      if (resonance && increased && !actor.flags.keluResUsedRound) {
        actor.flags.keluResUsedRound = true;
        state.players[actor.owner].energy = clamp(state.players[actor.owner].energy + 1, 0, RULES.ENERGY_MAX);
        log(state, `刻律「秒針斷裂」：冷卻增加成功，獲得 1 能量。`);
      }
      break;
    }
    case "songya": {
      if (!isEnemy(actor, target)) return false;
      const upgraded = !!target.flags.debtMark;
      applyDebtMark(state, actor, target, upgraded);
      if (resonance && debtTarget(state) && !actor.flags.songyaResUsedRound) {
        actor.flags.songyaResUsedRound = true;
        heal(snapshot, actor, 1, { actor, label: actor.res.name });
      }
      break;
    }
    case "qiheng": {
      if (!isEnemy(actor, target)) return false;
      const source = parseTarget(state, opts.qihengSourceKey);
      const loss = numberOr(opts.qihengLoss, 0);
      if (!source || source.owner !== actor.owner || source.hpNow - loss < 1 || ![1, 2, 3].includes(loss)) return false;
      const lost = loseHpAsCost(state, source, loss, label);
      damage(snapshot, actor, target, 2 + lost, { skill: true, label });
      if (lost === 3) {
        source.flags.nextDamageTakenReduction -= 1;
        log(state, `${label}：代價來源 ${source.name} 本回合下次受傷 +1。`);
      }
      if (resonance && lost === 1) {
        const low = lowestHpAlly(state.players[actor.owner].team);
        if (low) heal(snapshot, low, 1, { actor, label: actor.res.name });
      } else if (resonance && lost === 2) {
        heal(snapshot, actor, 1, { actor, label: actor.res.name });
      } else if (resonance && lost === 3) {
        log(state, `${actor.res.name}：代價來源失去 3 HP，不觸發共鳴治癒。`);
      }
      record = { kind: "damage", amount: 2 + lost, name: actor.skill.name };
      break;
    }
    case "shili": {
      if (!isEnemy(actor, target)) return false;
      const bonus = target.flags.healedThisRound ? 1 : 0;
      damage(snapshot, actor, target, 2 + bonus, { skill: true, label });
      if (bonus) log(state, `${label}：${target.name} 本回合曾受到治療，額外造成 1 傷害。`);
      addCorrosion(snapshot, { actor, label }, target);
      if (resonance && corrosionStacks(target) > 0) {
        const spread = alive(state.players[target.owner].team).find(enemy => enemy.id !== target.id);
        if (spread) addCorrosion(snapshot, { actor, label: actor.res.name }, spread);
        else log(state, `${actor.res.name}：沒有另一名敵方角色可擴散腐蝕。`);
      }
      record = { kind: "damage", amount: 2 + bonus, name: actor.skill.name };
      break;
    }
    case "fengxing":
      if (!isEnemy(actor, target)) return false;
      if (!applyStitch(snapshot, actor, target)) return false;
      break;
    case "liewu":
      if (target !== actor || (actor.flags.battleIntent || 0) < 2) return false;
      actor.flags.battleIntent -= 2;
      actor.flags.liewuGuardReady = true;
      log(state, `${label}：消耗 2 層戰意，本回合首次受傷 -2。`);
      setFx(state, "guard", label, "收勢護身", actor, actor);
      if (resonance) heal(snapshot, actor, 1, actor.res.name);
      break;
    case "jingren":
      if (target !== actor) return false;
      addStatus(snapshot, label, actor, STATUS.GUARD);
      actor.flags.nextRoundSpdMod += 3;
      log(state, `${label}：下回合 SPD 變為 4。`);
      break;
    case "xuntian":
      if (!isEnemy(actor, target)) return false;
      damage(snapshot, actor, target, 3, { skill: true, label });
      actor.flags.skillCostUp += 1;
      if (resonance && target.hpNow > 0 && target.hpNow <= 2) damage(snapshot, actor, target, 1, { skill: true, label: actor.res.name });
      record = { kind: "damage", amount: 3, name: actor.skill.name };
      break;
    case "zuozhe":
      if (!isEnemy(actor, target)) return false;
      damage(snapshot, actor, target, 2, { skill: true, label });
      if (coin()) {
        log(state, `${label} 擲硬幣：正面。`);
        addStatus(snapshot, label, target, STATUS.CONFUSE);
      } else {
        log(state, `${label} 擲硬幣：反面。`);
        target.flags.atkMod -= 1;
        target.flags.spdMod -= 1;
        target.flags.nextRoundAtkMod -= 1;
        target.flags.nextRoundSpdMod -= 1;
        log(state, `${target.name} 本回合與下回合 ATK / SPD -1。`);
      }
      if (resonance) addStatus(snapshot, actor.res.name, target, STATUS.OBSERVE);
      break;
    default:
      return false;
  }

  if (record) {
    state.lastSkill = record;
    if (!["ningyao", "zuozhe", "huiyin"].includes(actor.id)) {
      state.lastCopyableSkill[actor.owner] = { ...record, name: actor.skill.name };
    }
  }
  return true;
}

function normalizeBattleState(snapshot) {
  const state = getState(snapshot);
  if (!state) return null;
  if (!Array.isArray(state.logs)) state.logs = [];
  if (!Array.isArray(state.fxQueue)) state.fxQueue = [];
  if (!state.lastCopyableSkill) state.lastCopyableSkill = { p1: null, p2: null };
  if (state.pendingDebt === undefined) state.pendingDebt = null;
  if (state.pendingTianxunFocus === undefined) state.pendingTianxunFocus = null;
  if (state.pendingQihengBalance === undefined) state.pendingQihengBalance = null;
  if (state.pendingFengxingStar === undefined) state.pendingFengxingStar = null;
  if (!state.players) return state;

  for (const side of SIDES) {
    if (!state.players[side]) state.players[side] = createEmptyPlayer(side);
    const player = state.players[side];
    player.energy = clamp(numberOr(player.energy, RULES.ENERGY_START), 0, RULES.ENERGY_MAX);
    player.marks = clamp(numberOr(player.marks, RULES.JUDGEMENT_START), 0, RULES.JUDGEMENT_MAX);
    player.resUsed = clamp(numberOr(player.resUsed, 0), 0, RULES.RESONANCE_PER_ROUND);
    player.judgementUsed = !!player.judgementUsed;
    player.openingDefenseUsed = !!player.openingDefenseUsed;
    player.team = Array.isArray(player.team) ? player.team : [];
    for (const fighter of player.team) normalizeFighter(fighter, side);
  }
  ensureBattleStats(state);
  return state;
}

function createPlayer(side, draftIds, chars) {
  return {
    energy: RULES.ENERGY_START,
    marks: RULES.JUDGEMENT_START,
    judgementUsed: false,
    resUsed: 0,
    openingDefenseUsed: false,
    team: draftIds.map(id => createFighter(findChar(chars, id), side)).filter(Boolean)
  };
}

function createEmptyPlayer(_side?: Side) {
  return {
    energy: RULES.ENERGY_START,
    marks: RULES.JUDGEMENT_START,
    judgementUsed: false,
    resUsed: 0,
    openingDefenseUsed: false,
    team: []
  };
}

function createFighter(card, owner) {
  if (!card) return null;
  const fighter = structuredCloneSafe(card);
  fighter.owner = owner;
  fighter.maxHp = card.hp + RULES.BATTLE_HP_BONUS;
  fighter.hpNow = fighter.maxHp;
  fighter.cd = 0;
  fighter.statuses = [];
  fighter.flags = defaultFlags();
  return fighter;
}

function normalizeFighter(fighter, owner) {
  fighter.owner = fighter.owner || owner;
  fighter.maxHp = numberOr(fighter.maxHp, fighter.hp || 1);
  fighter.hpNow = clamp(numberOr(fighter.hpNow, fighter.maxHp), 0, fighter.maxHp);
  fighter.cd = Math.max(0, numberOr(fighter.cd, 0));
  fighter.statuses = uniqueIds(Array.isArray(fighter.statuses) ? fighter.statuses : []).filter(status => Object.values(STATUS).includes(status));
  fighter.flags = { ...defaultFlags(), ...(fighter.flags || {}) };
  fighter.flags.corrosionStacks = clamp(numberOr(fighter.flags.corrosionStacks, hasStatus(fighter, STATUS.CORROSION) ? 1 : 0), 0, 2);
  if (fighter.flags.corrosionStacks > 0 && !hasStatus(fighter, STATUS.CORROSION)) fighter.statuses.push(STATUS.CORROSION);
  if (fighter.flags.corrosionStacks <= 0 && hasStatus(fighter, STATUS.CORROSION)) fighter.statuses = fighter.statuses.filter(status => status !== STATUS.CORROSION);
  return fighter;
}

function defaultFlags() {
  return {
    defended: false,
    immuneNextDebuff: false,
    passiveUsed: false,
    tookDamage: false,
    firstDamageReduced: false,
    firstTeamDamageReduced: false,
    noAttack: false,
    noSkill: false,
    noDefend: false,
    cannotAttackYingli: false,
    skillTargeted: false,
    atkMod: 0,
    spdMod: 0,
    damageTakenMod: 0,
    nextDamageTakenReduction: 0,
    judgementDamageBonus: 0,
    skillCostUp: 0,
    noResNextSkill: false,
    nextRoundAtkMod: 0,
    nextRoundSpdMod: 0,
    buffDmgNext: 0,
    records: 0,
    usedSkillThisRound: false,
    hengshuoGuarded: false,
    hengshuoGuardUsed: false,
    hengshuoRedirectUsed: false,
    huiyinUsed: false,
    leitingResCount: 0,
    inoUsed: 0,
    inoRoundUsed: 0,
    confuseDamageCap: false,
    mirrorReflectUsed: 0,
    mirrorReflectRound: 0,
    mirrorReflectCurrent: false,
    mirrorReflectedThisAction: false,
    mirrorReflectedOwner: "",
    clearAtkDebuffOnActionEnd: false,
    timeTaxMark: null,
    keluResUsedRound: false,
    keluIncreasedCdThisSkill: false,
    debtMark: null,
    debtPromptedRound: 0,
    actionTargetedSongya: false,
    songyaResUsedRound: false,
    qihengBalancePromptedRound: 0,
    shiliPassiveRound: 0,
    healedThisRound: false,
    corrosionStacks: 0,
    tianxunFocusPromptedRound: 0,
    fengxingStarPromptedRound: 0,
    starLine: null,
    stitchMark: null,
    battleIntent: 0,
    liewuGuardReady: false
  };
}

function startRoundForFighter(state, fighter) {
  fighter.cd = Math.max(0, fighter.cd - 1);
  const keepYoumingAtkDebuff = !!fighter.flags.clearAtkDebuffOnActionEnd;
  Object.assign(fighter.flags, {
    tookDamage: false,
    firstDamageReduced: false,
    firstTeamDamageReduced: false,
    noDefend: false,
    cannotAttackYingli: false,
    skillTargeted: false,
    atkMod: 0,
    spdMod: 0,
    damageTakenMod: 0,
    nextDamageTakenReduction: 0,
    judgementDamageBonus: 0,
    hengshuoGuarded: false,
    hengshuoGuardUsed: false,
    hengshuoRedirectUsed: false,
    huiyinUsed: false,
    confuseDamageCap: false,
    mirrorReflectCurrent: false,
    mirrorReflectedThisAction: false,
    mirrorReflectedOwner: "",
    clearAtkDebuffOnActionEnd: keepYoumingAtkDebuff,
    keluResUsedRound: false,
    keluIncreasedCdThisSkill: false,
    actionTargetedSongya: false,
    songyaResUsedRound: false,
    shiliPassiveRound: 0,
    healedThisRound: false,
    usedSkillThisRound: false,
    liewuGuardReady: false
  });
  if (fighter.flags.nextRoundAtkMod) {
    fighter.flags.atkMod += fighter.flags.nextRoundAtkMod;
    fighter.flags.nextRoundAtkMod = 0;
  }
  if (keepYoumingAtkDebuff) fighter.flags.atkMod -= 1;
  if (fighter.flags.nextRoundSpdMod) {
    fighter.flags.spdMod += fighter.flags.nextRoundSpdMod;
    fighter.flags.nextRoundSpdMod = 0;
  }
  if (fighter.flags.noAttack) fighter.flags.noAttack = false;
  if (fighter.id === "aila" && hasStatus(fighter, STATUS.SEAL)) {
    removeStatus(fighter, STATUS.SEAL);
    log(state, "艾菈被動：回合開始移除自身封印。");
  }
}

function applyRoundStartPassives(snapshot) {
  const state = normalizeBattleState(snapshot);
  for (const side of SIDES) {
    const player = state.players[side];
    const dengzhen = alive(player.team).find(fighter => fighter.id === "dengzhen" && fighter.cd === 0);
    if (dengzhen && (state.round || 0) - (dengzhen.flags.dengzhenEnergyRound || -99) >= 2) {
      dengzhen.flags.dengzhenEnergyRound = state.round || 0;
      player.energy = clamp(player.energy + 1, 0, RULES.ENERGY_MAX);
      log(state, `燈真被動：${sideName(side)} 獲得 1 能量。`);
    }
  }
}

function clearSlowAfterQueue(state) {
  for (const side of SIDES) {
    for (const fighter of alive(state.players[side].team)) {
      if (hasStatus(fighter, STATUS.SLOW)) {
        removeStatus(fighter, STATUS.SLOW);
        log(state, `${fighter.name} 的遲緩已影響本回合行動順序，現在移除。`);
      }
    }
  }
}

function setActiveFromQueue(snapshot) {
  const state = normalizeBattleState(snapshot);
  state.queue = (state.queue || []).filter(item => getFighter(state, item.side, item.id)?.hpNow > 0);
  state.active = state.queue[0] || null;
  const actor = activeF(snapshot);
  if (actor) {
    if (actor.flags.defended || actor.flags.immuneNextDebuff) {
      actor.flags.defended = false;
      actor.flags.immuneNextDebuff = false;
      log(state, `${actor.name} 開始行動，防禦狀態結束。`);
    }
    log(state, `輪到 ${sideName(actor.owner)} ${actor.name} 行動。`);
  }
}

function performAttack(snapshot: RuleSnapshot, actor: Fighter, target: Fighter, confused: boolean, opts: RuleActionOptions = {}) {
  const state = normalizeBattleState(snapshot);
  actor.flags.mirrorReflectedThisAction = false;
  actor.flags.mirrorReflectedOwner = "";
  actor.flags.actionTargetedSongya = false;
  markDebtTargeting(state, actor, target);
  if (confused || hasStatus(actor, STATUS.CONFUSE)) {
    removeStatus(actor, STATUS.CONFUSE);
    log(state, `${actor.name} 混亂發作，攻擊目標變為 ${target.name}。`);
  }
  actor.flags.confuseDamageCap = !!(confused && target.owner === actor.owner);
  let amount = currentAtk(actor);
  if (actor.id === "leiting" && target.hpNow > actor.hpNow) {
    amount += 1;
    log(state, "雷霆被動：普攻 HP 高於自己的敵人，傷害 +1。");
  }
  if (actor.id === "xuntian" && (hasStatus(target, STATUS.SEAL) || hasStatus(target, STATUS.CONFUSE))) {
    amount += 1;
    log(state, "訊天被動：攻擊封印/混亂目標，傷害 +1。");
  }
  if (actor.flags.buffDmgNext) {
    amount += actor.flags.buffDmgNext;
    log(state, `雷幽曦被動：下一次造成傷害 +${actor.flags.buffDmgNext}。`);
    actor.flags.buffDmgNext = 0;
  }
  if (state.tianAtkBuff) {
    amount += 2;
    log(state, "天訊規則補充：普攻傷害 +2。");
  }
  const combo = actor.id === "liewu" && opts.liewuUseCombo
    ? clamp(actor.flags.battleIntent || 0, 0, 1)
    : 0;
  if (combo > 0) {
    actor.flags.battleIntent = Math.max(0, (actor.flags.battleIntent || 0) - combo);
    log(state, `裂舞消耗 1 層戰意，普通攻擊後追加 1 傷害。`);
  }
  damage(snapshot, actor, target, amount, { label: `${actor.name} 普通攻擊`, attack: true, mirrorReflect: !!opts.mirrorReflect });
  for (let i = 1; i <= combo && actor.hpNow > 0 && target.hpNow > 0; i += 1) {
    damage(snapshot, actor, target, 1, {
      label: `${actor.name} 戰意追擊`,
      attack: true,
      mirrorReflect: !!opts.mirrorReflect
    });
  }
  actor.flags.confuseDamageCap = false;
  log(state, "普通攻擊結算完成：依規則不觸發共鳴。");
}

function redirectTarget(state, target, dmg, source) {
  const team = state.players[target.owner].team;
  const guard = team.find(fighter => fighter.id !== target.id && fighter.hpNow > 0 && hasStatus(fighter, STATUS.GUARD));
  if (guard && dmg > 0) {
    removeStatus(guard, STATUS.GUARD);
    recordProtection(state, guard, target, dmg);
    log(state, `${guard.name} 的守護代替 ${target.name} 承受傷害，守護移除。`);
    return guard;
  }
  const hengshuo = team.find(fighter => fighter.id === "hengshuo" && fighter.id !== target.id && fighter.hpNow > 0 && !fighter.flags.hengshuoRedirectUsed);
  if (hengshuo && dmg > 0) {
    hengshuo.flags.hengshuoRedirectUsed = true;
    hengshuo.flags.damageTakenMod += 1;
    recordProtection(state, hengshuo, target, dmg);
    log(state, `衡朔被動：代替 ${target.name} 承受此次傷害，且本回合衡朔受傷 +1。`);
    return hengshuo;
  }
  return target;
}

function knockout(snapshot: RuleSnapshot, fighter: Fighter, source: RuleSource, context: KnockoutContext = {}) {
  const state = normalizeBattleState(snapshot);
  const player = state.players[fighter.owner];
  const sourceActor = actorFromSource(snapshot, source);

  if (fighter.id === "ningyao" && !fighter.flags.passiveUsed && context.marksBeforeDamage > 0) {
    fighter.flags.passiveUsed = true;
    player.marks = clamp(player.marks - 1, 0, RULES.JUDGEMENT_MAX);
    fighter.hpNow = 1;
    recordOneHpSave(state, fighter);
    log(state, `寧曜被動：傷害結算前已有裁定，消耗 1 裁定保留 1 HP。`);
    return;
  }
  if (fighter.id === "ningyao" && !fighter.flags.passiveUsed && context.marksBeforeDamage <= 0) {
    log(state, `寧曜被動未觸發：該次傷害結算前沒有裁定，不能用擊倒後獲得的裁定回溯保命。`);
  }
  if (fighter.id === "baidengling" && !fighter.flags.passiveUsed) {
    fighter.flags.passiveUsed = true;
    fighter.flags.noSkill = true;
    fighter.hpNow = 1;
    recordOneHpSave(state, fighter);
    log(state, `白燈澪被動：保留 1 HP，下回合不能使用技能。`);
    return;
  }
  if (fighter.id === "xiaomo" && !fighter.flags.passiveUsed) {
    fighter.flags.passiveUsed = true;
    if (coin()) {
      fighter.hpNow = 1;
      recordOneHpSave(state, fighter);
      log(state, `小莫被動擲出正面：保留 1 HP。`);
      return;
    }
    player.marks = clamp(player.marks + 1, 0, RULES.JUDGEMENT_MAX);
    log(state, `小莫被動擲出反面：${sideName(fighter.owner)} 獲得 1 裁定。`);
  }
  if (fighter.id === "zuozhe" && !fighter.flags.passiveUsed) {
    fighter.flags.passiveUsed = true;
    const enemies = alive(state.players[other(fighter.owner)].team);
    const minHp = Math.min(...enemies.map(enemy => enemy.hpNow));
    for (const enemy of enemies) damage(snapshot, fighter, enemy, enemy.hpNow === minHp ? 2 : 1, { label: "作者被動", zuozhePassive: true });
  }

  if (fighter.flags?.debtMark) {
    const mark = fighter.flags.debtMark;
    fighter.flags.debtMark = null;
    fighter.flags.actionTargetedSongya = false;
    log(state, `${fighter.name} 被擊倒，身上的${debtLabel(mark.level)}移除。`);
  }
  if (fighter.id === "songya") clearSongyaDebts(state, fighter);
  if (fighter.flags?.starLine) {
    fighter.flags.starLine = null;
    log(state, `${fighter.name} 被擊倒，身上的星線移除。`);
  }
  if (fighter.id === "fengxing") {
    clearStarLines(state, "縫星被擊倒");
    for (const enemy of allBattleFighters(state)) {
      const mark = enemy.flags?.stitchMark;
      if (mark && mark.owner === fighter.owner && mark.actorId === fighter.id) {
        removeStatus(enemy, STATUS.STITCH);
        log(state, `${fighter.name} 被擊倒，${enemy.name} 的縫線移除。`);
      }
    }
  }

  const leiyouxi = alive(player.team).find(member => member.id === "leiyouxi");
  if (leiyouxi) {
    const before = leiyouxi.flags.buffDmgNext || 0;
    leiyouxi.flags.buffDmgNext = Math.min(1, before + 1);
    if (leiyouxi.flags.buffDmgNext > before) {
      log(state, `雷幽曦被動：我方角色被擊倒，下一次造成傷害 +1（最多 1 層）。`);
    }
  }
  player.marks = clamp(player.marks + 1, 0, RULES.JUDGEMENT_MAX);
  recordKnockout(state, sourceActor, fighter);
  log(state, `${fighter.name} 被擊倒，${sideName(fighter.owner)} 立即獲得 1 裁定（${player.marks}/${RULES.JUDGEMENT_MAX}）。`);

  if (context.zuozhePassive && sourceActor?.id === "zuozhe" && sourceActor.owner !== fighter.owner) {
    const sourcePlayer = state.players[sourceActor.owner];
    sourcePlayer.marks = clamp(sourcePlayer.marks + 1, 0, RULES.JUDGEMENT_MAX);
    log(state, `作者被動擊倒敵人：${sideName(sourceActor.owner)} 額外獲得 1 裁定。`);
  }
}

function resolveWinner(state) {
  const p1Alive = alive(state.players.p1.team).length;
  const p2Alive = alive(state.players.p2.team).length;
  if (!p1Alive && !p2Alive) state.winner = "平手";
  else if (!p1Alive) state.winner = "P2";
  else if (!p2Alive) state.winner = "P1";
  if (state.winner) {
    const stats = ensureBattleStats(state);
    stats.winner = state.winner;
    stats.totalRounds = state.round || 0;
    if (!stats.victoryMethod) stats.victoryMethod = state.winner === "平手" ? "同歸於盡" : "全滅勝利";
    log(state, `戰鬥結束：${state.winner} 勝利。`);
  }
}

function removeNegativeStatus(state, fighter) {
  const status = fighter.statuses.find(item => NEGATIVE_STATUSES.includes(item));
  if (!status) {
    log(state, `${fighter.name} 沒有可移除的負面狀態。`);
    return null;
  }
  removeStatus(fighter, status);
  recordStatusRemoved(state, activeF({ state }) || fighter);
  log(state, `${fighter.name} 移除 ${status}。`);
  return status;
}

function clearActionEndSeal(state, actor) {
  if (hasStatus(actor, STATUS.SEAL)) {
    removeStatus(actor, STATUS.SEAL);
    log(state, `${actor.name} 行動結束，封印移除。`);
  }
  if (actor.flags.clearAtkDebuffOnActionEnd) {
    actor.flags.clearAtkDebuffOnActionEnd = false;
    actor.flags.atkMod += 1;
    log(state, `${actor.name} 行動結束，幽冥「暗痕」的 ATK -1 移除。`);
  }
  if (actor.flags.noSkill) {
    actor.flags.noSkill = false;
    log(state, `${actor.name} 的技能限制解除。`);
  }
}

function enemyInoFor(state, actor) {
  return alive(state.players[other(actor.owner)].team).find(fighter =>
    fighter.id === "ino"
    && fighter.flags.inoUsed < 2
    && fighter.flags.inoRoundUsed !== state.round
  );
}

function tianChoicesOk(state, actor, resonance, choices) {
  if (actor.id !== "tianxun") return true;
  const max = resonance ? 2 : 1;
  if (!choices.length) {
    log(state, "天訊技能至少要選 1 項效果。");
    return false;
  }
  if (choices.length > max) {
    log(state, `天訊${resonance ? "共鳴" : "未共鳴"}最多只能選 ${max} 項。`);
    return false;
  }
  return true;
}

function recordYiaiqian(state) {
  for (const side of SIDES) {
    const yiaiqian = alive(state.players[side].team).find(fighter => fighter.id === "yiaiqian");
    if (yiaiqian) {
      yiaiqian.flags.records = clamp((yiaiqian.flags.records || 0) + 1, 0, 3);
      log(state, `伊艾栞被動：獲得 1 紀錄（${yiaiqian.flags.records}/3）。`);
    }
  }
}

function snapshotSkillRecord(state) {
  return {
    lastSkill: state.lastSkill ? { ...state.lastSkill } : null,
    lastCopyableSkill: {
      p1: state.lastCopyableSkill?.p1 ? { ...state.lastCopyableSkill.p1 } : null,
      p2: state.lastCopyableSkill?.p2 ? { ...state.lastCopyableSkill.p2 } : null
    }
  };
}

function restoreSkillRecord(state, snapshot) {
  state.lastSkill = snapshot.lastSkill;
  state.lastCopyableSkill = snapshot.lastCopyableSkill;
}

function getState(snapshot) {
  return snapshot?.state || snapshot || null;
}

function getFighter(state, side, id) {
  return state?.players?.[side]?.team?.find(fighter => fighter.id === id) || null;
}

function parseTarget(state, key) {
  if (!key || !state?.players) return null;
  const [side, id] = String(key).split(":");
  if (!SIDES.includes(side as Side)) return null;
  return getFighter(state, side as Side, id);
}

function findChar(chars, id) {
  return chars.find(char => char.id === id);
}

function isAlly(actor, target) {
  return !!actor && !!target && target.owner === actor.owner && target.hpNow > 0;
}

function isEnemy(actor, target) {
  return !!actor && !!target && target.owner !== actor.owner && target.hpNow > 0;
}

function alive(team) {
  return (team || []).filter(fighter => fighter.hpNow > 0);
}

function lowestHpAlly(team) {
  return alive(team).sort((a, b) => a.hpNow - b.hpNow || a.maxHp - b.maxHp || a.id.localeCompare(b.id))[0] || null;
}

function trailing(state, side) {
  return deadCount(state, side) > deadCount(state, other(side));
}

function deadCount(state, side) {
  return RULES.TEAM_SIZE - alive(state.players[side].team).length;
}

function tieBreakBySide(state, a, b) {
  const aTrailing = trailing(state, a.side);
  const bTrailing = trailing(state, b.side);
  if (aTrailing !== bTrailing) return aTrailing ? -1 : 1;
  return a.id.localeCompare(b.id);
}

function other(side) {
  return side === "p1" ? "p2" : "p1";
}

function sideName(side) {
  return side === "p1" ? "P1" : "P2";
}

function hasStatus(fighter, status) {
  return !!fighter?.statuses?.includes(status);
}

function removeStatus(fighter, status) {
  if (!fighter?.statuses) return;
  fighter.statuses = fighter.statuses.filter(item => item !== status);
  if (status === STATUS.CORROSION) fighter.flags.corrosionStacks = 0;
  if (status === STATUS.STITCH) fighter.flags.stitchMark = null;
}

function uniqueIds<T extends string>(list: T[] = []) {
  return [...new Set((list || []).filter(Boolean))];
}

function log(state, message) {
  if (!state) return;
  if (!Array.isArray(state.logs)) state.logs = [];
  state.logs.push(message);
  if (state.logs.length > RULES.LOG_MAX) state.logs.splice(0, state.logs.length - RULES.LOG_MAX);
}

let fxSerial = 0;

function setFx(state, kind, title, sub, actor = null, target = null) {
  const keyOf = fighter => fighter?.owner && fighter?.id ? `${fighter.owner}:${fighter.id}` : "";
  const event = { kind, title, sub, stamp: Date.now() + ((fxSerial++ % 1000) / 1000), actorKey: keyOf(actor), targetKey: keyOf(target) };
  if (!Array.isArray(state.fxQueue)) state.fxQueue = [];
  state.fxQueue.push(event);
  if (state.fxQueue.length > 48) state.fxQueue.splice(0, state.fxQueue.length - 48);
  state.fx = event;
  return event;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function coin() {
  return Math.random() >= 0.5;
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
