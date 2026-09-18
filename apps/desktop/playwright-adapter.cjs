"use strict";

/**
 * ChromiumAdapter — Electron main only. Domain must not import this file.
 * Does not copy cookies between profiles. Does not log cookie/token values.
 *
 * Attach order:
 * 1. Reuse live Playwright session if still alive
 * 2. CDP http://127.0.0.1:9222 (Chrome already opened with remote debug)
 * 3. If User Data is locked (Chrome running without CDP) → fail closed
 * 4. Spawn the installed Google Chrome with --remote-debugging-port=9222
 *    and the selected --profile-directory, then connectOverCDP
 * 5. launchPersistentContext fallback
 */

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  defaultChromeExecutable,
  defaultChromeUserDataDir,
  listChromeProfiles,
  pickLoggedInChromeProfile,
} = require("./chrome-profiles.cjs");

const CDP_URL = "http://127.0.0.1:9222";

let live = {
  browser: null,
  context: null,
  page: null,
  mode: null,
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

function isCdpUp() {
  return new Promise((resolve) => {
    const req = http.get(`${CDP_URL}/json/version`, { timeout: 800 }, (res) => {
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

async function waitCdp(ms = 25000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await isCdpUp()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function pageAlive() {
  if (!live.page) return false;
  try {
    await live.page.evaluate(() => document.readyState);
    return true;
  } catch {
    live = { browser: null, context: null, page: null, mode: null };
    return false;
  }
}

async function connectCdp() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  if (!context) {
    throw err("NOT_READY", "Chrome CDP không có context hồ sơ. Mở một tab trong Chrome rồi kết nối lại.");
  }
  const pages = context.pages();
  const page = pages.find((p) => /facebook\.com/i.test(p.url())) || pages[0] || (await context.newPage());
  live = { browser, context, page, mode: "cdp" };
  return { mode: "cdp" };
}

function spawnChromeDebug(directory) {
  const executablePath = defaultChromeExecutable();
  if (!executablePath) {
    throw err("CAPABILITY_MISSING", "Không thấy Google Chrome. Cài Chrome rồi thử lại.");
  }
  const userDataDir = defaultChromeUserDataDir();
  const child = spawn(
    executablePath,
    [
      `--remote-debugging-port=9222`,
      `--user-data-dir=${userDataDir}`,
      `--profile-directory=${directory || "Default"}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-blink-features=AutomationControlled",
      "https://www.facebook.com/",
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
}

async function launchPersistent(directory) {
  const { chromium } = await loadPlaywright();
  const userDataDir = defaultChromeUserDataDir();
  const executablePath = defaultChromeExecutable();
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: null,
    executablePath: executablePath || undefined,
    channel: executablePath ? undefined : "chrome",
    args: [`--profile-directory=${directory}`, "--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
  });
  const page = context.pages()[0] || (await context.newPage());
  live = { browser: null, context, page, mode: "persistent" };
  return { mode: "persistent" };
}

function lockMessage(directory) {
  const exe = defaultChromeExecutable() || "chrome.exe";
  return [
    "Chrome đang mở và khóa hồ sơ — PMAI không copy cookie sang chỗ khác.",
    "Cách 1: đóng HẾT cửa sổ Google Chrome rồi bấm Kết nối lại.",
    `Cách 2: đóng Chrome, mở lại bằng lệnh rồi kết nối:`,
    `"${exe}" --remote-debugging-port=9222 --profile-directory=${directory || "Default"}`,
  ].join(" ");
}

async function ensureBrowser(directory) {
  if (await pageAlive()) return { mode: live.mode, reused: true };
  if (await isCdpUp()) {
    return connectCdp();
  }
  const profiles = listChromeProfiles();
  const locked = profiles.some((p) => p.locked);
  if (locked) {
    throw err("IDLE_BLOCKED", lockMessage(directory));
  }
  try {
    spawnChromeDebug(directory);
    const up = await waitCdp(25000);
    if (!up) throw err("NOT_READY", "Chrome đã mở nhưng cổng 9222 chưa sẵn sàng. Thử đóng Chrome rồi kết nối lại.");
    return connectCdp();
  } catch (e) {
    if (e && e.code === "IDLE_BLOCKED") throw e;
    try {
      return await launchPersistent(directory);
    } catch (err2) {
      const msg = err2 instanceof Error ? err2.message : String(err2);
      if (/in use|SingletonLock|ProcessSingleton/i.test(msg)) {
        throw err("IDLE_BLOCKED", lockMessage(directory));
      }
      throw err2;
    }
  }
}

async function listProfiles() {
  return listChromeProfiles();
}

async function status() {
  const profiles = listChromeProfiles();
  return {
    cdpAvailable: await isCdpUp(),
    live: Boolean(live.page),
    liveMode: live.mode,
    executable: defaultChromeExecutable(),
    userDataDir: defaultChromeUserDataDir(),
    picked: pickLoggedInChromeProfile(profiles),
    profiles,
    locked: profiles.some((p) => p.locked),
  };
}

async function launchSelected(directory, opts = {}) {
  const dir = directory || (pickLoggedInChromeProfile(listChromeProfiles()) || {}).directory || "Default";
  const launched = await ensureBrowser(dir);
  if (!opts.reuse || !launched.reused) {
    await live.page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
  }
  return observe();
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
  return { url, title, pageState, pageName };
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
    live = { browser: null, context: null, page: null, mode: null };
  }
}

module.exports = {
  listProfiles,
  status,
  launchSelected,
  observe,
  goto,
  typeText,
  uploadFiles,
  clickNamed,
  screenshotPng,
  closeBrowser,
  isCdpUp,
};
