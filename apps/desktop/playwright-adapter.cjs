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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isComposerCue(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/tạo nhóm mới|create (a )?new group|đăng ẩn danh|post anonymously/i.test(t)) return false;
  return /bạn đang nghĩ gì|bạn viết gì đi|viết gì đó|tạo bài viết|tạo bài viết công khai|write something|write a post|what['’`]?s on your mind|create a post|create a public post|start a discussion|share your thoughts|chia sẻ suy nghĩ|đăng bài viết|bắt đầu thảo luận/i.test(
    t,
  );
}

function anyDialog(page) {
  return page.locator('[role="dialog"], [aria-modal="true"]');
}

function composerOpeners(page) {
  const main = page.locator('[role="main"]');
  const cue =
    /bạn đang nghĩ gì|bạn viết gì đi|viết gì đó|write something|write a post|what.?s on your mind|tạo bài viết|create a post|create a public post|start a discussion|chia sẻ suy nghĩ|share your thoughts|đăng bài viết|bắt đầu thảo luận/i;
  return [
    page.getByRole("button", { name: /tạo bài viết|create a post|create a public post|đăng bài viết/i }).first(),
    page.getByPlaceholder(cue).first(),
    page.getByLabel(cue).first(),
    page.locator("[aria-placeholder]").filter({ hasText: cue }).first(),
    page.getByText(cue).first(),
    main.getByText(cue).first(),
    main.locator('[role="button"]').filter({ hasText: cue }).first(),
    page.locator('[aria-label*="Tạo bài" i], [aria-label*="Create a post" i], [aria-label*="Create post" i], [aria-label*="Write something" i]').first(),
    page.locator('[contenteditable="true"]').first(),
  ];
}

function composerTargets(page) {
  const dlg = anyDialog(page);
  return [
    dlg.getByText(/bạn đang nghĩ gì|what.?s on your mind/i).last(),
    dlg.getByText(/tạo bài viết công khai|bạn viết gì đi|write something/i).last(),
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
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const loc of candidates) {
      try {
        if (await loc.isVisible({ timeout: 120 })) return loc;
      } catch {
        /* next */
      }
    }
    await sleep(180);
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
  await sleep(1000);
  try {
    await live.page.locator('[role="main"]').first().waitFor({ state: "visible", timeout: 12000 });
  } catch {
    /* group/page chrome still hydrating */
  }
  await sleep(700);
  return observe();
}

async function composerReady(page) {
  if (await anyDialog(page).first().isVisible().catch(() => false)) return true;
  const editors = page.locator(
    '[role="dialog"] [contenteditable="true"], [aria-modal="true"] [contenteditable="true"], [role="dialog"] [data-lexical-editor="true"]',
  );
  if (await editors.first().isVisible().catch(() => false)) return true;
  return false;
}

async function clickComposerInPage(page) {
  const payload = {
    cue: "bạn đang nghĩ gì|bạn viết gì đi|viết gì đó|write something|write a post|what['’`]?s on your mind|create a post|create a public post|start a discussion|tạo bài viết|chia sẻ suy nghĩ|share your thoughts|đăng bài viết|bắt đầu thảo luận",
    skip: "tạo nhóm mới|create (a )?new group|đăng ẩn danh",
  };
  for (const frame of typeof page.frames === "function" ? page.frames() : [page]) {
    try {
      const result = await frame.evaluate(({ cue: cueSrc, skip: skipSrc }) => {
        const cue = new RegExp(cueSrc, "i");
        const skip = new RegExp(skipSrc, "i");
        const nodes = [...document.querySelectorAll('[role="button"], [role="textbox"], [contenteditable="true"], div[tabindex="0"], span, a')];
        let best = null;
        let bestArea = 0;
        for (const el of nodes) {
          const r = el.getBoundingClientRect();
          if (r.width < 48 || r.height < 14 || r.bottom < 80 || r.top > innerHeight - 20) continue;
          const st = window.getComputedStyle(el);
          if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) continue;
          const aria = el.getAttribute("aria-label") || el.getAttribute("aria-placeholder") || el.getAttribute("placeholder") || "";
          const text = (el.innerText || "").replace(/\s+/g, " ").trim();
          const blob = `${aria} ${text}`;
          if (skip.test(blob)) continue;
          if (!cue.test(blob)) continue;
          if (text.length > 90 && !cue.test(aria)) continue;
          const area = r.width * r.height;
          if (area > bestArea) {
            bestArea = area;
            best = el;
          }
        }
        if (!best) return { ok: false };
        best.click();
        return { ok: true, text: (best.innerText || best.getAttribute("aria-label") || "").slice(0, 60) };
      }, payload);
      if (result && result.ok) return true;
    } catch {
      /* cross-origin */
    }
  }
  return false;
}

async function ensureComposerOpen() {
  if (await composerReady(live.page)) return;

  const join = live.page.getByRole("button", { name: /tham gia nhóm|join group|join this group/i }).first();
  if (await join.isVisible().catch(() => false)) {
    throw err("NOT_READY", "Group chưa tham gia / không có quyền đăng. Mở group trên Chrome, tham gia, rồi duyệt lại.");
  }

  const opener = await firstVisible(composerOpeners(live.page), 14000);
  if (opener) {
    await safeClick(opener);
  } else {
    const clicked = await clickComposerInPage(live.page);
    if (!clicked) {
      throw err(
        "UI_CHANGED",
        "Không thấy ô soạn trên trang đích (Bạn đang nghĩ gì? / Write something / Tạo bài viết). Cuộn feed group/profile rồi thử lại.",
      );
    }
  }

  const start = Date.now();
  while (Date.now() - start < 12000) {
    if (await composerReady(live.page)) return;
    await sleep(300);
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

async function publishPost(opts = {}) {
  if (!live.page) throw err("NOT_READY", "Browser chưa launch");
  await ensureComposerOpen();
  const fbPublish = require("./facebook-publish.cjs");
  return fbPublish.publishFromComposer(live.page, {
    hasMedia: opts.hasMedia !== false,
    destinationType: opts.destinationType || "PAGE",
  });
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
  isComposerCue,
};
