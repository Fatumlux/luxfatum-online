import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const versionInfo = JSON.parse(readFileSync(join(root, "src", "config", "version.json"), "utf8"));
const smokeVersion = String(versionInfo.gameVersion || "v0.0.0");
const outDir = join(root, "artifacts", `${smokeVersion}-smoke`);
const vitePort = Number(process.env.LUXFATUM_SMOKE_PORT || 5179);
const cdpPort = Number(process.env.LUXFATUM_CDP_PORT || 9231);
const baseUrl = `http://127.0.0.1:${vitePort}/`;
const viewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 }
];
let activePage = null;
let activeBrowser = null;
let activeVite = null;

function cleanupSmokeChildren() {
  try {
    activePage?.close?.();
  } catch {
    // Best-effort cleanup only.
  }
  try {
    activeBrowser?.kill?.("SIGKILL");
  } catch {
    // Best-effort cleanup only.
  }
  try {
    activeVite?.kill?.("SIGKILL");
  } catch {
    // Best-effort cleanup only.
  }
  activePage = null;
  activeBrowser = null;
  activeVite = null;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    cleanupSmokeChildren();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

function sleep(ms) {
  return new Promise(resolveSleep => setTimeout(resolveSleep, ms));
}

async function waitFor(check, label, timeout = 15000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeout) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(120);
  }
  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ""}`);
}

function browserPath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge"
  ].filter(Boolean);
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) throw new Error("No Chrome/Edge executable found. Set CHROME_PATH to run smoke:ui.");
  return found;
}

function spawnLogged(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], ...options });
  child.stdout?.on("data", data => process.stdout.write(String(data)));
  child.stderr?.on("data", data => process.stderr.write(String(data)));
  return child;
}

class CdpPage {
  constructor(wsUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.ws = new WebSocket(wsUrl);
  }

  async open() {
    await new Promise((resolveOpen, rejectOpen) => {
      this.ws.addEventListener("open", resolveOpen, { once: true });
      this.ws.addEventListener("error", rejectOpen, { once: true });
    });
    this.ws.addEventListener("message", event => this.onMessage(event));
  }

  onMessage(event) {
    const message = JSON.parse(String(event.data));
    if (message.id && this.pending.has(message.id)) {
      const { resolve: resolvePending, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolvePending(message.result);
      return;
    }
    if (message.method && this.events.has(message.method)) {
      for (const resolveEvent of this.events.get(message.method)) resolveEvent(message.params || {});
      this.events.delete(message.method);
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
      this.ws.send(payload);
    });
  }

  event(method, timeout = 10000) {
    return new Promise((resolveEvent, rejectEvent) => {
      const list = this.events.get(method) || [];
      list.push(resolveEvent);
      this.events.set(method, list);
      setTimeout(() => rejectEvent(new Error(`${method} timed out`)), timeout).unref?.();
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
    return result.result?.value;
  }

  async click(selector) {
    const ok = await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.scrollIntoView({ block: "center", inline: "center" });
      el.click();
      return true;
    })()`);
    if (!ok) throw new Error(`Missing selector: ${selector}`);
    await sleep(280);
  }

  async clickText(selector, text) {
    const ok = await this.evaluate(`(() => {
      const items = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
      const el = items.find(item => (item.textContent || "").includes(${JSON.stringify(text)}));
      if (!el) return false;
      el.scrollIntoView({ block: "center", inline: "center" });
      el.click();
      return true;
    })()`);
    if (!ok) throw new Error(`Missing text ${text} in ${selector}`);
    await sleep(280);
  }

  async setViewport(width, height) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 520,
      screenWidth: width,
      screenHeight: height
    });
    await sleep(160);
  }

  async navigate(url) {
    const load = this.event("Page.loadEventFired", 15000).catch(() => null);
    await this.send("Page.navigate", { url });
    await load;
    await waitFor(() => this.evaluate("document.readyState === 'complete'"), "document ready");
    await this.evaluate(`localStorage.setItem("hasSeenIntro", "true")`);
    await sleep(500);
  }

  async waitForSelector(selector, label = selector) {
    await waitFor(() => this.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), label);
  }

  async screenshot(name) {
    const image = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const file = join(outDir, `${name}.png`);
    writeFileSync(file, Buffer.from(image.data, "base64"));
    return file;
  }

  close() {
    this.ws.close();
  }
}

async function main() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const viteBin = join(root, "node_modules", "vite", "bin", "vite.js");
  const vite = activeVite = spawnLogged(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(vitePort), "--strictPort"]);
  await waitFor(async () => {
    const res = await fetch(baseUrl);
    return res.ok;
  }, "Vite dev server");

  const userDataDir = join(tmpdir(), `luxfatum-smoke-profile-${Date.now()}`);
  const browser = activeBrowser = spawnLogged(browserPath(), [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank"
  ]);

  const version = await waitFor(async () => {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
    return res.ok ? res.json() : null;
  }, "Chrome DevTools");

  const pageInfo = await (async () => {
    const targetUrl = `${baseUrl}?smoke=1`;
    let res = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(targetUrl)}`, { method: "PUT" });
    if (!res.ok) res = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(targetUrl)}`);
    return res.json();
  })();

  const page = activePage = new CdpPage(pageInfo.webSocketDebuggerUrl || version.webSocketDebuggerUrl);
  await page.open();
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      localStorage.setItem("hasSeenIntro", "true");
      localStorage.setItem("luxfatum.settings.v1", JSON.stringify({
        masterVolume: 0.9,
        sfxVolume: 0.8,
        bgmVolume: 0.55,
        fullscreen: false,
        highValueMode: false,
        hasSeenTutorial: true,
        reducedMotion: true,
        showBattleHints: true,
        aspectRatio: "auto",
        recentTeams: []
      }));
    `
  });

  const report = [];
  async function capture(label, viewport, expectations = {}) {
    await page.setViewport(viewport.width, viewport.height);
    await sleep(350);
    const file = await page.screenshot(`${label}-${viewport.width}x${viewport.height}`);
    const metrics = await page.evaluate(`(() => {
      const text = document.body.innerText || "";
      const rectOf = selector => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { width: rect.width, height: rect.height, top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom };
      };
      const firstVisibleButton = () => {
        const buttons = Array.from(document.querySelectorAll("button:not(:disabled), summary"));
        for (const el of buttons) {
          const rect = el.getBoundingClientRect();
          const visible = rect.width >= 28
            && rect.height >= 28
            && rect.bottom > 0
            && rect.right > 0
            && rect.top < innerHeight
            && rect.left < innerWidth;
          if (visible) return { width: rect.width, height: rect.height, top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom };
        }
        return null;
      };
      const intersects = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const systemPanel = rectOf(".system-menu[open] .system-menu-panel");
      const systemProbe = systemPanel
        ? document.elementFromPoint(systemPanel.left + systemPanel.width / 2, Math.min(systemPanel.bottom - 4, systemPanel.top + 24))
        : null;
      const combatDrawer = rectOf(".combat-drawer-panel");
      const turnFlow = rectOf(".turn-flow");
      return {
        label: ${JSON.stringify(label)},
        viewport: { width: innerWidth, height: innerHeight },
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        hasVersion: text.includes(${JSON.stringify(smokeVersion)}),
        hasCanvas: !!document.querySelector("canvas"),
        hasMenu: !!document.querySelector("[data-smoke='menu']"),
        hasDraft: !!document.querySelector("[data-smoke='draft']"),
        hasBattle: !!document.querySelector("[data-smoke='battle']"),
        hasRules: !!document.querySelector("[data-smoke='rules']"),
        hasSettlement: !!document.querySelector("[data-smoke='settlement']"),
        hasObjective: !!document.querySelector(".objective-panel, .actions.pending"),
        primaryButton: firstVisibleButton(),
        combatFlowOverlap: intersects(combatDrawer, turnFlow),
        systemMenuOnTop: !systemPanel || !!systemProbe?.closest?.(".system-menu-panel")
      };
    })()`);
    const failures = [];
    if (metrics.scrollWidth > viewport.width + 2 || metrics.bodyScrollWidth > viewport.width + 2) failures.push("horizontal overflow");
    if (expectations.version && !metrics.hasVersion) failures.push(`missing ${smokeVersion} text`);
    if (expectations.canvas && !metrics.hasCanvas) failures.push("missing battle canvas");
    if (expectations.objective && !metrics.hasObjective) failures.push("missing battle objective");
    if (expectations.menu && !metrics.hasMenu) failures.push("missing menu");
    if (expectations.draft && !metrics.hasDraft) failures.push("missing draft");
    if (expectations.rules && !metrics.hasRules) failures.push("missing rules");
    if (expectations.settlement && !metrics.hasSettlement) failures.push("missing settlement");
    if (expectations.noCombatDrawerOverlap && metrics.combatFlowOverlap) failures.push("combat drawer overlaps turn flow");
    if (expectations.systemPopover && !metrics.systemMenuOnTop) failures.push("system menu is covered by page content");
    if (!metrics.primaryButton || metrics.primaryButton.height < 28) failures.push("primary button not visible");
    report.push({ ...metrics, file, failures });
    if (failures.length) throw new Error(`${label} ${viewport.width}x${viewport.height}: ${failures.join(", ")}`);
  }

  const desktop = viewports[0];
  await page.setViewport(desktop.width, desktop.height);
  await page.navigate(baseUrl);
  await page.waitForSelector("[data-smoke='menu']", "menu");
  for (const viewport of viewports) await capture("menu", viewport, { version: true, menu: true });

  await page.setViewport(desktop.width, desktop.height);
  await page.click("[data-smoke='local-draft']");
  await page.waitForSelector("[data-smoke='draft']", "draft");
  await capture("draft", desktop, { version: true, draft: true });
  await capture("draft", viewports[3], { version: true, draft: true });
  await page.setViewport(viewports[3].width, viewports[3].height);
  await page.evaluate(`document.querySelector(".draft-pool")?.scrollIntoView({ block: "start" })`);
  await sleep(300);
  await capture("draft-pool", viewports[3], { version: true, draft: true });

  await page.navigate(baseUrl);
  await page.waitForSelector("[data-smoke='menu']", "menu reload");
  await page.click("[data-smoke='training']");
  await page.waitForSelector("[data-smoke='battle']", "training battle");
  for (const viewport of viewports) await capture("battle-pending", viewport, { version: true, canvas: true, objective: true });

  await page.setViewport(desktop.width, desktop.height);
  await page.click(".battle-top .tool-button");
  await page.waitForSelector(".combat-drawer.open", "combat drawer");
  await capture("combat-drawer", desktop, { version: true, canvas: true, noCombatDrawerOverlap: true });
  await page.click(".battle-top .tool-button");

  await page.setViewport(viewports[2].width, viewports[2].height);
  await page.click(".system-menu summary");
  await waitFor(() => page.evaluate(`document.querySelector(".system-menu")?.open === true`), "system menu open");
  await capture("system-menu", viewports[2], { version: true, canvas: true, systemPopover: true });
  await page.click(".system-menu summary");

  await page.setViewport(desktop.width, desktop.height);
  await page.click(".actions.pending button:not(:disabled), .choice-grid button:not(:disabled)");
  await page.waitForSelector("[data-smoke='action-skill']", "battle actions");
  await capture("battle-action", desktop, { version: true, canvas: true, objective: true });

  await page.click("[data-smoke='action-skill']");
  await page.waitForSelector("[data-smoke='modal']", "skill dialog");
  await capture("skill-dialog", desktop, { version: true, canvas: true });
  await page.click(".dialog-head button");

  await page.click(".danger-zone summary");
  await page.click(".danger-zone button:not(:disabled)");
  await page.waitForSelector("[data-smoke='settlement']", "settlement");
  await capture("settlement", desktop, { version: true, settlement: true });

  await page.navigate(baseUrl);
  await page.waitForSelector("[data-smoke='menu']", "menu for rules");
  await page.clickText("button", "規則");
  await page.waitForSelector("[data-smoke='rules']", "rules");
  await capture("rules", desktop, { version: true, rules: true });

  writeFileSync(join(outDir, "smoke-report.json"), JSON.stringify(report, null, 2), "utf8");
  cleanupSmokeChildren();
  console.log(`UI smoke passed. Report: ${join(outDir, "smoke-report.json")}`);
}

main().catch(error => {
  cleanupSmokeChildren();
  console.error(error?.stack || error);
  process.exit(1);
});
