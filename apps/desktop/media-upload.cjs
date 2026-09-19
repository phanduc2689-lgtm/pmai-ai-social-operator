"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { fileURLToPath } = require("node:url");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);

function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function detectKind(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  throw err("SCHEMA_INVALID", `\u0110\u1ecbnh d\u1ea1ng kh\u00f4ng h\u1ed7 tr\u1ee3: ${ext || "(kh\u00f4ng c\u00f3 \u0111u\u00f4i)"}`);
}

function projectMediaRoot() {
  return path.join(__dirname, "..", "..", ".pmai", "media-cache");
}

async function resolveSource(source) {
  const raw = String(source || "").trim();
  if (!raw) throw err("SCHEMA_INVALID", "Thi\u1ebfu \u0111\u01b0\u1eddng d\u1eabn / URL media.");
  if (/^https?:\/\//i.test(raw)) return { kind: "url", value: raw };
  if (/^file:\/\//i.test(raw)) return { kind: "local", value: fileURLToPath(raw) };
  return { kind: "local", value: raw };
}

async function validateLocalFile(filePath) {
  try {
    await fsp.access(filePath, fs.constants.R_OK);
  } catch {
    throw err("NOT_READY", `Kh\u00f4ng \u0111\u1ecdc \u0111\u01b0\u1ee3c file: ${filePath}`);
  }
  const st = await fsp.stat(filePath);
  if (!st.isFile()) throw err("SCHEMA_INVALID", `Kh\u00f4ng ph\u1ea3i file: ${filePath}`);
  if (st.size <= 0) throw err("SCHEMA_INVALID", `File r\u1ed7ng: ${filePath}`);
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

async function downloadUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw err("NOT_READY", `T\u1ea3i media th\u1ea5t b\u1ea1i: ${response.status} ${url}`);
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
  const filePath = path.join(dir, `${crypto.randomUUID()}${ext}`);
  await fsp.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  detectKind(filePath);
  return filePath;
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
      const raw = typeof item === "string" ? item : item?.localPath || item?.path || item?.url || "";
      const resolved = await resolveSource(raw);
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
      throw err("SCHEMA_INVALID", "MVP1 kh\u00f4ng \u0111\u0103ng l\u1eabn \u1ea3nh v\u00e0 video trong m\u1ed9t b\u00e0i.");
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
  const inputs = page.locator('input[type="file"]');
  if ((await inputs.count()) === 0) {
    const openers = [
      page.getByRole("button", { name: /\u1ea3nh\/video|photo\/video|th\u00eam \u1ea3nh|add photo/i }).first(),
      page.getByText(/\u1ea3nh\/video|photo\/video|th\u00eam \u1ea3nh\/video/i).first(),
      page.locator('[aria-label*="\u1ea2nh" i], [aria-label*="Photo" i], [aria-label*="photo" i]').first(),
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
    throw err("UI_CHANGED", "Facebook ch\u01b0a render input[type=file]. \u0110\u00f3ng h\u1ed9p Open n\u1ebfu \u0111ang m\u1edf.");
  }
  await input.setInputFiles(files);
  const preview = page.locator('[role="dialog"] img, [aria-modal="true"] img').first();
  try {
    await preview.waitFor({ state: "visible", timeout: 15000 });
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
  validateLocalFile,
  downloadUrl,
  detectKind,
};
