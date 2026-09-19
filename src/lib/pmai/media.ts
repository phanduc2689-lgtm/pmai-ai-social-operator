import { PmaiError } from "./errors.ts";
import type { MediaAsset, MediaKind } from "./types.ts";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function looksLikeMediaId(value: string): boolean {
  const base = value.replace(/^.*[/\\]/, "").trim();
  return /^med_[a-z0-9]+$/i.test(base);
}

export function fileUrlToPath(url: string): string {
  let s = decodeURIComponent(url.replace(/^file:\/\//i, ""));
  if (/^\/[A-Za-z]:\//.test(s)) s = s.slice(1);
  return s;
}

export type ResolvedSource =
  | { kind: "http"; value: string }
  | { kind: "local"; value: string };

export function resolveMediaSource(source: string): ResolvedSource {
  const raw = String(source || "").trim();
  if (!raw) throw new PmaiError("SCHEMA_INVALID", "Thiếu đường dẫn / URL media.");
  if (looksLikeMediaId(raw)) {
    throw new PmaiError(
      "NOT_READY",
      "Đây là id nội bộ (med_…), không phải file. Chọn lại ảnh/video từ máy.",
    );
  }
  if (/^https?:\/\//i.test(raw)) return { kind: "http", value: raw };
  if (/^file:\/\//i.test(raw)) return { kind: "local", value: fileUrlToPath(raw) };
  return { kind: "local", value: raw };
}

export function detectMediaKind(file: { mimeType?: string; name: string }): MediaKind {
  const mime = (file.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  const ext = extOf(file.name);
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  throw new PmaiError("SCHEMA_INVALID", `Định dạng không hỗ trợ: ${file.name}`);
}

export function attachedMedia(media: MediaAsset[]): MediaAsset[] {
  return media.filter((m) => m.attach !== false);
}

export function assertCompatibleMedia(existing: MediaAsset[], incoming: MediaKind): void {
  const live = attachedMedia(existing);
  if (incoming === "video" && live.some((m) => m.type === "video")) {
    throw new PmaiError("SCHEMA_INVALID", "Mỗi bài chỉ một video.");
  }
  if (incoming === "video" && live.some((m) => m.type === "image")) {
    throw new PmaiError("SCHEMA_INVALID", "Không đăng lẫn ảnh và video trong một bài. Xóa loại kia trước.");
  }
  if (incoming === "image" && live.some((m) => m.type === "video")) {
    throw new PmaiError("SCHEMA_INVALID", "Không đăng lẫn ảnh và video trong một bài. Xóa loại kia trước.");
  }
  if (incoming === "image" && live.filter((m) => m.type === "image").length >= 10) {
    throw new PmaiError("SCHEMA_INVALID", "Tối đa 10 ảnh mỗi bài.");
  }
}

export function uploadPaths(media: MediaAsset[], requirePath: boolean): string[] {
  const shots = attachedMedia(media);
  if (!shots.length) return [];
  return shots.map((m) => {
    const src = (m.localPath || m.sourceUrl || "").trim();
    if (looksLikeMediaId(m.id) && (!src || looksLikeMediaId(src))) {
      throw new PmaiError(
        "NOT_READY",
        `Thiếu file thật cho «${m.name}». Không dùng id ${m.id}. Chọn lại bằng «Chọn từ máy».`,
      );
    }
    if (requirePath) {
      if (!src || looksLikeMediaId(src)) {
        throw new PmaiError(
          "NOT_READY",
          `Thiếu đường dẫn file: ${m.name}. Chọn lại bằng «Chọn từ máy» (lưu path), không dán id med_.`,
        );
      }
      return resolveMediaSource(src).kind === "http" ? src : resolveMediaSource(src).value;
    }
    if (src && !looksLikeMediaId(src)) {
      const r = resolveMediaSource(src);
      return r.value;
    }
    if (looksLikeMediaId(m.name)) {
      throw new PmaiError("NOT_READY", `Tên file không hợp lệ: ${m.name}`);
    }
    return m.name;
  });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
