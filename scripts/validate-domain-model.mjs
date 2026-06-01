import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tempDir = mkdtempSync(join(tmpdir(), "luxfatum-domain-"));
const checks = [];

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

function check(name, fn) {
  checks.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertText(value, label) {
  assert(typeof value === "string" && value.trim().length > 0, `${label} must be non-empty text`);
}

function assertInteger(value, label, min, max) {
  assert(Number.isInteger(value), `${label} must be an integer`);
  assert(value >= min && value <= max, `${label} must be between ${min} and ${max}`);
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

function fighterKey(item) {
  return `${item.side}:${item.id}`;
}

try {
  const gamePath = transpileTs("src/game.ts", "game.mjs");
  const charactersPath = transpileTs("src/data/characters.ts", "characters.mjs");
  const game = await import(pathToFileURL(gamePath));
  const characters = await import(pathToFileURL(charactersPath));
  const { CHARACTERS, byId, cardImage, portraitImage, artFocus, slotFocus } = characters;

  check("rules constants define valid battle limits", () => {
    assertInteger(game.RULES.TEAM_SIZE, "RULES.TEAM_SIZE", 1, 10);
    assertInteger(game.RULES.ENERGY_START, "RULES.ENERGY_START", 0, game.RULES.ENERGY_MAX);
    assertInteger(game.RULES.ENERGY_MAX, "RULES.ENERGY_MAX", 1, 20);
    assertInteger(game.RULES.ENERGY_PER_ROUND, "RULES.ENERGY_PER_ROUND", 0, 10);
    assertInteger(game.RULES.BATTLE_HP_BONUS, "RULES.BATTLE_HP_BONUS", 0, 20);
    assertInteger(game.RULES.JUDGEMENT_START, "RULES.JUDGEMENT_START", 0, game.RULES.JUDGEMENT_MAX);
    assertInteger(game.RULES.JUDGEMENT_MAX, "RULES.JUDGEMENT_MAX", 1, 20);
    assertInteger(game.RULES.RESONANCE_PER_ROUND, "RULES.RESONANCE_PER_ROUND", 0, 10);
    assertInteger(game.RULES.LOG_MAX, "RULES.LOG_MAX", 10, 10000);
  });

  check("character catalog has enough unique stable ids", () => {
    assert(Array.isArray(CHARACTERS), "CHARACTERS must be an array");
    assert(CHARACTERS.length >= game.RULES.TEAM_SIZE * 2, "catalog must support both teams");
    const ids = new Set();
    for (const card of CHARACTERS) {
      assertText(card.id, "character id");
      assert(/^[a-z][a-z0-9-]*$/.test(card.id), `character id ${card.id} must be a stable slug`);
      assert(!ids.has(card.id), `duplicate character id ${card.id}`);
      ids.add(card.id);
    }
  });

  check("character cards satisfy the shared catalog contract", () => {
    for (const card of CHARACTERS) {
      assertText(card.name, `${card.id}.name`);
      assertInteger(card.hp, `${card.id}.hp`, 1, 30);
      assertInteger(card.atk, `${card.id}.atk`, 0, 20);
      assertInteger(card.spd, `${card.id}.spd`, 0, 20);
      assertText(card.passive, `${card.id}.passive`);
      assert(card.skill && typeof card.skill === "object", `${card.id}.skill must exist`);
      assertText(card.skill.name, `${card.id}.skill.name`);
      assertInteger(card.skill.cost, `${card.id}.skill.cost`, 0, game.RULES.ENERGY_MAX);
      assertInteger(card.skill.cd, `${card.id}.skill.cd`, 0, 20);
      assertText(card.skill.desc, `${card.id}.skill.desc`);
      assert(card.res && typeof card.res === "object", `${card.id}.res must exist`);
      assertText(card.res.name, `${card.id}.res.name`);
      assertText(card.res.desc, `${card.id}.res.desc`);
      if (card.role !== undefined) assertText(card.role, `${card.id}.role`);
      if (card.complexity !== undefined) assertInteger(card.complexity, `${card.id}.complexity`, 1, 5);
      if (card.tags !== undefined) {
        assert(Array.isArray(card.tags), `${card.id}.tags must be an array`);
        assert(card.tags.length > 0, `${card.id}.tags must not be empty`);
        for (const tag of card.tags) assertText(tag, `${card.id}.tags[]`);
      }
      if (card.shortDesc !== undefined) assertText(card.shortDesc, `${card.id}.shortDesc`);
      if (card.battleTip !== undefined) assertText(card.battleTip, `${card.id}.battleTip`);
    }
  });

  check("character lookup and portrait helpers are consistent", () => {
    for (const card of CHARACTERS) {
      assert(byId(card.id) === card, `byId must return catalog object for ${card.id}`);
      const imagePath = cardImage(card.id);
      assert(imagePath === portraitImage(card.id), `portraitImage must match cardImage for ${card.id}`);
      assert(imagePath === `assets/portraits/${card.id}.jpg`, `unexpected portrait path for ${card.id}`);
      assert(existsSync(join(root, "public", imagePath)), `missing portrait asset for ${card.id}: ${imagePath}`);
      assertText(artFocus(card.id), `${card.id}.artFocus`);
      assertText(slotFocus(card.id), `${card.id}.slotFocus`);
    }
  });

  check("startBattle creates runtime players, fighters, and queue from draft ids", () => {
    const p1Draft = CHARACTERS.slice(0, game.RULES.TEAM_SIZE).map(card => card.id);
    const p2Draft = CHARACTERS.slice(game.RULES.TEAM_SIZE, game.RULES.TEAM_SIZE * 2).map(card => card.id);
    const snapshot = { version: "domain-validation", chars: CHARACTERS, state: baseState(p1Draft, p2Draft) };
    const result = game.startBattle(snapshot);
    assert(result.ok, `startBattle failed: ${result.reason || "unknown"}`);
    assert(snapshot.state.screen === "battle", "startBattle must move screen to battle");
    assert(snapshot.state.players?.p1 && snapshot.state.players?.p2, "startBattle must create both players");
    for (const side of ["p1", "p2"]) {
      const player = snapshot.state.players[side];
      assertInteger(player.energy, `${side}.energy`, 0, game.RULES.ENERGY_MAX);
      assertInteger(player.marks, `${side}.marks`, 0, game.RULES.JUDGEMENT_MAX);
      assertInteger(player.resUsed, `${side}.resUsed`, 0, game.RULES.RESONANCE_PER_ROUND);
      assert(player.team.length === game.RULES.TEAM_SIZE, `${side}.team must match TEAM_SIZE`);
      for (const fighter of player.team) {
        const card = byId(fighter.id);
        assert(card, `runtime fighter ${fighter.id} must come from catalog`);
        assert(fighter.owner === side, `${fighter.id}.owner must be ${side}`);
        assert(fighter.maxHp === card.hp + game.RULES.BATTLE_HP_BONUS, `${fighter.id}.maxHp must include battle HP bonus`);
        assert(fighter.hpNow === fighter.maxHp, `${fighter.id}.hpNow must start at maxHp`);
        assert(fighter.cd === 0, `${fighter.id}.cd must start at 0`);
        assert(Array.isArray(fighter.statuses), `${fighter.id}.statuses must be an array`);
        assert(fighter.flags && typeof fighter.flags === "object", `${fighter.id}.flags must exist`);
      }
    }
    const runtimeKeys = new Set(["p1", "p2"].flatMap(side => snapshot.state.players[side].team.map(item => `${side}:${item.id}`)));
    assert(snapshot.state.queue.length === game.RULES.TEAM_SIZE * 2, "queue must include every starting fighter");
    for (const item of snapshot.state.queue) {
      assert(runtimeKeys.has(fighterKey(item)), `queue item ${fighterKey(item)} must reference a runtime fighter`);
      assertInteger(item.spd, `${fighterKey(item)}.queue.spd`, 0, 50);
      assertInteger(item.hp, `${fighterKey(item)}.queue.hp`, 0, 50);
    }
  });

  let failed = 0;
  for (const item of checks) {
    try {
      item.fn();
      console.log(`PASS ${item.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${item.name}`);
      console.error(error?.stack || error);
    }
  }

  if (failed) {
    console.error(`${failed}/${checks.length} domain model checks failed.`);
    process.exitCode = 1;
  } else {
    console.log(`${checks.length} domain model checks passed for ${CHARACTERS.length} characters.`);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
