export type AspectRatioMode = "auto" | "16:9" | "16:10" | "4:3";

export interface GameSettings {
  masterVolume: number;
  sfxVolume: number;
  bgmVolume: number;
  fullscreen: boolean;
  highValueMode: boolean;
  hasSeenTutorial: boolean;
  reducedMotion: boolean;
  showBattleHints: boolean;
  aspectRatio: AspectRatioMode;
  recentTeams: string[][];
}

export const SETTINGS_KEY = "luxfatum.settings.v1";

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.9,
  sfxVolume: 0.8,
  bgmVolume: 0.55,
  fullscreen: false,
  highValueMode: false,
  hasSeenTutorial: false,
  reducedMotion: false,
  showBattleHints: true,
  aspectRatio: "auto",
  recentTeams: []
};

function clamp01(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function validAspectRatio(value: unknown): AspectRatioMode {
  return value === "16:9" || value === "16:10" || value === "4:3" ? value : "auto";
}

function normalizeRecentTeams(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(team => Array.isArray(team))
    .map(team => team.filter(id => typeof id === "string").slice(0, 3))
    .filter(team => team.length > 0)
    .slice(0, 5);
}

export function loadSettings(): GameSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}");
    const legacyIntro = window.localStorage.getItem("hasSeenIntro") === "true";
    return {
      masterVolume: clamp01(parsed.masterVolume, DEFAULT_SETTINGS.masterVolume),
      sfxVolume: clamp01(parsed.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
      bgmVolume: clamp01(parsed.bgmVolume, DEFAULT_SETTINGS.bgmVolume),
      fullscreen: typeof parsed.fullscreen === "boolean" ? parsed.fullscreen : DEFAULT_SETTINGS.fullscreen,
      highValueMode: typeof parsed.highValueMode === "boolean" ? parsed.highValueMode : DEFAULT_SETTINGS.highValueMode,
      hasSeenTutorial: typeof parsed.hasSeenTutorial === "boolean" ? parsed.hasSeenTutorial : legacyIntro,
      reducedMotion: typeof parsed.reducedMotion === "boolean" ? parsed.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
      showBattleHints: typeof parsed.showBattleHints === "boolean" ? parsed.showBattleHints : DEFAULT_SETTINGS.showBattleHints,
      aspectRatio: validAspectRatio(parsed.aspectRatio),
      recentTeams: normalizeRecentTeams(parsed.recentTeams)
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: GameSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (settings.hasSeenTutorial) window.localStorage.setItem("hasSeenIntro", "true");
  } catch {
    // Some embedded shells or strict privacy modes can disable localStorage.
  }
}
