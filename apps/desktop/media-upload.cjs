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
  const headingRe = /^(Tạo bài viết|Create post|Create a post)$/i;
  const headings = [...document.querySelectorAll("h1,h2,h3,h4,[role='heading']")];
  const heading = headings.find((el) => headingRe.test(String(el.textContent || "").replace(/\s+/g, " ").trim()));
  let scope = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].at(-1) || document.body;
  if (heading) {
    let p = heading.parentElement;
    while (p && p !== document.documentElement) {
      const r = p.getBoundingClientRect();
      if (r.height > 180 && r.width > 180) {
        scope = p;
        break;
      }
      p = p.parentElement;
    }
  }

  const photoRe = /ảnh\/video|photo\/video|photos?\/videos?|add photo|thêm ảnh|photo and video/i;
  const videoRe = /tải video|upload video|add video|^video$/i;
  const skip = /gắn thẻ|tag people|cảm xúc|feeling|check.?in|gif|live|phát trực tiếp|camera|sticker/i;

  const clickables = [...scope.querySelectorAll('[aria-label], [role="button"], [tabindex="0"]')];
  let best = null;
  let bestScore = 0;
  for (const el of clickables) {
    const r = el.getBoundingClientRect();
    if (r.width < 16 || r.height < 16 || r.bottom < 0 || r.top > innerHeight) continue;
    const aria = el.getAttribute("aria-label") || "";
    const text = String(el.innerText || "").replace(/\s+/g, " ").trim();
    if (text.length > 48) continue;
    const blob = `${aria} ${text}`;
    if (skip.test(blob)) continue;
    let score = 0;
    if (photoRe.test(blob)) score = wantVideo ? 8 : 12;
    if (wantVideo && (videoRe.test(aria) || videoRe.test(text))) score = 14;
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }

  if (!best) {
    const addEl = [...scope.querySelectorAll("span,div,h3,h4")].find((el) => {
      const t = String(el.innerText || "").replace(/\s+/g, " ").trim();
      return /thêm vào bài viết của bạn|add to your post/i.test(t) && t.length < 80;
    });
    if (addEl) {
      let row = addEl.parentElement;
      for (let i = 0; i < 6 && row; i++) {
        const btns = [...row.querySelectorAll('[role="button"], [tabindex="0"]')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width >= 20 && r.width <= 88 && r.height >= 20 && r.height <= 88;
        });
        if (btns.length) {
          best = wantVideo
            ? btns.find((b) => /video/i.test(b.getAttribute("aria-label") || "")) || btns[0]
            : btns[0];
          bestScore = 5;
          break;
        }
        row = row.parentElement;
      }
    }
  }

  if (!best) return { ok: false };
  best.click();
  return { ok: true, label: String(best.getAttribute("aria-label") || best.innerText || "").slice(0, 48) };
}

async function clickMediaToolbar(page, wantVideo) {
  try {
    const viaEval = await page.evaluate(clickComposerMediaToolbar, Boolean(wantVideo));
    if (viaEval && viaEval.ok) return true;
  } catch {
    /* fall through */
  }
  const dialog = page.locator('[role="dialog"], [aria-modal="true"]').last();
  const locators = wantVideo
    ? [
        dialog.locator('[aria-label="Video" i]').first(),
        dialog.getByRole("button", { name: /^video$/i }).first(),
        dialog.locator('[aria-label*="Ảnh/video" i], [aria-label*="Photo/video" i]').first(),
      ]
    : [
        dialog.locator('[aria-label="Ảnh/video" i], [aria-label="Photo/video" i]').first(),
        dialog.locator('[aria-label*="Ảnh/video" i], [aria-label*="Photo/video" i], [aria-label*="Photo" i]').first(),
        dialog.getByRole("button", { name: /ảnh\/video|photo\/video|ảnh|photo/i }).first(),
        dialog.getByText(/^Ảnh\/video$|^Photo\/video$/).first(),
        page.getByText(/thêm vào bài viết của bạn|add to your post/i).first(),
      ];
  for (const loc of locators) {
    try {
      if (await loc.isVisible({ timeout: 600 })) {
        await loc.click({ timeout: 2500, force: true });
        return true;
      }
    } catch {
      /* next */
    }
  }
  return false;
}

function pickLastMatching(metas, picker) {
  if (!Array.isArray(metas) || !metas.length) return null;
  let best = null;
  let bestScore = 0;
  for (const m of metas) {
    const a = String(m.accept || "").toLowerCase();
    const score =
      picker === "video"
        ? acceptLooksImageOnly(a)
          ? 0
          : /video\/|\.mp4|\.mov|\.webm/.test(a)
            ? 3
            : !a || a === "*/*"
              ? 2
              : /video/.test(a)
                ? 3
                : 1
        : /video\/|\.mp4/.test(a) && !/image\//.test(a) && a
          ? 0
          : acceptLooksImageOnly(a)
            ? 4
            : /image\//.test(a)
              ? 3
              : !a || a === "*/*"
                ? 2
                : 1;
    if (score > 0 && score >= bestScore) {
      bestScore = score;
      best = typeof m.index === "number" ? m.index : metas.indexOf(m);
    }
  }
  return best;
}

async function attachViaChooserOrInput(page, files, kind) {
  const before = await listFileInputs(page, false);
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 8000 }).catch(() => null);
  const clicked = await clickMediaToolbar(page, kind === "video");
  const chooser = clicked ? await chooserPromise : null;
  if (!clicked) chooserPromise.then(() => null);
  if (chooser) {
    await chooser.setFiles(files);
    return { via: "filechooser", clicked };
  }

  await sleep(500);
  const after = await listFileInputs(page, false);
  const picker = kind === "video" ? (m) => pickVideoInputIndex(m) : (m) => pickImageInputIndex(m);

  if (after.length > before.length) {
    const newcomers = after.slice(before.length);
    const idx = picker(newcomers);
    if (idx != null) {
      await fileInputLocator(page, idx, false).setInputFiles(files);
      return { via: "new-input", clicked };
    }
  }

  const dialogMetas = await listFileInputs(page, true);
  const dialogIdx = picker(dialogMetas);
  if (dialogIdx != null) {
    await fileInputLocator(page, dialogIdx, true).setInputFiles(files);
    return { via: "dialog-input", clicked };
  }

  const lastIdx = pickLastMatching(after, kind === "video" ? "video" : "image");
  if (lastIdx != null && clicked) {
    await fileInputLocator(page, lastIdx, false).setInputFiles(files);
    return { via: "last-input-after-toolbar", clicked };
  }

  throw err(
    "UI_CHANGED",
    kind === "video"
      ? "Không gắn được video. Bấm «Ảnh/video» trong modal Tạo bài viết — không dùng hộp Open Windows."
      : "Không gắn được ảnh. Bấm «Ảnh/video» trong «Thêm vào bài viết của bạn», không dùng cover/avatar.",
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
};
