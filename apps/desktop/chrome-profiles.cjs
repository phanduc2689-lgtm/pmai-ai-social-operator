"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

function defaultChromeUserDataDir(env = process.env, platform = process.platform) {
  if (platform === "win32") {
    const local = env.LOCALAPPDATA || path.join(env.USERPROFILE || "C:\\Users\\Default", "AppData", "Local");
    return path.join(local, "Google", "Chrome", "User Data");
  }
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome");
  }
  return path.join(os.homedir(), ".config", "google-chrome");
}

function defaultChromeExecutable(env = process.env, platform = process.platform) {
  const candidates =
    platform === "win32"
      ? [
          path.join(env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
          path.join(env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
          path.join(env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
        ]
      : platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function pmaiRoot(env = process.env, platform = process.platform) {
  if (platform === "win32") {
    const local = env.LOCALAPPDATA || path.join(env.USERPROFILE || "C:\\Users\\Default", "AppData", "Local");
    return path.join(local, "PMAI");
  }
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "PMAI");
  }
  return path.join(os.homedir(), ".local", "share", "pmai");
}

function profilesRoot() {
  return path.join(pmaiRoot(), "profiles");
}

function registryPath() {
  return path.join(pmaiRoot(), "profiles.json");
}

function facebookHostPresent(cookiesFile) {
  try {
    const buf = fs.readFileSync(cookiesFile);
    return buf.includes(Buffer.from(".facebook.com")) || buf.includes(Buffer.from("facebook.com"));
  } catch {
    return false;
  }
}

function isLocked(userDataDir) {
  return ["SingletonLock", "lockfile"].some((n) => fs.existsSync(path.join(userDataDir, n)));
}

function detectFacebook(userDataDir) {
  const defaultDir = path.join(userDataDir, "Default");
  return (
    facebookHostPresent(path.join(defaultDir, "Network", "Cookies")) ||
    facebookHostPresent(path.join(defaultDir, "Cookies")) ||
    facebookHostPresent(path.join(userDataDir, "Default", "Network", "Cookies"))
  );
}

function readRegistry() {
  try {
    const raw = JSON.parse(fs.readFileSync(registryPath(), "utf8"));
    return Array.isArray(raw.profiles) ? raw.profiles : [];
  } catch {
    return [];
  }
}

function writeRegistry(profiles) {
  fs.mkdirSync(pmaiRoot(), { recursive: true });
  fs.writeFileSync(registryPath(), JSON.stringify({ version: 1, profiles }, null, 2));
}

function hydrate(row) {
  const userDataDir = row.userDataDir;
  return {
    id: row.id,
    directory: row.id,
    displayName: row.displayName,
    userDataDir,
    profilePath: path.join(userDataDir, "Default"),
    facebookLikely: detectFacebook(userDataDir),
    locked: isLocked(userDataDir),
    kind: "pmai",
    clonedFrom: row.clonedFrom || null,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt || null,
    cdpPort: row.cdpPort || 9222,
  };
}

function listPmaiProfiles() {
  fs.mkdirSync(profilesRoot(), { recursive: true });
  const rows = readRegistry();
  return rows.map(hydrate).sort((a, b) => Number(b.facebookLikely) - Number(a.facebookLikely) || String(b.lastUsedAt || "").localeCompare(String(a.lastUsedAt || "")));
}

function getProfile(id) {
  return listPmaiProfiles().find((p) => p.id === id || p.directory === id) || null;
}

function createPmaiProfile(displayName) {
  const id = `pmai-${crypto.randomBytes(4).toString("hex")}`;
  const userDataDir = path.join(profilesRoot(), id);
  fs.mkdirSync(path.join(userDataDir, "Default"), { recursive: true });
  const row = {
    id,
    displayName: String(displayName || "Hồ sơ PMAI").trim() || "Hồ sơ PMAI",
    userDataDir,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    cdpPort: 9222,
    clonedFrom: null,
  };
  const all = readRegistry();
  all.push(row);
  writeRegistry(all);
  return hydrate(row);
}

const SKIP_COPY = new Set([
  "SingletonLock",
  "SingletonSocket",
  "SingletonCookie",
  "lockfile",
  "DevToolsActivePort",
]);

function clonePmaiProfile(sourceId, displayName) {
  const src = getProfile(sourceId);
  if (!src) {
    const e = new Error("Không thấy hồ sơ nguồn để copy session.");
    e.code = "NOT_READY";
    throw e;
  }
  if (src.locked) {
    const e = new Error("Hồ sơ nguồn đang mở. Đóng cửa sổ Chrome của hồ sơ đó rồi copy session.");
    e.code = "IDLE_BLOCKED";
    throw e;
  }
  const created = createPmaiProfile(displayName || `${src.displayName} (bản sao)`);
  try {
    fs.cpSync(src.userDataDir, created.userDataDir, {
      recursive: true,
      filter: (p) => !SKIP_COPY.has(path.basename(p)),
    });
  } catch (err) {
    const e = new Error(err instanceof Error ? err.message : String(err));
    e.code = "NOT_READY";
    throw e;
  }
  const all = readRegistry().map((r) => (r.id === created.id ? { ...r, clonedFrom: src.id } : r));
  writeRegistry(all);
  return getProfile(created.id);
}

function touchProfile(id, patch = {}) {
  const all = readRegistry();
  const next = all.map((r) => (r.id === id ? { ...r, ...patch, lastUsedAt: new Date().toISOString() } : r));
  writeRegistry(next);
  return getProfile(id);
}

function listChromeProfiles() {
  return listPmaiProfiles();
}

function pickLoggedInChromeProfile(profiles) {
  const list = profiles || listPmaiProfiles();
  return list.find((p) => p.facebookLikely && !p.locked) || list.find((p) => p.facebookLikely) || list[0] || null;
}

module.exports = {
  defaultChromeUserDataDir,
  defaultChromeExecutable,
  pmaiRoot,
  profilesRoot,
  listChromeProfiles,
  listPmaiProfiles,
  pickLoggedInChromeProfile,
  createPmaiProfile,
  clonePmaiProfile,
  getProfile,
  touchProfile,
  detectFacebook,
  isLocked,
};
