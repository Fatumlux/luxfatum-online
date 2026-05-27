import * as PIXI from "pixi.js";
import { installRulesBridge, readGameSnapshot } from "./game.js";
import { createPixiStage } from "./rendering/pixiApp.js";
import { renderBattleScene } from "./rendering/battleScene.js";

let stageHandle = null;
let activeRoot = null;
let stageToken = 0;

installRulesBridge();
installHowler();

async function installHowler() {
  if (window.Howl && window.Howler) return;
  try {
    const mod = await import("howler");
    window.Howl = mod.Howl || window.Howl;
    window.Howler = mod.Howler || window.Howler;
  } catch (error) {
    console.warn("Howler could not be loaded", error);
  }
}

async function ensureStage(root) {
  if (!root) return null;
  if (stageHandle && activeRoot === root && root.contains(stageHandle.app.canvas)) {
    return stageHandle;
  }

  destroyStage();
  activeRoot = root;
  const token = ++stageToken;
  const handle = await createPixiStage(PIXI, root, () => sync());
  if (token !== stageToken || activeRoot !== root) {
    handle.destroy();
    return null;
  }

  stageHandle = handle;
  return stageHandle;
}

function destroyStage() {
  stageToken += 1;
  const handle = stageHandle;
  stageHandle = null;
  activeRoot = null;
  if (!handle) return;
  try {
    handle.destroy();
  } catch (error) {
    console.warn("Pixi stage could not be destroyed", error);
  }
}

async function sync(snapshot = readGameSnapshot()) {
  const root = document.querySelector("#pixi-root");
  if (!root || !snapshot || snapshot.state?.screen !== "battle") {
    destroyStage();
    return;
  }

  const handle = await ensureStage(root);
  if (!handle) return;
  renderBattleScene(PIXI, handle, snapshot);
}

window.LuxFatumPixi = { sync, destroy: destroyStage };

window.addEventListener("resize", () => {
  if (stageHandle) sync();
});

queueMicrotask(() => sync());
