import { createServer } from "node:http";
import { closeSync, createReadStream, existsSync, openSync, readFileSync, readSync, renameSync, statSync, unlinkSync, watch, writeFileSync } from "node:fs";
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
  const targetPath = resolve(root, relativePath);
  const tempPath = `${targetPath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    renameSync(tempPath, targetPath);
  } catch {
    if (existsSync(tempPath)) {
      try { unlinkSync(tempPath); } catch {}
    }
    writeFileSync(targetPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
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
  telegram_audio_track_index: "number",
  default_multi_audio_track_index: "number",
  telegram_force_tamil_audio: "boolean",
  telegram_preserve_source_audio: "boolean",
  telegram_generate_tamil_voiceover: "boolean",
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

  // Also sync telegram config file
  const telegramConfigPath = resolve(root, "config", "telegram_tamil_shorts.json");
  if (existsSync(telegramConfigPath)) {
    try {
      const tgConfig = JSON.parse(readFileSync(telegramConfigPath, "utf8"));
      for (const [key, value] of Object.entries(current)) {
        if (key.startsWith("telegram_") || key.includes("audio")) {
          tgConfig[key] = value;
        }
      }
      writeFileSync(telegramConfigPath, `${JSON.stringify(tgConfig, null, 2)}\n`, "utf8");
    } catch (err) {
      console.error("[SERVER] Could not sync telegram config:", err);
    }
  }
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
    "telegram_audio_track_index",
    "default_multi_audio_track_index",
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

function readLastLogLines(filePath, maxLines = 80) {
  if (!filePath || !existsSync(filePath)) return [];
  try {
    const stat = statSync(filePath);
    if (stat.size <= 0) return [];
    const chunkSize = Math.min(64 * 1024, stat.size);
    const buffer = Buffer.alloc(chunkSize);
    const fd = openSync(filePath, "r");
    try {
      readSync(fd, buffer, 0, chunkSize, stat.size - chunkSize);
    } finally {
      closeSync(fd);
    }
    const text = buffer.toString("utf8");
    const lines = text.split(/\r?\n/).filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

function readStatus() {
  const config = readConfig();
  const activeLogFile = existsSync("telegram_tamil_pipeline.log")
    ? "telegram_tamil_pipeline.log"
    : logPath;
  const logTail = readLastLogLines(activeLogFile, 80);

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

function readAudioTrackerState() {
  const activeLogFile = existsSync("telegram_tamil_pipeline.log")
    ? "telegram_tamil_pipeline.log"
    : logPath;
  const logTail = readLastLogLines(activeLogFile, 150);
  
  let status = 'idle';
  let video_id = null;
  let streamsMap = new Map();
  
  for (const line of logTail) {
    if (line.includes("Downloading Telegram video")) {
      status = 'downloading';
      const match = line.match(/video\s([^\s]+)/);
      if (match) video_id = match[1];
    } else if (line.includes("Extracting audio")) {
      status = 'extracting';
    } else if (line.includes("Starting full audio analysis")) {
      status = 'vad';
    } else if (line.includes("Quick check sample") || line.includes("Using cached audio analysis")) {
      status = 'whisper';
    } else if (line.includes("AUDIO CHANGER:")) {
      status = 'tts_changer';
    } else if (line.includes("Rendering")) {
      status = 'rendering';
    } else if (line.includes("Rendered ") && line.includes(" Shorts from")) {
      status = 'complete';
    }

    if (line.includes("ACCEPTED:")) {
        const match = line.match(/Stream\s(\d+)\sACCEPTED:\s(\w+)\s\(([\d.]+)%\sconfidence\)/);
        if (match) {
            const idx = parseInt(match[1], 10);
            streamsMap.set(idx, { 
              index: idx, 
              language: match[2], 
              confidence: parseFloat(match[3]) / 100, 
              selected: true 
            });
        }
    }
  }

  // Ensure there's a fallback stream for visual demo if none detected yet
  if (streamsMap.size === 0 && (status === 'vad' || status === 'whisper')) {
    streamsMap.set(0, { index: 0, language: 'unknown', confidence: 0, selected: false });
    streamsMap.set(1, { index: 1, language: 'unknown', confidence: 0, selected: false });
  }

  return {
    status,
    video_id,
    streams: Array.from(streamsMap.values()),
    stats: { totalProcessed: 142, ttsReplaced: 87 }, // Mock stats for demo
    log: logTail.length > 0 ? logTail[logTail.length - 1] : "",
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

  if (request.method === "GET" && url.pathname === "/api/session") {
    sendJson(response, { authenticated: true });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/quota/reset") {
    sendJson(response, resetQuota());
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/audio-tracker/stream") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    
    // Initial payload
    response.write(`data: ${JSON.stringify(readAudioTrackerState())}\n\n`);
    
    // Push updates
    const interval = setInterval(() => {
      response.write(`data: ${JSON.stringify(readAudioTrackerState())}\n\n`);
    }, 1500);
    
    request.on('close', () => {
      clearInterval(interval);
    });
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
  if (request.method === "POST" && url.pathname === "/api/quota/reset") {
    sendJson(response, resetQuota());
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/logs/stream") {
    streamLogs(request, response);
    return true;
  }

  if (request.method === "DELETE" && url.pathname === "/api/logs") {
    try {
      if (existsSync("telegram_tamil_pipeline.log")) writeFileSync("telegram_tamil_pipeline.log", "", "utf8");
      if (existsSync(logPath)) writeFileSync(logPath, "", "utf8");
      sendJson(response, { ok: true, message: "Logs cleared" });
    } catch (err) {
      sendError(response, 500, `Failed to clear logs: ${err.message}`);
    }
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
  const venvPython = join(root, "venv", "Scripts", "python.exe");
  const python = existsSync(venvPython) ? venvPython : process.env.PYTHON || "python";
  const config = readConfig();
  const scriptName = config.active_pipeline || "telegram_tamil_shorts_pipeline.py";
  let logFd = "ignore";
  try {
    logFd = openSync(logPath, "a");
  } catch (err) {
    console.error(`[GHOSTPIPE] Could not open log file for append: ${err.message}`);
  }

  managedPipeline = spawn(python, [join("pipeline", scriptName)], {
    cwd: root,
    detached: false,
    stdio: ["ignore", logFd, logFd],
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
  return resetQuota();
}

function resetQuota() {
  const config = readConfig();
  const resetState = {
    date: new Date().toISOString().slice(0, 10),
    uploads: 0,
    history: [],
    max_daily_uploads: Number(config.max_daily_uploads ?? 5),
  };
  writeJson("public/data/daily_quota_state.json", resetState);
  writeJson("public/data/approval_queue.json", []);
  writeJson("public/data/recreated_media.json", []);

  // Remove sqlite tracking databases so pipeline fetches fresh videos
  const dbs = [
    join(root, "pipeline", "telegram_tamil_history.sqlite3"),
    join(root, "pipeline", "upload_history.sqlite3"),
    join(root, "pipeline", "learning_memory.sqlite3"),
  ];
  for (const dbPath of dbs) {
    if (existsSync(dbPath)) {
      try {
        unlinkSync(dbPath);
      } catch (e) {
        console.warn("[SERVER] Could not unlink db:", dbPath, e);
      }
    }
  }

  return { status: "quota_reset", quota: resetState };
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
    const activeLogFile = existsSync("telegram_tamil_pipeline.log")
      ? "telegram_tamil_pipeline.log"
      : logPath;
    const logTail = readLastLogLines(activeLogFile, 100);
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
  const targetFile = existsSync("telegram_tamil_pipeline.log")
    ? "telegram_tamil_pipeline.log"
    : logPath;

  if (existsSync(targetFile)) {
    try {
      watcher = watch(targetFile, () => sendCurrentLogs());
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

function serveFile(request, response, filePath, cacheControl) {
  if (!filePath || !existsSync(filePath)) {
    return false;
  }
  let stats;
  try {
    stats = statSync(filePath);
  } catch {
    return false;
  }
  if (!stats.isFile()) {
    return false;
  }

  const fileSize = stats.size;
  const mime = mimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  const cc = cacheControl ?? getCacheControl(filePath);
  const range = request.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || start >= fileSize || (parts[1] && end >= fileSize) || start > end) {
      response.writeHead(416, {
        "Content-Range": `bytes */${fileSize}`,
        "Cache-Control": NO_STORE,
      });
      response.end();
      return true;
    }

    const chunksize = (end - start) + 1;
    const fileStream = createReadStream(filePath, { start, end });
    response.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": mime,
      "Cache-Control": cc,
    });
    fileStream.pipe(response);
    return true;
  }

  response.writeHead(200, {
    "Content-Length": fileSize,
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": cc,
  });
  createReadStream(filePath).pipe(response);
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
    if (serveFile(request, response, filePath, NO_STORE)) return;
  }
  if (url.pathname.startsWith("/downloads/")) {
    const filePath = safeStaticPath(downloadsDir, url.pathname.replace(/^\/downloads\//, ""));
    if (serveFile(request, response, filePath, NO_STORE)) return;
  }
  if (url.pathname.startsWith("/data/")) {
    const filePath = safeStaticPath(join(publicDir, "data"), url.pathname.replace(/^\/data\//, ""));
    if (serveFile(request, response, filePath, NO_STORE)) return;
  }
  if (url.pathname.startsWith("/public/")) {
    const filePath = safeStaticPath(publicDir, url.pathname.replace(/^\/public\//, ""));
    if (serveFile(request, response, filePath, NO_STORE)) return;
  }

  const staticFile = safeStaticPath(distDir, url.pathname);
  if (serveFile(request, response, staticFile)) return;

  const publicFile = safeStaticPath(publicDir, url.pathname);
  if (serveFile(request, response, publicFile)) return;

  const rootFile = safeStaticPath(root, url.pathname);
  if (serveFile(request, response, rootFile)) return;

  if (serveFile(request, response, join(distDir, "index.html"), NO_STORE)) return;
  sendError(response, 404, "not found");
}

// ─── Start ────────────────────────────────────────────────────────────────────
async function startServer() {
  const maxAttempts = 20;
  for (let offset = 0; offset < maxAttempts; offset++) {
    const port = requestedPort + offset;
    const server = createHttpServer();
    try {
      await listenOnPort(server, port);
      console.log(`[GHOSTPIPE] Server listening at http://${host}:${port}`);
      console.log(`[GHOSTPIPE] Dev mode: ${isDev}`);
      return;
    } catch (error) {
      if (error?.code === "EADDRINUSE") {
        console.warn(`[GHOSTPIPE] Port ${port} is busy, trying ${port + 1}...`);
        continue;
      }
      console.error(error);
      process.exit(1);
    }
  }
  console.error(`[GHOSTPIPE] Could not find an available port after ${maxAttempts} attempts.`);
  process.exit(1);
}

startServer();
