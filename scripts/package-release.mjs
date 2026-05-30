import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const releaseInfo = JSON.parse(await readFile(join(root, "release.json"), "utf8"));
const version = String(releaseInfo.version || "v0.0.0");
const versionLabel = version.replace(/^v/i, "");
const outDir = join(root, "output", `release-${version}`);

function compileWindowsLauncher() {
  if (process.platform !== "win32") return;
  const csc = [
    "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe",
    "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe"
  ].find(existsSync);
  if (!csc) throw new Error("Missing .NET Framework csc.exe for Windows launcher build.");

  const result = spawnSync(csc, [
    "/nologo",
    "/target:winexe",
    "/platform:x64",
    "/out:dist\\windows\\LuxFatum.exe",
    "/win32icon:public\\assets\\ui\\luxfatum-app.ico",
    "/reference:dist\\windows\\Microsoft.Web.WebView2.Core.dll",
    "/reference:dist\\windows\\Microsoft.Web.WebView2.WinForms.dll",
    "/reference:System.Windows.Forms.dll",
    "/reference:System.Drawing.dll",
    "launcher\\LuxFatumLauncher.cs"
  ], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error("Windows launcher compilation failed.");
}

function compileInstallerBase() {
  if (process.platform !== "win32") return;
  const csc = [
    "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe",
    "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe"
  ].find(existsSync);
  if (!csc) throw new Error("Missing .NET Framework csc.exe for installer build.");

  const result = spawnSync(csc, [
    "/nologo",
    "/target:winexe",
    "/platform:x64",
    "/out:dist\\installer\\LuxFatum_Setup_Base.exe",
    "/win32icon:public\\assets\\ui\\luxfatum-app.ico",
    "/reference:System.Windows.Forms.dll",
    "/reference:System.Drawing.dll",
    "installer\\LuxFatumSetup.cs"
  ], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error("Installer compilation failed.");
}

compileWindowsLauncher();
compileInstallerBase();

const requiredFiles = [
  "web-build/index.html",
  "dist/windows/LuxFatum.exe",
  "dist/windows/Microsoft.Web.WebView2.Core.dll",
  "dist/windows/Microsoft.Web.WebView2.WinForms.dll",
  "dist/windows/WebView2Loader.dll"
];

for (const rel of requiredFiles) {
  if (!existsSync(join(root, rel))) {
    throw new Error(`Missing ${rel}. Run npm run build and rebuild the Windows launcher before packaging.`);
  }
}

function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
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
    await new Promise(resolveSleep => setTimeout(resolveSleep, 120));
  }
  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ""}`);
}

async function download(baseUrl, endpoint, filename) {
  const response = await fetch(`${baseUrl}${endpoint}`);
  if (!response.ok) throw new Error(`${endpoint} returned HTTP ${response.status}`);

  const bytes = Buffer.from(await response.arrayBuffer());
  let file = join(outDir, filename);
  try {
    await writeFile(file, bytes);
  } catch (error) {
    if ((error.code === "EBUSY" || error.code === "EPERM") && filename.toLowerCase().endsWith(".exe")) {
      file = join(outDir, filename.replace(/\.exe$/i, "-latest.exe"));
      await writeFile(file, bytes);
    } else {
      throw error;
    }
  }
  const info = await stat(file);
  return { file, bytes: info.size };
}

await mkdir(outDir, { recursive: true });

const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const serverLog = join(tmpdir(), `luxfatum-package-${Date.now()}.log`);
const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "ignore", "pipe"]
});

const errors = [];
server.stderr.on("data", chunk => errors.push(String(chunk)));

try {
  await waitFor(async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    return response.ok;
  }, "release package server");

  const outputs = [
    await download(baseUrl, "/download/package.zip", `luxfatum-online-v${versionLabel}-render-github.zip`),
    await download(baseUrl, "/download/windows.zip", `LuxFatum-Windows-Desktop-Online-v${versionLabel}.zip`)
  ];

  try {
    outputs.push(await download(baseUrl, "/download/installer.exe", `LuxFatum-Setup-v${versionLabel}.exe`));
  } catch (error) {
    console.warn(`Installer package skipped: ${error.message}`);
  }

  for (const output of outputs) {
    console.log(`${output.file} (${(output.bytes / 1024 / 1024).toFixed(2)} MB)`);
  }
} catch (error) {
  if (errors.length) await writeFile(serverLog, errors.join(""), "utf8");
  if (errors.length) console.error(`Server stderr saved to ${serverLog}`);
  throw error;
} finally {
  server.kill("SIGKILL");
}
