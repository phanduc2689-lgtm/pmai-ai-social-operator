"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { fileURLToPath } = require("node:url");
const os = require("node:os");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function looksLikeMediaId(value) {
  const base = String(value || "")
    .replace(/^.*[/\\]/, "")
    .trim();
  return /^med_[a-z0-9]+$/i.test(base);
}

function detectKind(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  throw err("SCHEMA_INVALID", `Dinh dang khong ho tro: ${ext || "(khong duoi)"}`);
}

function mimeFromExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".m4v": "video/mp4",
  };
  return map[ext] || "application/octet-stream";
}

function projectMediaRoot() {
  try {
    const { app } = require("electron");
    return path.join(app.getPath("userData"), "media");
  } catch {
    return path.join(os.homedir(), "AI-Social", "media");
  }
}

function resolveMediaSource(source) {
  const raw = String(source || "").trim();
  if (!raw) throw err("SCHEMA_INVALID", "Thieu duong dan / URL media.");
  if (looksLikeMediaId(raw)) {
    throw err("NOT_READY", `Day la id noi bo (${raw}), khong phai file. Chon lai anh tu may.`);
  }
  if (/^https?:\/\//i.test(raw)) return { kind: "url", value: raw };
  if (/^file:\/\//i.test(raw)) return { kind: "local", value: fileURLToPath(raw) };
  return { kind: "local", value: raw };
}

async function resolveSource(source) {
  return resolveMediaSource(source);
}

async function validateLocalFile(filePath) {
  if (looksLikeMediaId(filePath)) {
    throw err("NOT_READY", `Khong stat id noi bo: ${filePath}. Chon lai file.`);
  }
  try {
    await fsp.access(filePath, fs.constants.R_OK);
  } catch {
    throw err("NOT_READY", `Khong doc duoc file: ${filePath}`);
  }
  const st = await fsp.stat(filePath);
  if (!st.isFile()) throw err("SCHEMA_INVALID", `Khong phai file: ${filePath}`);
  if (st.size <= 0) throw err("SCHEMA_INVALID", `File rong: ${filePath}`);
  detectKind(filePath);
  return filePath;
}

function extFromContentType(contentType) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("jpeg")) return ".jpg";
  if (ct.includes("png")) return ".png";
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("gif")) return ".gif";
  if (ct.includes("mp4")) return ".mp4";
  if (ct.includes("quicktime") || ct.includes("mov")) return ".mov";
  if (ct.includes("webm")) return ".webm";
  return "";
}

function safeName(name) {
  return String(name || "media.bin").replace(/[<>:"/\\|?*\u0000]/g, "_");
}

async function downloadUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw err("NOT_READY", `Tai media that bai: ${response.status} ${url}`);
  let ext = extFromContentType(response.headers.get("content-type"));
  if (!ext) {
    try {
      ext = path.extname(new URL(url).pathname) || ".bin";
    } catch {
      ext = ".bin";
    }
  }
  const dir = projectMediaRoot();
  await fsp.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  await fsp.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  detectKind(filePath);
  return filePath;
}

async function persistBuffer({ name, mimeType, base64 }) {
  if (!base64) throw err("SCHEMA_INVALID", "Thieu noi dung file.");
  const dir = projectMediaRoot();
  await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${Date.now()}-${safeName(name)}`);
  await fsp.writeFile(dest, Buffer.from(base64, "base64"));
  const st = await fsp.stat(dest);
  detectKind(dest);
  return { path: dest, name: path.basename(dest), size: st.size, mimeType: mimeType || mimeFromExt(dest) };
}

class MediaUploadService {
  constructor() {
    this.tempFiles = [];
  }

  async prepare(sources) {
    const list = Array.isArray(sources) ? sources : [sources];
    const files = [];
    const kinds = [];
    for (const item of list) {
      const raw = typeof item === "string" ? item : item?.localPath || item?.path || item?.url || item?.sourceUrl || "";
      if (looksLikeMediaId(raw)) {
        throw err("NOT_READY", `Khong upload id ${raw}. Can path Windows hoac URL.`);
      }
      const resolved = resolveMediaSource(raw);
      let filePath;
      if (resolved.kind === "url") {
        filePath = await downloadUrl(resolved.value);
        this.tempFiles.push(filePath);
      } else {
        filePath = await validateLocalFile(resolved.value);
      }
      files.push(filePath);
      kinds.push(detectKind(filePath));
    }
    if (kinds.includes("image") && kinds.includes("video")) {
      throw err("SCHEMA_INVALID", "MVP1 khong dang lan anh va video trong mot bai.");
    }
    return { files, kind: kinds.includes("video") ? "video" : "image" };
  }

  async cleanup() {
    for (const fp of this.tempFiles) await fsp.unlink(fp).catch(() => {});
    this.tempFiles = [];
  }
}

async function attachFilesOnPage(page, files) {
  if (!files.length) return;
  for (const f of files) {
    if (looksLikeMediaId(f)) throw err("NOT_READY", `Khong setInputFiles id ${f}`);
  }
  const inputs = page.locator('input[type="file"]');
  if ((await inputs.count()) === 0) {
    const openers = [
      page.getByRole("button", { name: /ảnh\/video|photo\/video|thêm ảnh|add photo/i }).first(),
      page.getByText(/ảnh\/video|photo\/video|thêm ảnh\/video/i).first(),
      page.locator('[aria-label*="Ảnh" i], [aria-label*="Photo" i], [aria-label*="photo" i]').first(),
    ];
    for (const loc of openers) {
      try {
        if (await loc.isVisible({ timeout: 1200 })) {
          await loc.click({ timeout: 3000, force: true });
          break;
        }
      } catch {
        /* next */
      }
    }
  }
  const input = page.locator('input[type="file"]').last();
  try {
    await input.waitFor({ state: "attached", timeout: 12000 });
  } catch {
    throw err("UI_CHANGED", "Facebook chua render input[type=file]. Dong hop Open neu dang mo.");
  }
  await input.setInputFiles(files);
  const preview = page.locator('[role="dialog"] img, [aria-modal="true"] img, [role="dialog"] video').first();
  try {
    await preview.waitFor({ state: "visible", timeout: 20000 });
  } catch {
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function uploadToFacebook(page, filePaths) {
  const service = new MediaUploadService();
  const prepared = await service.prepare(filePaths);
  try {
    await attachFilesOnPage(page, prepared.files);
    return prepared;
  } finally {
    await new Promise((r) => setTimeout(r, 1200));
    await service.cleanup();
  }
}

module.exports = {
  MediaUploadService,
  uploadToFacebook,
  attachFilesOnPage,
  resolveSource,
  resolveMediaSource,
  validateLocalFile,
  downloadUrl,
  persistBuffer,
  detectKind,
  mimeFromExt,
  looksLikeMediaId,
};
