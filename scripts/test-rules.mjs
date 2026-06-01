import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tempDir = mkdtempSync(join(tmpdir(), "luxfatum-rules-"));

function transpileTs(sourcePath, outputName) {
  const source = readFileSync(join(root, sourcePath), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
      jsx: ts.JsxEmit.ReactJSX
    },
    fileName: sourcePath
  }).outputText;
  const outputPath = join(tempDir, outputName);
  writeFileSync(outputPath, output, "utf8");
  return outputPath;
}

const gamePath = transpileTs("src/game.ts", "game.mjs");
const charactersPath = transpileTs("src/data/characters.ts", "characters.mjs");
const game = await import(pathToFileURL(gamePath));
const { CHARACTERS } = await import(pathToFileURL(charactersPath));

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function key(side, id) {
  return `${side}:${id}`;
}

function baseState(p1Draft, p2Draft) {
  return {
    screen: "draft",
    round: 0,
    draftTurn: "p1",
    pickIndex: 6,
    p1Draft,
    p2Draft,
    players: null,
    queue: [],
    active: null,
    winner: null,
    logs: [],
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

function battle(p1Draft, p2Draft, options = {}) {
  const snapshot = { version: "test", chars: CHARACTERS, state: baseState(p1Draft, p2Draft) };
  const result = game.startBattle(snapshot);
  assert(result.ok, `startBattle failed: ${result.reason || "unknown"}`);
  if (options.settle !== false) settleRoundStart(snapshot);
  return snapshot;
}

function fighter(snapshot, side, id) {
  const found = snapshot.state.players?.[side]?.team.find(item => item.id === id);
  assert(found, `missing fighter ${side}:${id}`);
  return found;
}

function firstAlive(snapshot, side) {
  return snapshot.state.players[side].team.find(item => item.hpNow > 0);
}

function enemySide(side) {
  return side === "p1" ? "p2" : "p1";
}

function setActive(snapshot, side, id) {
  snapshot.state.active = { side, id };
  snapshot.state.queue = [{ side, id }];
}

function settleRoundStart(snapshot) {
  for (let guard = 0; guard < 20; guard += 1) {
    const state = snapshot.state;
    if (state.pendingTianxunFocus) {
      const pending = state.pendingTianxunFocus;
      const target = firstAlive(snapshot, pending.actorSide);
      game.decideTianxunFocus(snapshot, key(target.owner, target.id));
      continue;
    }
    if (state.pendingQihengBalance) {
      game.decideQihengBalance(snapshot, false);
      continue;
    }
    if (state.pendingFengxingStar) {
      const pending = state.pendingFengxingStar;
      const target = firstAlive(snapshot, pending.actorSide);
      game.decideFengxingStar(snapshot, key(target.owner, target.id));
      continue;
    }
    if (state.pendingDebt) {
      game.decideDebt(snapshot, null, true);
      continue;
    }
    if (state.pendingTimeTax) {
      const pending = state.pendingTimeTax;
      const target = firstAlive(snapshot, enemySide(pending.actorSide));
      game.decideTimeTax(snapshot, key(target.owner, target.id));
      continue;
    }
    return;
  }
  throw new Error("pending resolution loop did not settle");
}

test("v5 pacing starts slower and gives each fighter battle HP bonus", () => {
  assert(game.RULES.ENERGY_START === 1, `expected V5 energy start 1, got ${game.RULES.ENERGY_START}`);
  assert(game.RULES.BATTLE_HP_BONUS === 1, `expected V5 battle HP bonus 1, got ${game.RULES.BATTLE_HP_BONUS}`);
  const snapshot = battle(["ningyao", "hengshuo", "youming"], ["leiting", "aila", "xuntian"], { settle: false });
  const expectedRoundOneEnergy = game.RULES.ENERGY_START + game.RULES.ENERGY_PER_ROUND;
  assert(snapshot.state.players.p1.energy === expectedRoundOneEnergy, `expected P1 round-one energy ${expectedRoundOneEnergy}, got ${snapshot.state.players.p1.energy}`);
  assert(snapshot.state.players.p2.energy === expectedRoundOneEnergy, `expected P2 round-one energy ${expectedRoundOneEnergy}, got ${snapshot.state.players.p2.energy}`);
  const card = CHARACTERS.find(item => item.id === "ningyao");
  const actor = fighter(snapshot, "p1", "ningyao");
  assert(actor.maxHp === card.hp + 1, `expected Ningyao max HP ${card.hp + 1}, got ${actor.maxHp}`);
  assert(actor.hpNow === actor.maxHp, "fighters should begin at their V5 max HP");
});

test("rest heals 1 HP and removes one negative status", () => {
  const snapshot = battle(["ningyao", "baijian", "dengzhen"], ["leiting", "yingli", "xuntian"]);
  const actor = fighter(snapshot, "p1", "ningyao");
  actor.hpNow = 5;
  actor.statuses.push(game.STATUS.CONFUSE);
  setActive(snapshot, "p1", "ningyao");
  const result = game.rest(snapshot);
  assert(result.ok && result.actionSpent, "rest should spend the action");
  assert(actor.hpNow === 6, `expected hp 6, got ${actor.hpNow}`);
  assert(!actor.statuses.includes(game.STATUS.CONFUSE), "rest should remove confusion");
});

test("judgement options 1/2/3 match implemented rules without spending the action", () => {
  const snapshot = battle(["ningyao", "baijian", "dengzhen"], ["leiting", "yingli", "xuntian"]);
  const actor = fighter(snapshot, "p1", "ningyao");
  const ally = fighter(snapshot, "p1", "baijian");
  const enemy = fighter(snapshot, "p2", "leiting");
  setActive(snapshot, "p1", "ningyao");
  snapshot.state.queue.push({ side: "p1", id: "baijian" });
  const originalQueueLength = snapshot.state.queue.length;

  snapshot.state.players.p1.marks = 3;
  let result = game.judgement(snapshot, "atk");
  assert(result.ok, "1-cost attack judgement should succeed");
  assert(!result.actionSpent, "judgement should not spend the current action");
  assert(actor.flags.judgementDamageBonus === 1, "1 judgement should add next damage +1");
  assert(snapshot.state.active?.id === "ningyao", "actor should remain active after judgement");
  assert(snapshot.state.queue.length === originalQueueLength, "judgement should not advance the queue");

  snapshot.state.players.p1.judgementUsed = false;
  ally.hpNow = 5;
  ally.cd = 2;
  result = game.judgement(snapshot, "heal", key("p1", "baijian"));
  assert(result.ok, "2-cost heal judgement should succeed");
  assert(!result.actionSpent, "2-cost judgement should not spend the current action");
  assert(ally.hpNow === 6 && ally.cd === 1, "2 judgement should heal 1 and reduce cooldown 1");

  snapshot.state.players.p1.judgementUsed = false;
  snapshot.state.players.p1.marks = 3;
  result = game.judgement(snapshot, "seal", key("p2", "leiting"));
  assert(result.ok, "3-cost seal judgement should succeed");
  assert(!result.actionSpent, "3-cost judgement should not spend the current action");
  assert(enemy.flags.noResNextSkill === true, "3 judgement should block next skill resonance");
  assert(enemy.statuses.includes(game.STATUS.SLOW), "3 judgement should apply slow");

  const attackResult = game.attack(snapshot, key("p2", "leiting"));
  assert(attackResult.ok && attackResult.actionSpent, "actor should still be able to attack after judgement");
  game.finishAction(snapshot);
  assert(!snapshot.state.queue.some(item => item.side === "p1" && item.id === "ningyao"), "actor should leave the queue after the follow-up action");
});

test("finishAction removes the actor that spent the action after queue reorder", () => {
  const snapshot = battle(["dengzhen", "ningyao", "baijian"], ["leiting", "yingli", "xuntian"]);
  setActive(snapshot, "p1", "dengzhen");
  const result = game.useSkill(snapshot, key("p1", "ningyao"), { mode: "up" });
  assert(result.ok && result.actionSpent, "Dengzhen speed skill should spend the action");
  game.finishAction(snapshot);
  assert(!snapshot.state.queue.some(item => item.side === "p1" && item.id === "dengzhen"), "spent actor should be removed from reordered queue");
  assert(snapshot.state.active?.id !== "dengzhen", "spent actor should not become active again");
});

test("queue rebuilds do not give an already acted fighter a second action", () => {
  const snapshot = battle(["fengxing", "tianxun", "baijian"], ["leiting", "yingli", "xuntian"]);
  snapshot.state.queue = [
    { side: "p1", id: "fengxing" },
    { side: "p1", id: "tianxun" },
    { side: "p2", id: "leiting" }
  ];
  snapshot.state.active = { side: "p1", id: "fengxing" };

  const first = game.rest(snapshot);
  assert(first.ok && first.actionSpent, "Fengxing rest should spend the action");
  game.finishAction(snapshot);
  assert(!snapshot.state.queue.some(item => item.side === "p1" && item.id === "fengxing"), "Fengxing should leave the queue after acting");

  const second = game.useSkill(snapshot, null, { choices: ["spd"] });
  assert(second.ok && second.actionSpent, "Tianxun speed command should spend the action and rebuild the queue");
  game.finishAction(snapshot);
  assert(!snapshot.state.queue.some(item => item.side === "p1" && item.id === "fengxing"), "Queue rebuild should not re-add Fengxing after he already acted this round");
  assert(snapshot.state.active?.id !== "fengxing", "Fengxing should not become active twice in the same round");
});

test("Tianxun round-start focus grants +1 SPD", () => {
  const snapshot = battle(["tianxun", "ningyao", "baijian"], ["leiting", "yingli", "xuntian"], { settle: false });
  assert(snapshot.state.pendingTianxunFocus, "Tianxun focus prompt should be pending");
  const target = fighter(snapshot, "p1", "ningyao");
  const before = game.currentSpd(target);
  const result = game.decideTianxunFocus(snapshot, key("p1", "ningyao"));
  assert(result.ok, "Tianxun focus decision should succeed");
  assert(game.currentSpd(target) === before + 1, "Tianxun focus should increase SPD by 1");
});

test("Tianxun rule supplement uses +1 MVP balance values", () => {
  const speedSnapshot = battle(["tianxun", "ningyao", "baijian"], ["leiting", "yingli", "xuntian"]);
  const speedAlly = fighter(speedSnapshot, "p1", "ningyao");
  const speedBefore = game.currentSpd(speedAlly);
  setActive(speedSnapshot, "p1", "tianxun");
  let result = game.useSkill(speedSnapshot, null, { choices: ["spd"] });
  assert(result.ok && result.actionSpent, "Tianxun SPD rule should resolve");
  assert(game.currentSpd(speedAlly) === speedBefore + 1, "Tianxun team SPD rule should add only +1");

  const attackSnapshot = battle(["tianxun", "ningyao", "baijian"], ["leiting", "yingli", "xuntian"]);
  attackSnapshot.state.players.p2.openingDefenseUsed = true;
  setActive(attackSnapshot, "p1", "tianxun");
  result = game.useSkill(attackSnapshot, null, { choices: ["atk"] });
  assert(result.ok && result.actionSpent, "Tianxun attack rule should resolve");
  const attacker = fighter(attackSnapshot, "p1", "ningyao");
  const attackTarget = fighter(attackSnapshot, "p2", "leiting");
  setActive(attackSnapshot, "p1", "ningyao");
  const attackHp = attackTarget.hpNow;
  result = game.attack(attackSnapshot, key("p2", "leiting"));
  assert(result.ok && result.actionSpent, "follow-up attack should resolve");
  assert(attackHp - attackTarget.hpNow === game.currentAtk(attacker) + 1, "Tianxun attack rule should add only +1 damage");

  const skillSnapshot = battle(["tianxun", "ningyao", "baijian"], ["leiting", "yingli", "xuntian"]);
  skillSnapshot.state.players.p2.openingDefenseUsed = true;
  setActive(skillSnapshot, "p1", "tianxun");
  result = game.useSkill(skillSnapshot, null, { choices: ["skill"] });
  assert(result.ok && result.actionSpent, "Tianxun skill rule should resolve");
  const skillSource = fighter(skillSnapshot, "p1", "ningyao");
  const skillTarget = fighter(skillSnapshot, "p2", "leiting");
  const dealt = game.damage(skillSnapshot, skillSource, skillTarget, 2, { skill: true, label: "test skill damage" });
  assert(dealt === 3, `Tianxun skill rule should add only +1 damage, got ${dealt}`);
});

test("Huiyin copy skill only allows targets matching the copied skill kind", () => {
  const damageSnapshot = battle(["huiyin", "ningyao", "baijian"], ["leiting", "yingli", "xuntian"]);
  const huiyinDamage = fighter(damageSnapshot, "p1", "huiyin");
  const ally = fighter(damageSnapshot, "p1", "baijian");
  const enemy = fighter(damageSnapshot, "p2", "leiting");
  damageSnapshot.state.players.p2.openingDefenseUsed = true;
  damageSnapshot.state.lastCopyableSkill.p1 = { kind: "damage", amount: 2, name: "test damage" };
  setActive(damageSnapshot, "p1", "huiyin");
  assert(game.skillTargetFilter(damageSnapshot, huiyinDamage) === "enemy", "Huiyin copied damage should target enemies");
  const damageEnergy = damageSnapshot.state.players.p1.energy;
  const allyHp = ally.hpNow;
  let result = game.useSkill(damageSnapshot, key("p1", "baijian"));
  assert(!result.ok, "Huiyin copied damage should reject allied targets");
  assert(ally.hpNow === allyHp, "Rejected Huiyin copied damage should not damage an ally");
  assert(damageSnapshot.state.players.p1.energy === damageEnergy, "Rejected Huiyin copied damage should refund energy");
  const enemyHp = enemy.hpNow;
  result = game.useSkill(damageSnapshot, key("p2", "leiting"));
  assert(result.ok && result.actionSpent, "Huiyin copied damage should resolve against enemies");
  assert(enemyHp - enemy.hpNow === 3, "Huiyin copied damage should deal copied amount +1");

  const healSnapshot = battle(["huiyin", "ningyao", "baijian"], ["leiting", "yingli", "xuntian"]);
  const huiyinHeal = fighter(healSnapshot, "p1", "huiyin");
  const healAlly = fighter(healSnapshot, "p1", "baijian");
  const healEnemy = fighter(healSnapshot, "p2", "leiting");
  healSnapshot.state.lastCopyableSkill.p1 = { kind: "heal", amount: 2, name: "test heal" };
  healAlly.hpNow -= 4;
  healEnemy.hpNow -= 2;
  setActive(healSnapshot, "p1", "huiyin");
  assert(game.skillTargetFilter(healSnapshot, huiyinHeal) === "ally", "Huiyin copied heal should target allies");
  const healEnergy = healSnapshot.state.players.p1.energy;
  const enemyBeforeReject = healEnemy.hpNow;
  result = game.useSkill(healSnapshot, key("p2", "leiting"));
  assert(!result.ok, "Huiyin copied heal should reject enemy targets");
  assert(healEnemy.hpNow === enemyBeforeReject, "Rejected Huiyin copied heal should not heal an enemy");
  assert(healSnapshot.state.players.p1.energy === healEnergy, "Rejected Huiyin copied heal should refund energy");
  const allyBeforeHeal = healAlly.hpNow;
  result = game.useSkill(healSnapshot, key("p1", "baijian"));
  assert(result.ok && result.actionSpent, "Huiyin copied heal should resolve against allies");
  assert(healAlly.hpNow === Math.min(healAlly.maxHp, allyBeforeHeal + 3), "Huiyin copied heal should heal copied amount +1");
});

test("Qiheng skill pays HP cost without changing balance rules", () => {
  const snapshot = battle(["qiheng", "baijian", "dengzhen"], ["leiting", "yingli", "xuntian"]);
  const source = fighter(snapshot, "p1", "baijian");
  const target = fighter(snapshot, "p2", "leiting");
  source.hpNow = 6;
  setActive(snapshot, "p1", "qiheng");
  const beforeTargetHp = target.hpNow;
  const result = game.useSkill(snapshot, key("p2", "leiting"), { qihengSourceKey: key("p1", "baijian"), qihengLoss: 2 });
  assert(result.ok && result.actionSpent, "Qiheng skill should resolve");
  assert(source.hpNow === 4, `Qiheng cost source should lose 2 HP, got ${source.hpNow}`);
  assert(target.hpNow < beforeTargetHp, "Qiheng target should take damage");
});

test("Fengxing star line and stitch markers are created by existing rules", () => {
  const starSnapshot = battle(["fengxing", "ningyao", "baijian"], ["leiting", "yingli", "xuntian"], { settle: false });
  assert(starSnapshot.state.pendingFengxingStar, "Fengxing star prompt should be pending");
  game.decideFengxingStar(starSnapshot, key("p1", "ningyao"));
  assert(fighter(starSnapshot, "p1", "ningyao").flags.starLine, "Fengxing should place a star line");

  const stitchSnapshot = battle(["fengxing", "ningyao", "baijian"], ["leiting", "yingli", "xuntian"]);
  setActive(stitchSnapshot, "p1", "fengxing");
  const result = game.useSkill(stitchSnapshot, key("p2", "leiting"));
  assert(result.ok && result.actionSpent, "Fengxing skill should resolve");
  const target = fighter(stitchSnapshot, "p2", "leiting");
  assert(target.statuses.includes(game.STATUS.STITCH), "Fengxing skill should apply stitch");
  assert(target.flags.stitchMark, "Stitch should carry marker metadata");
});

test("Songya debt and Kelu time tax pending prompts apply markers", () => {
  const debtSnapshot = battle(["songya", "ningyao", "baijian"], ["leiting", "yingli", "xuntian"], { settle: false });
  assert(debtSnapshot.state.pendingDebt, "Songya debt prompt should be pending");
  game.decideDebt(debtSnapshot, key("p2", "leiting"));
  assert(fighter(debtSnapshot, "p2", "leiting").flags.debtMark, "Songya should place a debt mark");

  const taxSnapshot = battle(["kelu", "ningyao", "baijian"], ["leiting", "yingli", "xuntian"], { settle: false });
  assert(taxSnapshot.state.pendingTimeTax, "Kelu time tax prompt should be pending");
  game.decideTimeTax(taxSnapshot, key("p2", "leiting"));
  assert(fighter(taxSnapshot, "p2", "leiting").statuses.includes(game.STATUS.TIME_TAX), "Kelu should apply time tax");
});

test("Jingren mirror reflect queues a decision and reflects damage", () => {
  const snapshot = battle(["leiting", "ningyao", "baijian"], ["jingren", "yingli", "xuntian"]);
  const attacker = fighter(snapshot, "p1", "leiting");
  const mirror = fighter(snapshot, "p2", "jingren");
  setActive(snapshot, "p1", "leiting");
  const attackerHp = attacker.hpNow;
  const mirrorHp = mirror.hpNow;
  const prompt = game.attack(snapshot, key("p2", "jingren"));
  assert(prompt.pending === "mirror", "attack on Jingren should queue mirror prompt");
  const result = game.decideMirror(snapshot, true);
  assert(result.ok && result.actionSpent, "mirror decision should spend attacker action");
  assert(attacker.hpNow < attackerHp, "mirror reflect should damage the attacker");
  assert(mirror.hpNow === mirrorHp, "mirror reflect should cancel damage to Jingren");
});

test("Liewu gains battle intent when any skill succeeds", () => {
  const snapshot = battle(["liewu", "ningyao", "baijian"], ["leiting", "yingli", "xuntian"]);
  const liewu = fighter(snapshot, "p1", "liewu");
  setActive(snapshot, "p1", "ningyao");
  const result = game.useSkill(snapshot, key("p2", "leiting"));
  assert(result.ok && result.actionSpent, "Ningyao skill should resolve");
  assert(liewu.flags.battleIntent === 1, `Liewu should gain 1 battle intent, got ${liewu.flags.battleIntent}`);
});

test("Shili applies corrosion and healing removes one corrosion layer", () => {
  const snapshot = battle(["shili", "ningyao", "baijian"], ["leiting", "yingli", "xuntian"]);
  const target = fighter(snapshot, "p2", "leiting");
  setActive(snapshot, "p1", "shili");
  const result = game.useSkill(snapshot, key("p2", "leiting"));
  assert(result.ok && result.actionSpent, "Shili skill should resolve");
  assert(target.statuses.includes(game.STATUS.CORROSION), "Shili should apply corrosion");
  assert(target.flags.corrosionStacks === 1, "Corrosion should start at one layer");
  fighter(snapshot, "p1", "shili").flags.shiliPassiveRound = snapshot.state.round;
  target.hpNow = Math.max(1, target.hpNow - 2);
  game.heal(snapshot, target, 2, "test heal");
  assert(target.flags.corrosionStacks === 0, "Healing should remove one corrosion layer");
});

test("confusion lets the opponent redirect the attack target", () => {
  const snapshot = battle(["leiting", "baijian", "ningyao"], ["yingli", "xuntian", "youming"]);
  const actor = fighter(snapshot, "p1", "leiting");
  const redirected = fighter(snapshot, "p2", "xuntian");
  actor.statuses.push(game.STATUS.CONFUSE);
  setActive(snapshot, "p1", "leiting");
  const prompt = game.requestAttack(snapshot);
  assert(prompt.pending === "confuse", "confused attack should ask opponent for a target");
  const before = redirected.hpNow;
  const result = game.decideConfuseTarget(snapshot, key("p2", "xuntian"));
  assert(result.ok && result.actionSpent, "confusion target decision should spend action");
  assert(redirected.hpNow < before, "confusion should redirect attack to a legal target");
  assert(!actor.statuses.includes(game.STATUS.CONFUSE), "confusion should be removed after it fires");
});

let failed = 0;
for (const item of tests) {
  try {
    item.fn();
    console.log(`PASS ${item.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${item.name}`);
    console.error(error?.stack || error);
  }
}

rmSync(tempDir, { recursive: true, force: true });

if (failed) {
  console.error(`${failed}/${tests.length} rule tests failed.`);
  process.exit(1);
}

console.log(`${tests.length} rule tests passed.`);
