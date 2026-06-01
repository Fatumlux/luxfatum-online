import { STATUS } from "../game";

export type StatusTone = "good" | "bad";

export type StatusGuide = {
  icon: string;
  tone: StatusTone;
  desc: string;
};

export type RuleListBlock = {
  title: string;
  items: string[];
};

export type JudgementGuide = {
  type: "atk" | "def" | "spd" | "heal" | "seal";
  cost: number;
  scope: "self" | "ally" | "enemy";
  label: string;
  desc: string;
};

export const STATUS_META: Record<string, StatusGuide> = {
  [STATUS.SEAL]: { icon: "印", tone: "bad", desc: "限制下次行動不能使用技能；改用攻擊、防禦或休息後移除。" },
  [STATUS.OBSERVE]: { icon: "測", tone: "bad", desc: "下一次受到傷害 +1，然後移除；映璃免疫觀測。" },
  [STATUS.CONFUSE]: { icon: "亂", tone: "bad", desc: "下次指定目標時，由對手在原本合法目標中選擇；普攻不能被改成打己方。" },
  [STATUS.SLOW]: { icon: "緩", tone: "bad", desc: "下回合 SPD -1。" },
  [STATUS.GUARD]: { icon: "護", tone: "good", desc: "可代替其他我方角色承受一次傷害；守護優先於衡朔被動代承。" },
  [STATUS.TIME_TAX]: { icon: "稅", tone: "bad", desc: "本回合第一次成功使用技能後，該技能冷卻 +1，受到 1 傷害，然後移除；回合結束必定移除。" },
  [STATUS.DELAY]: { icon: "延", tone: "bad", desc: "下次成功使用技能後，該技能冷卻 +1，然後移除；不因回合結束移除。" },
  [STATUS.CORROSION]: { icon: "蝕", tone: "bad", desc: "負面狀態，最多 2 層；受到治療時治療量 -1，治療後移除 1 層，不會把治療量降到 0。" },
  [STATUS.STITCH]: { icon: "縫", tone: "bad", desc: "負面狀態；本回合第一次造成傷害後，若指定縫星方 HP 最低角色，自己受到 1 傷害。" },
  欠條: { icon: "欠", tone: "bad", desc: "訟鴉特殊標記，不是負面狀態；本回合第一次行動後，若未指定訟鴉，訟鴉方獲得 1 能量，且自己受到 2 傷害。" },
  加重欠條: { icon: "重", tone: "bad", desc: "訟鴉特殊標記，不是負面狀態；若未指定訟鴉，訟鴉方獲得 1 能量，自己受到 2 傷害且獲得延滯。" },
  代價負荷: { icon: "衡", tone: "bad", desc: "祈衡特殊標記，不是負面狀態；本回合下次受到傷害時該次傷害 +1，然後移除。" },
  星線: { icon: "星", tone: "good", desc: "縫星我方特殊標記，不是守護；敵方第一次指定此角色為普攻或技能目標時，攻擊者受到 2 傷害。" }
};

export const STATUS_RULE_ROWS = Object.entries(STATUS_META).map(([name, meta]) => ({
  name,
  desc: meta.desc
}));

export const DRAFT_SEQUENCE_TEXT = "P1 → P2 → P2 → P1 → P1 → P2";

export const BASIC_ACTION_GUIDE: RuleListBlock = {
  title: "基本行動",
  items: [
    "普攻：指定 1 名敵方角色，造成目前 ATK 傷害。",
    "技能：支付能量並進入冷卻；角色需存活、冷卻為 0，且未被封印限制。",
    "防禦：本回合下一次受到傷害 -2，並免疫下一個負面狀態。",
    "休息：回復 1 HP，並移除 1 個負面狀態。",
    "裁定：每方每回合最多使用 1 次，消耗裁定標記產生戰術干預；不會結束目前角色行動。"
  ]
};

export const ROUND_FLOW_GUIDE: RuleListBlock = {
  title: "回合流程",
  items: [
    "回合開始：雙方 +2 能量，技能冷卻 -1，共鳴次數重置。",
    "待決處理：天訊、祈衡、縫星、訟鴉、刻律等回合開始效果依序詢問。",
    "排定順序：SPD 高者先；同速時 HP 較低者先，可被天訊規則改寫。",
    "角色行動：攻擊、技能、防禦或休息會結束行動；裁定可在行動中使用，且不會結束行動。",
    "回合結束：處理回合結束效果；時間稅與未觸發星線/縫線依規則移除。"
  ]
};

export const SETUP_GUIDE: RuleListBlock = {
  title: "開局設定",
  items: [
    "每位玩家選 3 名角色。",
    "起始能量 1，上限 6。",
    "起始裁定 0，上限 3。",
    "全角色開戰 HP +1，讓首輪交換更有餘裕。",
    "所有技能冷卻從 0 開始，第 1 回合仍可使用技能，但能量節奏較慢。",
    `選角順序：${DRAFT_SEQUENCE_TEXT}。`
  ]
};

export const RESONANCE_GUIDE: RuleListBlock = {
  title: "共鳴",
  items: [
    "只有成功使用技能後才能觸發。",
    "需要至少 1 名其他我方角色存活。",
    "每位玩家的隊伍每回合最多觸發 2 次。",
    "費用 1 的技能若共鳴，需額外支付 1 能量。"
  ]
};

export const DAMAGE_FLOW_GUIDE: RuleListBlock = {
  title: "傷害結算",
  items: [
    "先決定原目標，再檢查守護、衡朔代承與鏡刃鏡返。",
    "只有實際承傷者會套用觀測、受傷修正、防禦、裁定減傷與開局防線。",
    "祈衡代價失去 HP 不視為受到傷害，不觸發守護、觀測、裁定減傷或開局防線。"
  ]
};

export const JUDGEMENT_GUIDE: JudgementGuide[] = [
  { type: "atk", cost: 1, scope: "self", label: "傷害 +1", desc: "目前行動者下一次造成傷害 +1。" },
  { type: "def", cost: 1, scope: "self", label: "受傷 -1", desc: "目前行動者下一次受到傷害 -1。" },
  { type: "spd", cost: 1, scope: "ally", label: "SPD +1", desc: "指定我方 1 名角色，本回合 SPD +1 並重排行動序。" },
  { type: "heal", cost: 2, scope: "ally", label: "冷卻 -1 並回 1HP", desc: "指定我方 1 名角色，技能冷卻 -1 並回復 1 HP。" },
  { type: "seal", cost: 3, scope: "enemy", label: "封殺共鳴並遲緩", desc: "指定敵方 1 名角色，下一次技能不能觸發共鳴，並獲得遲緩。" }
];

export const RULE_GUIDE_BLOCKS = [
  SETUP_GUIDE,
  ROUND_FLOW_GUIDE,
  RESONANCE_GUIDE,
  DAMAGE_FLOW_GUIDE
];
