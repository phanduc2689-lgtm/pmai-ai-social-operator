"use strict";

/**
 * ChromiumAdapter — Electron main only.
 * Never launch against the system Chrome User Data directory (Chrome 136+ blocks CDP).
 * PMAI owns user-data-dir under %LOCALAPPDATA%\PMAI\profiles\<id>.
 * Session persists in that folder. Clone copies a PMAI profile only — not system Chrome cookies.
 */

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const store = require("./chrome-profiles.cjs");

const DEFAULT_CDP_PORT = 9222;

let live = {
  browser: null,
  context: null,
  page: null,
  mode: null,
  profileId: null,
  cdpPort: DEFAULT_CDP_PORT,
};

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function composerOpeners(page) {
  return [
    page.getByRole("button", { name: /what's on your mind|bạn đang nghĩ gì|create a post|tạo bài viết|write a post|bài viết/i }).first(),
    page.getByText(/what's on your mind|bạn đang nghĩ gì/i).first(),
    page.locator('[aria-label*="Create a post" i], [aria-label*="Tạo bài" i]').first(),
  ];
}

function composerBoxes(page) {
  return [
    page.locator('[contenteditable="true"][role="textbox"]').last(),
    page.locator('div[role="dialog"] [contenteditable="true"]').last(),
    page.locator('div[contenteditable="true"]').last(),
    page.getByRole("textbox", { name: /bài viết|what's on your mind|viết/i }).first(),
  ];
}

function publishButtons(page) {
  return [
    page.getByRole("button", { name: /^(đăng|post)$/i }).last(),
    page.locator('[aria-label="Post"], [aria-label="Đăng"]').last(),
    page.getByRole("button", { name: /đăng|post/i }).last(),
  ];
}

function genericLocators(page, name) {
  return [
    page.getByRole("button", { name: new RegExp(name, "i") }).first(),
    page.getByLabel(new RegExp(name, "i")).first(),
    page.locator(`[aria-label*="${name}" i]`).first(),
    page.getByText(name, { exact: false }).first(),
  ];
}

async function firstVisible(candidates) {
  for (const loc of candidates) {
    try {
      if (await loc.isVisible({ timeout: 800 })) return loc;
    } catch {
      /* next */
    }
  }
  return null;
}

async function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    throw err("CAPABILITY_MISSING", "Chưa cài Playwright. Chạy: npm install && npx playwright install chrome");
  }
}

function cdpUrl(port) {
  return `http://127.0.0.1:${port}`;
}

function isCdpUp(port = live.cdpPort || DEFAULT_CDP_PORT) {
  return new Promise((resolve) => {
    const req = http.get(`${cdpUrl(port)}/json/version`, { timeout: 800 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitCdp(port, ms = 25000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await isCdpUp(port)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function findFreePort(start = DEFAULT_CDP_PORT) {
  for (let p = start; p < start + 20; p++) {
    if (!(await isCdpUp(p))) return p;
  }
  return start;
}

async function pageAlive() {
  if (!live.page) return false;
  try {
    await live.page.evaluate(() => document.readyState);
    return true;
  } catch {
    live = { browser: null, context: null, page: null, mode: null, profileId: null, cdpPort: DEFAULT_CDP_PORT };
    return false;
  }
}

async function connectCdp(port, profileId) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.connectOverCDP(cdpUrl(port));
  const context = browser.contexts()[0];
  if (!context) {
    throw err("NOT_READY", "Chrome CDP không có context. Mở một tab trong cửa sổ Chrome PMAI rồi kết nối lại.");
  }
  const pages = context.pages();
  const page = pages.find((p) => /facebook\.com/i.test(p.url())) || pages[0] || (await context.newPage());
  live = { browser, context, page, mode: "cdp", profileId, cdpPort: port };
  return { mode: "cdp", profileId, cdpPort: port };
}

function assertNotSystemUserData(userDataDir) {
  const system = store.defaultChromeUserDataDir();
  const norm = (s) => path.resolve(s).toLowerCase();
  if (norm(userDataDir) === norm(system) || norm(userDataDir).startsWith(norm(system) + path.sep)) {
    throw err(
      "IDLE_BLOCKED",
      "Chrome 136+ cấm debug User Data mặc định. PMAI chỉ mở hồ sơ riêng trong %LOCALAPPDATA%\\PMAI\\profiles.",
    );
  }
}

function spawnChromeForProfile(profile, port) {
  const executablePath = store.defaultChromeExecutable();
  if (!executablePath) {
    throw err("CAPABILITY_MISSING", "Không thấy Google Chrome. Cài Chrome rồi thử lại.");
  }
  assertNotSystemUserData(profile.userDataDir);
  fs.mkdirSync(profile.userDataDir, { recursive: true });
  const child = spawn(
    executablePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile.userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-blink-features=AutomationControlled",
      "https://www.facebook.com/",
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
}

async function ensureBrowser(profileId) {
  let profile = profileId ? store.getProfile(profileId) : store.pickLoggedInChromeProfile();
  if (!profile) {
    profile = store.createPmaiProfile("Hồ sơ 1");
  }
  if (await pageAlive()) {
    if (!live.profileId || live.profileId === profile.id) return { mode: live.mode, reused: true, profileId: profile.id };
  }
  const port = profile.cdpPort || DEFAULT_CDP_PORT;
  if (await isCdpUp(port) && !profile.locked) {
    try {
      return await connectCdp(port, profile.id);
    } catch {
      /* spawn fresh */
    }
  }
  if (profile.locked && !(await isCdpUp(port))) {
    throw err(
      "IDLE_BLOCKED",
      `Đang mở cửa sổ Chrome của hồ sơ «${profile.displayName}» nhưng không có CDP. Đóng đúng cửa sổ đó rồi bấm Mở lại.`,
    );
  }
  const usePort = (await isCdpUp(port)) ? await findFreePort(port + 1) : port;
  spawnChromeForProfile(profile, usePort);
  store.touchProfile(profile.id, { cdpPort: usePort });
  const up = await waitCdp(usePort, 25000);
  if (!up) {
    throw err(
      "NOT_READY",
      "Đã mở Chrome hồ sơ PMAI nhưng cổng CDP chưa sẵn sàng. Đóng cửa sổ đó rồi mở lại từ app.",
    );
  }
  return connectCdp(usePort, profile.id);
}

async function listProfiles() {
  return store.listPmaiProfiles();
}

async function status() {
  const profiles = store.listPmaiProfiles();
  return {
    cdpAvailable: await isCdpUp(live.cdpPort || DEFAULT_CDP_PORT),
    live: Boolean(live.page),
    liveMode: live.mode,
    executable: store.defaultChromeExecutable(),
    userDataDir: store.profilesRoot(),
    picked: store.pickLoggedInChromeProfile(profiles),
    profiles,
    locked: profiles.some((p) => p.locked),
    systemUserDataBlocked: true,
  };
}

async function createProfile(payload = {}) {
  const created = store.createPmaiProfile(payload.displayName || payload.name || "Hồ sơ PMAI");
  return created;
}

async function cloneProfile(payload = {}) {
  const sourceId = payload.sourceId || payload.directory;
  return store.clonePmaiProfile(sourceId, payload.displayName || payload.name);
}

async function observe() {
  if (!live.page) throw err("NOT_READY", "Browser chưa launch");
  const url = live.page.url();
  const title = await live.page.title();
  let pageState = "unknown";
  const blob = `${url} ${title}`;
  if (/checkpoint|security/i.test(blob)) pageState = "checkpoint";
  else if (/captcha|two.?factor|auth_platform/i.test(blob)) pageState = "captcha";
  else if (/login|checkpoint/i.test(url)) pageState = "login";
  else if (/facebook\.com/i.test(url)) pageState = "feed";
  const composer = await firstVisible(composerBoxes(live.page).concat(composerOpeners(live.page)));
  if (composer) pageState = pageState === "login" ? pageState : "composer";
  let pageName = title ? title.replace(/\s*\|\s*Facebook\s*$/i, "").trim() : null;
  if (pageName && /^facebook$/i.test(pageName)) pageName = null;
  try {
    const h1 = await live.page.locator("h1").first().innerText({ timeout: 1500 });
    if (h1 && h1.trim() && !/^facebook$/i.test(h1.trim())) pageName = h1.trim();
  } catch {
    /* keep title */
  }
  if (live.profileId) store.touchProfile(live.profileId, {});
  return { url, title, pageState, pageName, profileId: live.profileId };
}

async function launchSelected(directory, opts = {}) {
  const launched = await ensureBrowser(directory);
  if (!opts.reuse || !launched.reused) {
    await live.page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
  }
  return observe();
}

async function autoConnect(opts = {}) {
  const id = opts.directory || opts.profileId;
  const observation = await launchSelected(id, { reuse: Boolean(opts.reuse) });
  return {
    profile: store.getProfile(live.profileId) || store.pickLoggedInChromeProfile(),
    observation,
    cdpAvailable: await isCdpUp(live.cdpPort),
    liveMode: live.mode,
  };
}

async function goto(url) {
  await live.page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  return observe();
}

async function typeText(name, text) {
  let box = await firstVisible(composerBoxes(live.page));
  if (!box) {
    const opener = await firstVisible(composerOpeners(live.page).concat(genericLocators(live.page, name || "bài viết")));
    if (opener) {
      await opener.click();
      await new Promise((r) => setTimeout(r, 600));
    }
    box = await firstVisible(composerBoxes(live.page));
  }
  if (!box) {
    throw err("UI_CHANGED", "Không thấy ô soạn. UI Facebook có thể đã đổi.");
  }
  await box.click();
  try {
    await box.fill(text);
  } catch {
    await live.page.keyboard.insertText(text);
  }
}

async function uploadFiles(files) {
  const input = live.page.locator('input[type="file"]').first();
  await input.setInputFiles(files);
}

async function clickNamed(name) {
  const n = String(name || "");
  let btn = null;
  if (/composer|bài viết|create a post/i.test(n)) {
    btn = await firstVisible(composerOpeners(live.page).concat(genericLocators(live.page, n)));
  } else if (/^(đăng|post|publish)$/i.test(n) || /đăng|publish/i.test(n)) {
    btn = await firstVisible(publishButtons(live.page).concat(genericLocators(live.page, n)));
  } else {
    btn = await firstVisible(genericLocators(live.page, n));
  }
  if (!btn) {
    throw err("UI_CHANGED", `Không thấy nút «${name}».`);
  }
  await btn.click();
}

async function screenshotPng() {
  let dir;
  try {
    dir = path.join(require("electron").app.getPath("userData"), "evidence");
  } catch {
    dir = path.join(os.homedir(), "AI-Social", "evidence");
  }
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `shot-${Date.now()}.png`);
  await live.page.screenshot({ path: file, fullPage: false });
  return file;
}

async function closeBrowser() {
  try {
    if (live.mode === "cdp") {
      live.browser = null;
    } else {
      await live.context?.close();
    }
  } finally {
    live = { browser: null, context: null, page: null, mode: null, profileId: null, cdpPort: DEFAULT_CDP_PORT };
  }
}

module.exports = {
  listProfiles,
  status,
  launchSelected,
  autoConnect,
  createProfile,
  cloneProfile,
  observe,
  goto,
  typeText,
  uploadFiles,
  clickNamed,
  screenshotPng,
  closeBrowser,
  isCdpUp,
};
