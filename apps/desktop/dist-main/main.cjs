"use strict";

const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const crypto = require("node:crypto");
const path = require("node:path");

// Windows GPU ACCESS_VIOLATION 0xC0000005 / -1073741819.
// Must run before app.ready. SwiftShader paints if the hardware GPU dies.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("disable-direct-composition");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion,HardwareMediaKeyHandling");
app.commandLine.appendSwitch("use-angle", "swiftshader");
app.commandLine.appendSwitch("use-gl", "angle");
console.log("PMAI v1.0.0 boot gpu-swiftshader");

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
const handlers = new Map();
const bridge = { port: 0, token: "", keepAlive: false };

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
  handlers.set(channel, fn);
  try {
    ipcMain.removeHandler(channel);
  } catch {
    /* ignore */
  }
  ipcMain.handle(channel, fn);
}

async function dispatchInvoke(channel, payload) {
  const fn = handlers.get(channel);
  if (!fn) {
    return { ok: false, error: { code: "NOT_READY", message: `Kenh ${channel} khong co.` } };
  }
  return fn({}, payload);
}

function startBridge() {
  bridge.token = crypto.randomBytes(16).toString("hex");
  const server = http.createServer(async (req, res) => {
    const origin = String(req.headers.origin || "");
    if (origin.startsWith("http://127.0.0.1:") || origin.startsWith("http://localhost:")) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
      res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:5174");
    }
    res.setHeader("Access-Control-Allow-Headers", "content-type, x-pmai-token");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const urlPath = String(req.url || "").split("?")[0];
    if (req.method === "GET" && (urlPath === "/" || urlPath === "/pmai/health")) {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("PMAI host ok");
      return;
    }
    if (req.method !== "POST" || urlPath !== "/pmai/invoke") {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.headers["x-pmai-token"] !== bridge.token) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: { code: "NOT_READY", message: "token sai" } }));
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      body = {};
    }
    try {
      const result = await dispatchInvoke(body.channel, body.payload);
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: false,
          error: {
            code: e && e.code ? e.code : "NOT_READY",
            message: e instanceof Error ? e.message : String(e),
          },
        }),
      );
    }
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      bridge.port = addr && typeof addr === "object" ? addr.port : 0;
      console.log("PMAI host IPC 127.0.0.1:" + bridge.port);
      resolve(bridge);
    });
  });
}

function rendererUrl() {
  const dev = process.env.PMAI_RENDERER_URL || "http://127.0.0.1:5174";
  const u = new URL(dev.includes("://") ? dev : `http://127.0.0.1:5174`);
  if (bridge.port) u.searchParams.set("pmaiPort", String(bridge.port));
  if (bridge.token) u.searchParams.set("pmaiToken", bridge.token);
  return u.toString();
}

async function openBrowserFallback() {
  bridge.keepAlive = true;
  const url = rendererUrl();
  console.log("PMAI: GPU Windows khong ve cua so Electron. Mo trinh duyet...");
  try {
    await shell.openExternal(url);
  } catch (e) {
    console.error("PMAI: khong mo duoc trinh duyet", e);
    console.error("Mo thu cong:", url.replace(bridge.token, "***"));
  }
  try {
    await dialog.showMessageBox({
      type: "info",
      title: "PMAI",
      message: "Cua so Electron bi GPU Windows chan. PMAI da mo tren trinh duyet.",
      detail: "Giu cua so terminal (npm start) mo. Khong dong no khi dang dang bai.",
      buttons: ["OK"],
    });
  } catch {
    /* ignore */
  }
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
  setTimeout(() => forceShow(win), 400);
  setTimeout(() => forceShow(win), 1500);
  setTimeout(() => forceShow(win), 4000);
  const devUrl = process.env.PMAI_RENDERER_URL;
  const loadPackaged = () => {
    if (!fs.existsSync(indexHtml)) return false;
    console.log("PMAI: load file", indexHtml);
    void win.loadFile(indexHtml);
    return true;
  };
  if (devUrl) {
    const url = rendererUrl();
    console.log("PMAI: load", url.replace(bridge.token, "***"));
    void win.loadURL(url);
    setTimeout(() => {
      if (win.isDestroyed() || fallbackUsed) return;
      win.webContents
        .executeJavaScript("document.body && document.body.innerText.length > 0")
        .then((ok) => {
          if (!ok && !fallbackUsed) {
            fallbackUsed = true;
            loadPackaged();
          }
        })
        .catch(() => {
          if (!fallbackUsed) {
            fallbackUsed = true;
            loadPackaged();
          }
        });
    }, 5000);
  } else if (!loadPackaged()) {
    console.error("PMAI: khong co dist-renderer/index.html");
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
  app.on("child-process-gone", (_e, details) => {
    console.error("PMAI: process thoat", details && details.type, details && details.reason, details && details.exitCode);
    forceShow(BrowserWindow.getAllWindows()[0]);
  });
  app
    .whenReady()
    .then(async () => {
      ensureDataDir();
      registerIpc();
      await startBridge();
      createWindow();
      setTimeout(async () => {
        const win = BrowserWindow.getAllWindows()[0];
        let painted = false;
        if (win && !win.isDestroyed()) {
          try {
            painted = await win.webContents.executeJavaScript(
              "!!(document.body && document.body.innerText && document.body.innerText.length > 8)",
            );
          } catch {
            painted = false;
          }
        }
        if (!painted) {
          await openBrowserFallback();
        } else {
          console.log("PMAI: cua so Electron ve OK.");
        }
      }, 3500);
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch((e) => {
      console.error("PMAI whenReady loi:", e);
    });
  app.on("window-all-closed", () => {
    if (bridge.keepAlive) {
      console.log("PMAI host van chay cho trinh duyet. Ctrl+C de thoat.");
      return;
    }
    app.quit();
  });
}
