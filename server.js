const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const API_BASE = String(process.env.LUXFATUM_API_BASE || "").replace(/\/+$/, "");
const PROXY_API_PATHS = new Set(["/api/create", "/api/join", "/api/state"]);
const rooms = new Map();
const packageInfo = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const releaseInfo = JSON.parse(fs.readFileSync(path.join(ROOT, "release.json"), "utf8"));
const APP_META = {
  name: packageInfo.name || "luxfatum-online",
  displayName: releaseInfo.name || "LuxFatum",
  version: releaseInfo.version || packageInfo.version || "0.0.0",
  build: process.env.RENDER_GIT_COMMIT || process.env.APP_BUILD || "local",
  channel: releaseInfo.channel || "stable",
  updatedAt: releaseInfo.updatedAt || "2026-05-27",
  minSupportedVersion: releaseInfo.minSupportedVersion || releaseInfo.version || packageInfo.version || "0.0.0",
  forceUpdate: !!releaseInfo.forceUpdate,
  packageName: `luxfatum-online-v${releaseInfo.version || packageInfo.version || "0.0.0"}-render-github.zip`,
  windowsPackageName: `LuxFatum-Windows-Desktop-Online-v${releaseInfo.version || packageInfo.version || "0.0.0"}.zip`,
  installerPackageName: `LuxFatum-Setup-v${releaseInfo.version || packageInfo.version || "0.0.0"}.exe`
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".zip": "application/zip",
  ".exe": "application/vnd.microsoft.portable-executable"
};

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 8_000_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch (err) { reject(err); }
    });
  });
}

async function proxyApi(req, res, url) {
  const target = `${API_BASE}${url.pathname}${url.search}`;
  const init = {
    method: req.method,
    headers: {
      "content-type": req.headers["content-type"] || "application/json; charset=utf-8"
    }
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = JSON.stringify(await readBody(req));
  }

  try {
    const upstream = await fetch(target, init);
    const body = await upstream.text();
    res.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    });
    res.end(body);
  } catch (err) {
    json(res, 502, { ok: false, error: `線上伺服器連線失敗：${err.message}` });
  }
}

function roomCode() {
  const chars = "BCDFGHJKLMNPQRSTVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? roomCode() : code;
}

function compareVersions(a, b) {
  const left = String(a || "0").split(".").map(n => Number.parseInt(n, 10) || 0);
  const right = String(b || "0").split(".").map(n => Number.parseInt(n, 10) || 0);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function versionPayload(clientVersion) {
  const latest = APP_META.version;
  const belowMinimum = clientVersion ? compareVersions(clientVersion, APP_META.minSupportedVersion) < 0 : false;
  const updateAvailable = clientVersion ? compareVersions(clientVersion, latest) < 0 : false;
  const forced = APP_META.forceUpdate || belowMinimum;
  return {
    ok: true,
    appId: releaseInfo.appId || "luxfatum.online",
    name: APP_META.displayName,
    version: latest,
    latestVersion: latest,
    clientVersion: clientVersion || null,
    updateAvailable,
    forceUpdate: forced,
    minSupportedVersion: APP_META.minSupportedVersion,
    channel: APP_META.channel,
    build: APP_META.build,
    updatedAt: APP_META.updatedAt,
    notes: releaseInfo.notes || [],
    message: forced ? releaseInfo.forceUpdateMessage : "目前已是最新版本。",
    downloadUrl: releaseInfo.downloadUrl || "/download/installer.exe",
    installerUrl: releaseInfo.installerUrl || releaseInfo.downloadUrl || "/download/installer.exe",
    windowsZipUrl: releaseInfo.windowsZipUrl || "/download/windows.zip",
    renderPackageUrl: releaseInfo.renderPackageUrl || "/download/package.zip",
    onlineUrl: releaseInfo.onlineUrl || null,
    versionUrl: releaseInfo.versionUrl || "/api/version"
  };
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(date) {
  return ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) & 0xffff;
}

function dosDate(date) {
  return (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
}

function shouldPackage(rel) {
  const clean = rel.replace(/\\/g, "/");
  if (!clean || clean.startsWith(".git/") || clean.startsWith("runtime_logs/") || clean.startsWith("node_modules/")) return false;
  if (clean.startsWith("launcher/webview2_pkg/")) return false;
  if (clean.startsWith("verification-") || clean.endsWith(".zip") || clean.endsWith(".log")) return false;
  return [
    "assets/",
    "dist/windows/LuxFatum.exe",
    "dist/windows/Microsoft.Web.WebView2.Core.dll",
    "dist/windows/Microsoft.Web.WebView2.WinForms.dll",
    "dist/windows/WebView2Loader.dll",
    "dist/installer/LuxFatum_Setup_Base.exe",
    "installer/MicrosoftEdgeWebView2Setup.exe",
    "launcher/",
    "index.html",
    "server.js",
    "package.json",
    "release.json",
    "render.yaml",
    "Dockerfile",
    "README.txt",
    "README_WINDOWS.txt",
    "DEPLOY_RENDER.txt",
    "rules_v4_1.txt",
    "start_server.bat"
  ].some(entry => clean === entry || clean.startsWith(entry));
}

function packageFiles(dir = ROOT, base = "") {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.join(base, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...packageFiles(full, rel));
    else if (stat.isFile() && shouldPackage(rel)) out.push({ full, rel: rel.replace(/\\/g, "/"), stat });
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

function buildZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const data = fs.readFileSync(file.full);
    const name = Buffer.from(file.rel, "utf8");
    const crc = crc32(data);
    const mtime = file.stat.mtime;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime(mtime), 10);
    local.writeUInt16LE(dosDate(mtime), 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime(mtime), 12);
    central.writeUInt16LE(dosDate(mtime), 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function servePackage(res) {
  const zip = buildZip(packageFiles());
  res.writeHead(200, {
    "content-type": "application/zip",
    "content-length": zip.length,
    "content-disposition": `attachment; filename="${APP_META.packageName}"`,
    "cache-control": "no-store"
  });
  res.end(zip);
}

function windowsPackageFiles() {
  const exe = path.join(ROOT, "dist", "windows", "LuxFatum.exe");
  if (!fs.existsSync(exe)) return null;
  const files = packageFiles().filter(file => !file.rel.startsWith("launcher/") && !file.rel.startsWith("dist/") && !file.rel.startsWith("installer/"));
  files.push({ full: exe, rel: "LuxFatum.exe", stat: fs.statSync(exe) });
  for (const name of ["Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.WinForms.dll", "WebView2Loader.dll"]) {
    const full = path.join(ROOT, "dist", "windows", name);
    if (fs.existsSync(full)) files.push({ full, rel: name, stat: fs.statSync(full) });
  }
  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}

function serveWindowsPackage(res) {
  const files = windowsPackageFiles();
  if (!files) return json(res, 404, { ok: false, error: "Windows 啟動器尚未建立" });
  const zip = buildZip(files);
  res.writeHead(200, {
    "content-type": "application/zip",
    "content-length": zip.length,
    "content-disposition": `attachment; filename="${APP_META.windowsPackageName}"`,
    "cache-control": "no-store"
  });
  res.end(zip);
}

function buildInstaller() {
  const baseExe = path.join(ROOT, "dist", "installer", "LuxFatum_Setup_Base.exe");
  const webViewSetup = path.join(ROOT, "installer", "MicrosoftEdgeWebView2Setup.exe");
  const files = windowsPackageFiles();
  if (!files || !fs.existsSync(baseExe) || !fs.existsSync(webViewSetup)) return null;

  const base = fs.readFileSync(baseExe);
  const payload = buildZip(files);
  const webView = fs.readFileSync(webViewSetup);
  const lengths = Buffer.alloc(16);
  lengths.writeBigInt64LE(BigInt(payload.length), 0);
  lengths.writeBigInt64LE(BigInt(webView.length), 8);
  return Buffer.concat([base, payload, webView, lengths, Buffer.from("LUXFATUMSETUP001", "ascii")]);
}

function serveInstaller(res) {
  if (releaseInfo.installerExternalUrl) {
    res.writeHead(302, {
      "location": releaseInfo.installerExternalUrl,
      "cache-control": "no-store"
    });
    res.end();
    return;
  }

  const installer = buildInstaller();
  if (!installer) {
    return json(res, 404, {
      ok: false,
      error: "Installer payload is missing. Upload dist/installer/LuxFatum_Setup_Base.exe and installer/MicrosoftEdgeWebView2Setup.exe."
    });
  }

  res.writeHead(200, {
    "content-type": "application/vnd.microsoft.portable-executable",
    "content-length": installer.length,
    "content-disposition": `attachment; filename="${APP_META.installerPackageName}"`,
    "cache-control": "no-store"
  });
  res.end(installer);
}

function touch(room) {
  room.updatedAt = Date.now();
}

setInterval(() => {
  const cutoff = Date.now() - 1000 * 60 * 60 * 8;
  for (const [code, room] of rooms) {
    if (room.updatedAt < cutoff) rooms.delete(code);
  }
}, 1000 * 60 * 20).unref();

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (API_BASE && PROXY_API_PATHS.has(url.pathname)) {
    return proxyApi(req, res, url);
  }

  if (url.pathname === "/api/version" && req.method === "GET") {
    return json(res, 200, versionPayload(url.searchParams.get("client")));
  }

  if (url.pathname === "/api/health" && req.method === "GET") {
    return json(res, 200, {
      ok: true,
      version: APP_META.version,
      build: APP_META.build,
      rooms: rooms.size,
      uptime: Math.round(process.uptime())
    });
  }

  if (url.pathname === "/api/create" && req.method === "POST") {
    const payload = await readBody(req);
    const code = roomCode();
    const room = {
      code,
      state: payload.state || null,
      rev: 1,
      players: { p1: true, p2: false },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    rooms.set(code, room);
    return json(res, 200, { ok: true, room: code, seat: "p1", rev: room.rev, state: room.state });
  }

  if (url.pathname === "/api/join" && req.method === "POST") {
    const payload = await readBody(req);
    const code = String(payload.room || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return json(res, 404, { ok: false, error: "找不到房間" });
    room.players.p2 = true;
    touch(room);
    return json(res, 200, { ok: true, room: code, seat: "p2", rev: room.rev, state: room.state });
  }

  if (url.pathname === "/api/state" && req.method === "GET") {
    const code = String(url.searchParams.get("room") || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return json(res, 404, { ok: false, error: "找不到房間" });
    touch(room);
    return json(res, 200, { ok: true, room: code, rev: room.rev, players: room.players, state: room.state });
  }

  if (url.pathname === "/api/state" && req.method === "POST") {
    const payload = await readBody(req);
    const code = String(payload.room || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return json(res, 404, { ok: false, error: "找不到房間" });
    if (!payload.state || typeof payload.rev !== "number") return json(res, 400, { ok: false, error: "資料格式錯誤" });
    if (payload.rev < room.rev) return json(res, 409, { ok: false, error: "房間狀態較新", rev: room.rev, state: room.state });
    room.state = payload.state;
    room.rev += 1;
    touch(room);
    return json(res, 200, { ok: true, rev: room.rev, state: room.state });
  }

  return json(res, 404, { ok: false, error: "未知 API" });
}

function serveFile(req, res, url) {
  let file = decodeURIComponent(url.pathname);
  if (file === "/") file = "/index.html";
  const full = path.normalize(path.join(ROOT, file));
  if (!full.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.stat(full, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const type = mime[path.extname(full).toLowerCase()] || "application/octet-stream";
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        res.writeHead(416, { "content-range": `bytes */${stat.size}` });
        res.end();
        return;
      }
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
      if (start >= stat.size || end < start) {
        res.writeHead(416, { "content-range": `bytes */${stat.size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        "content-type": type,
        "content-length": end - start + 1,
        "content-range": `bytes ${start}-${end}/${stat.size}`,
        "accept-ranges": "bytes",
        "cache-control": type.startsWith("audio/") ? "public, max-age=3600" : "no-store"
      });
      fs.createReadStream(full, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      "content-type": type,
      "content-length": stat.size,
      "accept-ranges": "bytes",
      "cache-control": type.startsWith("audio/") ? "public, max-age=3600" : "no-store"
    });
    fs.createReadStream(full).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/download/package.zip") {
    servePackage(res);
    return;
  }
  if (url.pathname === "/download/windows.zip") {
    serveWindowsPackage(res);
    return;
  }
  if (url.pathname === "/download/installer.exe") {
    serveInstaller(res);
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch(err => json(res, 500, { ok: false, error: err.message }));
    return;
  }
  serveFile(req, res, url);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`LuxFatum online server running`);
  console.log(`Local:   http://localhost:${PORT}`);
  console.log(`LAN:     http://<this-computer-ip>:${PORT}`);
});
