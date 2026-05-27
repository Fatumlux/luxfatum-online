export const STATUS = {
  SEAL: "封印",
  OBSERVE: "觀測",
  CONFUSE: "混亂",
  SLOW: "遲緩",
  GUARD: "守護"
};

export const NEGATIVE_STATUSES = [STATUS.SEAL, STATUS.OBSERVE, STATUS.CONFUSE, STATUS.SLOW];

export const RULES = {
  TEAM_SIZE: 3,
  ENERGY_START: 2,
  ENERGY_MAX: 6,
  ENERGY_PER_ROUND: 2,
  JUDGEMENT_START: 0,
  JUDGEMENT_MAX: 3,
  RESONANCE_PER_ROUND: 2,
  LOG_MAX: 220
};

const SIDES = ["p1", "p2"];

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
  if (typeof window === "undefined" || window.LuxFatumRules?.version === "4.2.2-rules") return;

  const bridge = {
    version: "4.2.2-rules",
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
    confusionTargets: actor => confusionTargets(readGameSnapshot(), actor),
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
  state.lastSkill = null;
  state.lastCopyableSkill = { p1: null, p2: null };
  state.lowestFirst = false;
  state.tianAtkBuff = false;
  state.tianSkillDebuff = false;
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
  buildQueue(snapshot);
  clearSlowAfterQueue(state);
  setActiveFromQueue(snapshot);
  return { ok: true };
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

export function requestAttack(snapshot) {
  const state = normalizeBattleState(snapshot);
  const actor = activeF(snapshot);
  if (!actor) return { ok: false };
  if (actor.flags.noAttack) {
    log(state, `${actor.name} 本回合不能攻擊。`);
    return { ok: false };
  }
  if (hasStatus(actor, STATUS.CONFUSE)) {
    state.pendingConfuseAttack = { actorSide: actor.owner, actorId: actor.id, action: "attack" };
    log(state, `${actor.name} 受到混亂影響，等待對手指定攻擊目標。`);
    return { ok: true, pending: "confuse" };
  }
  return { ok: true, openDialog: true };
}

export function attack(snapshot, targetKey, opts = {}) {
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
  performAttack(snapshot, actor, target, !!opts.confused);
  clearActionEndSeal(state, actor);
  return { ok: true, actionSpent: true };
}

export function decideConfuseTarget(snapshot, targetKey) {
  const state = normalizeBattleState(snapshot);
  const pending = state?.pendingConfuseAttack;
  if (!pending) return { ok: false };

  const actor = getFighter(state, pending.actorSide, pending.actorId);
  const target = parseTarget(state, targetKey);
  if (!actor || !target) {
    state.pendingConfuseAttack = null;
    return { ok: false };
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

export function useSkill(snapshot, targetKey, opts = {}) {
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
    return { ok: false, actionSpent: true };
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

  if (!tianChoicesOk(state, actor, resonance, opts.choices || [])) return { ok: false, closeDialog: false };
  if (hasStatus(actor, STATUS.CONFUSE) && skillFilter(actor) !== "none" && !opts.confuseTargetChosen) {
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

export function decideIno(snapshot, useInterference) {
  const state = normalizeBattleState(snapshot);
  const pending = state?.pendingSkill;
  if (!pending) return { ok: false };
  state.pendingSkill = null;
  return executeSkill(snapshot, pending.targetKey, { ...pending.opts, actorId: pending.actorId, inoDecision: !!useInterference });
}

export function defend(snapshot) {
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
  clearActionEndSeal(state, actor);
  return { ok: true, actionSpent: true };
}

export function rest(snapshot) {
  const state = normalizeBattleState(snapshot);
  const actor = activeF(snapshot);
  if (!actor) return { ok: false };
  heal(snapshot, actor, 1, "休息");
  removeNegativeStatus(state, actor);
  clearActionEndSeal(state, actor);
  return { ok: true, actionSpent: true };
}

export function judgement(snapshot, type, targetKey) {
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
    heal(snapshot, target, 1, "裁定");
    log(state, `裁定：${target.name} 技能冷卻 -1。`);
  } else if (type === "seal") {
    target.flags.noResNextSkill = true;
    addStatus(snapshot, "裁定封殺", target, STATUS.SLOW);
    log(state, `裁定：${target.name} 下一次技能共鳴被取消，並獲得遲緩。`);
  }
  return { ok: true };
}

export function finishAction(snapshot) {
  const state = normalizeBattleState(snapshot);
  if (!state?.players) return { ok: false };
  resolveWinner(state);
  if (state.winner) return { ok: true };

  if (state.queue?.length) state.queue.shift();
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
    if (baijian && player.team.some(fighter => fighter.flags.tookDamage)) {
      const target = lowestHpAlly(player.team);
      if (target) heal(snapshot, target, 1, "白繭被動");
    }
  }
  log(state, `第 ${state.round} 回合結束。`);
  nextRound(snapshot);
  return { ok: true };
}

export function currentAtk(fighter) {
  return Math.max(0, (fighter?.atk || 0) + (fighter?.flags?.atkMod || 0));
}

export function currentSpd(fighter) {
  return Math.max(0, (fighter?.spd || 0) + (fighter?.flags?.spdMod || 0) - (hasStatus(fighter, STATUS.SLOW) ? 1 : 0));
}

export function activeF(snapshot) {
  const state = getState(snapshot);
  if (!state?.active || !state.players) return null;
  return getFighter(state, state.active.side, state.active.id);
}

export function targetList(snapshot, filter) {
  const state = normalizeBattleState(snapshot);
  const actor = activeF(snapshot);
  if (!state?.players || !actor) return [];
  const out = [];
  for (const side of SIDES) {
    for (const fighter of alive(state.players[side].team)) {
      if (filter === "ally" && side !== actor.owner) continue;
      if (filter === "enemy" && side === actor.owner) continue;
      if (filter === "none") continue;
      out.push({ key: `${side}:${fighter.id}`, side, c: fighter });
    }
  }
  return out;
}

export function confusionTargets(snapshot, actor) {
  const state = normalizeBattleState(snapshot);
  if (!state?.players) return [];
  const out = [];
  for (const side of SIDES) {
    for (const fighter of alive(state.players[side].team)) {
      if (actor?.flags?.cannotAttackYingli && fighter.id === "yingli") continue;
      out.push({ key: `${side}:${fighter.id}`, side, c: fighter });
    }
  }
  return out;
}

export function skillFilter(actor) {
  if (!actor) return "none";
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

export function heal(snapshot, target, amount, source = "治癒") {
  const state = normalizeBattleState(snapshot);
  if (!state || !target || target.hpNow <= 0 || amount <= 0) return 0;
  const before = target.hpNow;
  target.hpNow = clamp(target.hpNow + amount, 0, target.maxHp);
  const healed = target.hpNow - before;
  log(state, `${source}：${target.name} 回復 ${healed} HP (${before} → ${target.hpNow})。`);
  setFx(state, "heal", source, healed > 0 ? `${target.name} +${healed} HP` : `${target.name} 已滿血`);
  return healed;
}

export function addStatus(snapshot, source, target, status) {
  const state = normalizeBattleState(snapshot);
  if (!state || !target || target.hpNow <= 0 || !Object.values(STATUS).includes(status)) return false;
  if (status === STATUS.OBSERVE && target.id === "yingli") {
    log(state, `映璃被動：不能被觀測，${source} 的觀測無效。`);
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
  log(state, `${source}：${target.name} 獲得 ${status}。`);
  setFx(state, "status", String(source), `${target.name} 獲得 ${status}`);
  return true;
}

export function damage(snapshot, source, target, amount, opts = {}) {
  const state = normalizeBattleState(snapshot);
  if (!state || !target || target.hpNow <= 0 || amount <= 0) return 0;

  const label = opts.label || source?.name || "傷害";
  let dmg = amount;
  const notes = [`基礎 ${amount}`];

  if (source?.flags?.judgementDamageBonus) {
    dmg += source.flags.judgementDamageBonus;
    notes.push(`裁定造成傷害 +${source.flags.judgementDamageBonus}`);
    source.flags.judgementDamageBonus = 0;
  }
  if (hasStatus(target, STATUS.OBSERVE) && target.id !== "yingli") {
    dmg += 1;
    removeStatus(target, STATUS.OBSERVE);
    notes.push("觀測 +1");
  }
  if (target.flags.damageTakenMod) {
    dmg += target.flags.damageTakenMod;
    notes.push(`受傷修正 ${signed(target.flags.damageTakenMod)}`);
  }
  if (opts.skill && state.tianSkillDebuff) {
    dmg += 1;
    notes.push("天訊技能傷害 +1");
  }
  if (target.id === "youming" && !target.flags.firstDamageReduced) {
    target.flags.firstDamageReduced = true;
    dmg -= 1;
    notes.push("幽冥首次受傷 -1");
  }
  if (opts.skill && target.id === "aila" && !target.statuses.some(status => NEGATIVE_STATUSES.includes(status))) {
    dmg -= 1;
    notes.push("艾菈無負面狀態，技能傷害 -1");
  }
  if (opts.skill && target.id === "yingli" && !target.flags.skillTargeted) {
    target.flags.skillTargeted = true;
    dmg -= 2;
    notes.push("映璃首次成為技能目標，傷害 -2");
  }

  const weixiang = alive(state.players[target.owner].team).find(fighter => fighter.id === "weixiang");
  if (weixiang && amount >= 3 && !weixiang.flags.firstTeamDamageReduced) {
    weixiang.flags.firstTeamDamageReduced = true;
    dmg -= 1;
    notes.push("未響首次 3+ 傷害 -1");
  }
  if (target.flags.defended) {
    dmg -= 2;
    notes.push("防禦 -2");
  }
  if (target.flags.nextDamageTakenReduction) {
    dmg -= target.flags.nextDamageTakenReduction;
    notes.push(`裁定受傷 -${target.flags.nextDamageTakenReduction}`);
    target.flags.nextDamageTakenReduction = 0;
  }

  let actual = redirectTarget(state, target, dmg);
  const actualPlayer = state.players[actual.owner];
  let openingDefenseApplied = false;
  if (state.round === 1 && actualPlayer.openingDefenseUsed && !actualPlayer.team.some(fighter => fighter.flags.tookDamage)) {
    actualPlayer.openingDefenseUsed = false;
  }
  if (state.round === 1 && !actualPlayer.openingDefenseUsed) {
    actualPlayer.openingDefenseUsed = true;
    openingDefenseApplied = true;
    dmg -= 1;
    notes.push("開局防線 -1");
  }
  if (source?.flags?.confuseDamageCap && actual.owner === source.owner) {
    dmg = Math.min(dmg, 1);
    notes.push("混亂打到己方，傷害最多 1");
  }

  dmg = Math.max(openingDefenseApplied ? 0 : 1, dmg);
  const before = actual.hpNow;
  const marksBeforeDamage = actualPlayer.marks;
  actual.hpNow = Math.max(0, actual.hpNow - dmg);
  if (actual.hpNow < before) actual.flags.tookDamage = true;
  state.lastHit = { owner: actual.owner, id: actual.id, stamp: Date.now() };
  state.shakeStamp = Date.now();
  log(state, `${label} 對 ${actual.name} 造成 ${before - actual.hpNow} 傷害 (${notes.join("，")}，實際 ${before - actual.hpNow})。`);
  setFx(state, opts.skill ? "skill" : "damage", label, `${actual.name} -${before - actual.hpNow} HP`);

  if (actual.hpNow <= 0) knockout(snapshot, actual, source, { marksBeforeDamage });
  return before - actual.hpNow;
}

function executeSkill(snapshot, targetKey, opts = {}) {
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
  const ok = resolveSkill(snapshot, actor, target, resonance, opts);
  actor.flags.confuseDamageCap = false;

  if (!ok) {
    player.energy = clamp(player.energy + cost, 0, RULES.ENERGY_MAX);
    actor.cd = 0;
    if (resonance) player.resUsed = Math.max(0, player.resUsed - 1);
    if (inoApplied) enemyIno.flags.inoUsed = Math.max(0, enemyIno.flags.inoUsed - 1);
    restoreSkillRecord(state, before);
    log(state, `${actor.name} 技能目標或條件不合法，費用與冷卻已退回，未消耗行動。`);
    return { ok: false };
  }

  if (inoApplied && enemyIno) {
    state.players[enemyIno.owner].energy = clamp(state.players[enemyIno.owner].energy + 1, 0, RULES.ENERGY_MAX);
    log(state, `伊諾干涉後技能仍成功，伊諾方獲得 1 能量。`);
  }
  recordYiaiqian(state);
  clearActionEndSeal(state, actor);
  return { ok: true, actionSpent: true };
}

function resolveSkill(snapshot, actor, target, resonance, opts) {
  const state = normalizeBattleState(snapshot);
  const label = `${actor.name}「${actor.skill.name}」`;
  let record = null;

  switch (actor.id) {
    case "ningyao":
      if (!isEnemy(actor, target)) return false;
      damage(snapshot, actor, target, 3, { skill: true, label });
      addStatus(snapshot, label, target, STATUS.SEAL);
      if (resonance) heal(snapshot, actor, 1, actor.res.name);
      record = { kind: "damage", amount: 3, name: actor.skill.name };
      break;
    case "hengshuo":
      if (!isAlly(actor, target)) return false;
      target.flags.damageTakenMod -= 2;
      target.flags.hengshuoGuarded = true;
      removeStatus(target, STATUS.OBSERVE);
      log(state, `${label}：${target.name} 本回合受傷 -2，並移除觀測。`);
      if (resonance) addStatus(snapshot, actor.res.name, target, STATUS.GUARD);
      break;
    case "youming":
      if (!isEnemy(actor, target)) return false;
      damage(snapshot, actor, target, 2, { skill: true, label });
      addStatus(snapshot, label, target, STATUS.SLOW);
      if (resonance) {
        target.flags.atkMod -= 1;
        log(state, `${actor.res.name}：${target.name} 本回合 ATK -1。`);
      }
      record = { kind: "damage", amount: 2, name: actor.skill.name };
      break;
    case "leiting":
      if (!isEnemy(actor, target)) return false;
      damage(snapshot, actor, target, 4, { skill: true, label });
      if (resonance && actor.flags.leitingResCount < 2) {
        actor.flags.leitingResCount += 1;
        addStatus(snapshot, actor.res.name, target, STATUS.OBSERVE);
      }
      record = { kind: "damage", amount: 4, name: actor.skill.name };
      break;
    case "baijian": {
      if (!isAlly(actor, target)) return false;
      const minHp = Math.min(...alive(state.players[actor.owner].team).map(member => member.hpNow));
      heal(snapshot, target, target.hpNow === minHp ? 4 : 3, label);
      removeNegativeStatus(state, target);
      if (resonance) addStatus(snapshot, actor.res.name, target, STATUS.GUARD);
      record = { kind: "heal", amount: 3, name: actor.skill.name };
      break;
    }
    case "dengzhen":
      if (!target) return false;
      target.flags.spdMod += opts.mode === "down" ? -2 : 2;
      log(state, `${label}：${target.name} 本回合 SPD ${opts.mode === "down" ? "-2" : "+2"}。`);
      if (target.owner === actor.owner) heal(snapshot, target, 1, label);
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
        addStatus(snapshot, label, target, STATUS.OBSERVE);
      }
      if (resonance) {
        target.flags.damageTakenMod += 1;
        log(state, `${actor.res.name}：${target.name} 本回合受傷 +1。`);
      }
      break;
    case "aila":
      if (!isEnemy(actor, target)) return false;
      addStatus(snapshot, label, target, STATUS.SEAL);
      if (hasStatus(target, STATUS.OBSERVE)) {
        damage(snapshot, actor, target, 2, { skill: true, label });
        record = { kind: "damage", amount: 2, name: actor.skill.name };
      }
      if (resonance) {
        state.players[actor.owner].energy = clamp(state.players[actor.owner].energy + 1, 0, RULES.ENERGY_MAX);
        log(state, `${actor.res.name}：${sideName(actor.owner)} 獲得 1 能量。`);
      }
      break;
    case "leiyouxi":
      if (!isEnemy(actor, target)) return false;
      damage(snapshot, actor, target, resonance ? 4 : 3, { skill: true, label });
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
      if (!state.lastSkill || (actor.flags.records || 0) < 1) return false;
      actor.flags.records -= 1;
      if (state.lastSkill.kind === "damage") damage(snapshot, actor, target, state.lastSkill.amount, { skill: true, label });
      else heal(snapshot, target, state.lastSkill.amount, label);
      if (resonance) {
        state.players[actor.owner].energy = clamp(state.players[actor.owner].energy + 1, 0, RULES.ENERGY_MAX);
        log(state, `${actor.res.name}：${sideName(actor.owner)} 獲得 1 能量。`);
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
        damage(snapshot, actor, actor, 1, { skill: true, label: "小莫反噬" });
        if (resonance) addStatus(snapshot, actor.res.name, target, STATUS.SLOW);
      }
      break;
    }
    case "huiyin": {
      const copy = state.lastCopyableSkill?.[actor.owner];
      if (copy) {
        if (copy.kind === "damage") damage(snapshot, actor, target, copy.amount, { skill: true, label: `${label} 複製 ${copy.name}` });
        else heal(snapshot, target, copy.amount, `${label} 複製 ${copy.name}`);
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
      addStatus(snapshot, label, target, STATUS.CONFUSE);
      target.flags.cannotAttackYingli = true;
      if (hadConfuse) damage(snapshot, actor, target, 2, { skill: true, label });
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
        if (choice === "spd") for (const ally of alive(state.players[actor.owner].team)) ally.flags.spdMod += 1;
        if (choice === "low") state.lowestFirst = true;
      }
      if (resonance) actor.flags.noDefend = true;
      log(state, `${label} 套用：${selected.join("、")}。`);
      buildQueue(snapshot);
      break;
    }
    case "xuntian":
      if (!isEnemy(actor, target)) return false;
      damage(snapshot, actor, target, 5, { skill: true, label });
      actor.flags.skillCostUp += 1;
      if (resonance && target.hpNow > 0 && target.hpNow <= 3) damage(snapshot, actor, target, 1, { skill: true, label: actor.res.name });
      record = { kind: "damage", amount: 5, name: actor.skill.name };
      break;
    case "zuozhe":
      if (!isEnemy(actor, target)) return false;
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
      if (resonance && hasStatus(target, STATUS.CONFUSE)) addStatus(snapshot, actor.res.name, target, STATUS.OBSERVE);
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
  if (!state.lastCopyableSkill) state.lastCopyableSkill = { p1: null, p2: null };
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

function createEmptyPlayer() {
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
  fighter.maxHp = card.hp;
  fighter.hpNow = card.hp;
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
    hengshuoGuarded: false,
    hengshuoGuardUsed: false,
    hengshuoRedirectUsed: false,
    huiyinUsed: false,
    leitingResCount: 0,
    inoUsed: 0,
    confuseDamageCap: false
  };
}

function startRoundForFighter(state, fighter) {
  fighter.cd = Math.max(0, fighter.cd - 1);
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
    confuseDamageCap: false
  });
  if (fighter.flags.nextRoundAtkMod) {
    fighter.flags.atkMod += fighter.flags.nextRoundAtkMod;
    fighter.flags.nextRoundAtkMod = 0;
  }
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
    if (dengzhen) {
      player.energy = clamp(player.energy + 1, 0, RULES.ENERGY_MAX);
      log(state, `燈真被動：${sideName(side)} 獲得 1 能量。`);
    }

    const tianxun = alive(player.team).find(fighter => fighter.id === "tianxun");
    if (tianxun) {
      const targets = [...alive(player.team), ...alive(state.players[other(side)].team)];
      const target = targets[Math.floor(Math.random() * targets.length)];
      if (target) {
        target.flags.spdMod += 1;
        if (target.owner !== side) target.flags.damageTakenMod += 1;
        log(state, `天訊被動：${target.name} SPD +1${target.owner !== side ? "，本回合受傷 +1" : ""}。`);
      }
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

function performAttack(snapshot, actor, target, confused) {
  const state = normalizeBattleState(snapshot);
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
    log(state, "訊天被動：攻擊封印或混亂目標，傷害 +1。");
  }
  if (actor.flags.buffDmgNext) {
    amount += actor.flags.buffDmgNext;
    log(state, `雷幽曦被動：下一次造成傷害 +${actor.flags.buffDmgNext}。`);
    actor.flags.buffDmgNext = 0;
  }
  if (state.tianAtkBuff) {
    amount += 1;
    log(state, "天訊規則補充：普攻傷害 +1。");
  }
  damage(snapshot, actor, target, amount, { label: `${actor.name} 普通攻擊`, attack: true });
  actor.flags.confuseDamageCap = false;
  log(state, "普通攻擊結算完成：依規則不觸發共鳴。");
}

function redirectTarget(state, target, dmg) {
  const team = state.players[target.owner].team;
  const guard = team.find(fighter => fighter.id !== target.id && fighter.hpNow > 0 && hasStatus(fighter, STATUS.GUARD));
  if (guard && dmg > 0) {
    removeStatus(guard, STATUS.GUARD);
    log(state, `${guard.name} 的守護代替 ${target.name} 承受傷害，守護移除。`);
    return guard;
  }
  const hengshuo = team.find(fighter => fighter.id === "hengshuo" && fighter.id !== target.id && fighter.hpNow > 0 && !fighter.flags.hengshuoRedirectUsed);
  if (hengshuo && dmg > 0) {
    hengshuo.flags.hengshuoRedirectUsed = true;
    log(state, `衡朔被動：代替 ${target.name} 承受此次傷害。`);
    return hengshuo;
  }
  return target;
}

function knockout(snapshot, fighter, source, context = {}) {
  const state = normalizeBattleState(snapshot);
  const player = state.players[fighter.owner];

  if (fighter.id === "ningyao" && !fighter.flags.passiveUsed && context.marksBeforeDamage > 0) {
    fighter.flags.passiveUsed = true;
    player.marks = clamp(player.marks - 1, 0, RULES.JUDGEMENT_MAX);
    fighter.hpNow = 1;
    log(state, `寧曜被動：傷害結算前已有裁定，消耗 1 裁定保留 1 HP。`);
    return;
  }
  if (fighter.id === "ningyao" && !fighter.flags.passiveUsed && context.marksBeforeDamage <= 0) {
    log(state, `寧曜被動未觸發：該次傷害結算前沒有裁定，不能用擊倒後獲得的裁定回溯保命。`);
  }
  if (fighter.id === "baidengling" && !fighter.flags.passiveUsed) {
    fighter.flags.passiveUsed = true;
    fighter.flags.noAttack = true;
    fighter.hpNow = 1;
    log(state, `白燈澪被動：保留 1 HP，下回合不能攻擊。`);
    return;
  }
  if (fighter.id === "xiaomo" && !fighter.flags.passiveUsed) {
    fighter.flags.passiveUsed = true;
    if (coin()) {
      fighter.hpNow = 1;
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
    for (const enemy of enemies) damage(snapshot, fighter, enemy, enemy.hpNow === minHp ? 2 : 1, { label: "作者被動" });
  }

  const leiyouxi = alive(player.team).find(member => member.id === "leiyouxi");
  if (leiyouxi) {
    leiyouxi.flags.buffDmgNext += 1;
    log(state, `雷幽曦被動：我方角色被擊倒，下一次造成傷害 +1。`);
  }
  player.marks = clamp(player.marks + 1, 0, RULES.JUDGEMENT_MAX);
  log(state, `${fighter.name} 被擊倒，${sideName(fighter.owner)} 立即獲得 1 裁定（${player.marks}/${RULES.JUDGEMENT_MAX}）。`);

  if (source?.id === "zuozhe" && source.owner !== fighter.owner) {
    const sourcePlayer = state.players[source.owner];
    sourcePlayer.marks = clamp(sourcePlayer.marks + 1, 0, RULES.JUDGEMENT_MAX);
    log(state, `作者被動擊倒敵人：${sideName(source.owner)} 額外獲得 1 裁定。`);
  }
}

function resolveWinner(state) {
  const p1Alive = alive(state.players.p1.team).length;
  const p2Alive = alive(state.players.p2.team).length;
  if (!p1Alive && !p2Alive) state.winner = "平手";
  else if (!p1Alive) state.winner = "P2";
  else if (!p2Alive) state.winner = "P1";
  if (state.winner) log(state, `戰鬥結束：${state.winner} 勝利。`);
}

function removeNegativeStatus(state, fighter) {
  const status = fighter.statuses.find(item => NEGATIVE_STATUSES.includes(item));
  if (!status) {
    log(state, `${fighter.name} 沒有可移除的負面狀態。`);
    return null;
  }
  removeStatus(fighter, status);
  log(state, `${fighter.name} 移除 ${status}。`);
  return status;
}

function clearActionEndSeal(state, actor) {
  if (hasStatus(actor, STATUS.SEAL)) {
    removeStatus(actor, STATUS.SEAL);
    log(state, `${actor.name} 行動結束，封印移除。`);
  }
}

function enemyInoFor(state, actor) {
  return alive(state.players[other(actor.owner)].team).find(fighter => fighter.id === "ino" && fighter.flags.inoUsed < 2);
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
  if (!SIDES.includes(side)) return null;
  return getFighter(state, side, id);
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
}

function uniqueIds(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function log(state, message) {
  if (!state) return;
  if (!Array.isArray(state.logs)) state.logs = [];
  state.logs.push(message);
  if (state.logs.length > RULES.LOG_MAX) state.logs.splice(0, state.logs.length - RULES.LOG_MAX);
}

function setFx(state, kind, title, sub) {
  state.fx = { kind, title, sub, stamp: Date.now() };
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
