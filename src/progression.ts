import type { GameState, Side } from "./types";

export interface LocalMatchResult {
  at: number;
  winner: Side | "平手" | "";
  rounds: number;
  mode: "training" | "ai" | "local" | "online";
}

export interface LocalAchievement {
  id: string;
  title: string;
  desc: string;
  unlocked: boolean;
}

export interface LocalMeta {
  matches: number;
  wins: number;
  losses: number;
  trainingRuns: number;
  lastWinner: Side | "平手" | "";
  recentResults: LocalMatchResult[];
  achievements: Record<string, boolean>;
}

export const META_KEY = "luxfatum.meta.v1";

export const DEFAULT_META: LocalMeta = {
  matches: 0,
  wins: 0,
  losses: 0,
  trainingRuns: 0,
  lastWinner: "",
  recentResults: [],
  achievements: {}
};

export const ACHIEVEMENT_DEFS = [
  { id: "first_training", title: "命運入門", desc: "完成或進入一次訓練對戰。" },
  { id: "first_match", title: "裁定開局", desc: "完成一場完整對戰。" },
  { id: "first_win", title: "第一道勝線", desc: "P1 取得一場勝利。" },
  { id: "mirror_seen", title: "鏡面回聲", desc: "任一場出現鏡返紀錄。" },
  { id: "resonance_seen", title: "共鳴成形", desc: "任一場使用過共鳴。" }
];

export function loadMeta(): LocalMeta {
  if (typeof window === "undefined") return DEFAULT_META;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(META_KEY) || "{}");
    return {
      matches: Math.max(0, Number(parsed.matches) || 0),
      wins: Math.max(0, Number(parsed.wins) || 0),
      losses: Math.max(0, Number(parsed.losses) || 0),
      trainingRuns: Math.max(0, Number(parsed.trainingRuns) || 0),
      lastWinner: parsed.lastWinner === "p1" || parsed.lastWinner === "p2" || parsed.lastWinner === "平手" ? parsed.lastWinner : "",
      recentResults: Array.isArray(parsed.recentResults) ? parsed.recentResults.slice(0, 6) : [],
      achievements: parsed.achievements && typeof parsed.achievements === "object" ? parsed.achievements : {}
    };
  } catch {
    return DEFAULT_META;
  }
}

export function saveMeta(meta: LocalMeta) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // localStorage can be disabled in strict embedded shells.
  }
}

export function recordTrainingStart(meta: LocalMeta): LocalMeta {
  const achievements = { ...meta.achievements, first_training: true };
  return { ...meta, trainingRuns: meta.trainingRuns + 1, achievements };
}

export function recordMatchResult(meta: LocalMeta, state: GameState, mode: LocalMatchResult["mode"]): LocalMeta {
  const winner = state.winner === "p1" || state.winner === "p2" || state.winner === "平手" ? state.winner : "";
  const rows = Object.values(state.battleStats?.fighters || {});
  const achievements: Record<string, boolean> = { ...meta.achievements, first_match: true };
  if (winner === "p1") achievements.first_win = true;
  if (rows.some(row => row.mirrorReflects > 0)) achievements.mirror_seen = true;
  if (rows.some(row => row.resonanceUsed > 0)) achievements.resonance_seen = true;
  if (mode === "training") achievements.first_training = true;

  const result: LocalMatchResult = {
    at: Date.now(),
    winner,
    rounds: state.battleStats?.totalRounds || state.round || 0,
    mode
  };

  return {
    ...meta,
    matches: meta.matches + 1,
    wins: meta.wins + (winner === "p1" ? 1 : 0),
    losses: meta.losses + (winner === "p2" ? 1 : 0),
    lastWinner: winner,
    recentResults: [result, ...meta.recentResults].slice(0, 6),
    achievements
  };
}

export function achievementsFor(meta: LocalMeta): LocalAchievement[] {
  return ACHIEVEMENT_DEFS.map(def => ({ ...def, unlocked: !!meta.achievements[def.id] }));
}
