# LuxFatum裁定對決 Domain Model

This document defines the current game data/domain model for the MVP/demo. It records the existing contracts so future steps can change the game safely and deliberately.

## Source Of Truth

- `src/types.ts` defines shared TypeScript contracts.
- `src/data/characters.ts` defines the playable character card catalog.
- `src/game.ts` defines rule constants, battle-state construction, action resolution, pending decisions, and combat helpers.
- `scripts/test-rules.mjs` verifies important rule behaviors.
- `scripts/validate-domain-model.mjs` verifies structural domain invariants.

## Core Types

### CharacterCard

`CharacterCard` is the catalog model for a playable character.

Required fields:

- `id`: stable lowercase identifier used by draft state, assets, and lookups.
- `name`: display name.
- `hp`, `atk`, `spd`: base stats before battle modifiers.
- `passive`: passive rule text.
- `skill`: active skill data with `name`, `cost`, `cd`, and `desc`.
- `res`: resonance data with `name` and `desc`.

Optional metadata:

- `role`
- `complexity`
- `tags`
- `shortDesc`
- `battleTip`

The current character catalog is `CHARACTERS`.

### Fighter

`Fighter` is the runtime battle version of `CharacterCard`.

Runtime fields:

- `owner`: `p1` or `p2`.
- `maxHp`: base `hp` plus `RULES.BATTLE_HP_BONUS`.
- `hpNow`: current HP.
- `cd`: current skill cooldown.
- `statuses`: active status labels.
- `flags`: structured runtime flags for passives, pending effects, counters, and temporary modifiers.

Catalog cards should stay immutable in behavior. Runtime battle changes belong on fighters.

### GameState

`GameState` is the main client-side domain state.

Important sections:

- Screen/draft: `screen`, `draftTurn`, `pickIndex`, `p1Draft`, `p2Draft`.
- Battle players: `players.p1`, `players.p2`.
- Turn order: `queue`, `active`.
- Resolution state: `pendingSkill`, `pendingConfuseAttack`, `pendingMirror`, `pendingQihengBalance`, `pendingFengxingStar`, `pendingTianxunFocus`, `pendingTimeTax`, `pendingDebt`, `pendingLiewuCombo`.
- Outcome/history: `winner`, `logs`, `lastSkill`, `battleStats`.
- UI/game feedback: `shakeStamp`, `fx`, `fxQueue`.

Server room state currently stores opaque game state snapshots. It is not durable persistence.

### RuleActionResult

Rule functions return `RuleActionResult` to report whether an action resolved, opened a dialog, spent the action, or created a pending decision.

Common fields:

- `ok`
- `reason`
- `openDialog`
- `closeDialog`
- `actionSpent`
- `pending`

## Rule Constants

`src/game.ts` exports `RULES`.

Current important constants:

- `TEAM_SIZE`
- `ENERGY_START`
- `ENERGY_MAX`
- `ENERGY_PER_ROUND`
- `BATTLE_HP_BONUS`
- `JUDGEMENT_START`
- `JUDGEMENT_MAX`
- `RESONANCE_PER_ROUND`
- `LOG_MAX`

Changes to these constants are gameplay changes and should be covered by rule tests.

## Domain Invariants

The MVP/demo assumes:

- Character ids are unique and stable.
- Character ids match portrait paths under `public/assets/portraits/{id}.jpg`.
- Every character has valid base stats, passive text, skill data, resonance data, and metadata.
- A battle needs exactly `RULES.TEAM_SIZE` unique draft ids per side.
- `startBattle` converts draft ids into two `PlayerState` objects.
- Runtime fighters receive `owner`, `maxHp`, `hpNow`, `cd`, `statuses`, and `flags`.
- Initial battle HP is `card.hp + RULES.BATTLE_HP_BONUS`.
- Turn queue entries reference existing alive fighters.
- Pending decision fields are explicit on `GameState`; do not add hidden pending state elsewhere.

## Validation

Run:

```bash
npm run validate:domain
```

Baseline checks still include:

```bash
npm run typecheck
npm run test:rules
npm run smoke:ui
npm run build
```

On Windows without Bash:

```powershell
powershell -ExecutionPolicy Bypass -File tools/bootstrap_windows.ps1
```

## Change Rules

- Add new character data in `src/data/characters.ts`.
- Add or update shared shape in `src/types.ts`.
- Add gameplay behavior in `src/game.ts`.
- Add a focused rule test in `scripts/test-rules.mjs` when behavior changes.
- Add structural validation in `scripts/validate-domain-model.mjs` when catalog/state invariants change.
- Do not let rendering or network code become the source of truth for gameplay rules.
