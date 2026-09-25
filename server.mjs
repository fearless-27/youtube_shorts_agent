import { createServer } from "node:http";
import { closeSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, unlinkSync, watch, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const root = fileURLToPath(new URL(".", import.meta.url));
const distDir = resolve(root, "dist");
const publicDir = resolve(root, "public");
const outputsDir = resolve(root, "outputs");
const downloadsDir = resolve(root, "downloads");
const uploadsDir = resolve(downloadsDir, "uploads");
const smartClipsDir = resolve(outputsDir, "smart_clips");
const editorJobsDir = resolve(publicDir, "data", "editor_jobs");
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
if (!existsSync(smartClipsDir)) mkdirSync(smartClipsDir, { recursive: true });
if (!existsSync(editorJobsDir)) mkdirSync(editorJobsDir, { recursive: true });
const landingDir = resolve(root, "landing page");
const configPath = resolve(root, "config", "ghostpipe.json");
const logsDir = resolve(root, "logs");
const logPath = resolve(logsDir, "ghostpipe.log");
const lockPath = resolve(root, "ghostpipe.lock");

function getActiveLogFile(userId = "default") {
  const candidates = [];
  if (userId && userId !== "default") {
    try {
      const userLog = getUserFilePath(userId, "pipeline.log");
      if (existsSync(userLog)) {
        const stat = statSync(userLog);
        if (stat.size > 200) {
          candidates.push({ file: userLog, mtime: stat.mtimeMs, size: stat.size });
        }
      }
    } catch {}
  }

  const systemCandidates = [
    resolve(logsDir, "telegram_tamil_pipeline.log"),
    resolve(logsDir, "ghostpipe.log"),
    resolve(root, "telegram_tamil_pipeline.log"),
    resolve(root, "ghostpipe.log"),
  ];

  for (const file of systemCandidates) {
    if (existsSync(file)) {
      try {
        const stat = statSync(file);
        if (stat.size > 0) {
          candidates.push({ file, mtime: stat.mtimeMs, size: stat.size });
        }
      } catch {}
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.mtime - a.mtime || b.size - a.size);
    return candidates[0].file;
  }
  return logPath;
}
const approvalQueuePath = "public/data/approval_queue.json";
const requestedPort = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const sessions = new Map();
let managedPipeline = null;
let telegramPipeline = null;
let telegramPipelineMode = "idle";
let telegramStartTime = null;
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
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
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
const jsonCache = new Map();

function readJson(relativePath, fallback) {
  try {
    const fullPath = resolve(root, relativePath);
    if (!existsSync(fullPath)) return fallback;
    const stat = statSync(fullPath);
    const cached = jsonCache.get(fullPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.data;
    }
    const data = JSON.parse(readFileSync(fullPath, "utf8"));
    jsonCache.set(fullPath, { mtimeMs: stat.mtimeMs, data });
    return data;
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

const dashboardUser = envValue("DASHBOARD_USERNAME", "operator@nemo.local");
const dashboardPassword = envValue("DASHBOARD_PASSWORD", "nemo");

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
  const cookies = parseCookies(request);
  const token = cookies.nemo_session || cookies.ghostpipe_session;
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

// ─── JSON & User Data helpers ────────────────────────────────────────────────
function writeJson(relativePath, data) {
  const targetPath = resolve(root, relativePath);
  jsonCache.delete(targetPath);
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

// User-scoped data isolation helpers
const ADMIN_EMAIL = "gobi56529@gmail.com";
const ADMIN_UID = "ZUXh4wwtSYNp7VZv9IYtdEWMI6q2";

function sanitizeUserId(id) {
  if (!id || typeof id !== "string") return "default";
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function getRequestUserId(request, url) {
  // 1. Header
  const headerId = request.headers["x-user-id"];
  if (headerId && typeof headerId === "string" && headerId.trim()) {
    return sanitizeUserId(headerId.trim());
  }
  // 2. URL query param
  if (url && url.searchParams) {
    const queryId = url.searchParams.get("userId") || url.searchParams.get("uid");
    if (queryId && queryId.trim()) {
      return sanitizeUserId(queryId.trim());
    }
  }
  // 3. Cookie
  const cookies = parseCookies(request);
  if (cookies.nemo_user_id) {
    return sanitizeUserId(cookies.nemo_user_id);
  }
  return "default";
}

function getRequestUserEmail(request, url) {
  const headerEmail = request.headers["x-user-email"];
  if (headerEmail && typeof headerEmail === "string" && headerEmail.trim()) {
    return headerEmail.trim().toLowerCase();
  }
  if (url && url.searchParams) {
    const queryEmail = url.searchParams.get("userEmail") || url.searchParams.get("email");
    if (queryEmail && queryEmail.trim()) {
      return queryEmail.trim().toLowerCase();
    }
  }
  const cookies = parseCookies(request);
  if (cookies.nemo_user_email) {
    return cookies.nemo_user_email.trim().toLowerCase();
  }
  return "";
}

function getUserDataDir(userId) {
  const safeId = sanitizeUserId(userId);
  const dir = resolve(root, "public", "data", "users", safeId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function initUserDataDir(userId) {
  const safeId = sanitizeUserId(userId);
  const userDir = getUserDataDir(safeId);

  const approvalsPath = resolve(userDir, "approval_queue.json");
  if (!existsSync(approvalsPath)) {
    writeFileSync(approvalsPath, "[]\n", "utf8");
  }

  const quotaPath = resolve(userDir, "daily_quota_state.json");
  if (!existsSync(quotaPath)) {
    const baseConfig = readJson("config/ghostpipe.json", {});
    const defaultQuota = {
      date: new Date().toISOString().slice(0, 10),
      uploads: 0,
      short: 0,
      video: 0,
      max_daily_uploads: Number(baseConfig.max_daily_uploads ?? 5),
      history: []
    };
    writeFileSync(quotaPath, `${JSON.stringify(defaultQuota, null, 2)}\n`, "utf8");
  }

  const mediaPath = resolve(userDir, "recreated_media.json");
  if (!existsSync(mediaPath)) {
    writeFileSync(mediaPath, "[]\n", "utf8");
  }

  const reportPath = resolve(userDir, "weekly_tuning_report.json");
  if (!existsSync(reportPath)) {
    writeFileSync(reportPath, "{}\n", "utf8");
  }

  const configFilePath = resolve(userDir, "config.json");
  if (!existsSync(configFilePath)) {
    const baseConfig = readJson("config/ghostpipe.json", {});
    writeFileSync(configFilePath, `${JSON.stringify(baseConfig, null, 2)}\n`, "utf8");
  }

  const logFilePath = resolve(userDir, "pipeline.log");
  if (!existsSync(logFilePath)) {
    const initLog = `${new Date().toISOString()} | INFO | NemoCore | Workspace initialized. Fresh dashboard ready for operator.\n`;
    writeFileSync(logFilePath, initLog, "utf8");
  }

  const profilePath = resolve(userDir, "profile.json");
  if (!existsSync(profilePath)) {
    const isAdmin = safeId === ADMIN_UID;
    const defaultProfile = {
      email: isAdmin ? ADMIN_EMAIL : "",
      role: isAdmin ? "admin" : "normal",
      automation_runs: 0,
      created_at: new Date().toISOString(),
    };
    writeFileSync(profilePath, `${JSON.stringify(defaultProfile, null, 2)}\n`, "utf8");
  }
}

function getUserFilePath(userId, fileName) {
  initUserDataDir(userId);
  const userDir = getUserDataDir(userId);
  return resolve(userDir, fileName);
}

function readUserJson(userId, fileName, fallback) {
  initUserDataDir(userId);
  const filePath = getUserFilePath(userId, fileName);
  try {
    if (!existsSync(filePath)) return fallback;
    const stat = statSync(filePath);
    const cached = jsonCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.data;
    }
    const data = JSON.parse(readFileSync(filePath, "utf8"));
    jsonCache.set(filePath, { mtimeMs: stat.mtimeMs, data });
    return data;
  } catch {
    return fallback;
  }
}

function getUserAccountInfo(userId = "default", incomingEmail = "") {
  initUserDataDir(userId);
  const profile = readUserJson(userId, "profile.json", {});
  const safeEmail = (incomingEmail || profile.email || "").toLowerCase().trim();
  const isAdmin = (safeEmail === ADMIN_EMAIL.toLowerCase()) || (userId === ADMIN_UID);
  const role = isAdmin ? "admin" : "normal";
  const automationRuns = Number(profile.automation_runs || 0);
  const maxRuns = isAdmin ? null : 1;
  const runsRemaining = isAdmin ? 999999 : Math.max(0, 1 - automationRuns);
  const canRun = isAdmin || automationRuns < 1;

  if (profile.email !== safeEmail || profile.role !== role || profile.automation_runs === undefined) {
    const updated = {
      ...profile,
      email: safeEmail || (isAdmin ? ADMIN_EMAIL : ""),
      role,
      automation_runs: automationRuns,
      updated_at: new Date().toISOString(),
    };
    writeUserJson(userId, "profile.json", updated);
  }

  return {
    userId,
    email: safeEmail || (isAdmin ? ADMIN_EMAIL : ""),
    role,
    isAdmin,
    automation_runs: automationRuns,
    max_runs: maxRuns,
    runs_remaining: runsRemaining,
    can_run: canRun,
  };
}

function recordAutomationRun(userId = "default", incomingEmail = "") {
  const account = getUserAccountInfo(userId, incomingEmail);
  if (account.isAdmin) {
    return account;
  }
  const profile = readUserJson(userId, "profile.json", {});
  const runs = Number(profile.automation_runs || 0) + 1;
  const updated = {
    ...profile,
    automation_runs: runs,
    last_run_at: new Date().toISOString(),
  };
  writeUserJson(userId, "profile.json", updated);
  return getUserAccountInfo(userId, incomingEmail);
}

function writeUserJson(userId, fileName, data) {
  initUserDataDir(userId);
  const targetPath = getUserFilePath(userId, fileName);
  jsonCache.delete(targetPath);
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
function readConfig(userId = "default") {
  initUserDataDir(userId);
  const current = readUserJson(userId, "config.json", {});
  const telegramConfig = readJson("config/telegram_tamil_shorts.json", {});
  return {
    ...current,
    telegram_max_daily_uploads: telegramConfig.telegram_max_daily_uploads ?? 10,
    telegram_max_uploads_per_run: telegramConfig.telegram_max_uploads_per_run ?? 10,
  };
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
  viral_max_daily_uploads: "number",
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
  telegram_max_daily_uploads: "number",
  telegram_max_uploads_per_run: "number",
  required_audio_language: "string",
  telegram_required_audio_language: "string",
  skip_on_audio_mismatch: "boolean",
  audio_replacement_mode: "string",
  telegram_channel_name: "string",
  telegram_channel_handle: "string",
  telegram_header_text: "string",
  telegram_footer_text: "string",
  telegram_brand_color: "string",
  telegram_video_layout: "string",
  telegram_channel_logo_path: "string",
  telegram_render_template: "string",
  telegram_template: "string",
  scan_interval_minutes: "number",
  categories: "array",
  download_dir: "string",
  max_video_duration: "number",
  subscriber_growth_goal_enabled: "boolean",
  subscriber_growth_target: "number",
  subscriber_growth_days: "number",
  subscriber_growth_current: "number",
  subscriber_growth_strategy: "string",
  growth_first_comment_enabled: "boolean",
  custom_thumbnails_enabled: "boolean",
  auto_learning_enabled: "boolean",
  learning_exploration_rate: "number",
  learning_refresh_minutes: "number",
  learning_model_min_samples: "number",
  youtube_analytics_enabled: "boolean",
  youtube_analytics_lookback_days: "number",
  whisper_device: "string",
  copyright_safety_level: "string",
  require_safe_to_upload: "boolean",
  video_use_grade_preset: "string",
  video_use_audio_fade_ms: "number",
  video_use_hdr_tonemap: "boolean",
  video_use_burn_subtitles: "boolean",
  video_use_subtitle_style: "string",
  transcription_engine: "string",
  trend_search_terms: "array",
  youtube_api_max_results: "number",
  growth_min_engagement_rate: "number",
  upload_public_stats_viewable: "boolean",
  custom_thumbnail_frame_ratio: "number",
  custom_thumbnail_label: "string",
  custom_thumbnail_accent: "string",
  yt_dlp_cookie_file: "string",
  yt_dlp_cookies_from_browser: "string",
};

function validateConfigPatch(patch) {
  const errors = [];
  const validated = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;

    const expectedType = CONFIG_SCHEMA[key];
    if (!expectedType) {
      // Safe fallback: allow valid primitives and arrays without throwing 400 error
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || Array.isArray(value)) {
        validated[key] = value;
      }
      continue;
    }

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

function writeConfigPatch(userId = "default", patch) {
  const current = readConfig(userId);
  for (const [key, value] of Object.entries(patch)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    current[key] = normalizeConfigValue(key, value);
  }
  writeUserJson(userId, "config.json", current);

  // Also sync root config so backend pipelines always see active settings
  try {
    writeFileSync(configPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
    const telegramConfigPath = resolve(root, "config", "telegram_tamil_shorts.json");
    if (existsSync(telegramConfigPath)) {
      try {
        const tgConfig = JSON.parse(readFileSync(telegramConfigPath, "utf8"));
        const syncKeys = new Set([
          "upload_peak_times",
          "upload_timezone",
          "schedule_uploads_ahead",
          "schedule_upload_days_ahead",
          "upload_privacy",
          "upload_public_stats_viewable",
          "max_daily_uploads",
          "viral_max_daily_uploads",
          "upload_window_minutes",
          "upload_window_position",
        ]);
        for (const [key, value] of Object.entries(current)) {
          if (key.startsWith("telegram_") || key.includes("audio") || syncKeys.has(key)) {
            tgConfig[key] = value;
          }
        }
        writeFileSync(telegramConfigPath, `${JSON.stringify(tgConfig, null, 2)}\n`, "utf8");
      } catch (err) {
        console.error("[SERVER] Could not sync telegram config:", err);
      }
    }
  } catch {}
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
    "telegram_max_daily_uploads",
    "telegram_max_uploads_per_run",
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

function readApprovals(userId = "default") {
  const config = readConfig(userId);
  const userItems = withIds(readUserJson(userId, "approval_queue.json", []));
  const rootItems = withIds(readJson(approvalQueuePath, []));

  const mergedMap = new Map();
  for (const item of rootItems) {
    const key = item.id || item.video_path;
    if (key) mergedMap.set(key, item);
  }
  for (const item of userItems) {
    const key = item.id || item.video_path;
    if (key) mergedMap.set(key, item);
  }
  const items = Array.from(mergedMap.values());

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
    if (changed) writeApprovals(userId, items);
  }
  return items;
}

function writeApprovals(userId = "default", items) {
  writeUserJson(userId, "approval_queue.json", items.map(({ id, ...item }) => item));
  writeJson(approvalQueuePath, items.map(({ id, ...item }) => item));
}

function handleApprovalAction(userId = "default", id, approved) {
  const venvPython = join(root, "venv", "Scripts", "python.exe");
  const python = existsSync(venvPython) ? venvPython : process.env.PYTHON || "python";
  const scriptPath = join(root, "scripts", "upload_approved_short.py");
  const args = [scriptPath, id];
  if (!approved) {
    args.push("--reject");
  }
  if (userId && userId !== "default") {
    args.push("--user", userId);
  }
  try {
    const res = spawnSync(python, args, {
      cwd: root,
      encoding: "utf8",
      timeout: 180000,
      windowsHide: true,
    });
    const stdout = (res.stdout || "").trim();
    if (stdout) {
      try {
        const lastLine = stdout.split(/\r?\n/).filter(Boolean).pop();
        return JSON.parse(lastLine);
      } catch {
        return { ok: res.status === 0, message: stdout, stderr: res.stderr };
      }
    }
    return { ok: false, error: res.stderr || "No output from upload script" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function clearContentData(userId = "default", options = {}) {
  const { scope = "all", ids = [], deleteFiles = false } = options;
  const approvals = readApprovals(userId);
  const media = readUserJson(userId, "recreated_media.json", []);

  const matchesScope = (item) => {
    if (!item) return false;
    const itemId = String(item.id || item.video_path || item.public_url || "");
    const videoPath = String(item.video_path || "").replaceAll("\\", "/");
    const fullVideoPath = String(item.full_video_path || "").replaceAll("\\", "/");

    if (scope === "selected") {
      return ids.some((targetId) => {
        const normTarget = String(targetId).replaceAll("\\", "/");
        return (
          itemId === normTarget ||
          videoPath === normTarget ||
          fullVideoPath === normTarget ||
          videoPath.endsWith(normTarget) ||
          itemId.includes(normTarget)
        );
      });
    }
    if (scope === "all") {
      return true;
    }
    if (scope === "rejected") {
      return item.approved === false || item.upload_status === "rejected" || item.status === "REJECTED";
    }
    if (scope === "pending") {
      return item.approved == null || item.upload_status === "pending_approval" || item.status === "PENDING_REVIEW";
    }
    if (scope === "uploaded") {
      return item.upload_status === "uploaded" || Boolean(item.upload_result?.url);
    }
    return false;
  };

  const toRemoveApprovals = approvals.filter(matchesScope);
  const toRemoveMedia = media.filter(matchesScope);
  const remainingApprovals = approvals.filter((item) => !matchesScope(item));
  const remainingMedia = media.filter((item) => !matchesScope(item));

  if (deleteFiles) {
    const filesToDelete = new Set();
    [...toRemoveApprovals, ...toRemoveMedia].forEach((item) => {
      const candidates = [
        item.video_path,
        item.full_video_path,
        item.thumbnail_path,
        item.preview_path,
      ].filter(Boolean);
      for (const p of candidates) {
        try {
          const abs = resolve(root, String(p));
          if (abs.startsWith(outputsDir) || abs.startsWith(downloadsDir)) {
            filesToDelete.add(abs);
          }
        } catch {}
      }
    });

    for (const f of filesToDelete) {
      try {
        if (existsSync(f)) {
          unlinkSync(f);
        }
      } catch (err) {
        console.warn(`[NEMO] Could not delete file ${f}: ${err.message}`);
      }
    }
  }

  writeApprovals(userId, remainingApprovals);
  writeUserJson(userId, "recreated_media.json", remainingMedia);
  if (userId === "default") {
    writeJson("public/data/recreated_media.json", remainingMedia);
  }

  const removedCount = toRemoveApprovals.length + toRemoveMedia.length;
  const remainingCount = remainingApprovals.length + remainingMedia.length;

  return {
    ok: true,
    scope,
    removedCount,
    remainingCount,
    approvalsRemaining: remainingApprovals.length,
    mediaRemaining: remainingMedia.length,
  };
}

// ─── Storage Analytics & Automated Janitor Cleanup ──────────────────────────
function getDirectoryStats(dirPath, extFilter = null) {
  let totalBytes = 0;
  let fileCount = 0;
  if (!existsSync(dirPath)) return { totalBytes, fileCount };
  try {
    const entries = readdirSync(dirPath, { recursive: true });
    for (const rel of entries) {
      try {
        const full = join(dirPath, rel);
        const st = statSync(full);
        if (st.isFile()) {
          if (!extFilter || extFilter.test(rel)) {
            totalBytes += st.size;
            fileCount++;
          }
        }
      } catch {}
    }
  } catch {}
  return { totalBytes, fileCount };
}

function calculateStorageStats(userId = "default") {
  const outputs = getDirectoryStats(outputsDir);
  const downloads = getDirectoryStats(downloadsDir);
  const editorJobs = getDirectoryStats(editorJobsDir);

  const dbFiles = [
    resolve(root, "copyright_shield.db"),
    getUserFilePath(userId, "approval_queue.json"),
    getUserFilePath(userId, "recreated_media.json"),
    getUserFilePath(userId, "config.json"),
  ];

  let databaseBytes = 0;
  for (const f of dbFiles) {
    try {
      if (existsSync(f)) {
        databaseBytes += statSync(f).size;
      }
    } catch {}
  }

  // Count temporary files (.wav, .srt, .tmp, .part, *TEMP_MPY*)
  const tempFilter = /\.(wav|srt|tmp|part)$|TEMP_MPY/i;
  const tempInOutputs = getDirectoryStats(outputsDir, tempFilter);
  const tempInDownloads = getDirectoryStats(downloadsDir, tempFilter);
  const tempFilesCount = tempInOutputs.fileCount + tempInDownloads.fileCount;
  const tempFilesBytes = tempInOutputs.totalBytes + tempInDownloads.totalBytes;

  // Check uploaded videos that still have local files & rejected videos
  const approvals = readApprovals(userId);
  const media = readUserJson(userId, "recreated_media.json", []);
  let uploadedLocalBytes = 0;
  let uploadedLocalCount = 0;
  let rejectedBytes = 0;
  let rejectedCount = 0;

  [...approvals, ...media].forEach((item) => {
    if (!item) return;
    const paths = [item.video_path, item.full_video_path, item.thumbnail_path].filter(Boolean);
    let itemBytes = 0;
    for (const p of paths) {
      try {
        const abs = resolve(root, String(p));
        if (existsSync(abs)) {
          itemBytes += statSync(abs).size;
        }
      } catch {}
    }
    if (item.upload_status === "uploaded" || item.status === "UPLOADED" || item.upload_result?.url) {
      if (itemBytes > 0) {
        uploadedLocalBytes += itemBytes;
        uploadedLocalCount++;
      }
    } else if (item.approved === false || item.upload_status === "rejected" || item.status === "REJECTED") {
      if (itemBytes > 0) {
        rejectedBytes += itemBytes;
        rejectedCount++;
      }
    }
  });

  const totalDiskUsed = outputs.totalBytes + downloads.totalBytes + editorJobs.totalBytes + databaseBytes;

  return {
    ok: true,
    outputs: {
      bytes: outputs.totalBytes,
      mb: Math.round((outputs.totalBytes / (1024 * 1024)) * 10) / 10,
      count: outputs.fileCount,
    },
    downloads: {
      bytes: downloads.totalBytes,
      mb: Math.round((downloads.totalBytes / (1024 * 1024)) * 10) / 10,
      count: downloads.fileCount,
    },
    editorJobs: {
      bytes: editorJobs.totalBytes,
      mb: Math.round((editorJobs.totalBytes / (1024 * 1024)) * 10) / 10,
      count: editorJobs.fileCount,
    },
    database: {
      bytes: databaseBytes,
      mb: Math.round((databaseBytes / (1024 * 1024)) * 100) / 100,
    },
    tempArtifacts: {
      bytes: tempFilesBytes,
      mb: Math.round((tempFilesBytes / (1024 * 1024)) * 10) / 10,
      count: tempFilesCount,
    },
    uploadedLocal: {
      bytes: uploadedLocalBytes,
      mb: Math.round((uploadedLocalBytes / (1024 * 1024)) * 10) / 10,
      count: uploadedLocalCount,
    },
    rejected: {
      bytes: rejectedBytes,
      mb: Math.round((rejectedBytes / (1024 * 1024)) * 10) / 10,
      count: rejectedCount,
    },
    totalUsed: {
      bytes: totalDiskUsed,
      mb: Math.round((totalDiskUsed / (1024 * 1024)) * 10) / 10,
      gb: Math.round((totalDiskUsed / (1024 * 1024 * 1024)) * 100) / 100,
    },
  };
}

function cleanSystemStorage(userId = "default", options = {}) {
  const {
    cleanTemp = true,
    cleanUploadedLocal = true,
    cleanRejected = true,
    cleanDownloads = false,
    cleanOrphans = true,
    vacuumDb = true,
  } = options;

  let freedBytes = 0;
  let deletedFiles = 0;
  const deletedPaths = [];

  const deleteSafe = (absPath) => {
    try {
      if (!absPath) return false;
      const resolved = resolve(root, String(absPath));
      if (!resolved.startsWith(outputsDir) && !resolved.startsWith(downloadsDir) && !resolved.startsWith(editorJobsDir)) {
        return false;
      }
      if (existsSync(resolved) && statSync(resolved).isFile()) {
        const size = statSync(resolved).size;
        unlinkSync(resolved);
        freedBytes += size;
        deletedFiles++;
        deletedPaths.push(resolved);
        return true;
      }
    } catch (err) {
      console.warn(`[STORAGE CLEANUP] Could not delete ${absPath}: ${err.message}`);
    }
    return false;
  };

  // 1. Clean Stray Temporary Files (*.wav, *.srt, *.tmp, *.part, *TEMP_MPY*)
  if (cleanTemp) {
    const tempPattern = /\.(wav|srt|tmp|part)$|TEMP_MPY/i;
    [outputsDir, downloadsDir, uploadsDir, smartClipsDir].forEach((dir) => {
      if (!existsSync(dir)) return;
      try {
        const files = readdirSync(dir, { recursive: true });
        for (const f of files) {
          if (tempPattern.test(f)) {
            deleteSafe(join(dir, f));
          }
        }
      } catch {}
    });
  }

  // 2. Clean Local Files of Uploaded Videos
  const approvals = readApprovals(userId);
  const media = readUserJson(userId, "recreated_media.json", []);

  if (cleanUploadedLocal) {
    [...approvals, ...media].forEach((item) => {
      if (!item) return;
      const isUploaded = item.upload_status === "uploaded" || item.status === "UPLOADED" || item.upload_result?.url;
      if (isUploaded) {
        [item.video_path, item.full_video_path].forEach(deleteSafe);
        item.fileStatus = "DELETED";
      }
    });
  }

  // 3. Clean Rejected Videos
  if (cleanRejected) {
    const toRemoveAppr = approvals.filter((item) => item.approved === false || item.upload_status === "rejected" || item.status === "REJECTED");
    const toRemoveMed = media.filter((item) => item.approved === false || item.upload_status === "rejected" || item.status === "REJECTED");
    [...toRemoveAppr, ...toRemoveMed].forEach((item) => {
      [item.video_path, item.full_video_path, item.thumbnail_path, item.preview_path].forEach(deleteSafe);
    });

    const remainingAppr = approvals.filter((item) => !(item.approved === false || item.upload_status === "rejected" || item.status === "REJECTED"));
    const remainingMed = media.filter((item) => !(item.approved === false || item.upload_status === "rejected" || item.status === "REJECTED"));
    writeApprovals(userId, remainingAppr);
    writeUserJson(userId, "recreated_media.json", remainingMed);
    if (userId === "default") {
      writeJson("public/data/recreated_media.json", remainingMed);
    }
  } else {
    writeApprovals(userId, approvals);
    writeUserJson(userId, "recreated_media.json", media);
  }

  // 4. Clean Raw Downloads (older than 12h or source downloads)
  if (cleanDownloads && existsSync(downloadsDir)) {
    try {
      const files = readdirSync(downloadsDir, { recursive: true });
      const now = Date.now();
      for (const f of files) {
        const full = join(downloadsDir, f);
        try {
          const st = statSync(full);
          if (st.isFile()) {
            if (now - st.mtimeMs > 12 * 3600 * 1000) {
              deleteSafe(full);
            }
          }
        } catch {}
      }
    } catch {}
  }

  // 5. Clean Orphaned Video Files in outputs (files not referenced in approvals or media)
  if (cleanOrphans && existsSync(outputsDir)) {
    const activePaths = new Set();
    [...readApprovals(userId), ...readUserJson(userId, "recreated_media.json", [])].forEach((item) => {
      [item.video_path, item.full_video_path, item.thumbnail_path, item.preview_path].filter(Boolean).forEach((p) => {
        try {
          activePaths.add(resolve(root, String(p)).toLowerCase());
        } catch {}
      });
    });

    try {
      const outputFiles = readdirSync(outputsDir, { recursive: true });
      for (const f of outputFiles) {
        const full = join(outputsDir, f);
        try {
          const st = statSync(full);
          if (st.isFile() && /\.(mp4|mov|mkv|webm)$/i.test(f)) {
            const normalized = full.toLowerCase();
            if (!activePaths.has(normalized) && !f.includes("template") && !f.includes("preview_")) {
              deleteSafe(full);
            }
          }
        } catch {}
      }
    } catch {}
  }

  // 6. SQLite VACUUM
  let vacuumSuccess = false;
  if (vacuumDb) {
    const dbPath = resolve(root, "copyright_shield.db");
    if (existsSync(dbPath)) {
      try {
        spawnSync("python", ["-c", `import sqlite3; conn = sqlite3.connect(r'${dbPath}'); conn.execute('VACUUM'); conn.close()`], { timeout: 5000 });
        vacuumSuccess = true;
      } catch {}
    }
  }

  return {
    ok: true,
    freedBytes,
    freedMB: Math.round((freedBytes / (1024 * 1024)) * 10) / 10,
    deletedFilesCount: deletedFiles,
    vacuumSuccess,
    timestamp: new Date().toISOString(),
  };
}

// ─── Telegram Template Rendering System ─────────────────────────────────────
const TELEGRAM_TEMPLATES_LIST = [
  {
    id: "anime_multi_tier",
    name: "Pro Anime Multi-Tier",
    badge: "Viral Anime",
    description: "Top anime sky banner, center black branding bar with glowing avatar, and bottom anime character art.",
    best_for: "Shinchan, Doraemon, Naruto & anime series",
    preview_image: "/images/templates/preview_anime_multi_tier.png",
  },
  {
    id: "cinematic_ambient",
    name: "Cinematic Ambient Glow",
    badge: "Premium Glow",
    description: "Full-bleed ambient blurred video backdrop, floating center clip with glassmorphic channel pill and neon glow.",
    best_for: "Cinematic scenes, fight sequences & dramatic moments",
    preview_image: "/images/templates/preview_cinematic_ambient.png",
  },
  {
    id: "split_screen",
    name: "Split-Screen Action",
    badge: "High Retention",
    description: "Top episode video clip with a vibrant neon ticker divider bar and bottom manga/visual art panel.",
    best_for: "Fast-paced comedy, gaming & high-retention Shorts",
    preview_image: "/images/templates/preview_split_screen.png",
  },
  {
    id: "sleek_dark",
    name: "Sleek Dark Creator",
    badge: "Minimalist Studio",
    description: "Ultra-clean dark matte aesthetic with large glowing avatar ring, verified badge, and bold pulse CTA button.",
    best_for: "Dubbed movies, informative clips & creator series",
    preview_image: "/images/templates/preview_sleek_dark.png",
  },
];

let activeRenderJob = {
  running: false,
  template: null,
  template_meta: null,
  percent: 0,
  currentPart: 0,
  totalParts: 0,
  status: "idle",
  logs: [],
  completedClips: [],
  startedAt: null,
  error: null,
};

function startTelegramRender(userId = "default", templateId = "anime_multi_tier", clipPart = null) {
  if (activeRenderJob.running) {
    return { ok: false, error: "A rendering job is already in progress", job: activeRenderJob };
  }

  const venvPython = join(root, "venv", "Scripts", "python.exe");
  const python = existsSync(venvPython) ? venvPython : process.env.PYTHON || "python";
  const scriptPath = join(root, "scripts", "render_telegram_shorts_with_anime_template.py");

  const validTemplates = new Set(TELEGRAM_TEMPLATES_LIST.map((t) => t.id));
  const tid = validTemplates.has(templateId) ? templateId : "anime_multi_tier";

  const args = [scriptPath, "--template", tid];
  if (userId && userId !== "default") {
    args.push("--user-id", userId);
  }
  if (clipPart) {
    args.push("--clip", String(clipPart));
  }

  activeRenderJob = {
    running: true,
    template: tid,
    template_meta: TELEGRAM_TEMPLATES_LIST.find((t) => t.id === tid) || null,
    percent: 0,
    currentPart: 0,
    totalParts: clipPart ? 1 : 10,
    status: `Starting render with ${tid}...`,
    logs: [],
    completedClips: [],
    startedAt: new Date().toISOString(),
    error: null,
  };

  try {
    const child = spawn(python, args, {
      cwd: root,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      const lines = text.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        activeRenderJob.logs.push(line);
        if (activeRenderJob.logs.length > 100) activeRenderJob.logs.shift();

        try {
          const parsed = JSON.parse(line);
          if (parsed.type === "progress") {
            activeRenderJob.percent = parsed.percent ?? activeRenderJob.percent;
            activeRenderJob.currentPart = parsed.part ?? activeRenderJob.currentPart;
            activeRenderJob.totalParts = parsed.total ?? activeRenderJob.totalParts;
            activeRenderJob.status = parsed.status || activeRenderJob.status;
          } else if (parsed.type === "part_done") {
            activeRenderJob.percent = parsed.percent ?? activeRenderJob.percent;
            activeRenderJob.status = parsed.status || activeRenderJob.status;
            if (parsed.public_url) {
              activeRenderJob.completedClips.push(parsed);
            }
          } else if (parsed.type === "complete") {
            activeRenderJob.percent = 100;
            activeRenderJob.status = parsed.message || "Completed";
          } else if (parsed.type === "error") {
            activeRenderJob.status = `Error: ${parsed.message}`;
          }
        } catch {}
      }
    });

    child.stderr.on("data", (chunk) => {
      const err = chunk.toString("utf8");
      activeRenderJob.logs.push(`[ERR] ${err}`);
      if (activeRenderJob.logs.length > 100) activeRenderJob.logs.shift();
    });

    child.on("close", (code) => {
      activeRenderJob.running = false;
      if (code === 0) {
        activeRenderJob.percent = 100;
        activeRenderJob.status = "Render completed successfully!";
      } else {
        activeRenderJob.error = `Process exited with code ${code}`;
        activeRenderJob.status = "Render failed";
      }
    });

    child.on("error", (err) => {
      activeRenderJob.running = false;
      activeRenderJob.error = err.message;
      activeRenderJob.status = `Execution error: ${err.message}`;
    });

    return { ok: true, message: `Started render with template ${tid}`, job: activeRenderJob };
  } catch (err) {
    activeRenderJob.running = false;
    activeRenderJob.error = err.message;
    return { ok: false, error: err.message };
  }
}

function getTodayDateKey(timeZone = "Asia/Kolkata") {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// ─── Overview data ────────────────────────────────────────────────────────────
function readQuota(userId = "default") {
  initUserDataDir(userId);
  const config = readConfig(userId);
  const today = getTodayDateKey(config.upload_timezone || "Asia/Kolkata");
  let quota = readUserJson(userId, "daily_quota_state.json", {});

  // Daily auto-reset: if the stored date doesn't match today, automatically reset upload counters
  if (!quota.date || quota.date !== today) {
    quota = {
      ...quota,
      date: today,
      uploads: 0,
      short: 0,
      video: 0,
      max_daily_uploads: Number(quota.max_daily_uploads ?? config.max_daily_uploads ?? 10),
      last_daily_reset: new Date().toISOString(),
      history: quota.history || [],
    };
    writeUserJson(userId, "daily_quota_state.json", quota);
    if (userId === "default") {
      writeJson("public/data/daily_quota_state.json", quota);
    }
  }

  return {
    ...quota,
    short: quota.short ?? 0,
    video: quota.video ?? 0,
    max_daily_uploads: quota.max_daily_uploads ?? config.max_daily_uploads ?? 10,
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

let lastStatusSnapshotKey = "";
let lastStatusGeneratedAt = new Date().toISOString();

function readStatus(userId = "default") {
  initUserDataDir(userId);
  const config = readConfig(userId);
  const activeLogPath = getActiveLogFile(userId);
  const logTail = readLastLogLines(activeLogPath, 100);
  const running = Boolean(
    isPipelineRunning() ||
    (telegramPipeline && !telegramPipeline.killed) ||
    (managedPipeline && !managedPipeline.killed)
  );
  const lastLine = logTail.at(-1) ?? null;
  const managedPid = telegramPipeline?.pid ?? managedPipeline?.pid ?? readPipelinePid() ?? null;
  const mode = config.mode ?? "live";

  const key = `${userId}|${mode}|${running}|${managedPid}|${lastLine}`;
  if (key !== lastStatusSnapshotKey) {
    lastStatusSnapshotKey = key;
    lastStatusGeneratedAt = new Date().toISOString();
  }

  return {
    mode,
    running,
    lock_file: "ghostpipe.lock",
    log_tail: logTail,
    last_log_line: lastLine,
    generated_at: lastStatusGeneratedAt,
    managed_pid: managedPid,
  };
}

function readAudioTrackerState() {
  const activeLogFile = getActiveLogFile();
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

// ─── YouTube OAuth & Channel Integration ─────────────────────────────────────
function getGoogleClientSecrets() {
  const secretPath = resolve(root, "client_secrets.json");
  if (existsSync(secretPath)) {
    try {
      const data = JSON.parse(readFileSync(secretPath, "utf8"));
      const config = data.installed || data.web || {};
      if (config.client_id && config.client_secret) {
        return {
          clientId: config.client_id,
          clientSecret: config.client_secret,
          redirectUris: config.redirect_uris || [],
        };
      }
    } catch {}
  }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUris: [],
    };
  }
  return null;
}

function getYouTubeCallbackUrl(request) {
  const host = request.headers["x-forwarded-host"] || request.headers.host || `localhost:${requestedPort}`;
  const proto = request.headers["x-forwarded-proto"] || "http";
  return `${proto}://${host}/api/youtube/callback`;
}

function getYouTubeConnectedChannel(userId) {
  const userDir = getUserDataDir(userId);
  const channelData = readUserJson(userId, "youtube_channel.json", null);
  const credsPath = resolve(userDir, "youtube_credentials.json");
  const hasCreds = existsSync(credsPath);

  if (channelData) {
    return { connected: true, channel: channelData, credentials_exist: hasCreds };
  }
  // Check if root credentials exist and user is admin
  if (userId === ADMIN_UID && existsSync(resolve(root, "youtube_credentials.json"))) {
    return {
      connected: true,
      channel: {
        id: "primary",
        title: "NEMO YouTube Channel",
        handle: "@TamilShortsDaily",
        avatar: "",
        subscriberCount: 0,
        videoCount: 0,
        isRootFallback: true,
      },
      credentials_exist: true,
    };
  }
  return { connected: false, channel: null, credentials_exist: false };
}

function generateYouTubeAuthUrl(userId, redirectUri) {
  const secrets = getGoogleClientSecrets();
  if (!secrets) {
    throw new Error("client_secrets.json missing or incomplete on server");
  }
  const statePayload = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString("base64url");
  const scopes = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: secrets.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
    state: statePayload,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function handleYouTubeCallback(request, response, url) {
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  let redirectHost = "http://localhost:5173";
  const host = request.headers.host || "";
  if (host.includes("5173")) {
    redirectHost = `http://${host}`;
  } else if (host.includes("4173")) {
    redirectHost = isDev ? "http://localhost:5173" : `http://${host}`;
  }

  if (error || !code) {
    response.writeHead(302, { Location: `${redirectHost}/dashboard/settings?youtube_error=${encodeURIComponent(error || "no_code")}` });
    response.end();
    return true;
  }

  let state = {};
  try {
    state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
  } catch {}

  const userId = sanitizeUserId(state.userId || "default");
  const secrets = getGoogleClientSecrets();
  if (!secrets) {
    response.writeHead(302, { Location: `${redirectHost}/dashboard/settings?youtube_error=secrets_missing` });
    response.end();
    return true;
  }

  const callbackUrl = getYouTubeCallbackUrl(request);

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: secrets.clientId,
        client_secret: secrets.clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }).toString(),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("[YOUTUBE OAUTH] Token exchange failed:", tokenData);
      response.writeHead(302, { Location: `${redirectHost}/dashboard/settings?youtube_error=token_exchange_failed` });
      response.end();
      return true;
    }

    let channelInfo = {
      id: "unknown",
      title: "My YouTube Channel",
      handle: "",
      avatar: "",
      subscriberCount: 0,
      videoCount: 0,
      connectedAt: new Date().toISOString(),
    };

    try {
      const channelRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (channelRes.ok) {
        const chData = await channelRes.json();
        const item = chData.items?.[0];
        if (item) {
          channelInfo = {
            id: item.id,
            title: item.snippet?.title || "My YouTube Channel",
            handle: item.snippet?.customUrl || `@${(item.snippet?.title || "creator").replace(/\s+/g, "").toLowerCase()}`,
            avatar: item.snippet?.thumbnails?.default?.url || item.snippet?.thumbnails?.high?.url || "",
            subscriberCount: Number(item.statistics?.subscriberCount || 0),
            videoCount: Number(item.statistics?.videoCount || 0),
            connectedAt: new Date().toISOString(),
          };
        }
      }
    } catch (chErr) {
      console.warn("[YOUTUBE OAUTH] Could not fetch channel profile:", chErr);
    }

    const expiry = new Date(Date.now() + (Number(tokenData.expires_in || 3600) * 1000)).toISOString();
    const creds = {
      token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || "",
      token_uri: "https://oauth2.googleapis.com/token",
      client_id: secrets.clientId,
      client_secret: secrets.clientSecret,
      scopes: [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
      ],
      universe_domain: "googleapis.com",
      account: channelInfo.handle || channelInfo.title,
      expiry: expiry,
    };

    const userCredsPath = getUserFilePath(userId, "youtube_credentials.json");
    writeFileSync(userCredsPath, `${JSON.stringify(creds, null, 2)}\n`, "utf8");

    writeUserJson(userId, "youtube_channel.json", channelInfo);

    const userConfig = readConfig(userId);
    userConfig.youtube_channel_name = channelInfo.title;
    userConfig.youtube_channel_handle = channelInfo.handle;
    userConfig.youtube_credentials_path = `public/data/users/${userId}/youtube_credentials.json`;
    writeUserJson(userId, "config.json", userConfig);

    console.log(`[YOUTUBE OAUTH] User ${userId} successfully linked YouTube channel: ${channelInfo.title} (${channelInfo.handle})`);

    response.writeHead(302, { Location: `${redirectHost}/dashboard/settings?youtube=connected&channel=${encodeURIComponent(channelInfo.title)}` });
    response.end();
    return true;
  } catch (err) {
    console.error("[YOUTUBE OAUTH] Callback exception:", err);
    response.writeHead(302, { Location: `${redirectHost}/dashboard/settings?youtube_error=${encodeURIComponent(err.message)}` });
    response.end();
    return true;
  }
}

function disconnectYouTubeChannel(userId) {
  initUserDataDir(userId);
  const userDir = getUserDataDir(userId);
  const credsPath = resolve(userDir, "youtube_credentials.json");
  if (existsSync(credsPath)) {
    try { unlinkSync(credsPath); } catch {}
  }
  const channelPath = resolve(userDir, "youtube_channel.json");
  if (existsSync(channelPath)) {
    try { unlinkSync(channelPath); } catch {}
  }
  const userConfig = readConfig(userId);
  delete userConfig.youtube_channel_name;
  delete userConfig.youtube_channel_handle;
  delete userConfig.youtube_credentials_path;
  writeUserJson(userId, "config.json", userConfig);
  return { ok: true, connected: false };
}

function readOverview(userId = "default", userEmail = "") {
  initUserDataDir(userId);
  const userMedia = readUserJson(userId, "recreated_media.json", []);
  const rootMedia = readJson("public/data/recreated_media.json", []);
  const mergedMediaMap = new Map();
  for (const item of rootMedia) {
    const key = item.id || item.video_path || item.title;
    if (key) mergedMediaMap.set(key, item);
  }
  for (const item of userMedia) {
    const key = item.id || item.video_path || item.title;
    if (key) mergedMediaMap.set(key, item);
  }
  const media = Array.from(mergedMediaMap.values());

  return {
    account: getUserAccountInfo(userId, userEmail),
    youtube_channel: getYouTubeConnectedChannel(userId),
    quota: readQuota(userId),
    approvals: readApprovals(userId),
    report: readUserJson(userId, "weekly_tuning_report.json", {}),
    media,
    status: readStatus(userId),
    config: readConfig(userId),
  };
}

function readAnalytics(userId = "default") {
  initUserDataDir(userId);
  const report = readUserJson(userId, "weekly_tuning_report.json", {});
  const userMedia = readUserJson(userId, "recreated_media.json", []);
  const rootMedia = readJson("public/data/recreated_media.json", []);
  const mergedMediaMap = new Map();
  for (const item of rootMedia) {
    const key = item.id || item.video_path || item.title;
    if (key) mergedMediaMap.set(key, item);
  }
  for (const item of userMedia) {
    const key = item.id || item.video_path || item.title;
    if (key) mergedMediaMap.set(key, item);
  }
  const media = Array.from(mergedMediaMap.values());
  const config = readConfig(userId);

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
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-user-id, x-user-email");
  }
}

// ─── API handler ─────────────────────────────────────────────────────────────
async function handleApi(request, response, url) {
  setCorsHeaders(request, response);
  const userId = getRequestUserId(request, url);
  const userEmail = getRequestUserEmail(request, url);

  // Handle CORS preflight
  if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    response.writeHead(204);
    response.end();
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/session") {
    sendJson(response, {
      authenticated: true,
      user_id: userId,
      account: getUserAccountInfo(userId, userEmail),
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/quota/reset") {
    sendJson(response, resetQuota(userId));
    return true;
  }

  // YouTube Channel OAuth endpoints
  if (request.method === "GET" && url.pathname === "/api/youtube/auth-url") {
    try {
      const redirectUri = url.searchParams.get("redirect_uri") || getYouTubeCallbackUrl(request);
      const authUrl = generateYouTubeAuthUrl(userId, redirectUri);
      sendJson(response, { ok: true, url: authUrl, redirect_uri: redirectUri });
    } catch (err) {
      sendJson(response, { ok: false, error: err.message }, 500);
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/youtube/callback") {
    await handleYouTubeCallback(request, response, url);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/youtube/channel") {
    sendJson(response, getYouTubeConnectedChannel(userId));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/youtube/disconnect") {
    sendJson(response, disconnectYouTubeChannel(userId));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/audio-tracker/stream") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    
    let lastAudioPayload = "";
    const sendAudio = () => {
      try {
        const payload = JSON.stringify(readAudioTrackerState());
        if (payload !== lastAudioPayload) {
          lastAudioPayload = payload;
          response.write(`data: ${payload}\n\n`);
        }
      } catch {}
    };

    sendAudio();
    const interval = setInterval(sendAudio, 3000);
    
    request.on('close', () => {
      clearInterval(interval);
    });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/overview/stream") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });

    let lastPayload = "";
    const sendUpdate = () => {
      try {
        const data = readOverview(userId, userEmail);
        const payload = JSON.stringify(data);
        if (payload !== lastPayload) {
          lastPayload = payload;
          response.write(`event: overview\ndata: ${payload}\n\n`);
        }
      } catch (err) {
        // silent
      }
    };

    // Send initial snapshot immediately
    sendUpdate();

    // Check every 3.5s for changes, but only write to client when payload actually changed
    const interval = setInterval(sendUpdate, 3500);

    // Also watch user's data directory with debounce for instant push on file changes
    const userDir = getUserDataDir(userId);
    let watcher = null;
    let watchTimer = null;
    try {
      watcher = watch(userDir, () => {
        clearTimeout(watchTimer);
        watchTimer = setTimeout(sendUpdate, 150);
      });
    } catch {}

    request.on("close", () => {
      clearInterval(interval);
      clearTimeout(watchTimer);
      try { watcher?.close(); } catch {}
    });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/overview") {
    sendJson(response, readOverview(userId, userEmail));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/approvals") {
    sendJson(response, readApprovals(userId));
    return true;
  }
  if (request.method === "PATCH" && url.pathname.startsWith("/api/approvals/")) {
    const rawId = url.pathname.slice("/api/approvals/".length);
    const id = decodeURIComponent(rawId);
    const body = await parseJsonBody(request);
    const approved = Boolean(body.approved);
    let result = handleApprovalAction(userId, id, approved);
    if (!result || !result.ok) {
      // Robust fallback: ensure approval status is directly persisted in approval_queue.json
      const approvals = readApprovals(userId);
      const normalizedId = id.replaceAll("\\", "/");
      const index = approvals.findIndex((item) => {
        const videoPath = String(item.video_path ?? "").replaceAll("\\", "/");
        const publicUrl = String(item.public_url ?? "").replaceAll("\\", "/");
        const fullVideoPath = String(item.full_video_path ?? "").replaceAll("\\", "/");
        return (
          item.id === id ||
          videoPath === normalizedId ||
          publicUrl === normalizedId ||
          fullVideoPath === normalizedId ||
          (item.video_path && String(item.video_path).includes(id)) ||
          (id && (videoPath.endsWith(id) || fullVideoPath.endsWith(id)))
        );
      });
      if (index !== -1) {
        approvals[index].approved = approved;
        approvals[index].upload_status = approved ? "approved" : "rejected";
        approvals[index].reviewed_at = new Date().toISOString();
        writeApprovals(userId, approvals);
        result = { ok: true, status: approved ? "approved" : "rejected", ...approvals[index] };
      }
    }
    const statusCode = result?.ok ? 200 : (result?.error?.includes("not found") ? 404 : 200);
    sendJson(response, result, statusCode);
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/content/clear") {
    const body = await parseJsonBody(request);
    const result = clearContentData(userId, body);
    sendJson(response, result);
    return true;
  }
  if (request.method === "DELETE" && url.pathname.startsWith("/api/content/")) {
    const rawId = url.pathname.slice("/api/content/".length);
    const id = decodeURIComponent(rawId);
    const deleteFiles = url.searchParams.get("deleteFiles") === "true";
    const result = clearContentData(userId, { scope: "selected", ids: [id], deleteFiles });
    sendJson(response, { ok: true, id, removed: result.removedCount > 0, ...result });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/status") {
    sendJson(response, readStatus(userId));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/config") {
    sendJson(response, readConfig(userId));
    return true;
  }
  if (request.method === "PATCH" && url.pathname === "/api/config") {
    const body = await parseJsonBody(request);
    const { validated, errors } = validateConfigPatch(body);
    if (errors.length > 0) {
      sendError(response, 400, errors.join("; "));
      return true;
    }
    sendJson(response, writeConfigPatch(userId, validated));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/cookies/status") {
    const cfg = readConfig(userId);
    const cookiePath = cfg.yt_dlp_cookie_file ? resolve(root, cfg.yt_dlp_cookie_file) : null;
    let fileExists = false;
    let fileSize = 0;
    let lastModified = null;
    if (cookiePath && existsSync(cookiePath)) {
      try {
        const st = statSync(cookiePath);
        fileExists = true;
        fileSize = st.size;
        lastModified = st.mtime.toISOString();
      } catch {}
    }
    sendJson(response, {
      ok: true,
      browser: cfg.yt_dlp_cookies_from_browser || "chrome",
      cookieFile: cfg.yt_dlp_cookie_file || "",
      fileExists,
      fileSize,
      lastModified,
    });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/cookies/upload") {
    const body = await parseJsonBody(request);
    const cookieText = typeof body.cookieText === "string" ? body.cookieText : "";
    if (!cookieText.trim()) {
      sendError(response, 400, "Empty cookie file content");
      return true;
    }
    const userDir = getUserDataDir(userId);
    const targetFile = resolve(userDir, "cookies.txt");
    writeFileSync(targetFile, cookieText.trim() + "\n", "utf8");
    const relativePath = `public/data/users/${userId}/cookies.txt`;
    writeConfigPatch(userId, { yt_dlp_cookie_file: relativePath });
    sendJson(response, {
      ok: true,
      cookieFile: relativePath,
      fileSize: Buffer.byteLength(cookieText, "utf8"),
      message: "Cookie file saved successfully",
    });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/storage/stats") {
    sendJson(response, calculateStorageStats(userId));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/storage/clean") {
    const body = await parseJsonBody(request);
    sendJson(response, cleanSystemStorage(userId, body));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/analytics") {
    sendJson(response, readAnalytics(userId));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/pipeline/start") {
    const account = getUserAccountInfo(userId, userEmail);
    if (!account.can_run) {
      sendJson(response, {
        ok: false,
        error: "Trial limit reached: Normal accounts are permitted only 1 YouTube automation run to test functionality. Please contact administrator (gobi56529@gmail.com) for full access.",
        trial_exhausted: true,
        account,
      }, 403);
      return true;
    }
    recordAutomationRun(userId, userEmail);
    sendJson(response, startPipeline());
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/pipeline/stop") {
    sendJson(response, stopPipeline());
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/pipeline/reset") {
    sendJson(response, resetPipelineQueue(userId));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/quota/reset") {
    const body = await parseJsonBody(request).catch(() => ({}));
    sendJson(response, resetQuota(userId, body));
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/telegram/status") {
    sendJson(response, getTelegramStatus());
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/telegram/run-once") {
    const account = getUserAccountInfo(userId, userEmail);
    if (!account.can_run) {
      sendJson(response, {
        ok: false,
        error: "Trial limit reached: Normal accounts are permitted only 1 YouTube automation run to test functionality. Please contact administrator (gobi56529@gmail.com) for full access.",
        trial_exhausted: true,
        account,
      }, 403);
      return true;
    }
    recordAutomationRun(userId, userEmail);
    sendJson(response, startTelegramPipeline("once"));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/telegram/start") {
    const account = getUserAccountInfo(userId, userEmail);
    if (!account.can_run) {
      sendJson(response, {
        ok: false,
        error: "Trial limit reached: Normal accounts are permitted only 1 YouTube automation run to test functionality. Please contact administrator (gobi56529@gmail.com) for full access.",
        trial_exhausted: true,
        account,
      }, 403);
      return true;
    }
    recordAutomationRun(userId, userEmail);
    sendJson(response, startTelegramPipeline("continuous"));
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/telegram/stop") {
    sendJson(response, stopTelegramPipeline());
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/telegram/downloads") {
    sendJson(response, getTelegramDownloads());
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/telegram/templates") {
    sendJson(response, { ok: true, templates: TELEGRAM_TEMPLATES_LIST });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/telegram/render-status") {
    sendJson(response, { ok: true, job: activeRenderJob });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/telegram/render") {
    const account = getUserAccountInfo(userId, userEmail);
    if (!account.can_run) {
      sendJson(response, {
        ok: false,
        error: "Trial limit reached: Normal accounts are permitted only 1 YouTube automation run to test functionality. Please contact administrator (gobi56529@gmail.com) for full access.",
        trial_exhausted: true,
        account,
      }, 403);
      return true;
    }
    const body = await parseJsonBody(request);
    const templateId = body.template || readConfig(userId).telegram_render_template || "anime_multi_tier";
    const clipPart = body.clip ? Number(body.clip) : null;
    const result = startTelegramRender(userId, templateId, clipPart);
    if (result.ok) {
      recordAutomationRun(userId, userEmail);
    }
    sendJson(response, result, result.ok ? 200 : 400);
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/learning/sync-analytics") {
    sendJson(response, syncYouTubeAnalytics());
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/learning/telemetry") {
    sendJson(response, getLearningTelemetry());
    return true;
  }

  // Audio Tools endpoints
  if (request.method === "POST" && url.pathname === "/api/audio-tools/inspect") {
    const body = await parseJsonBody(request);
    const videoPath = body.video_path;
    if (!videoPath) {
      sendError(response, 400, "Missing video_path");
      return true;
    }
    const result = execPythonTool(["inspect", videoPath]);
    sendJson(response, result);
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/audio-tools/ai-detect") {
    const body = await parseJsonBody(request);
    const { video_path, track_index = 0 } = body;
    if (!video_path) {
      sendError(response, 400, "Missing video_path");
      return true;
    }
    const result = execPythonTool(["ai-detect", video_path, "--track", String(track_index)]);
    sendJson(response, result);
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/audio-tools/preview") {
    const body = await parseJsonBody(request);
    const { video_path, track_index = 0 } = body;
    if (!video_path) {
      sendError(response, 400, "Missing video_path");
      return true;
    }
    const result = execPythonTool(["preview", video_path, "--track", String(track_index)]);
    if (result?.status === "success" && result.preview_path) {
      // Create web-accessible relative URL
      const rel = result.preview_path.replace(/\\/g, "/").replace(/^outputs\//, "");
      result.preview_url = `/outputs/${rel}`;
    }
    sendJson(response, result);
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/audio-tools/swap") {
    const body = await parseJsonBody(request);
    const { video_path, track_index = 0, output_path, loudnorm = false } = body;
    if (!video_path) {
      sendError(response, 400, "Missing video_path");
      return true;
    }
    const targetOut = output_path || join("outputs", `swapped_${Date.now()}.mp4`);
    const args = ["swap", video_path, String(track_index), "-o", targetOut];
    if (loudnorm) args.push("--loudnorm");
    const result = execPythonTool(args);
    if (result?.status === "success" && result.output_path) {
      const rel = result.output_path.replace(/\\/g, "/").replace(/^outputs\//, "");
      result.video_url = `/outputs/${rel}`;
    }
    sendJson(response, result);
    return true;
  }

  // ─── AI Smart Editor Endpoints (OpenShorts Engine) ──────────────────────────
  if (request.method === "POST" && url.pathname === "/api/editor/upload") {
    const rawName = url.searchParams.get("filename") || "uploaded_video.mp4";
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const targetName = `${Date.now()}_${safeName}`;
    const targetPath = join(uploadsDir, targetName);
    const writeStream = createWriteStream(targetPath);
    request.pipe(writeStream);
    writeStream.on("finish", () => {
      sendJson(response, {
        ok: true,
        file_path: targetPath,
        filename: targetName,
        relative_path: `downloads/uploads/${targetName}`
      });
    });
    writeStream.on("error", (err) => {
      sendError(response, 500, err.message);
    });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/editor/analyze") {
    const body = await parseJsonBody(request);
    const { source, target_duration = 60 } = body;
    if (!source) {
      sendError(response, 400, "Missing source (file_path or URL)");
      return true;
    }
    const jobId = `job_${Date.now()}_${randomBytes(4).toString("hex")}`;
    const jobFile = join(editorJobsDir, `${jobId}.json`);
    const initialJob = {
      job_id: jobId,
      status: "pending",
      progress: 5,
      source_type: source.startsWith("http://") || source.startsWith("https://") ? "url" : "upload",
      source_input: source,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      moments: [],
      rendered_clips: []
    };
    writeFileSync(jobFile, JSON.stringify(initialJob, null, 2), "utf8");

    const python = process.env.PYTHON || "python";
    const script = join(root, "pipeline", "smart_clip_engine.py");

    const child = spawn(python, [
      script,
      "analyze",
      source,
      "--job-id", jobId,
      "--target-duration", String(target_duration)
    ], {
      cwd: root,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (d) => console.log(`[SMART EDITOR ${jobId}] ${d.toString().trim()}`));
    child.stderr.on("data", (d) => console.error(`[SMART EDITOR ${jobId} ERR] ${d.toString().trim()}`));
    child.unref();

    sendJson(response, { ok: true, job_id: jobId });
    return true;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/editor/jobs/")) {
    const jobId = url.pathname.slice("/api/editor/jobs/".length);
    const jobFile = join(editorJobsDir, `${jobId}.json`);
    if (!existsSync(jobFile)) {
      sendError(response, 404, "Job not found");
      return true;
    }
    try {
      const data = JSON.parse(readFileSync(jobFile, "utf8"));
      sendJson(response, { ok: true, job: data });
    } catch {
      sendError(response, 500, "Error reading job state");
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/editor/render") {
    const body = await parseJsonBody(request);
    const { job_id, moment_index = 0, crop_mode = "blur_stack", hook_text = "" } = body;
    if (!job_id) {
      sendError(response, 400, "Missing job_id");
      return true;
    }
    const python = process.env.PYTHON || "python";
    const script = join(root, "pipeline", "smart_clip_engine.py");

    const renderArgs = [
      script,
      "render",
      job_id,
      "--moment-index", String(moment_index),
      "--crop-mode", crop_mode
    ];
    if (hook_text) {
      renderArgs.push("--hook-text", hook_text);
    }

    try {
      const proc = spawnSync(python, renderArgs, {
        cwd: root,
        encoding: "utf8",
        timeout: 180000,
        windowsHide: true
      });
      if (proc.error) {
        sendError(response, 500, proc.error.message);
        return true;
      }
      const out = (proc.stdout || "").trim();
      try {
        const parsed = JSON.parse(out);
        sendJson(response, parsed);
      } catch {
        sendJson(response, { ok: false, error: proc.stderr || out });
      }
    } catch (err) {
      sendError(response, 500, err.message);
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/editor/clips") {
    const allClips = [];
    try {
      const files = readdirSync(editorJobsDir).filter((f) => f.endsWith(".json"));
      for (const f of files) {
        try {
          const jobData = JSON.parse(readFileSync(join(editorJobsDir, f), "utf8"));
          if (Array.isArray(jobData.rendered_clips)) {
            for (const clip of jobData.rendered_clips) {
              allClips.push({ ...clip, job_id: jobData.job_id });
            }
          }
        } catch {}
      }
    } catch {}
    allClips.sort((a, b) => new Date(b.rendered_at || 0).getTime() - new Date(a.rendered_at || 0).getTime());
    sendJson(response, { ok: true, clips: allClips });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/editor/queue-approval") {
    const body = await parseJsonBody(request);
    const { title, video_path, thumbnail_path, virality_score = 85, caption = "" } = body;
    if (!video_path) {
      sendError(response, 400, "Missing video_path");
      return true;
    }
    const approvalQueueFile = resolve(root, "public", "data", "approval_queue.json");
    let queue = [];
    if (existsSync(approvalQueueFile)) {
      try {
        queue = JSON.parse(readFileSync(approvalQueueFile, "utf8"));
      } catch {}
    }
    const newItem = {
      id: `smart_${Date.now()}_${randomBytes(3).toString("hex")}`,
      title: title || "AI Smart Short",
      video_path: video_path,
      thumbnail_path: thumbnail_path || "",
      approved: true,
      upload_status: "approved",
      timestamp: new Date().toISOString(),
      prediction: {
        predicted_virality: virality_score,
        hook_score: 9
      },
      metadata: {
        title: title || "AI Smart Short",
        description: caption || `${title}\n\n#shorts #viral #trending`,
        tags: ["shorts", "viral", "trending"]
      }
    };
    queue.unshift(newItem);
    writeFileSync(approvalQueueFile, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
    sendJson(response, { ok: true, item: newItem });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/logs/stream") {
    streamLogs(request, response, userId);
    return true;
  }

  if (request.method === "DELETE" && url.pathname === "/api/logs") {
    try {
      const userLogPath = getUserFilePath(userId, "pipeline.log");
      if (existsSync(userLogPath)) writeFileSync(userLogPath, "", "utf8");

      const filesToClear = [
        resolve(logsDir, "telegram_tamil_pipeline.log"),
        resolve(root, "telegram_tamil_pipeline.log"),
        resolve(logsDir, "ghostpipe.log"),
        resolve(root, "ghostpipe.log"),
      ];
      for (const f of filesToClear) {
        if (existsSync(f)) writeFileSync(f, "", "utf8");
      }
      sendJson(response, { ok: true, message: "Logs cleared" });
    } catch (err) {
      sendError(response, 500, `Failed to clear logs: ${err.message}`);
    }
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
    console.error(`[NEMO] Could not open log file for append: ${err.message}`);
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

function resetPipelineQueue(userId = "default") {
  return resetQuota(userId);
}

function resetQuota(userId = "default", options = {}) {
  const { resetQueue = false } = options;
  const config = readConfig(userId);
  const today = getTodayDateKey(config.upload_timezone || "Asia/Kolkata");
  const currentQuota = readUserJson(userId, "daily_quota_state.json", {});
  const resetState = {
    ...currentQuota,
    date: today,
    uploads: 0,
    short: 0,
    video: 0,
    max_daily_uploads: Number(config.max_daily_uploads ?? 10),
    last_reset: new Date().toISOString(),
    history: currentQuota.history || [],
  };
  writeUserJson(userId, "daily_quota_state.json", resetState);
  if (userId === "default") {
    writeJson("public/data/daily_quota_state.json", resetState);
  }

  if (resetQueue) {
    writeUserJson(userId, "approval_queue.json", []);
    writeUserJson(userId, "recreated_media.json", []);

    if (userId === "default") {
      writeJson("public/data/approval_queue.json", []);
      writeJson("public/data/recreated_media.json", []);

      // Remove sqlite tracking databases if full queue reset requested
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
    }
  }

  return { ok: true, status: "quota_reset", quota: resetState };
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

// ─── Telegram Pipeline & Audio Tool Helpers ─────────────────────────────────
function getTelegramStatus() {
  const isRunning = telegramPipeline !== null && !telegramPipeline.killed;
  return {
    running: isRunning,
    pid: isRunning ? telegramPipeline.pid : null,
    mode: telegramPipelineMode,
    started_at: telegramStartTime,
  };
}

function startTelegramPipeline(mode = "continuous") {
  if (telegramPipeline && !telegramPipeline.killed) {
    return { status: "already_running", pid: telegramPipeline.pid, mode: telegramPipelineMode };
  }
  const venvPython = join(root, "venv", "Scripts", "python.exe");
  const python = existsSync(venvPython) ? venvPython : process.env.PYTHON || "python";
  const scriptPath = join(root, "pipeline", "telegram_tamil_shorts_pipeline.py");
  const args = [scriptPath];
  if (mode === "once") {
    args.push("--once");
  }

  const telegramLogPath = resolve(logsDir, "telegram_tamil_pipeline.log");
  let logFd = "ignore";
  try {
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    logFd = openSync(telegramLogPath, "a");
  } catch (err) {
    console.error(`[NEMO] Could not open telegram log file for append: ${err.message}`);
  }

  try {
    telegramPipeline = spawn(python, args, {
      cwd: root,
      detached: false,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
    });
    telegramPipelineMode = mode;
    telegramStartTime = new Date().toISOString();

    const pid = telegramPipeline.pid;
    telegramPipeline.on("exit", (code) => {
      console.log(`[NEMO] Telegram pipeline exited with code ${code}`);
      telegramPipeline = null;
      telegramPipelineMode = "idle";
      telegramStartTime = null;
      if (typeof logFd === "number") {
        try { closeSync(logFd); } catch {}
      }
    });

    return { status: "started", mode, pid };
  } catch (err) {
    return { status: "start_failed", error: err.message };
  }
}

function stopTelegramPipeline() {
  if (!telegramPipeline || telegramPipeline.killed) {
    return { status: "not_running" };
  }
  const pid = telegramPipeline.pid;
  try {
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"]);
    telegramPipeline = null;
    telegramPipelineMode = "idle";
    telegramStartTime = null;
    return { status: "stopped", pid };
  } catch (error) {
    return { status: "stop_failed", pid, error: error.message };
  }
}

function getTelegramDownloads() {
  const candidates = [
    join(root, "downloads", "telegram"),
    join(root, "downloads"),
    join(root, "outputs"),
  ];
  const items = [];
  const seenPaths = new Set();
  const validExts = new Set([".mp4", ".mkv", ".mov", ".webm"]);

  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir);
      for (const file of files) {
        const fullPath = join(dir, file);
        if (seenPaths.has(fullPath)) continue;
        try {
          const st = statSync(fullPath);
          if (st.isFile() && validExts.has(extname(file).toLowerCase()) && st.size > 1024) {
            seenPaths.add(fullPath);
            const isOutput = dir.includes("outputs");
            const relUrl = isOutput
              ? `/outputs/${file}`
              : `/downloads/${dir.endsWith("telegram") ? "telegram/" : ""}${file}`;
            items.push({
              name: file,
              path: fullPath,
              size: st.size,
              mtime: st.mtimeMs,
              url: relUrl,
              is_output: isOutput,
            });
          }
        } catch {}
      }
    } catch {}
  }
  items.sort((a, b) => b.mtime - a.mtime);
  return items.slice(0, 50);
}

function execPythonTool(args) {
  const venvPython = join(root, "venv", "Scripts", "python.exe");
  const python = existsSync(venvPython) ? venvPython : process.env.PYTHON || "python";
  const toolScript = join(root, "pipeline", "video_audio_tools.py");
  try {
    const res = spawnSync(python, [toolScript, ...args], {
      cwd: root,
      encoding: "utf8",
      timeout: 60000,
      windowsHide: true,
    });
    if (res.error) {
      return { status: "error", message: res.error.message };
    }
    const stdout = (res.stdout || "").trim();
    if (!stdout) {
      return { status: "error", message: res.stderr || "No output from python tool" };
    }
    try {
      return JSON.parse(stdout);
    } catch (e) {
      return { status: "error", message: stdout || res.stderr };
    }
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

// ─── Self-Learning & Analytics Sync ─────────────────────────────────────────

function syncYouTubeAnalytics() {
  const venvPython = join(root, "venv", "Scripts", "python.exe");
  const python = existsSync(venvPython) ? venvPython : process.env.PYTHON || "python";
  const scriptPath = join(root, "pipeline", "sync_youtube_analytics.py");
  try {
    const res = spawnSync(python, [scriptPath], {
      cwd: root,
      encoding: "utf8",
      timeout: 60000,
      windowsHide: true,
    });
    return {
      status: res.status === 0 ? "success" : "error",
      output: (res.stdout || "") + (res.stderr || ""),
    };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}

function getLearningTelemetry() {
  const venvPython = join(root, "venv", "Scripts", "python.exe");
  const python = existsSync(venvPython) ? venvPython : process.env.PYTHON || "python";
  const script = `
import sqlite3, json
db = "pipeline/learning_memory.sqlite3"
try:
    with sqlite3.connect(db) as conn:
        conn.row_factory = sqlite3.Row
        exp_count = conn.execute("SELECT COUNT(*) FROM learning_experiments").fetchone()[0]
        scores = [dict(r) for r in conn.execute("SELECT dimension, key, category, attempts, uploads, avg_outcome_score FROM learning_scores ORDER BY avg_outcome_score DESC LIMIT 10").fetchall()]
        print(json.dumps({"status": "success", "experiments_count": exp_count, "top_scores": scores}))
except Exception as e:
    print(json.dumps({"status": "error", "message": str(e), "experiments_count": 0, "top_scores": []}))
`;
  try {
    const res = spawnSync(python, ["-c", script], { cwd: root, encoding: "utf8", timeout: 10000 });
    return JSON.parse(res.stdout || "{}");
  } catch (e) {
    return { status: "error", message: e.message };
  }
}

// ─── Log streaming (fs.watch-based) ─────────────────────────────────────────

function streamLogs(request, response, userId = "default") {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  if (typeof response.flushHeaders === "function") {
    response.flushHeaders();
  }

  let lastPayload = "";

  const sendCurrentLogs = () => {
    try {
      const activeLogFile = getActiveLogFile(userId);
      const logTail = readLastLogLines(activeLogFile, 150);
      const payload = JSON.stringify(logTail);
      if (payload !== lastPayload) {
        lastPayload = payload;
        response.write(`event: logs\ndata: ${payload}\n\n`);
        response.write(`data: ${payload}\n\n`);
      }
    } catch {}
  };

  // Send initial snapshot immediately
  sendCurrentLogs();

  // Watch candidate log files
  const watchers = [];
  const filesToWatch = new Set([
    getActiveLogFile(userId),
    resolve(logsDir, "telegram_tamil_pipeline.log"),
    resolve(logsDir, "ghostpipe.log"),
    getUserFilePath(userId, "pipeline.log"),
  ]);

  for (const file of filesToWatch) {
    if (existsSync(file)) {
      try {
        const w = watch(file, () => sendCurrentLogs());
        watchers.push(w);
      } catch {}
    }
  }

  // Polling fallback every 1.5s ensures rapid updates even if file events are buffered
  const pollTimer = setInterval(sendCurrentLogs, 1500);

  // Heartbeat comment ping every 15s to keep connection alive
  const pingTimer = setInterval(() => {
    try {
      response.write(": ping\n\n");
    } catch {}
  }, 15000);

  request.on("close", () => {
    clearInterval(pollTimer);
    clearInterval(pingTimer);
    for (const w of watchers) {
      try { w.close(); } catch {}
    }
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

  if (range && fileSize > 0) {
    const matches = range.match(/bytes=(\d*)-(\d*)/);
    if (matches) {
      const rawStart = matches[1];
      const rawEnd = matches[2];
      let start;
      let end;

      if (rawStart === "" && rawEnd !== "") {
        // Suffix range: bytes=-500 (last 500 bytes)
        const suffixLength = parseInt(rawEnd, 10);
        start = Math.max(0, fileSize - suffixLength);
        end = fileSize - 1;
      } else {
        start = parseInt(rawStart, 10);
        end = rawEnd ? parseInt(rawEnd, 10) : fileSize - 1;
      }

      // RFC 7233 / 9110: if end is absent or >= fileSize, clamp to fileSize - 1
      if (end >= fileSize) {
        end = fileSize - 1;
      }

      if (isNaN(start) || start < 0 || start >= fileSize || start > end) {
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

  if (url.pathname === "/login" || url.pathname === "/login/") {
    response.writeHead(302, { Location: "/landing/login.html" });
    response.end();
    return;
  }

  if (url.pathname === "/landing") {
    response.writeHead(301, { Location: "/landing/" });
    response.end();
    return;
  }
  if (url.pathname.startsWith("/landing/")) {
    const subPath = url.pathname.replace(/^\/landing\//, "") || "index.html";
    let filePath = safeStaticPath(landingDir, subPath);
    if (filePath && !existsSync(filePath) && !extname(filePath)) {
      const withHtml = safeStaticPath(landingDir, `${subPath}.html`);
      if (withHtml && existsSync(withHtml)) {
        filePath = withHtml;
      }
    }
    if (serveFile(request, response, filePath, NO_STORE)) return;
    sendError(response, 404, "not found");
    return;
  }

  const staticFile = safeStaticPath(distDir, url.pathname);
  if (serveFile(request, response, staticFile)) return;

  const publicFile = safeStaticPath(publicDir, url.pathname);
  if (serveFile(request, response, publicFile)) return;

  const rootFile = safeStaticPath(root, url.pathname);
  if (serveFile(request, response, rootFile)) return;

  const ext = extname(url.pathname).toLowerCase();
  const hasExtension = Boolean(ext && ext !== ".html");
  if (!hasExtension && serveFile(request, response, join(distDir, "index.html"), NO_STORE)) return;
  sendError(response, 404, "not found");
}

// ─── Start ────────────────────────────────────────────────────────────────────
async function startServer() {
  const maxAttempts = 20;
  let boundPort = null;
  for (let offset = 0; offset < maxAttempts; offset++) {
    const port = requestedPort + offset;
    const server = createHttpServer();
    try {
      await listenOnPort(server, port);
      boundPort = port;
      try {
        writeFileSync(resolve(root, ".backend_port"), String(port), "utf8");
      } catch {}
      console.log(`[NEMO] Server listening at http://${host}:${port}`);
      console.log(`[NEMO] Dev mode: ${isDev}`);
      break;
    } catch (error) {
      if (error?.code === "EADDRINUSE") {
        console.warn(`[NEMO] Port ${port} is busy, trying ${port + 1}...`);
        continue;
      }
      console.error(error);
      process.exit(1);
    }
  }

  if (!boundPort) {
    console.error(`[NEMO] Could not find an available port after ${maxAttempts} attempts.`);
    process.exit(1);
  }

  // Also try to bind alternative common dev port (4174 if bound to 4173, or 4173 if bound to 4174)
  const altPort = boundPort === 4173 ? 4174 : (boundPort === 4174 ? 4173 : null);
  if (altPort) {
    try {
      const auxServer = createHttpServer();
      await listenOnPort(auxServer, altPort);
      console.log(`[NEMO] Auxiliary mirror listening at http://${host}:${altPort}`);
    } catch {
      // alt port might be in use, ignore
    }
  }
}

process.on("exit", () => {
  try { unlinkSync(resolve(root, ".backend_port")); } catch {}
});
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

startServer();
