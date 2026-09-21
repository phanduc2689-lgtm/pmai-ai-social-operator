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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function acceptLooksImageOnly(accept) {
  const a = String(accept || "").toLowerCase();
  if (!a) return false;
  const hasVideo = /video\/|\.mp4|\.mov|\.webm|\.m4v|\.mkv/.test(a);
  const hasImage = /image\/|\.jpe?g|\.png|\.gif|\.webp|\.tif|\.jfif|\.pjp|\.apng|\.heic|\.heif|\.bmp/.test(a);
  return hasImage && !hasVideo;
}

function acceptLooksVideo(accept) {
  const a = String(accept || "").toLowerCase();
  if (acceptLooksImageOnly(a)) return false;
  if (!a || a === "*/*") return true;
  return /video\/|\.mp4|\.mov|\.webm|\.m4v|\.mkv|\*\/\*/.test(a);
}

/** Prefer a composer input that accepts mp4; never the photo-only picker (tif/jfif/pjp). */
function pickVideoInputIndex(metas) {
  if (!Array.isArray(metas) || !metas.length) return null;
  let best = null;
  let bestScore = 0;
  for (const m of metas) {
    const a = String(m.accept || "").toLowerCase();
    let score = 0;
    if (acceptLooksImageOnly(a)) score = 0;
    else if (/video\/|\.mp4|\.mov|\.webm|\.m4v/.test(a)) score = 3;
    else if (!a || a === "*/*") score = 2;
    else if (/video/.test(a)) score = 3;
    else score = 1;
    if (score > bestScore) {
      bestScore = score;
      best = typeof m.index === "number" ? m.index : metas.indexOf(m);
    }
  }
  return bestScore > 0 ? best : null;
}

async function listFileInputs(page, dialogOnly) {
  return page.evaluate((dialogOnlyInner) => {
    const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')];
    const scope = dialogOnlyInner && dialogs.length ? dialogs[dialogs.length - 1] : document;
    return [...scope.querySelectorAll('input[type="file"]')].map((el, index) => ({
      index,
      accept: el.getAttribute("accept") || "",
    }));
  }, Boolean(dialogOnly));
}

function fileInputLocator(page, index, dialogOnly) {
  const root = dialogOnly
    ? page.locator('[role="dialog"], [aria-modal="true"]').last()
    : page;
  return root.locator('input[type="file"]').nth(index);
}

async function waitForVideoAttached(page, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 90000);
  const dialog = page.locator('[role="dialog"], [aria-modal="true"]').last();
  let sawUpload = false;
  while (Date.now() < deadline) {
    if (typeof hasComposerMediaPreview === "function") {
      try {
        if (await hasComposerMediaPreview(page)) return;
      } catch {
        /* preview helper not ready */
      }
    }
    const videoEl = await dialog.locator("video").first().isVisible().catch(() => false);
    if (videoEl) return;
    const processing = await dialog
      .getByText(/đang tải|uploading|đang xử lý|processing|đang đăng video|upload in progress/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (processing) sawUpload = true;
    const bar = await dialog.locator('[role="progressbar"]').first().isVisible().catch(() => false);
    if (bar) sawUpload = true;
    const remove = await dialog
      .locator('[aria-label*="Gỡ" i], [aria-label*="Remove" i], [aria-label*="Xóa video" i], [aria-label*="Remove video" i]')
      .first()
      .isVisible()
      .catch(() => false);
    if (remove) return;
    const videoAria = await dialog.locator('[aria-label*="Video" i], [aria-label*="video" i]').first().isVisible().catch(() => false);
    if (videoAria && sawUpload) return;
    if (sawUpload && !processing && !bar) {
      await sleep(1500);
      const stillBusy = await dialog
        .getByText(/đang tải|uploading|đang xử lý|processing/i)
        .first()
        .isVisible()
        .catch(() => false);
      if (!stillBusy) return;
    }
    await sleep(400);
  }
  if (sawUpload) return;
  throw err(
    "NOT_READY",
    "Video chưa gắn vào composer (không thấy player / đang tải). Không đăng bài chỉ có caption. Đóng hộp Open Windows nếu đang mở.",
  );
}

function clickComposerMediaToolbar(wantVideo) {
  const skip = /gắn thẻ|tag people|cảm xúc|feeling|check.?in|gif|live|phát trực tiếp|sticker|camera roll/i;
  const labeled = [...document.querySelectorAll("[aria-label]")];
  const hits = [];
  for (const el of labeled) {
    const aria = String(el.getAttribute("aria-label") || "").trim();
    if (!aria || skip.test(aria)) continue;
    let score = 0;
    if (/ảnh\s*\/\s*video|photo\s*\/\s*video/i.test(aria)) score = 20;
    else if (/^ảnh$|^photos?$|^photo$/i.test(aria)) score = 15;
    else if (wantVideo && /^video$/i.test(aria)) score = 24;
    else if (wantVideo && /video/i.test(aria) && !/ảnh|photo/i.test(aria)) score = 18;
    if (!score) continue;
    if (el.closest('[role="dialog"], [aria-modal="true"]')) score += 6;
    const r = el.getBoundingClientRect();
    if (r.width < 8 && r.height < 8) {
      const p = el.closest('[role="button"], button, [tabindex="0"]');
      if (p) {
        hits.push({ el: p, score, aria });
        continue;
      }
    }
    hits.push({ el, score, aria });
  }
  hits.sort((a, b) => b.score - a.score);
  if (hits[0]) {
    const node = hits[0].el.closest('[role="button"], button, [tabindex="0"]') || hits[0].el;
    node.click();
    return { ok: true, label: hits[0].aria };
  }

  const addEl = [...document.querySelectorAll("span,div,h3,h4")].find((el) => {
    const t = String(el.innerText || "").replace(/\s+/g, " ").trim();
    return /thêm vào bài viết của bạn|add to your post/i.test(t) && t.length < 80;
  });
  if (addEl) {
    let row = addEl.parentElement;
    for (let i = 0; i < 8 && row; i++) {
      const btns = [...row.querySelectorAll('[role="button"], [tabindex="0"], button')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width >= 16 && r.width <= 96 && r.height >= 16 && r.height <= 96;
      });
      if (btns.length) {
        const chosen = wantVideo
          ? btns.find((b) => /video/i.test(b.getAttribute("aria-label") || "")) || btns[0]
          : btns[0];
        chosen.click();
        return { ok: true, label: "add-to-post-icon" };
      }
      row = row.parentElement;
    }
  }
  return { ok: false };
}

async function clickMediaToolbar(page, wantVideo) {
  const frames = typeof page.frames === "function" ? page.frames() : [page];
  for (const frame of frames) {
    try {
      const viaEval = await frame.evaluate(clickComposerMediaToolbar, Boolean(wantVideo));
      if (viaEval && viaEval.ok) return true;
    } catch {
      /* cross-origin */
    }
  }
  const roots = [page.locator('[role="dialog"], [aria-modal="true"]').last(), page];
  const names = wantVideo
    ? [
        '[aria-label="Video" i]',
        '[aria-label="Ảnh/video" i]',
        '[aria-label="Photo/video" i]',
        '[aria-label*="Ảnh/video" i]',
        '[aria-label*="Photo/video" i]',
        '[aria-label*="Video" i]',
      ]
    : [
        '[aria-label="Ảnh/video" i]',
        '[aria-label="Photo/video" i]',
        '[aria-label*="Ảnh/video" i]',
        '[aria-label*="Photo/video" i]',
        '[aria-label="Ảnh" i]',
        '[aria-label="Photo" i]',
      ];
  for (const root of roots) {
    for (const sel of names) {
      const loc = root.locator(sel).first();
      try {
        if (await loc.isVisible({ timeout: 350 })) {
          await loc.click({ timeout: 2500, force: true });
          return true;
        }
      } catch {
        /* next */
      }
    }
  }
  const byRole = page.getByRole("button", { name: /ảnh\/video|photo\/video|^ảnh$|^photo$|^video$/i }).first();
  try {
    if (await byRole.isVisible({ timeout: 400 })) {
      await byRole.click({ timeout: 2500, force: true });
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function scoreInputForKind(accept, kind) {
  const a = String(accept || "").toLowerCase();
  if (kind === "video") {
    if (/video\/|\.mp4|\.mov|\.webm|\.m4v/.test(a)) return 10;
    if (!a || a === "*/*") return 8;
    if (acceptLooksImageOnly(a)) return 3;
    return 2;
  }
  if (acceptLooksImageOnly(a) || /image\//.test(a)) return 10;
  if (!a || a === "*/*") return 8;
  if (/video\//.test(a) && !/image\//.test(a)) return 1;
  return 2;
}

function pickLastMatching(metas, picker) {
  if (!Array.isArray(metas) || !metas.length) return null;
  let best = null;
  let bestScore = 0;
  for (const m of metas) {
    const score = scoreInputForKind(m.accept, picker);
    if (score > 0 && score >= bestScore) {
      bestScore = score;
      best = typeof m.index === "number" ? m.index : metas.indexOf(m);
    }
  }
  return best;
}

function pickBestMeta(metas, kind) {
  if (!Array.isArray(metas) || !metas.length) return null;
  let best = null;
  let bestScore = 0;
  for (const m of metas) {
    const score = scoreInputForKind(m.accept, kind);
    if (score > 0 && score >= bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

async function listAllFileInputs(page) {
  const frames = typeof page.frames === "function" ? page.frames() : [page];
  const out = [];
  for (let f = 0; f < frames.length; f++) {
    try {
      const metas = await frames[f].evaluate(() =>
        [...document.querySelectorAll('input[type="file"]')].map((el, index) => ({
          index,
          accept: el.getAttribute("accept") || "",
        })),
      );
      for (const m of metas) out.push({ ...m, frame: f });
    } catch {
      /* cross-origin */
    }
  }
  return out;
}

async function setInputFilesAt(page, meta, files) {
  const frames = typeof page.frames === "function" ? page.frames() : [page];
  const root = frames[meta.frame] || page;
  await root.locator('input[type="file"]').nth(meta.index).setInputFiles(files, { timeout: 8000 });
}

async function attachViaChooserOrInput(page, files, kind) {
  const trySet = async (preferNew, before) => {
    const metas = await listAllFileInputs(page);
    const pool = preferNew && before && metas.length > before.length ? metas.slice(before.length) : metas;
    const best = pickBestMeta(pool, kind) || pickBestMeta(metas, kind);
    if (!best) return false;
    await setInputFilesAt(page, best, files);
    return true;
  };

  const before = await listAllFileInputs(page);
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 6000 }).catch(() => null);
  const clicked = await clickMediaToolbar(page, kind === "video");
  const chooser = await chooserPromise;
  if (chooser) {
    await chooser.setFiles(files);
    return { via: "filechooser", clicked };
  }

  await sleep(400);
  if (await trySet(true, before)) return { via: "new-or-best-input", clicked };

  const last = page.locator('input[type="file"]').last();
  if ((await last.count().catch(() => 0)) > 0) {
    await last.setInputFiles(files, { timeout: 8000 });
    return { via: "page-last-input", clicked };
  }

  throw err(
    "UI_CHANGED",
    kind === "video"
      ? "Không gắn được video vào composer. Đóng hộp Open Windows nếu đang mở, giữ modal Tạo bài viết rồi duyệt lại."
      : "Không gắn được ảnh vào composer. Đóng hộp Open Windows nếu đang mở, giữ modal Tạo bài viết rồi duyệt lại.",
  );
}

async function attachVideoOnPage(page, files) {
  for (const f of files) {
    if (looksLikeMediaId(f)) throw err("NOT_READY", `Khong setInputFiles id ${f}`);
    if (detectKind(f) !== "video") {
      throw err("SCHEMA_INVALID", `attachVideo nhan file khong phai video: ${f}`);
    }
  }
  await attachViaChooserOrInput(page, files, "video");
  await waitForVideoAttached(page);
}

function pickImageInputIndex(metas) {
  if (!Array.isArray(metas) || !metas.length) return null;
  let best = null;
  let bestScore = 0;
  for (const m of metas) {
    const a = String(m.accept || "").toLowerCase();
    const videoOnly = /video\/|\.mp4|\.mov|\.webm|\.m4v/.test(a) && !/image\/|\.jpe?g|\.png|\.gif|\.webp|\.tif|\.heic/.test(a) && a.length > 0;
    let score = 0;
    if (videoOnly) score = 0;
    else if (acceptLooksImageOnly(a)) score = 4;
    else if (/image\//.test(a)) score = 3;
    else if (!a || a === "*/*") score = 2;
    else score = 1;
    if (score > bestScore) {
      bestScore = score;
      best = typeof m.index === "number" ? m.index : metas.indexOf(m);
    }
  }
  return bestScore > 0 ? best : null;
}

/** True when composer shows an attached photo/video, ignoring 32–48px avatars. */
function inspectComposerMediaPreview() {
  const roots = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], [role="sheet"]')];
  const heading = [...document.querySelectorAll("h1,h2,h3,h4,[role='heading']")].find((el) => {
    const n = String(el.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    return (
      n === "Tạo bài viết" ||
      n === "Create post" ||
      n === "Create a post" ||
      n === "Cài đặt bài viết" ||
      n === "Post settings"
    );
  });
  let scope = roots.length ? roots[roots.length - 1] : document.body;
  if (heading) {
    let p = heading.parentElement;
    while (p && p !== document.documentElement) {
      if (p.querySelector && p.querySelector("img, video, [contenteditable='true']")) {
        scope = p;
        break;
      }
      p = p.parentElement;
    }
  }

  const avatarish = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 72 || r.height < 72) return true;
    const label = String(el.getAttribute("alt") || el.getAttribute("aria-label") || "").toLowerCase();
    return /avatar|profile picture|ảnh đại diện|user profile/.test(label);
  };

  for (const el of scope.querySelectorAll("img, video")) {
    if (avatarish(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 72 && r.height >= 72 && r.bottom > 0 && r.top < innerHeight) return true;
  }
  for (const el of scope.querySelectorAll("[aria-label]")) {
    if (/gỡ|remove photo|remove video|xóa ảnh|xóa video|remove attachment/i.test(el.getAttribute("aria-label") || "")) {
      const r = el.getBoundingClientRect();
      if (r.width > 8 && r.height > 8) return true;
    }
  }
  for (const el of scope.querySelectorAll("div")) {
    const bg = window.getComputedStyle(el).backgroundImage || "";
    if (!/url\(/.test(bg)) continue;
    if (!/blob:|fbcdn|scontent/i.test(bg)) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 120 && r.height >= 80) return true;
  }
  return false;
}

async function hasComposerMediaPreview(page) {
  try {
    return Boolean(await page.evaluate(inspectComposerMediaPreview));
  } catch {
    return false;
  }
}

async function waitForImageAttached(page, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 25000);
  while (Date.now() < deadline) {
    if (await hasComposerMediaPreview(page)) return;
    const processing = await page
      .locator('[role="dialog"], [aria-modal="true"]')
      .getByText(/đang tải|uploading|đang xử lý|processing/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (processing) {
      await sleep(400);
      continue;
    }
    await sleep(350);
  }
  throw err(
    "NOT_READY",
    "Chưa thấy ảnh trong composer (bỏ qua avatar). Không đăng bài chỉ có chữ. Bấm «Ảnh/video» trong modal Tạo bài viết.",
  );
}

async function clickPhotoOpener(page) {
  return clickMediaToolbar(page, false);
}

async function attachImagesOnPage(page, files) {
  if (!files.length) return;
  for (const f of files) {
    if (looksLikeMediaId(f)) throw err("NOT_READY", `Khong setInputFiles id ${f}`);
    if (detectKind(f) === "video") {
      throw err("SCHEMA_INVALID", `attachImages nhan file video: ${f}`);
    }
  }
  await attachViaChooserOrInput(page, files, "image");
  await waitForImageAttached(page);
}

async function attachFilesOnPage(page, files, kind) {
  if (!files.length) return;
  if (kind === "video") return attachVideoOnPage(page, files);
  return attachImagesOnPage(page, files);
}

async function uploadToFacebook(page, filePaths) {
  const service = new MediaUploadService();
  const prepared = await service.prepare(filePaths);
  try {
    await attachFilesOnPage(page, prepared.files, prepared.kind);
    return prepared;
  } finally {
    if (prepared.kind !== "video") {
      await sleep(1200);
      await service.cleanup();
    }
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
  acceptLooksImageOnly,
  acceptLooksVideo,
  pickVideoInputIndex,
  pickImageInputIndex,
  inspectComposerMediaPreview,
  hasComposerMediaPreview,
  waitForImageAttached,
  clickComposerMediaToolbar,
  pickLastMatching,
  pickBestMeta,
  scoreInputForKind,
};
