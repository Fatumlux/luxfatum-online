import type { GameState } from "../types";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce((acc, key) => {
      acc[key] = stable((value as Record<string, unknown>)[key]);
      return acc;
    }, {} as Record<string, unknown>);
}

export function stableStringify(value: unknown) {
  return JSON.stringify(stable(value));
}

export function stateHash(state: GameState | unknown) {
  const input = stableStringify(state);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
