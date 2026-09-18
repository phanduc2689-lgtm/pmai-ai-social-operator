"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

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

function facebookHostPresent(cookiesFile) {
  try {
    const buf = fs.readFileSync(cookiesFile);
    return buf.includes(Buffer.from(".facebook.com")) || buf.includes(Buffer.from("facebook.com"));
  } catch {
    return false;
  }
}

function isLocked(profilePath, userDataDir) {
  return ["SingletonLock", "lockfile"].some(
    (n) => fs.existsSync(path.join(profilePath, n)) || fs.existsSync(path.join(userDataDir, n)),
  );
}

function listChromeProfiles(userDataDir = defaultChromeUserDataDir()) {
  if (!fs.existsSync(userDataDir)) return [];
  let cache = {};
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(userDataDir, "Local State"), "utf8"));
    cache = (raw.profile && raw.profile.info_cache) || {};
  } catch {
    cache = {};
  }
  const dirs = new Set(["Default", ...Object.keys(cache)]);
  try {
    for (const ent of fs.readdirSync(userDataDir, { withFileTypes: true })) {
      if (ent.isDirectory() && (ent.name === "Default" || ent.name.startsWith("Profile "))) dirs.add(ent.name);
    }
  } catch {
    /* ignore */
  }
  const list = [];
  for (const directory of dirs) {
    const profilePath = path.join(userDataDir, directory);
    if (!fs.existsSync(profilePath)) continue;
    const displayName =
      (cache[directory] && cache[directory].name && String(cache[directory].name).trim()) ||
      (directory === "Default" ? "Chrome mặc định" : directory);
    list.push({
      directory,
      displayName,
      userDataDir,
      profilePath,
      facebookLikely:
        facebookHostPresent(path.join(profilePath, "Network", "Cookies")) ||
        facebookHostPresent(path.join(profilePath, "Cookies")),
      locked: isLocked(profilePath, userDataDir),
    });
  }
  list.sort((a, b) => Number(b.facebookLikely) - Number(a.facebookLikely) || a.displayName.localeCompare(b.displayName));
  return list;
}

function pickLoggedInChromeProfile(profiles) {
  return profiles.find((p) => p.facebookLikely && !p.locked) || profiles.find((p) => p.facebookLikely) || null;
}

module.exports = {
  defaultChromeUserDataDir,
  defaultChromeExecutable,
  listChromeProfiles,
  pickLoggedInChromeProfile,
};
