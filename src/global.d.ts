import type { GameSnapshot } from "./types";
import type { SteamBridge } from "./network/SteamBridgeTransport";

declare module "*.css";

declare global {
  interface Window {
    LuxFatumGameSnapshot?: () => GameSnapshot;
    LuxFatumRules?: Record<string, unknown>;
    LuxFatumDevTools?: {
      enable: () => void;
      disable: () => void;
      check: () => unknown[];
    };
    LuxFatumPhaser?: unknown;
    commit?: () => void | Promise<void>;
    render?: () => void;
    openDialog?: (type: string) => void;
    closeDialog?: () => void;
    startBattle?: (...args: unknown[]) => unknown;
    nextRound?: (...args: unknown[]) => unknown;
    buildQueue?: (...args: unknown[]) => unknown;
    afterAction?: (...args: unknown[]) => unknown;
    endRound?: (...args: unknown[]) => unknown;
    requestAttack?: (...args: unknown[]) => unknown;
    attack?: (...args: unknown[]) => unknown;
    decideConfuseAttack?: (...args: unknown[]) => unknown;
    decideMirror?: (...args: unknown[]) => unknown;
    decideTimeTax?: (...args: unknown[]) => unknown;
    decideDebt?: (...args: unknown[]) => unknown;
    decideQihengBalance?: (...args: unknown[]) => unknown;
    decideFengxingStar?: (...args: unknown[]) => unknown;
    decideLiewuCombo?: (...args: unknown[]) => unknown;
    useSkill?: (...args: unknown[]) => unknown;
    decideIno?: (...args: unknown[]) => unknown;
    defend?: (...args: unknown[]) => unknown;
    rest?: (...args: unknown[]) => unknown;
    judgement?: (...args: unknown[]) => unknown;
    luxfatumSteam?: SteamBridge;
  }
}

export {};
