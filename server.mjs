import { createServer } from "node:http";
import { existsSync, readFileSync, statSync, unlinkSync, watch, writeFileSync } from "node:fs";
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
const approvalQueuePath = "public/data/approval_queue.json";
const requestedPort = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const sessions = new Map();
let managedPipeline = null;
const isDev = process.env.NODE_ENV !== "production";

// ─── Rate Limiting ──────────────────────────────────────────────────────────
const loginAttempts = new Map(); // ip -> { count, resetAt }
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

function clearRateLimit(ip) {
  loginAttempts.delete(ip);
}

// Clean up expired rate-limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(ip);
  }
}, 300_000);

// ─── Server ─────────────────────────────────────────────────────────────────
function createHttpServer() {
  return createServer((request, response) => {
    const start = Date.now();
    response.on("finish", () => {
      const duration = Date.now() - start;
      console.log(`${request.method} ${request.url} → ${response.statusCode} (${duration}ms)`);
    });
    handleRequest(request, response).catch((error) => {
      console.error("[SERVER ERROR]", error);
      sendError(response, 500, "internal server error");
    });
  });
}

function listenOnPort(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", (error) => {
      if (error?.code === "EADDRINUSE") {
        reject(error);
        return;
      }
      reject(error);
    });
    server.listen(port, host, () => resolve());
  });
}

// ─── MIME types ─────────────────────────────────────────────────────────────
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".m4a": "audio/mp4",
  ".vtt": "text/vtt; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
};

// Cache-Control: long-lived for hashed assets, no-store for HTML and API
const STATIC_CACHE = "public, max-age=31536000, immutable";
const NO_STORE = "no-store";

function getCacheControl(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".html") return NO_STORE;
  // Vite hashes JS/CSS filenames — safe to cache forever
  if (ext === ".js" || ext === ".css" || ext === ".woff2" || ext === ".woff") {
    return STATIC_CACHE;
  }
  return "public, max-age=3600";
}

// ─── Env & config helpers ────────────────────────────────────────────────────
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
        // Trim BOTH key and value to handle leading/trailing spaces
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

// ─── Auth helpers ────────────────────────────────────────────────────────────
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

function getClientIp(request) {
  return String(
    request.headers["x-forwarded-for"]?.split(",")[0] ||
    request.socket?.remoteAddress ||
    "unknown"
  );
}

// ─── JSON helpers ─────────────────────────────────────────────────────────────
function writeJson(relativePath, data) {
  writeFileSync(resolve(root, relativePath), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function sendJson(response, data, status = 200) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": NO_STORE,
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

async function parseJsonBody(request) {
  const raw = await readBody(request);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ─── Config ──────────────────────────────────────────────────────────────────
function readConfig() {
  return readJson("config/ghostpipe.json", {});
}

// Allowed config keys with type validation
const CONFIG_SCHEMA = {
  mode: "string",
  min_views: "number",
  max_video_age_hours: "number",
  content_language: "string",
  youtube_region_code: "string",
  growth_min_views: "number",
  subscriber_cta: "string",
  subscriber_value_promise: "string",
  growth_first_comment: "string",
  growth_audience_keywords: "array",
  growth_search_results_per_term: "number",
  growth_discovery_terms: "array",
  growth_discovery_groups: "array",
  max_daily_uploads: "number",
  upload_privacy: "string",
  upload_timezone: "string",
  upload_peak_times: "array",
  schedule_uploads_ahead: "boolean",
  schedule_upload_days_ahead: "number",
  upload_window_minutes: "number",
  upload_window_position: "string",
  delete_local_files_after_upload: "boolean",
  telegram_channels: "string",
  telegram_channel: "string",
  active_pipeline: "string",
  auto_approve_pending: "boolean",
  approval_auto_min_virality_score: "number",
  min_virality_threshold: "number",
  whisper_model: "string",
};

function validateConfigPatch(patch) {
  const errors = [];
  const validated = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!CONFIG_SCHEMA[key]) {
      errors.push(`Unknown config key: ${key}`);
      continue;
    }
    const expectedType = CONFIG_SCHEMA[key];
    if (expectedType === "number") {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        errors.push(`${key} must be a number`);
        continue;
      }
      validated[key] = parsed;
    } else if (expectedType === "boolean") {
      validated[key] = Boolean(value);
    } else if (expectedType === "array") {
      if (!Array.isArray(value)) {
        errors.push(`${key} must be an array`);
        continue;
      }
      validated[key] = value;
    } else {
      validated[key] = String(value ?? "");
    }
  }
  return { validated, errors };
}

function writeConfigPatch(patch) {
  const current = readConfig();
  const allowed = new Set(Object.keys(CONFIG_SCHEMA));
  for (const [key, value] of Object.entries(patch)) {
    if (allowed.has(key)) {
      current[key] = normalizeConfigValue(key, value);
    }
  }
  writeFileSync(configPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  return current;
}

function normalizeConfigValue(key, value) {
  if (key === "mode") {
    return String(value).replace("-", "_");
  }
  if ([
    "min_views",
    "max_video_age_hours",
    "growth_min_views",
    "growth_search_results_per_term",
    "max_daily_uploads",
    "schedule_upload_days_ahead",
    "upload_window_minutes",
    "approval_auto_min_virality_score",
    "min_virality_threshold",
  ].includes(key)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (key === "upload_peak_times" && Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  if (key === "telegram_channels") {
    if (Array.isArray(value)) return value.map(String).filter(Boolean).join(",");
    return String(value ?? "");
  }
  if (key === "telegram_channel") {
    return String(value ?? "");
  }
  return value;
}

// ─── Approvals ───────────────────────────────────────────────────────────────
function encodeApprovalId(item) {
  return Buffer.from(`${item.video_path}|${item.timestamp}`, "utf8").toString("base64url");
}

function withIds(items) {
  return items.map((item) => ({ ...item, id: item.id ?? encodeApprovalId(item) }));
}

function readApprovals() {
  const config = readConfig();
  const items = withIds(readJson(approvalQueuePath, []));
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
  writeJson(approvalQueuePath, items.map(({ id, ...item }) => item));
}

// ─── Overview data ────────────────────────────────────────────────────────────
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
    running: isPipelineRunning(),
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

function readAnalytics() {
  const report = readJson("public/data/weekly_tuning_report.json", {});
  const media = readJson("public/data/recreated_media.json", []);
  const config = readConfig();

  // Compute basic analytics from available data
  const uploadedMedia = media.filter(
    (item) => item && item.upload_result && (item.upload_result).url
  );
  const totalViews = uploadedMedia.reduce(
    (sum, item) => sum + Number((item.upload_result)?.views ?? 0),
    0
  );
  const avgVirality = uploadedMedia.length
    ? uploadedMedia.reduce(
        (sum, item) => sum + Number((item.prediction)?.predicted_virality ?? 0),
        0
      ) / uploadedMedia.length
    : 0;

  return {
    report,
    total_uploads: uploadedMedia.length,
    total_views_estimate: totalViews,
    avg_virality: Math.round(avgVirality * 10) / 10,
    youtube_analytics_enabled: Boolean(config.youtube_analytics_enabled),
    lookback_days: Number(config.youtube_analytics_lookback_days ?? 28),
    generated_at: new Date().toISOString(),
  };
}

// ─── CORS ────────────────────────────────────────────────────────────────────
function setCorsHeaders(request, response) {
  if (!isDev) return;
  const origin = request.headers.origin ?? "";
  const allowed = /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
  if (allowed) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
}

// ─── API handler ─────────────────────────────────────────────────────────────
async function handleApi(request, response, url) {
  setCorsHeaders(request, response);

  // Handle CORS preflight
  if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    response.writeHead(204);
    response.end();
    return true;
  }

  // ── Auth endpoints (unauthenticated) ──────────────────────────────────────
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const ip = getClientIp(request);
    if (isRateLimited(ip)) {
      sendError(response, 429, "too many login attempts — try again in a minute");
      return true;
    }
    const body = await parseJsonBody(request);
    const userIdentifier = body.username || body.email || "";
    if (!safeEqual(userIdentifier, dashboardUser) || !safeEqual(body.password || "", dashboardPassword)) {
      sendError(response, 401, "invalid credentials");
      return true;
    }
    clearRateLimit(ip);
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

  // ── Protected endpoints ───────────────────────────────────────────────────
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
    const body = await parseJsonBody(request);
    const { validated, errors } = validateConfigPatch(body);
    if (errors.length > 0) {
      sendError(response, 400, errors.join("; "));
      return true;
    }
    sendJson(response, writeConfigPatch(validated));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/analytics") {
    sendJson(response, readAnalytics());
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
  if (request.method === "POST" && url.pathname === "/api/pipeline/reset") {
    sendJson(response, resetPipelineQueue());
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/logs/stream") {
    streamLogs(request, response);
    return true;
  }

  const approvalMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)$/);
  if (request.method === "PATCH" && approvalMatch) {
    const body = await parseJsonBody(request);
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

// ─── Pipeline control ─────────────────────────────────────────────────────────
function startPipeline() {
  clearStaleLock();
  if (isPipelineRunning()) {
    return { status: "already_running", ...readStatus() };
  }
  if (managedPipeline && !managedPipeline.killed) {
    return { status: "already_managed", pid: managedPipeline.pid };
  }
  const python = process.env.PYTHON || "python";
  const config = readConfig();
  const scriptName = config.active_pipeline || "telegram_tamil_shorts_pipeline.py";
  managedPipeline = spawn(python, [join("pipeline", scriptName)], {
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
  const pid = managedPipeline?.pid || readPipelinePid();
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

function resetPipelineQueue() {
  writeApprovals([]);
  return { status: "queue_reset", approvals: [] };
}

function isPipelineRunning() {
  if (managedPipeline && !managedPipeline.killed) return true;
  if (!existsSync(lockPath)) return false;
  const pid = readPipelinePid();
  if (pid === null) return true;
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPipelinePid() {
  if (!existsSync(lockPath)) return 0;
  try {
    return Number(readFileSync(lockPath, "utf8"));
  } catch (error) {
    if (error?.code === "EBUSY") return null;
    return 0;
  }
}

function clearStaleLock() {
  if (!existsSync(lockPath) || isPipelineRunning()) return;
  try {
    unlinkSync(lockPath);
  } catch {
    // The next start attempt will report the remaining lock if it cannot be removed.
  }
}

// ─── Log streaming (fs.watch-based) ─────────────────────────────────────────
function streamLogs(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });

  let lastPayload = "";

  const sendCurrentLogs = () => {
    const logTail = existsSync(logPath)
      ? readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean).slice(-100)
      : [];
    const payload = JSON.stringify(logTail);
    if (payload !== lastPayload) {
      lastPayload = payload;
      response.write(`event: logs\ndata: ${payload}\n\n`);
    }
  };

  // Send initial snapshot
  sendCurrentLogs();

  // Watch log file for changes
  let watcher = null;
  if (existsSync(logPath)) {
    try {
      watcher = watch(logPath, () => sendCurrentLogs());
    } catch {
      // Fallback to polling if watch fails (e.g. network drives)
    }
  }

  // Fallback polling timer (also handles case where log file doesn't exist yet)
  const pollTimer = setInterval(sendCurrentLogs, 3000);

  request.on("close", () => {
    clearInterval(pollTimer);
    try { watcher?.close(); } catch { /* ignore */ }
  });
}

// ─── Static file serving ──────────────────────────────────────────────────────
function safeStaticPath(baseDir, pathname) {
  const cleanPath = decodeURIComponent(pathname).replace(/^\/+/, "");
  const resolved = resolve(baseDir, cleanPath);
  return resolved.startsWith(baseDir) ? resolved : null;
}

function serveFile(response, filePath, cacheControl) {
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return false;
  }
  const cc = cacheControl ?? getCacheControl(filePath);
  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": cc,
  });
  response.end(readFileSync(filePath));
  return true;
}

// ─── Main request handler ─────────────────────────────────────────────────────
async function handleRequest(request, response) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  if (await handleApi(request, response, url)) {
    return;
  }

  if (url.pathname.startsWith("/outputs/")) {
    const filePath = safeStaticPath(outputsDir, url.pathname.replace(/^\/outputs\//, ""));
    if (serveFile(response, filePath, NO_STORE)) return;
  }
  if (url.pathname.startsWith("/downloads/")) {
    const filePath = safeStaticPath(downloadsDir, url.pathname.replace(/^\/downloads\//, ""));
    if (serveFile(response, filePath, NO_STORE)) return;
  }
  if (url.pathname.startsWith("/data/")) {
    const filePath = safeStaticPath(join(publicDir, "data"), url.pathname.replace(/^\/data\//, ""));
    if (serveFile(response, filePath, NO_STORE)) return;
  }

  const staticFile = url.pathname === "/"
    ? join(distDir, "index.html")
    : safeStaticPath(distDir, url.pathname);
  if (serveFile(response, staticFile)) return;
  if (serveFile(response, join(distDir, "index.html"), NO_STORE)) return;
  sendError(response, 404, "not found");
}

// ─── Start ────────────────────────────────────────────────────────────────────
async function startServer() {
  const server = createHttpServer();
  try {
    await listenOnPort(server, requestedPort);
    console.log(`[GHOSTPIPE] Server listening at http://${host}:${requestedPort}`);
    console.log(`[GHOSTPIPE] Dashboard credentials loaded for: ${dashboardUser}`);
    console.log(`[GHOSTPIPE] Dev mode: ${isDev}`);
  } catch (error) {
    if (error?.code === "EADDRINUSE") {
      const fallbackPort = requestedPort + 1;
      console.warn(`[GHOSTPIPE] Port ${requestedPort} is busy, trying ${fallbackPort} instead.`);
      try {
        await listenOnPort(server, fallbackPort);
        console.log(`[GHOSTPIPE] Server listening at http://${host}:${fallbackPort}`);
      } catch (fallbackError) {
        console.error(fallbackError);
        process.exit(1);
      }
    } else {
      console.error(error);
      process.exit(1);
    }
  }
}

startServer();
