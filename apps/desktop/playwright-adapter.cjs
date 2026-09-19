"use strict";

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const store = require("./chrome-profiles.cjs");
const media = require("./media-upload.cjs");

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

function anyDialog(page) {
  return page.locator('[role="dialog"], [aria-modal="true"]');
}

function composerOpeners(page) {
  return [
    page.getByRole("button", { name: /tạo bài viết|create a post|viết bài/i }).first(),
    page.getByText(/bạn đang nghĩ gì|what.?s on your mind/i).first(),
    page.locator('[aria-label*="Tạo bài" i], [aria-label*="Create a post" i], [aria-label*="Create post" i]').first(),
  ];
}

function composerTargets(page) {
  const dlg = anyDialog(page);
  return [
    dlg.getByText(/bạn đang nghĩ gì|what.?s on your mind/i).last(),
    dlg.locator('[contenteditable="true"]').first(),
    dlg.locator('[role="textbox"]').first(),
    dlg.locator('[data-lexical-editor="true"]').first(),
    page.locator('[role="dialog"] [contenteditable="true"]').first(),
    page.getByText(/bạn đang nghĩ gì|what.?s on your mind/i).last(),
  ];
}

function publishButtons(page) {
  const dlg = anyDialog(page);
  return [
    dlg.getByRole("button", { name: /^(đăng|post)$/i }).last(),
    dlg.getByRole("button", { name: /(đăng|post)/i }).last(),
  ];
}

function nextButtons(page) {
  const dlg = anyDialog(page);
  return [dlg.getByRole("button", { name: /^(tiếp|next)$/i }).last(), dlg.getByRole("button", { name: /tiếp|next/i }).last()];
}

function genericLocators(page, name) {
  return [
    page.getByRole("button", { name: new RegExp(name, "i") }).first(),
    page.getByLabel(new RegExp(name, "i")).first(),
    page.locator(`[aria-label*="${name}" i]`).first(),
    page.getByText(name, { exact: false }).first(),
  ];
}

async function firstVisible(candidates, timeout = 2000) {
  for (const loc of candidates) {
    try {
      if (await loc.isVisible({ timeout })) return loc;
    } catch {
      /* next */
    }
  }
  return null;
}

async function safeClick(loc) {
  try {
    await loc.click({ timeout: 5000 });
  } catch {
    await loc.click({ timeout: 5000, force: true });
  }
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
  if (!context) throw err("NOT_READY", "Chrome CDP không có context.");
  const pages = context.pages();
  const page = pages.find((p) => /facebook\.com/i.test(p.url())) || pages[0] || (await context.newPage());
  live = { browser, context, page, mode: "cdp", profileId, cdpPort: port };
  return { mode: "cdp", profileId, cdpPort: port };
}

function assertNotSystemUserData(userDataDir) {
  const system = store.defaultChromeUserDataDir();
  const norm = (s) => path.resolve(s).toLowerCase();
  if (norm(userDataDir) === norm(system) || norm(userDataDir).startsWith(norm(system) + path.sep)) {
    throw err("IDLE_BLOCKED", "Chrome 136+ cấm debug User Data mặc định.");
  }
}

function spawnChromeForProfile(profile, port) {
  const executablePath = store.defaultChromeExecutable();
  if (!executablePath) throw err("CAPABILITY_MISSING", "Không thấy Google Chrome.");
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
  if (!profile) profile = store.createPmaiProfile("Hồ sơ 1");
  if (await pageAlive()) {
    if (!live.profileId || live.profileId === profile.id) return { mode: live.mode, reused: true, profileId: profile.id };
  }
  const port = profile.cdpPort || DEFAULT_CDP_PORT;
  if (await isCdpUp(port) && !profile.locked) {
    try {
      return await connectCdp(port, profile.id);
    } catch {
      /* spawn */
    }
  }
  if (profile.locked && !(await isCdpUp(port))) {
    throw err("IDLE_BLOCKED", `Đang mở Chrome hồ sơ «${profile.displayName}» nhưng không có CDP.`);
  }
  const usePort = (await isCdpUp(port)) ? await findFreePort(port + 1) : port;
  spawnChromeForProfile(profile, usePort);
  store.touchProfile(profile.id, { cdpPort: usePort });
  if (!(await waitCdp(usePort, 25000))) throw err("NOT_READY", "Cổng CDP chưa sẵn sàng.");
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
  return store.createPmaiProfile(payload.displayName || payload.name || "Hồ sơ PMAI");
}

async function cloneProfile(payload = {}) {
  return store.clonePmaiProfile(payload.sourceId || payload.directory, payload.displayName || payload.name);
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
  if (await firstVisible(composerOpeners(live.page), 400)) pageState = pageState === "login" ? pageState : "composer";
  let pageName = title ? title.replace(/\s*\|\s*Facebook\s*$/i, "").trim() : null;
  if (pageName && /^facebook$/i.test(pageName)) pageName = null;
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
  const observation = await launchSelected(opts.directory || opts.profileId, { reuse: Boolean(opts.reuse) });
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

async function ensureComposerOpen() {
  const already = await anyDialog(live.page)
    .first()
    .isVisible()
    .catch(() => false);
  if (already) return;
  const opener = await firstVisible(composerOpeners(live.page), 2500);
  if (!opener) throw err("UI_CHANGED", "Không thấy «Bạn đang nghĩ gì?» / Tạo bài viết trên trang.");
  await safeClick(opener);
  const start = Date.now();
  while (Date.now() - start < 8000) {
    const vis = await anyDialog(live.page)
      .first()
      .isVisible()
      .catch(() => false);
    if (vis) return;
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function typeText(_name, text) {
  await ensureComposerOpen();
  const target = await firstVisible(composerTargets(live.page), 2500);
  if (target) await safeClick(target);
  await new Promise((r) => setTimeout(r, 250));
  await live.page.keyboard.insertText(String(text || ""));
}

async function uploadFiles(files) {
  await ensureComposerOpen();
  const list = Array.isArray(files) ? files : [files];
  await media.uploadToFacebook(live.page, list.filter(Boolean));
}

async function clickNamed(name) {
  const n = String(name || "");
  if (/composer|bài viết|create a post/i.test(n)) {
    await ensureComposerOpen();
    return;
  }
  if (n === "Đăng" || n === "đăng" || /^(post|publish)$/i.test(n) || /publish/i.test(n)) {
    return publishPost();
  }
  const btn = await firstVisible(genericLocators(live.page, n), 2000);
  if (!btn) throw err("UI_CHANGED", `Không thấy nút «${name}».`);
  await safeClick(btn);
}

async function publishPost() {
  if (!live.page) throw err("NOT_READY", "Browser chưa launch");
  await ensureComposerOpen();
  const fbPublish = require("./facebook-publish.cjs");
  return fbPublish.publishFromComposer(live.page, { hasMedia: true });
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
    if (live.mode !== "cdp") await live.context?.close();
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
  publishPost,
  screenshotPng,
  closeBrowser,
  isCdpUp,
};
