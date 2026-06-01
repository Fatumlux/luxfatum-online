export type Side = "p1" | "p2";
export type Winner = Side | "平手";
export type Screen = "menu" | "draft" | "battle";
export type DialogType = "attack" | "skill" | "judgement" | null;
export type ViewType = "rules" | "codex" | "settings" | "patch" | "credits" | null;
export type AiDifficulty = "easy" | "normal" | "hard" | "impossible";
export type RuleActionKind = "attack" | "skill";
export type SkillFilter = "ally" | "enemy" | "self" | "all" | "none";
export type SkillRecordKind = "damage" | "heal";

export interface CharacterCard {
  id: string;
  name: string;
  role?: string;
  complexity?: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
  shortDesc?: string;
  battleTip?: string;
  hp: number;
  atk: number;
  spd: number;
  passive: string;
  skill: {
    name: string;
    cost: number;
    cd: number;
    desc: string;
  };
  res: {
    name: string;
    desc: string;
  };
}

export interface SkillRecord {
  kind: SkillRecordKind;
  amount: number;
  name: string;
}

export interface RuleSourceLabel {
  actor?: Fighter | null;
  label?: string;
  name?: string;
  owner?: Side;
  id?: string;
}

export type RuleSource = string | Fighter | RuleSourceLabel | null | undefined;

export interface RuleActionOptions {
  actorId?: string;
  attack?: boolean;
  skill?: boolean;
  res?: boolean;
  choices?: string[];
  mode?: "up" | "down" | string;
  qihengLoss?: number;
  qihengSourceKey?: string;
  confuseTargetChosen?: boolean;
  confused?: boolean;
  inoDecision?: boolean;
  mirrorDecision?: boolean;
  mirrorReflect?: boolean;
  mirrorDeclined?: boolean;
  liewuComboDecision?: boolean;
  liewuUseCombo?: boolean;
  passive?: boolean;
  noShiliPassive?: boolean;
  starLine?: boolean;
  label?: string;
  stitchTrap?: boolean;
  zuozhePassive?: boolean;
}

export interface RuleActionResult {
  ok: boolean;
  reason?: string;
  openDialog?: boolean;
  closeDialog?: boolean;
  actionSpent?: boolean;
  pending?: string;
}

export interface BattleMark {
  owner?: Side;
  actorId?: string;
  targetOwner?: Side;
  targetId?: string;
  level?: number;
  useResonance?: boolean;
  round?: number;
  [key: string]: unknown;
}

export interface FighterFlags {
  defended: boolean;
  immuneNextDebuff: boolean;
  passiveUsed: boolean;
  tookDamage: boolean;
  firstDamageReduced: boolean;
  firstTeamDamageReduced: boolean;
  noAttack: boolean;
  noSkill: boolean;
  noDefend: boolean;
  cannotAttackYingli: boolean;
  skillTargeted: boolean;
  atkMod: number;
  spdMod: number;
  damageTakenMod: number;
  judgementDamageBonus: number;
  nextDamageTakenReduction: number;
  nextRoundAtkMod: number;
  nextRoundSpdMod: number;
  skillCostUp: number;
  buffDmgNext: number;
  records: number;
  battleIntent: number;
  corrosionStacks: number;
  inoUsed: number;
  inoRoundUsed: number;
  mirrorReflectUsed: number;
  mirrorReflectRound: number;
  mirrorReflectCurrent: boolean;
  mirrorReflectedThisAction: boolean;
  mirrorReflectedOwner: Side | "";
  liewuGuardReady: boolean;
  healedThisRound: boolean;
  usedSkillThisRound: boolean;
  clearAtkDebuffOnActionEnd: boolean;
  noResNextSkill: boolean;
  confuseDamageCap: boolean;
  actionTargetedSongya: boolean;
  hengshuoGuarded: boolean;
  hengshuoGuardUsed: boolean;
  hengshuoRedirectUsed: boolean;
  huiyinUsed: boolean;
  qihengRift: boolean;
  keluIncreasedCdThisSkill: boolean;
  keluResUsedRound: boolean;
  songyaResUsedRound: boolean;
  dengzhenEnergyRound: number;
  shiliPassiveRound: number;
  tianxunFocusPromptedRound: number;
  qihengBalancePromptedRound: number;
  fengxingStarPromptedRound: number;
  actedRound: number;
  debtPromptedRound: number;
  debtMark: BattleMark | null;
  timeTaxMark: BattleMark | null;
  starLine: BattleMark | null;
  stitchMark: BattleMark | null;
  [key: string]: unknown;
}

export interface Fighter extends CharacterCard {
  owner: Side;
  maxHp: number;
  hpNow: number;
  cd: number;
  statuses: string[];
  flags: FighterFlags;
}

export interface TargetEntry {
  key: string;
  side: Side;
  c: Fighter;
}

export interface PlayerState {
  energy: number;
  marks: number;
  judgementUsed: boolean;
  resUsed: number;
  openingDefenseUsed: boolean;
  team: Fighter[];
}

export interface QueueItem {
  side: Side;
  id: string;
  spd?: number;
  hp?: number;
}

export interface BattleFighterStats {
  id: string;
  side: Side;
  name: string;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  healingReceived: number;
  knockouts: number;
  timesTargeted: number;
  resonanceUsed: number;
  statusApplied: number;
  statusRemoved: number;
  protectCount: number;
  protectedDamage: number;
  oneHpSaves: number;
  mirrorReflects: number;
  judgementUsed: number;
}

export interface BattleStats {
  startedAt?: number;
  winner?: string | null;
  victoryMethod?: string;
  totalRounds?: number;
  lastKnockout?: {
    actorKey: string;
    actorName: string;
    targetKey: string;
    targetName: string;
    round: number;
  } | null;
  fighters: Record<string, BattleFighterStats>;
}

export interface PendingBase {
  actorSide: Side;
  actorId: string;
}

export interface PendingSkill extends PendingBase {
  targetKey: string | null;
  opts: RuleActionOptions;
}

export interface PendingConfuseAttack extends PendingBase {
  action: RuleActionKind;
  targetKey?: string | null;
  opts?: RuleActionOptions;
}

export interface PendingMirror extends PendingBase {
  targetKey: string | null;
  action: RuleActionKind;
  opts: RuleActionOptions;
  mirrorSide: Side;
  mirrorId: string;
}

export interface PendingTargetChoice extends PendingBase {
  targetKey?: string | null;
  opts?: RuleActionOptions;
}

export interface AiState {
  enabled: boolean;
  side: Side;
  difficulty: AiDifficulty;
  label: string;
  training?: boolean;
}

export interface GameState {
  screen: Screen;
  round: number;
  draftTurn: Side;
  pickIndex: number;
  p1Draft: string[];
  p2Draft: string[];
  players: null | Record<Side, PlayerState>;
  queue: QueueItem[];
  active: QueueItem | null;
  winner: Winner | null;
  logs: string[];
  lastSkill: SkillRecord | null;
  lastCopyableSkill: Record<Side, SkillRecord | null>;
  pendingSkill: PendingSkill | null;
  pendingConfuseAttack: PendingConfuseAttack | null;
  pendingMirror: PendingMirror | null;
  pendingQihengBalance: PendingTargetChoice | null;
  pendingFengxingStar: PendingTargetChoice | null;
  pendingTianxunFocus: PendingTargetChoice | null;
  pendingTimeTax: PendingTargetChoice | null;
  pendingDebt: PendingTargetChoice | null;
  pendingLiewuCombo: PendingTargetChoice | null;
  ai?: AiState | null;
  lowestFirst: boolean;
  tianAtkBuff: boolean;
  tianSkillDebuff: boolean;
  lastHit: null | {
    owner: Side;
    id: string;
    stamp: number;
  };
  battleStats: BattleStats | null;
  shakeStamp: number;
  fx: null | {
    kind: string;
    title: string;
    sub: string;
    stamp: number;
    actorKey?: string;
    targetKey?: string;
  };
  fxQueue?: {
    kind: string;
    title: string;
    sub: string;
    stamp: number;
    actorKey?: string;
    targetKey?: string;
  }[];
}

export interface NetState {
  mode: "local" | "online";
  room: string;
  seat: "" | Side;
  rev: number;
  polling: boolean;
  status: string;
}

export interface ReleaseInfo {
  ok?: boolean;
  updateAvailable?: boolean;
  forceUpdate?: boolean;
  latestVersion?: string;
  message?: string;
  installerUrl?: string;
  downloadUrl?: string;
  windowsZipUrl?: string;
}

export interface ReleaseState {
  checked: boolean;
  checking: boolean;
  data: ReleaseInfo | null;
  error: string;
}

export interface GameSnapshot {
  version: string;
  chars: CharacterCard[];
  state: GameState;
}

export interface TargetPreview {
  key: string;
  side: Side;
  name: string;
  hp: string;
  stats: string;
  summary: string;
  tags: string[];
}

export interface ObjectiveState {
  phase: "round-start" | "pending" | "action" | "settled";
  title: string;
  detail: string;
  controller: Side | "";
  actorName: string;
  pendingKind: string;
  confirmLabel: string;
  targets: TargetPreview[];
}
