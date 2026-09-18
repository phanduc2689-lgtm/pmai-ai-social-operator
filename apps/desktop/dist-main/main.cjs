"use strict";

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const chromeScan = require("./chrome-profiles.cjs");
let playwrightAdapter = null;
function adapter() {
  if (!playwrightAdapter) playwrightAdapter = require("./playwright-adapter.cjs");
  return playwrightAdapter;
}

const ALLOWLIST = [
  "chrome.listProfiles",
  "chrome.status",
  "chrome.launch",
  "chrome.autoConnect",
  "chrome.observe",
  "chrome.goto",
  "chrome.type",
  "chrome.upload",
  "chrome.click",
  "chrome.screenshot",
  "chrome.close",
  "workspace.get",
  "profile.create",
  "session.markLoggedIn",
  "page.select",
  "content.createDraft",
  "content.update",
  "approval.submit",
  "approval.decide",
  "task.execute",
  "task.verifyNeeds",
  "llm.test",
  "settings.set",
  "activity.list",
];

const registered = new Set();

function dataRoot() {
  return path.join(app.getPath("appData"), "AI-Social");
}

function ensureDataDir() {
  const dir = dataRoot();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function wrap(fn) {
  return async (_evt, payload) => {
    try {
      const data = await fn(payload);
      return { ok: true, data };
    } catch (e) {
      return {
        ok: false,
        error: {
          code: e && e.code ? e.code : "NOT_READY",
          message: e instanceof Error ? e.message : String(e),
        },
      };
    }
  };
}

function handleOnce(channel, fn) {
  if (registered.has(channel)) return;
  registered.add(channel);
  try {
    ipcMain.removeHandler(channel);
  } catch {
    /* not registered */
  }
  ipcMain.handle(channel, fn);
}

function pickDirectory(payload) {
  if (payload && payload.directory) return payload.directory;
  const list = chromeScan.listChromeProfiles();
  const pick = chromeScan.pickLoggedInChromeProfile(list);
  return (pick && pick.directory) || "Default";
}

function createWindow() {
  const preload = path.join(__dirname, "preload.cjs");
  const indexHtml = path.join(__dirname, "..", "dist-renderer", "index.html");
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "AI Social Operator",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  win.once("ready-to-show", () => win.show());
  const devUrl = process.env.PMAI_RENDERER_URL;
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(indexHtml);
}

function registerIpc() {
  handleOnce("chrome.listProfiles", wrap(async () => chromeScan.listChromeProfiles()));
  handleOnce("chrome.status", wrap(async () => adapter().status()));
  handleOnce(
    "chrome.launch",
    wrap(async (payload) => adapter().launchSelected(pickDirectory(payload), { reuse: Boolean(payload && payload.reuse) })),
  );
  handleOnce(
    "chrome.autoConnect",
    wrap(async (payload) =>
      adapter().autoConnect({
        directory: pickDirectory(payload),
        reuse: payload && payload.reuse !== undefined ? Boolean(payload.reuse) : true,
      }),
    ),
  );
  handleOnce("chrome.observe", wrap(async () => adapter().observe()));
  handleOnce("chrome.goto", wrap(async (payload) => adapter().goto(payload.url)));
  handleOnce("chrome.type", wrap(async (payload) => adapter().typeText(payload.name, payload.text)));
  handleOnce("chrome.upload", wrap(async (payload) => adapter().uploadFiles(payload.files)));
  handleOnce("chrome.click", wrap(async (payload) => adapter().clickNamed(payload.name)));
  handleOnce("chrome.screenshot", wrap(async () => adapter().screenshotPng()));
  handleOnce("chrome.close", wrap(async () => adapter().closeBrowser()));
  for (const ch of ALLOWLIST) {
    handleOnce(ch, async () => ({
      ok: false,
      error: { code: "NOT_READY", message: "Kênh này chạy trên renderer engine." },
    }));
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setName("AI-Social");
  app.setPath("userData", ensureDataDir());
  app.whenReady().then(() => {
    ensureDataDir();
    registerIpc();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on("window-all-closed", () => {
    app.quit();
  });
}
