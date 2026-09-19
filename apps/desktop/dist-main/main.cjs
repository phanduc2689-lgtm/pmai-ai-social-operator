"use strict";

const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

// Windows GPU ACCESS_VIOLATION 0xC0000005 / -1073741819: GPU process dies,
// ready-to-show never fires, window stays hidden. Disable GPU *before* ready.
// Do not disable the software rasterizer — SwiftShader is the fallback painter.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");

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
  "chrome.createProfile",
  "chrome.cloneProfile",
  "chrome.pickImages",
  "chrome.saveMedia",
  "chrome.resolveMedia",
  "chrome.observe",
  "chrome.goto",
  "chrome.type",
  "chrome.upload",
  "chrome.click",
  "chrome.publish",
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
          ...(e && e.stages ? { stages: e.stages } : {}),
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
    /* ignore */
  }
  ipcMain.handle(channel, fn);
}

function pickDirectory(payload) {
  if (payload && (payload.profileId || payload.directory)) return payload.profileId || payload.directory;
  if (typeof chromeScan.listPmaiProfiles === "function") {
    const list = chromeScan.listPmaiProfiles();
    const pick = chromeScan.pickLoggedInChromeProfile(list);
    return (pick && (pick.id || pick.directory)) || null;
  }
  const list = chromeScan.listChromeProfiles();
  const pick = chromeScan.pickLoggedInChromeProfile(list);
  return (pick && pick.directory) || "Default";
}

function forceShow(win) {
  if (!win || win.isDestroyed()) return;
  try {
    if (win.isMinimized()) win.restore();
    win.show();
    win.setSkipTaskbar(false);
    win.moveTop();
    win.focus();
  } catch {
    /* ignore */
  }
}

function createWindow() {
  const preload = path.join(__dirname, "preload.cjs");
  const indexHtml = path.join(__dirname, "..", "dist-renderer", "index.html");
  console.log("PMAI: tao cua so...");
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "AI Social Operator",
    show: true,
    backgroundColor: "#f1eee6",
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  forceShow(win);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  win.webContents.on("did-finish-load", () => {
    console.log("PMAI: giao dien da tai.");
    forceShow(win);
  });
  let fallbackUsed = false;
  win.webContents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame) return;
    if (code === -3) return;
    console.error("PMAI: tai giao dien that bai", code, desc, url);
    if (!fallbackUsed && fs.existsSync(indexHtml)) {
      fallbackUsed = true;
      console.log("PMAI: thu file dong goi", indexHtml);
      void win.loadFile(indexHtml);
    } else {
      forceShow(win);
    }
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("PMAI: renderer thoat", details && details.reason, details && details.exitCode);
    if (!win.isDestroyed() && details && details.reason !== "clean-exit") {
      setTimeout(() => {
        if (!win.isDestroyed()) win.reload();
      }, 600);
    }
  });
  win.on("ready-to-show", () => forceShow(win));
  setTimeout(() => forceShow(win), 800);
  setTimeout(() => forceShow(win), 2500);
  const devUrl = process.env.PMAI_RENDERER_URL;
  if (devUrl) {
    console.log("PMAI: load", devUrl);
    void win.loadURL(devUrl);
  } else {
    console.log("PMAI: load file", indexHtml);
    void win.loadFile(indexHtml);
  }
}

function registerIpc() {
  handleOnce("chrome.listProfiles", wrap(async () => adapter().listProfiles()));
  handleOnce("chrome.status", wrap(async () => adapter().status()));
  handleOnce(
    "chrome.createProfile",
    wrap(async (payload) => {
      if (typeof adapter().createProfile === "function") return adapter().createProfile(payload || {});
      throw Object.assign(new Error("Adapter khong ho tro createProfile."), { code: "CAPABILITY_MISSING" });
    }),
  );
  handleOnce(
    "chrome.cloneProfile",
    wrap(async (payload) => {
      if (typeof adapter().cloneProfile === "function") return adapter().cloneProfile(payload || {});
      throw Object.assign(new Error("Adapter khong ho tro cloneProfile."), { code: "CAPABILITY_MISSING" });
    }),
  );
  handleOnce(
    "chrome.pickImages",
    wrap(async () => {
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      const r = await dialog.showOpenDialog(win, {
        title: "Chon anh hoac video",
        properties: ["openFile", "multiSelections"],
        filters: [
          { name: "Anh va video", extensions: ["jpg", "jpeg", "png", "webp", "gif", "mp4", "mov", "webm", "m4v"] },
        ],
      });
      if (r.canceled) return { files: [] };
      const mime = require("./media-upload.cjs").mimeFromExt;
      const files = r.filePaths.map((fp) => ({
        path: fp,
        localPath: fp,
        name: path.basename(fp),
        size: fs.statSync(fp).size,
        mimeType: mime(fp),
      }));
      return { files };
    }),
  );
  handleOnce(
    "chrome.saveMedia",
    wrap(async (payload) => require("./media-upload.cjs").persistBuffer(payload || {})),
  );
  handleOnce(
    "chrome.resolveMedia",
    wrap(async (payload) => {
      const media = require("./media-upload.cjs");
      const service = new media.MediaUploadService();
      const prepared = await service.prepare([payload && payload.source]);
      return { path: prepared.files[0], kind: prepared.kind };
    }),
  );
  handleOnce(
    "chrome.launch",
    wrap(async (payload) => adapter().launchSelected(pickDirectory(payload), { reuse: Boolean(payload && payload.reuse) })),
  );
  handleOnce(
    "chrome.autoConnect",
    wrap(async (payload) =>
      adapter().autoConnect({
        directory: pickDirectory(payload),
        profileId: pickDirectory(payload),
        reuse: payload && payload.reuse !== undefined ? Boolean(payload.reuse) : true,
      }),
    ),
  );
  handleOnce("chrome.observe", wrap(async () => adapter().observe()));
  handleOnce("chrome.goto", wrap(async (payload) => adapter().goto(payload.url)));
  handleOnce("chrome.type", wrap(async (payload) => adapter().typeText(payload.name, payload.text)));
  handleOnce(
    "chrome.upload",
    wrap(async (payload) => {
      const files = Array.isArray(payload && payload.files) ? payload.files : [];
      const media = require("./media-upload.cjs");
      for (const f of files) {
        if (media.looksLikeMediaId(f)) {
          const e = new Error(`Khong upload id noi bo: ${f}. Chon lai anh tu may.`);
          e.code = "NOT_READY";
          throw e;
        }
      }
      return adapter().uploadFiles(files);
    }),
  );
  handleOnce("chrome.click", wrap(async (payload) => adapter().clickNamed(payload.name)));
  handleOnce(
    "chrome.publish",
    wrap(async () => {
      if (typeof adapter().publishPost === "function") return adapter().publishPost();
      return adapter().clickNamed("Đăng");
    }),
  );
  handleOnce("chrome.screenshot", wrap(async () => adapter().screenshotPng()));
  handleOnce("chrome.close", wrap(async () => adapter().closeBrowser()));
  for (const ch of ALLOWLIST) {
    handleOnce(ch, async () => ({
      ok: false,
      error: { code: "NOT_READY", message: "Kenh nay chay tren renderer engine." },
    }));
  }
}

process.on("uncaughtException", (e) => {
  console.error("PMAI uncaught:", e);
});
process.on("unhandledRejection", (e) => {
  console.error("PMAI rejection:", e);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.error("PMAI dang chay o cua so khac (hoac electron.exe zombie giu lock).");
  console.error("Mo Task Manager → dong toan bo electron.exe / PMAI → chay lai npm start.");
  app.quit();
} else {
  app.setName("AI-Social");
  app.setPath("userData", ensureDataDir());
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) forceShow(win);
    else createWindow();
  });
  app
    .whenReady()
    .then(() => {
      ensureDataDir();
      registerIpc();
      createWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch((e) => {
      console.error("PMAI whenReady loi:", e);
    });
  app.on("window-all-closed", () => {
    app.quit();
  });
  app.on("child-process-gone", (_e, details) => {
    if (details && details.type === "GPU") {
      console.error("PMAI: GPU process thoat", details.reason, details.exitCode, "- cua so van mo bang software render.");
    }
  });
}
