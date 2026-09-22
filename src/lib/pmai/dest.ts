import { PmaiError } from "./errors.ts";
import type { DestinationType, PageTarget } from "./types.ts";

export const DEST_TYPES = ["PROFILE", "PAGE", "GROUP"] as const;

export function inferDestinationType(url: string): DestinationType {
  const u = String(url || "").toLowerCase();
  if (/facebook\.com\/groups\//i.test(u)) return "GROUP";
  if (/facebook\.com\/profile\.php/i.test(u)) return "PROFILE";
  if (/facebook\.com\/me\/?(\?|$)/i.test(u)) return "PROFILE";
  return "PAGE";
}

export function destType(p: { type?: DestinationType; url?: string } | null | undefined): DestinationType {
  if (!p) return "PAGE";
  if (p.type === "PROFILE" || p.type === "PAGE" || p.type === "GROUP") return p.type;
  return inferDestinationType(p.url || "");
}

export function destKindLabel(type: DestinationType): string {
  if (type === "PROFILE") return "Trang cá nhân";
  if (type === "GROUP") return "Group";
  return "Fanpage";
}

export function destGlyph(type: DestinationType): string {
  if (type === "PROFILE") return "👤";
  if (type === "GROUP") return "👥";
  return "📄";
}

export function normalizeFacebookUrl(raw: string): string {
  let url = String(raw || "").trim();
  if (!url) throw new PmaiError("SCHEMA_INVALID", "Thiếu URL Facebook.");
  if (!/^https:\/\/(www\.)?facebook\.com\/.+/i.test(url) && !/^https:\/\/(m|web)\.facebook\.com\/.+/i.test(url)) {
    throw new PmaiError("SCHEMA_INVALID", "URL phải bắt đầu bằng https://www.facebook.com/");
  }
  url = url.replace(/\/$/, "");
  return url;
}

export function assertDestinationUrl(type: DestinationType, url: string): string {
  const normalized = normalizeFacebookUrl(url);
  const inferred = inferDestinationType(normalized);
  if (type === "GROUP" && inferred !== "GROUP") {
    throw new PmaiError("SCHEMA_INVALID", "URL group phải chứa facebook.com/groups/…");
  }
  if (type === "PAGE" && inferred === "GROUP") {
    throw new PmaiError("SCHEMA_INVALID", "Đây là Group. Chọn loại Group, không phải Fanpage.");
  }
  if (type === "PROFILE" && inferred === "GROUP") {
    throw new PmaiError("SCHEMA_INVALID", "Đây là Group, không phải trang cá nhân.");
  }
  return normalized;
}

export function destinationsOf(pages: PageTarget[], type: DestinationType): PageTarget[] {
  return pages.filter((p) => destType(p) === type);
}
