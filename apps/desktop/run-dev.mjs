#!/usr/bin/env node
/**
 * Windows Node 20+/24: spawn("npx.cmd") throws EINVAL (CVE-2024-27980).
 * Launch Vite with `node vite/bin/vite.js` and Electron with the real binary.
 * Node 24 mis-parses ESM when the folder path contains spaces.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 5174;
const DEV_URL = `http://127.0.0.1:${PORT}`;
const ELECTRON_ARGS = [
  "--disable-gpu",
  "--disable-gpu-compositing",
  "--disable-gpu-sandbox",
  "--disable-direct-composition",
  "--disable-features=CalculateNativeWinOcclusion,HardwareMediaKeyHandling",
  "--use-angle=swiftshader",
  ".",
];

function mustExist(file, hint) {
  if (!fs.existsSync(file)) {
    console.error(`Thieu: ${file}`);
    console.error(hint || "Chay: npm install");
    process.exit(1);
  }
  return file;
}

function run(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_DISABLE_COMPILE_CACHE: "1", ...extraEnv },
    windowsHide: false,
    shell: false,
  });
  child.on("error", (err) => {
    console.error(`Khong chay duoc ${path.basename(String(command))}:`, err.message);
    process.exit(1);
  });
  return child;
}

function waitPort(port, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.connect({ port, host: "127.0.0.1" }, () => {
        sock.end();
        resolve(undefined);
      });
      sock.on("error", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error("Vite chua san sang (het 60s)."));
        else setTimeout(tryOnce, 400);
      });
    };
    tryOnce();
  });
}

function waitHttp(url, timeoutMs = 45000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve(undefined);
          return;
        }
        retry();
      });
      req.on("error", retry);
      req.setTimeout(1500, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) reject(new Error("Vite chua tra trang (het thoi gian cho)."));
      else setTimeout(tryOnce, 300);
    };
    tryOnce();
  });
}

function electronBinary() {
  try {
    const p = require("electron");
    if (typeof p === "string" && fs.existsSync(p)) return p;
  } catch {
    /* path.txt missing in this environment */
  }
  return null;
}

function driveForSpacedPath(dir) {
  if (process.platform !== "win32" || !/\s/.test(dir) || process.env.PMAI_RESPAWNED === "1") return null;
  for (const letter of ["P", "Q", "R", "S", "T"]) {
    const drive = `${letter}:\\`;
    try {
      execFileSync("subst", [`${letter}:`, dir], { stdio: "ignore" });
    } catch {
      continue;
    }
    if (fs.existsSync(path.join(drive, "package.json"))) return drive;
    try {
      execFileSync("subst", [`${letter}:`, "/d"], { stdio: "ignore" });
    } catch {
      /* ignore */
    }
  }
  return null;
}

const jumped = driveForSpacedPath(root);
if (jumped) {
  console.log("Duong dan co dau cach. Node 24 doc sai file JS. Chay lai tu", jumped);
  const child = spawn(process.execPath, [path.join(jumped, "apps", "desktop", "run-dev.mjs")], {
    cwd: jumped,
    stdio: "inherit",
    env: { ...process.env, PMAI_RESPAWNED: "1", NODE_DISABLE_COMPILE_CACHE: "1" },
    windowsHide: false,
    shell: false,
  });
  child.on("error", (err) => {
    console.error("Khong chay duoc tu o dia ao:", err.message);
    process.exit(1);
  });
  child.on("exit", (code) => process.exit(code ?? 1));
} else {
  await start();
}

async function start() {
  mustExist(path.join(root, "package.json"), "Chay CAI-DAT-WINDOWS.bat trong thu muc repo (co package.json).");
  const rolldown = path.join(root, "node_modules", "rolldown", "dist", "parse-ast-index.mjs");
  if (fs.existsSync(rolldown)) {
    const head = fs.readFileSync(rolldown, "utf8").slice(0, 240);
    if (!/import |export |use strict/.test(head)) {
      console.error("node_modules\\rolldown bi hong (khong phai file JavaScript).");
      console.error("Xoa thu muc node_modules roi chay lai CAI-DAT-WINDOWS.bat.");
      process.exit(1);
    }
  }
  const viteJs = mustExist(path.join(root, "node_modules", "vite", "bin", "vite.js"), "Chay: npm install");
  const viteConfig = mustExist(path.join(root, "apps", "desktop", "vite.config.ts"));
  const electronCli = path.join(root, "node_modules", "electron", "cli.js");
  mustExist(electronCli, "Chay: npm install");
  const mainCjs = mustExist(path.join(root, "apps", "desktop", "dist-main", "main.cjs"));

  let version = "dev";
  try {
    version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version || version;
  } catch {
    /* keep dev */
  }
  console.log(`PMAI v${version} — thu muc:`, root);
  console.log("PMAI boot gpu-swiftshader");
  if (/\s/.test(root)) {
    console.error("Duong dan van con dau cach. Doi thu muc sang F:\\pmai roi chay lai.");
  }
  if (!fs.readFileSync(mainCjs, "utf8").includes("disableHardwareAcceleration")) {
    console.error("BAN MAIN.CJS CU — cua so se khong hien. Tai lai repo tu GitHub (khong dung ZIP cu).");
  }
  if (!fs.existsSync(path.join(root, ".git"))) {
    console.error("Thu muc nay khong co .git — co the la ZIP cu. Tai: https://github.com/phanduc2689-lgtm/pmai-ai-social-operator");
  }

  const vite = run(process.execPath, [viteJs, "--config", viteConfig, "--host", "127.0.0.1", "--port", String(PORT)], {
    VITE_CONFIG_NATIVE_IGNORE_WARNING: "true",
  });
  vite.on("exit", (code) => {
    if (code) {
      console.error("Vite thoat ma", code);
      process.exit(code);
    }
  });

  try {
    await waitPort(PORT);
    await waitHttp(DEV_URL);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    vite.kill();
    process.exit(1);
  }

  console.log("PMAI: mo Electron (tat GPU, tranh crash Windows 0xC0000005)...");
  const exe = electronBinary();
  const electron = exe
    ? run(exe, ELECTRON_ARGS, { PMAI_RENDERER_URL: DEV_URL, VITE_CONFIG_NATIVE_IGNORE_WARNING: "true" })
    : run(process.execPath, [electronCli, ...ELECTRON_ARGS], {
        PMAI_RENDERER_URL: DEV_URL,
        VITE_CONFIG_NATIVE_IGNORE_WARNING: "true",
      });

  function shutdown() {
    try {
      electron.kill();
    } catch {
      /* ignore */
    }
    try {
      vite.kill();
    } catch {
      /* ignore */
    }
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  electron.on("exit", (code) => {
    if (code === 0) {
      console.log("PMAI: Electron da thoat.");
      console.log("Neu cua so khong hien: Task Manager → dong electron.exe / PMAI → npm start lai.");
    } else {
      console.error("PMAI: Electron thoat ma", code);
    }
    vite.kill();
    process.exit(code ?? 0);
  });
}
