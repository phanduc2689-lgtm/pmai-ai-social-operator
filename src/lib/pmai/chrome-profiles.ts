import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface ChromeProfileInfo {
  directory: string;
  displayName: string;
  userDataDir: string;
  profilePath: string;
  facebookLikely: boolean;
  locked: boolean;
}

export function defaultChromeUserDataDir(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
  if (platform === "win32") {
    const local = env.LOCALAPPDATA || path.join(env.USERPROFILE || "C:\\Users\\Default", "AppData", "Local");
    return path.join(local, "Google", "Chrome", "User Data");
  }
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome");
  }
  return path.join(os.homedir(), ".config", "google-chrome");
}

export function defaultChromeExecutable(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string | null {
  const candidates =
    platform === "win32"
      ? [
          path.join(env["PROGRAMFILES"] || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
          path.join(env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
          path.join(env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
        ]
      : platform === "darwin"
        ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"];
  return candidates.find((p) => p && fs.existsSync(p)) ?? null;
}

function facebookHostPresent(cookiesFile: string): boolean {
  try {
    const buf = fs.readFileSync(cookiesFile);
    if (buf.includes(Buffer.from(".facebook.com")) || buf.includes(Buffer.from("facebook.com"))) return true;
  } catch {
    /* ignore — do not log cookie bytes */
  }
  return false;
}

function isLocked(profilePath: string, userDataDir: string): boolean {
  const lockNames = ["SingletonLock", "lockfile", "DevToolsActivePort"];
  return lockNames.some((n) => fs.existsSync(path.join(profilePath, n)) || fs.existsSync(path.join(userDataDir, n)));
}

export function listChromeProfiles(userDataDir = defaultChromeUserDataDir()): ChromeProfileInfo[] {
  if (!fs.existsSync(userDataDir)) return [];
  const localStatePath = path.join(userDataDir, "Local State");
  let cache: Record<string, { name?: string }> = {};
  try {
    const raw = JSON.parse(fs.readFileSync(localStatePath, "utf8")) as {
      profile?: { info_cache?: Record<string, { name?: string }> };
    };
    cache = raw.profile?.info_cache ?? {};
  } catch {
    cache = {};
  }
  const dirs = new Set<string>(["Default", ...Object.keys(cache)]);
  try {
    for (const ent of fs.readdirSync(userDataDir, { withFileTypes: true })) {
      if (ent.isDirectory() && (ent.name === "Default" || ent.name.startsWith("Profile "))) dirs.add(ent.name);
    }
  } catch {
    /* ignore */
  }
  const list: ChromeProfileInfo[] = [];
  for (const directory of dirs) {
    const profilePath = path.join(userDataDir, directory);
    if (!fs.existsSync(profilePath)) continue;
    const displayName = cache[directory]?.name?.trim() || (directory === "Default" ? "Chrome mặc định" : directory);
    list.push({
      directory,
      displayName,
      userDataDir,
      profilePath,
      facebookLikely: facebookHostPresent(path.join(profilePath, "Network", "Cookies")) || facebookHostPresent(path.join(profilePath, "Cookies")),
      locked: isLocked(profilePath, userDataDir),
    });
  }
  list.sort((a, b) => Number(b.facebookLikely) - Number(a.facebookLikely) || a.displayName.localeCompare(b.displayName));
  return list;
}

export function pickLoggedInChromeProfile(profiles: ChromeProfileInfo[]): ChromeProfileInfo | null {
  return profiles.find((p) => p.facebookLikely && !p.locked) ?? profiles.find((p) => p.facebookLikely) ?? null;
}
