import { createServer } from "node:http";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL(".", import.meta.url));
const distDir = resolve(root, "dist");
const publicDir = resolve(root, "public");
const outputsDir = resolve(root, "outputs");
const downloadsDir = resolve(root, "downloads");
const configPath = resolve(root, "config", "ghostpipe.json");
const logPath = resolve(root, "ghostpipe.log");
const lockPath = resolve(root, "ghostpipe.lock");
const port = Number(process.env.PORT || 4173);
const sessions = new Map();
let managedPipeline = null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".m4a": "audio/mp4",
  ".vtt": "text/vtt; charset=utf-8",
};

function readJson(relativePath, fallback) {
  try {
    return JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
  } catch {
    return fallback;
  }
}

function readEnvFile() {
  if (!existsSync(resolve(root, ".env"))) return {};
  return Object.fromEntries(
    readFileSync(resolve(root, ".env"), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
  );
}

const envFile = readEnvFile();

function envValue(key, fallback) {
  return process.env[key] || envFile[key] || fallback;
}

const dashboardUser = envValue("DASHBOARD_USERNAME", "operator@ghostpipe.local");
const dashboardPassword = envValue("DASHBOARD_PASSWORD", "ghostpipe");

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function isAuthenticated(request) {
  const token = parseCookies(request).ghostpipe_session;
  return Boolean(token && sessions.has(token));
}

function requireAuth(request, response) {
  if (isAuthenticated(request)) return true;
  sendError(response, 401, "authentication required");
  return false;
}

function writeJson(relativePath, data) {
  writeFileSync(resolve(root, relativePath), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function readConfig() {
  return readJson("config/ghostpipe.json", {});
}

function writeConfigPatch(patch) {
  const current = readConfig();
  const allowed = new Set([
    "mode",
    "max_daily_uploads",
    "upload_privacy",
    "upload_timezone",
    "upload_peak_times",
    "delete_local_files_after_upload",
    "auto_approve_pending",
    "approval_auto_min_virality_score",
  ]);
  for (const [key, value] of Object.entries(patch)) {
    if (allowed.has(key)) {
      current[key] = value;
    }
  }
  writeFileSync(configPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  return current;
}

function encodeApprovalId(item) {
  return Buffer.from(`${item.video_path}|${item.timestamp}`, "utf8").toString("base64url");
}

function withIds(items) {
  return items.map((item) => ({ ...item, id: item.id ?? encodeApprovalId(item) }));
}

function readApprovals() {
  const config = readConfig();
  const items = withIds(readJson("public/data/approval_queue.json", []));
  if (config.auto_approve_pending === true) {
    const minimumScore = Number(config.approval_auto_min_virality_score ?? 0);
    let changed = false;
    for (const item of items) {
      const score = Number(item?.prediction?.predicted_virality ?? 0);
      const pending = item.approved == null || item.upload_status === "pending_approval";
      if (pending && score >= minimumScore) {
        item.approved = true;
        item.upload_status = "approved";
        item.reviewed_at = item.reviewed_at ?? new Date().toISOString();
        item.auto_approved = true;
        changed = true;
      }
    }
    if (changed) writeApprovals(items);
  }
  return items;
}

function writeApprovals(items) {
  writeJson("public/data/approval_queue.json", items.map(({ id, ...item }) => item));
}

function readQuota() {
  const quota = readJson("public/data/daily_quota_state.json", {});
  const config = readConfig();
  return {
    ...quota,
    short: quota.short ?? 0,
    video: quota.video ?? 0,
    max_daily_uploads: quota.max_daily_uploads ?? config.max_daily_uploads ?? 5,
  };
}

function readStatus() {
  const config = readConfig();
  const logTail = existsSync(logPath)
    ? readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean).slice(-80)
    : [];

  return {
    mode: config.mode ?? "live",
    running: existsSync(lockPath),
    lock_file: "ghostpipe.lock",
    log_tail: logTail,
    last_log_line: logTail.at(-1) ?? null,
    generated_at: new Date().toISOString(),
    managed_pid: managedPipeline?.pid ?? null,
  };
}

function readOverview() {
  return {
    quota: readQuota(),
    approvals: readApprovals(),
    report: readJson("public/data/weekly_tuning_report.json", {}),
    media: readJson("public/data/recreated_media.json", []),
    status: readStatus(),
    config: readConfig(),
  };
}

function sendJson(response, data, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

function sendError(response, status, message) {
  sendJson(response, { error: message }, status);
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        rejectBody(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolveBody(body));
    request.on("error", rejectBody);
  });
}

async function handleApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const body = JSON.parse((await readBody(request)) || "{}");
    if (!safeEqual(body.email || "", dashboardUser) || !safeEqual(body.password || "", dashboardPassword)) {
      sendError(response, 401, "invalid credentials");
      return true;
    }
    const token = randomBytes(32).toString("hex");
    sessions.set(token, { createdAt: Date.now() });
    response.setHeader("Set-Cookie", `ghostpipe_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`);
    sendJson(response, { ok: true });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = parseCookies(request).ghostpipe_session;
    if (token) sessions.delete(token);
    response.setHeader("Set-Cookie", "ghostpipe_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    sendJson(response, { ok: true });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/session") {
    sendJson(response, { authenticated: isAuthenticated(request) });
    return true;
  }

  if (url.pathname.startsWith("/api/") && !requireAuth(request, response)) {
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/overview") {
    sendJson(response, readOverview());
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/approvals") {
    sendJson(response, readApprovals());
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/status") {
    sendJson(response, readStatus());
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/config") {
    sendJson(response, readConfig());
    return true;
  }
  if (request.method === "PATCH" && url.pathname === "/api/config") {
    const body = JSON.parse((await readBody(request)) || "{}");
    sendJson(response, writeConfigPatch(body));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/pipeline/start") {
    sendJson(response, startPipeline());
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/pipeline/stop") {
    sendJson(response, stopPipeline());
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/logs/stream") {
    streamLogs(request, response);
    return true;
  }

  const approvalMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)$/);
  if (request.method === "PATCH" && approvalMatch) {
    const body = JSON.parse((await readBody(request)) || "{}");
    if (typeof body.approved !== "boolean") {
      sendError(response, 400, "approved must be boolean");
      return true;
    }
    const approvals = readApprovals();
    const id = decodeURIComponent(approvalMatch[1]);
    const normalizedId = id.replaceAll("\\", "/");
    const index = approvals.findIndex((item) => {
      const videoPath = String(item.video_path ?? "").replaceAll("\\", "/");
      const publicUrl = String(item.public_url ?? "").replaceAll("\\", "/");
      return item.id === id || videoPath === normalizedId || publicUrl === normalizedId;
    });
    if (index === -1) {
      sendError(response, 404, "approval item not found");
      return true;
    }
    approvals[index].approved = body.approved;
    approvals[index].upload_status = body.approved ? "approved" : "rejected";
    approvals[index].reviewed_at = new Date().toISOString();
    writeApprovals(approvals);
    sendJson(response, approvals[index]);
    return true;
  }

  return false;
}

function startPipeline() {
  if (existsSync(lockPath)) {
    return { status: "already_running", ...readStatus() };
  }
  if (managedPipeline && !managedPipeline.killed) {
    return { status: "already_managed", pid: managedPipeline.pid };
  }
  managedPipeline = spawn("python", ["pipeline\\ghostpipe_v5_1_pipeline.py"], {
    cwd: root,
    detached: false,
    stdio: "ignore",
    windowsHide: true,
  });
  managedPipeline.unref();
  const pid = managedPipeline.pid;
  managedPipeline.on("exit", () => {
    managedPipeline = null;
  });
  return { status: "started", pid };
}

function stopPipeline() {
  const pid = managedPipeline?.pid || Number(existsSync(lockPath) ? readFileSync(lockPath, "utf8") : 0);
  if (!pid) {
    return { status: "not_running" };
  }
  try {
    process.kill(pid);
    if (managedPipeline?.pid === pid) managedPipeline = null;
    return { status: "stopped", pid };
  } catch (error) {
    return { status: "stop_failed", pid, error: error.message };
  }
}

function streamLogs(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
  let last = "";
  const send = () => {
    const logTail = existsSync(logPath)
      ? readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean).slice(-80)
      : [];
    const payload = JSON.stringify(logTail);
    if (payload !== last) {
      last = payload;
      response.write(`event: logs\ndata: ${payload}\n\n`);
    }
  };
  send();
  const timer = setInterval(send, 2000);
  request.on("close", () => clearInterval(timer));
}

function safeStaticPath(baseDir, pathname) {
  const cleanPath = decodeURIComponent(pathname).replace(/^\/+/, "");
  const resolved = resolve(baseDir, cleanPath);
  return resolved.startsWith(baseDir) ? resolved : null;
}

function serveFile(response, filePath) {
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return false;
  }
  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  response.end(readFileSync(filePath));
  return true;
}

async function handleRequest(request, response) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  if (await handleApi(request, response, url)) {
    return;
  }

  if (url.pathname.startsWith("/outputs/")) {
    const filePath = safeStaticPath(outputsDir, url.pathname.replace(/^\/outputs\//, ""));
    if (serveFile(response, filePath)) return;
  }
  if (url.pathname.startsWith("/downloads/")) {
    const filePath = safeStaticPath(downloadsDir, url.pathname.replace(/^\/downloads\//, ""));
    if (serveFile(response, filePath)) return;
  }
  if (url.pathname.startsWith("/data/")) {
    const filePath = safeStaticPath(join(publicDir, "data"), url.pathname.replace(/^\/data\//, ""));
    if (serveFile(response, filePath)) return;
  }

  const staticFile = url.pathname === "/"
    ? join(distDir, "index.html")
    : safeStaticPath(distDir, url.pathname);
  if (serveFile(response, staticFile)) return;
  if (serveFile(response, join(distDir, "index.html"))) return;
  sendError(response, 404, "not found");
}

createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(error);
    sendError(response, 500, "internal server error");
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`GhostPipe frontend/backend listening at http://127.0.0.1:${port}`);
});
