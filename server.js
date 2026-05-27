const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const rooms = new Map();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf"
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

function roomCode() {
  const chars = "BCDFGHJKLMNPQRSTVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? roomCode() : code;
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
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": mime[path.extname(full).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
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
