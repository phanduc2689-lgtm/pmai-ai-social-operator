"use strict";

const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const store = require("./chrome-profiles.cjs");
const media = require("./media-upload.cjs");

const DEFAULT_CDP_PORT = 9222;

/** One live CDP connection per PMAI Chrome profile. Concurrent sessions are the product. */
const pool = new Map();
let lastId = null;

function emptyLive(port = DEFAULT_CDP_PORT) {
  return { browser: null, context: null, page: null, mode: null, profileId: null, cdpPort: port };
}

function resolveProfileId(arg) {
  if (arg == null || arg === "") return lastId;
  if (typeof arg === "string") return arg;
  return arg.profileId || arg.directory || lastId;
}

function getLive(profileId) {
  const id = resolveProfileId(profileId);
  if (id && pool.has(id)) {
    lastId = id;
    return pool.get(id);
  }
  if (lastId && pool.has(lastId)) return pool.get(lastId);
  if (pool.size === 1) return [...pool.values()][0];
  return emptyLive();
}

function putLive(profileId, live) {
  if (!profileId) return live;
  pool.set(profileId, live);
  lastId = profileId;
  return live;
}

function requireLive(profileId) {
  const live = getLive(profileId);
  if (!live || !live.page) throw err("NOT_READY", "Browser chưa launch");
  return live;
}

function sessionCount() {
  return pool.size;
}

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
  if (/tạo nhóm mới|create (a )?new group|đăng ẩn danh|post anonymously|chia sẻ suy nghĩ|share your thoughts/i.test(t)) {
    return false;
  }
  return /bạn đang nghĩ gì|bạn viết gì đi|viết gì đó|tạo bài viết|tạo bài viết công khai|write something|write a post|what['’`]?s on your mind|create a post|create a public post|start a discussion|đăng bài viết|bắt đầu thảo luận/i.test(
    t,
  );
}

function anyDialog(page) {
  return page.locator('[role="dialog"], [aria-modal="true"]');
}

function composerOpeners(page) {
  const url = typeof page.url === "function" ? String(page.url() || "") : "";
  const isGroup = /\/groups\//i.test(url);
  const cue = isGroup
    ? /bạn viết gì đi|write something|write a post|tạo bài viết|create a post|create a public post|start a discussion|bắt đầu thảo luận/i
    : /bạn đang nghĩ gì|what.?s on your mind|tạo bài viết|create a post/i;
  const main = page.locator('[role="main"]');
  return [
    main.getByText(cue).first(),
    page.getByRole("button", { name: /tạo bài viết|create a post|create a public post/i }).first(),
    page.getByPlaceholder(cue).first(),
    page.getByLabel(cue).first(),
    page.locator("[aria-placeholder]").filter({ hasText: cue }).first(),
    page.getByText(cue).first(),
    main.locator('[role="button"]').filter({ hasText: cue }).first(),
    page.locator('[aria-label*="Tạo bài" i], [aria-label*="Create a post" i], [aria-label*="Create post" i], [aria-label*="Write something" i]').first(),
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

function isCdpUp(port = DEFAULT_CDP_PORT) {
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

function usedCdpPorts() {
  return new Set([...pool.values()].map((s) => s.cdpPort).filter(Boolean));
}

async function findFreePort(start = DEFAULT_CDP_PORT) {
  const used = usedCdpPorts();
  for (let p = start; p < start + 80; p++) {
    if (used.has(p)) continue;
    if (!(await isCdpUp(p))) return p;
  }
  return start;
}

async function pageAlive(live) {
  if (!live || !live.page) return false;
  try {
    await live.page.evaluate(() => document.readyState);
    return true;
  } catch {
    if (live.profileId) pool.delete(live.profileId);
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
  const live = { browser, context, page, mode: "cdp", profileId, cdpPort: port };
  putLive(profileId, live);
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

function portOwnedByOther(port, profileId) {
  for (const [id, s] of pool) {
    if (id !== profileId && s.cdpPort === port && s.page) return true;
  }
  return false;
}

async function ensureBrowser(profileId) {
  let profile = profileId ? store.getProfile(profileId) : store.pickLoggedInChromeProfile();
  if (!profile) profile = store.createPmaiProfile("Hồ sơ 1");
  const existing = pool.get(profile.id);
  if (existing && (await pageAlive(existing))) {
    lastId = profile.id;
    return { mode: existing.mode, reused: true, profileId: profile.id, cdpPort: existing.cdpPort };
  }
  const port = profile.cdpPort || DEFAULT_CDP_PORT;
  if ((await isCdpUp(port)) && !profile.locked && !portOwnedByOther(port, profile.id)) {
    try {
      return await connectCdp(port, profile.id);
    } catch {
      /* spawn */
    }
  }
  if (profile.locked && !(await isCdpUp(port))) {
    throw err("IDLE_BLOCKED", `Đang mở Chrome hồ sơ «${profile.displayName}» nhưng không có CDP.`);
  }
  const conflict = portOwnedByOther(port, profile.id) || (await isCdpUp(port));
  const usePort = conflict ? await findFreePort(port + 1) : port;
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
  const sessions = [];
  for (const [id, s] of pool) {
    const alive = await pageAlive(s);
    sessions.push({
      profileId: id,
      cdpPort: s.cdpPort,
      live: alive,
      liveMode: s.mode,
    });
  }
  const anyLive = sessions.some((s) => s.live);
  const current = getLive();
  return {
    cdpAvailable: anyLive || (await isCdpUp(current.cdpPort || DEFAULT_CDP_PORT)),
    live: anyLive,
    liveMode: current.mode,
    liveCount: sessions.filter((s) => s.live).length,
    sessions,
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

async function observe(profileId) {
  const live = requireLive(profileId);
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
  return { url, title, pageState, pageName, profileId: live.profileId, cdpPort: live.cdpPort };
}

async function launchSelected(directory, opts = {}) {
  const launched = await ensureBrowser(directory || opts.profileId);
  const live = requireLive(launched.profileId);
  if (!opts.reuse || !launched.reused) {
    await live.page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
  }
  return observe(launched.profileId);
}

async function autoConnect(opts = {}) {
  const observation = await launchSelected(opts.directory || opts.profileId, { reuse: Boolean(opts.reuse) });
  const live = getLive(opts.profileId || opts.directory);
  return {
    profile: store.getProfile(live.profileId) || store.pickLoggedInChromeProfile(),
    observation,
    cdpAvailable: await isCdpUp(live.cdpPort),
    liveMode: live.mode,
    profileId: live.profileId,
    cdpPort: live.cdpPort,
  };
}

async function goto(url, profileId) {
  const live = requireLive(profileId);
  await live.page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await sleep(1000);
  try {
    await live.page.locator('[role="main"]').first().waitFor({ state: "visible", timeout: 12000 });
  } catch {
    /* group/page chrome still hydrating */
  }
  await sleep(700);
  return observe(live.profileId);
}

async function composerReady(page) {
  if (await page.getByText("Tạo bài viết", { exact: true }).first().isVisible().catch(() => false)) return true;
  if (await page.getByText("Create post", { exact: true }).first().isVisible().catch(() => false)) return true;
  if (await anyDialog(page).first().isVisible().catch(() => false)) return true;
  const editors = page.locator(
    '[role="dialog"] [contenteditable="true"], [aria-modal="true"] [contenteditable="true"], [role="dialog"] [data-lexical-editor="true"]',
  );
  if (await editors.first().isVisible().catch(() => false)) return true;
  return false;
}

async function clickComposerInPage(page) {
  const payload = {
    cue: "bạn đang nghĩ gì|bạn viết gì đi|viết gì đó|write something|write a post|what['’`]?s on your mind|create a post|create a public post|start a discussion|tạo bài viết|đăng bài viết|bắt đầu thảo luận",
    skip: "tạo nhóm mới|create (a )?new group|đăng ẩn danh|chia sẻ suy nghĩ|share your thoughts",
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

async function ensureComposerOpen(page) {
  if (!page) throw err("NOT_READY", "Browser chưa launch");
  if (await composerReady(page)) return;

  const join = page.getByRole("button", { name: /tham gia nhóm|join group|join this group/i }).first();
  if (await join.isVisible().catch(() => false)) {
    throw err("NOT_READY", "Group chưa tham gia / không có quyền đăng. Mở group trên Chrome, tham gia, rồi duyệt lại.");
  }

  const opener = await firstVisible(composerOpeners(page), 14000);
  if (opener) {
    await safeClick(opener);
  } else {
    const clicked = await clickComposerInPage(page);
    if (!clicked) {
      throw err(
        "UI_CHANGED",
        "Không thấy ô soạn trên trang đích (Bạn đang nghĩ gì? / Write something / Tạo bài viết). Cuộn feed group/profile rồi thử lại.",
      );
    }
  }

  const start = Date.now();
  while (Date.now() - start < 12000) {
    if (await composerReady(page)) return;
    await sleep(300);
  }
}

async function typeText(_name, text, profileId) {
  const live = requireLive(profileId);
  await ensureComposerOpen(live.page);
  const target = await firstVisible(composerTargets(live.page), 8000);
  if (target) await safeClick(target);
  await new Promise((r) => setTimeout(r, 250));
  await live.page.keyboard.insertText(String(text || ""));
}

async function uploadFiles(files, profileId) {
  const live = requireLive(profileId);
  await ensureComposerOpen(live.page);
  const list = Array.isArray(files) ? files : [files];
  await media.uploadToFacebook(live.page, list.filter(Boolean));
}

async function clickNamed(name, profileId) {
  const live = requireLive(profileId);
  const n = String(name || "");
  if (/composer|bài viết|create a post/i.test(n)) {
    await ensureComposerOpen(live.page);
    return;
  }
  if (n === "Đăng" || n === "đăng" || /^(post|publish)$/i.test(n) || /publish/i.test(n)) {
    return publishPost({ profileId: live.profileId });
  }
  const btn = await firstVisible(genericLocators(live.page, n), 2000);
  if (!btn) throw err("UI_CHANGED", `Không thấy nút «${name}».`);
  await safeClick(btn);
}

async function publishPost(opts = {}) {
  const live = requireLive(opts.profileId);
  await ensureComposerOpen(live.page);
  const fbPublish = require("./facebook-publish.cjs");
  return fbPublish.publishFromComposer(live.page, {
    hasMedia: opts.hasMedia !== false,
    hasVideo: Boolean(opts.hasVideo),
    destinationType: opts.destinationType || "PAGE",
    humanPauseMs: typeof opts.humanPauseMs === "number" ? opts.humanPauseMs : undefined,
  });
}

async function screenshotPng(profileId) {
  const live = requireLive(profileId);
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

async function closeBrowser(profileId) {
  const id = resolveProfileId(profileId);
  const closeOne = async (key, live) => {
    try {
      if (live && live.mode !== "cdp") await live.context?.close();
    } catch {
      /* ignore */
    }
    pool.delete(key);
  };
  if (id && pool.has(id)) {
    await closeOne(id, pool.get(id));
    if (lastId === id) lastId = pool.size ? [...pool.keys()][0] : null;
    return;
  }
  for (const [key, live] of [...pool.entries()]) {
    await closeOne(key, live);
  }
  lastId = null;
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
  sessionCount,
};
