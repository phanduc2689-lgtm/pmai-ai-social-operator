export type DestStatus = "READY" | "WARMING" | "NEEDS_LOGIN" | "RESTRICTED";
export type DestinationType = "PROFILE" | "PAGE" | "GROUP";
export type BrowserStatus = "RUNNING" | "DISCONNECTED" | "CRASHED";
export type SessionStatus = "CONNECTED" | "AUTH_REQUIRED" | "CHECKPOINT";
export type Intent = "itinerary" | "private" | "price" | "slot" | "consult" | "season" | "general";
export type CommentRole = "author" | "customer";

export interface FbAccount {
  id: string;
  kind: "PAGE" | "PROFILE";
  name: string;
}

export interface BrowserProfile {
  id: string;
  name: string;
  status: BrowserStatus;
  directory: string;
}

export interface FbIdentity {
  id: string;
  name: string;
  browserId: string;
  session: SessionStatus;
  accountIds: string[];
}

export interface Destination {
  id: string;
  name: string;
  type: DestinationType;
  status: DestStatus;
  accountId: string;
  browserId: string;
  identityId: string;
  url: string;
}

export interface ThreadComment {
  id: string;
  author: string;
  initials: string;
  tone: 0 | 1 | 2 | 3 | 4 | 5;
  timeLabel: string;
  body: string;
  role: CommentRole;
  liked: boolean;
  reply: string | null;
  replyAt: string | null;
}

export interface Selection {
  accountId: string;
  browserId: string;
  identityId: string;
  destinationId: string;
}

export interface LogEntry {
  id: string;
  at: string;
  action: string;
  target: string;
  detail: string;
  result: "OK" | "SKIP" | "FAIL";
}

export interface GeminiSettings {
  model: string;
  apiKey: string;
  auto: boolean;
}

export const SAMPLE_POST_URL = "https://www.facebook.com/pmtravel/posts/pfbid0LaVangBacKinh";

export const DEFAULT_REPLIES = [
  "Dạ em gửi lịch trình và bảng giá qua inbox để mình xem ngày khởi hành ạ.",
  "Tour riêng cho gia đình thiết kế được, mình cho em số người và ngày đi nhé.",
  "Đoàn từ 4 khách bên em có ưu đãi theo nhóm, em nhắn giá chi tiết ngay ạ.",
  "Cửu Trại Câu vẫn nhận book, em kiểm tra chỗ và báo mức giảm theo đoàn.",
  "Tour Thượng Hải 5N4Đ ngày 20 còn nhận thêm khách, mình xác nhận để em giữ chỗ.",
  "Dạ em tư vấn Tây An - Lạc Dương theo số ngày mình muốn, inbox giúp em nhé.",
  "Mùa lá vàng đẹp khoảng giữa đến cuối tháng 10, em gửi ảnh đoàn vừa đi.",
  "Tháp Đông Phương Minh Châu có trong lịch Thượng Hải, em gửi chi tiết điểm ghé.",
];

export const ACCOUNTS: FbAccount[] = [
  { id: "acc-pm-page", kind: "PAGE", name: "PM Travel" },
  { id: "acc-pm-profile", kind: "PROFILE", name: "PM Travel · cá nhân" },
  { id: "acc-sales", kind: "PAGE", name: "PM Travel Sales" },
];

export const BROWSERS: BrowserProfile[] = [
  { id: "br-ops", name: "Chrome · PM Travel Ops", status: "RUNNING", directory: "Profile 2" },
  { id: "br-sales", name: "Chrome · Sales Bắc", status: "DISCONNECTED", directory: "Profile 4" },
  { id: "br-ads", name: "AdsPower · PM-02", status: "RUNNING", directory: "pm-02" },
];

export const IDENTITIES: FbIdentity[] = [
  {
    id: "id-pm",
    name: "PM Travel",
    browserId: "br-ops",
    session: "CONNECTED",
    accountIds: ["acc-pm-page", "acc-pm-profile"],
  },
  {
    id: "id-minh",
    name: "Nguyễn Minh",
    browserId: "br-sales",
    session: "AUTH_REQUIRED",
    accountIds: ["acc-sales"],
  },
  {
    id: "id-ads",
    name: "PM Travel Ads",
    browserId: "br-ads",
    session: "CONNECTED",
    accountIds: ["acc-pm-page"],
  },
];

export const DESTINATIONS: Destination[] = [
  {
    id: "d1",
    name: "PM Travel",
    type: "PAGE",
    status: "READY",
    accountId: "acc-pm-page",
    browserId: "br-ops",
    identityId: "id-pm",
    url: "https://www.facebook.com/pmtravel",
  },
  {
    id: "d2",
    name: "PM Travel · Khách đoàn",
    type: "GROUP",
    status: "READY",
    accountId: "acc-pm-page",
    browserId: "br-ops",
    identityId: "id-pm",
    url: "https://www.facebook.com/groups/pmtravelkhach",
  },
  {
    id: "d3",
    name: "PM Travel cá nhân",
    type: "PROFILE",
    status: "RESTRICTED",
    accountId: "acc-pm-profile",
    browserId: "br-ops",
    identityId: "id-pm",
    url: "https://www.facebook.com/pm.travel.official",
  },
  {
    id: "d4",
    name: "PM Travel Sales",
    type: "PAGE",
    status: "NEEDS_LOGIN",
    accountId: "acc-sales",
    browserId: "br-sales",
    identityId: "id-minh",
    url: "https://www.facebook.com/pmtravel.sales",
  },
  {
    id: "d5",
    name: "PM Travel · Fanpage phụ",
    type: "PAGE",
    status: "READY",
    accountId: "acc-pm-page",
    browserId: "br-ads",
    identityId: "id-ads",
    url: "https://www.facebook.com/pmtravel.fan",
  },
  {
    id: "d6",
    name: "Kho warmup",
    type: "PAGE",
    status: "WARMING",
    accountId: "acc-pm-page",
    browserId: "br-ads",
    identityId: "id-ads",
    url: "https://www.facebook.com/pmtravel.warmup",
  },
];

const THREAD: Omit<ThreadComment, "liked" | "reply" | "replyAt">[] = [
  {
    id: "c-author",
    author: "PM Travel",
    initials: "PM",
    tone: 0,
    timeLabel: "2 giờ",
    role: "author",
    body: "Nhiều bạn canh đi đầu tháng 10 lúc lá còn xanh rủ, hoặc đi cuối tháng 11 thì cây đã rụng trơ cành. Mọi người có ai từng dính cảnh đi săn lá vàng mà gặp đúng cây trụi lá ở đâu chưa? Chia sẻ bên dưới nhé!",
  },
  {
    id: "c1",
    author: "Nghiện Cái Đồ",
    initials: "NĐ",
    tone: 1,
    timeLabel: "1 giờ",
    role: "customer",
    body: "Tour Thượng Hải có ghé Tháp truyền hình Đông Phương Minh Châu không bạn?",
  },
  {
    id: "c2",
    author: "Phùng Súng Quốc",
    initials: "PQ",
    tone: 2,
    timeLabel: "1 giờ",
    role: "customer",
    body: "Đoàn gia đình 6 người có thiết kế tour riêng đi Bắc Kinh được không?",
  },
  {
    id: "c3",
    author: "Trùm Ông",
    initials: "TÔ",
    tone: 3,
    timeLabel: "40 phút",
    role: "customer",
    body: "Đoàn 4 người lớn đi Côn Minh - Đại Lý có ưu đãi gì không shop?",
  },
  {
    id: "c4",
    author: "Trung Nguyên",
    initials: "TN",
    tone: 4,
    timeLabel: "1 giờ",
    role: "customer",
    body: "Nhóm mình 8 người muốn book tour Cửu Trại Câu, có giảm giá không?",
  },
  {
    id: "c5",
    author: "Trọng Phát",
    initials: "TP",
    tone: 5,
    timeLabel: "2 giờ",
    role: "customer",
    body: "Tour Thượng Hải 5N4Đ còn nhận thêm 2 khách ngày 20 không ad?",
  },
  {
    id: "c6",
    author: "Bùi Đức Vận",
    initials: "BV",
    tone: 1,
    timeLabel: "1 giờ",
    role: "customer",
    body: "Tư vấn giúp mình tour Tây An - Lạc Dương với ạ.",
  },
  {
    id: "c7",
    author: "Lan Anh",
    initials: "LA",
    tone: 3,
    timeLabel: "35 phút",
    role: "customer",
    body: "Mùa lá vàng Bắc Kinh năm nay còn đẹp không shop?",
  },
  {
    id: "c8",
    author: "Mỹ Duyên",
    initials: "MD",
    tone: 4,
    timeLabel: "20 phút",
    role: "customer",
    body: "Inbox giá tour Côn Minh 4N3Đ giúp em với ạ.",
  },
];

export function freshThread(): ThreadComment[] {
  return THREAD.map((row) => ({ ...row, liked: false, reply: null, replyAt: null }));
}

export function destKindLabel(type: DestinationType): string {
  if (type === "PROFILE") return "Trang cá nhân";
  if (type === "GROUP") return "Group";
  return "Fanpage";
}

export function accountKindLabel(kind: FbAccount["kind"]): string {
  return kind === "PROFILE" ? "Profile" : "Page";
}

export function browsersFor(accountId: string): BrowserProfile[] {
  const ids = new Set(DESTINATIONS.filter((d) => d.accountId === accountId).map((d) => d.browserId));
  return BROWSERS.filter((b) => ids.has(b.id));
}

export function identitiesFor(accountId: string, browserId: string): FbIdentity[] {
  return IDENTITIES.filter((i) => i.browserId === browserId && i.accountIds.includes(accountId));
}

export function destinationsFor(
  selection: Pick<Selection, "accountId" | "browserId" | "identityId">,
  onlyReady: boolean,
): Destination[] {
  return DESTINATIONS.filter(
    (d) =>
      d.accountId === selection.accountId &&
      d.browserId === selection.browserId &&
      d.identityId === selection.identityId &&
      (!onlyReady || d.status === "READY"),
  );
}

export function normalizeSelection(selection: Selection): Selection {
  const accountId = ACCOUNTS.some((a) => a.id === selection.accountId) ? selection.accountId : ACCOUNTS[0].id;
  const browsers = browsersFor(accountId);
  const browserId = browsers.some((b) => b.id === selection.browserId) ? selection.browserId : (browsers[0]?.id ?? "");
  const identities = identitiesFor(accountId, browserId);
  const identityId = identities.some((i) => i.id === selection.identityId)
    ? selection.identityId
    : (identities[0]?.id ?? "");
  const ready = destinationsFor({ accountId, browserId, identityId }, true);
  const destinationId = ready.some((d) => d.id === selection.destinationId)
    ? selection.destinationId
    : (ready[0]?.id ?? "");
  return { accountId, browserId, identityId, destinationId };
}

export const DEFAULT_SELECTION = normalizeSelection({
  accountId: "acc-pm-page",
  browserId: "br-ops",
  identityId: "id-pm",
  destinationId: "d1",
});

export function analyzeComment(body: string): { intent: Intent; label: string } {
  const t = body.toLowerCase();
  if (/giảm giá|ưu đãi|book|giá/.test(t)) return { intent: "price", label: "Hỏi giá" };
  if (/tour riêng|gia đình|thiết kế/.test(t)) return { intent: "private", label: "Tour riêng" };
  if (/còn nhận|thêm \d|slot|ngày \d+/.test(t)) return { intent: "slot", label: "Còn chỗ" };
  if (/tư vấn/.test(t)) return { intent: "consult", label: "Tư vấn" };
  if (/ghé|tháp|lịch trình/.test(t)) return { intent: "itinerary", label: "Lịch trình" };
  if (/lá vàng|mùa|đẹp không/.test(t)) return { intent: "season", label: "Mùa vụ" };
  return { intent: "general", label: "Chung" };
}

export function replyLines(raw: string): string[] {
  return raw
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== "-" && line !== "—");
}

export function pickReply(lines: string[], last: string | null): string {
  const pool = lines.map((line) => line.trim()).filter(Boolean);
  if (pool.length === 0) throw new Error("EMPTY_REPLIES");
  const bag = pool.length > 1 && last ? pool.filter((line) => line !== last) : pool;
  const source = bag.length > 0 ? bag : pool;
  return source[Math.floor(Math.random() * source.length)] ?? source[0];
}

/** Delays sum to totalMs. Long replies type faster so the whole reply stays inside 3–5s. */
export function planDelays(text: string, totalMs: number): number[] {
  const chars = Array.from(text);
  if (chars.length === 0) return [];
  const weights = chars.map((ch, index) => {
    if (ch === " ") return 2.4;
    if (",.!?".includes(ch)) return 1.8;
    return 0.65 + ((index * 13) % 8) / 10;
  });
  const sum = weights.reduce((total, weight) => total + weight, 0);
  const delays = weights.map((weight) => (weight / sum) * totalMs);
  const drift = totalMs - delays.reduce((total, delay) => total + delay, 0);
  delays[delays.length - 1] += drift;
  return delays;
}

export function humanTypeMs(): number {
  return 3000 + Math.floor(Math.random() * 2001);
}

export function parsePostUrl(raw: string): { ok: boolean; message: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, message: "Dán URL bài viết Facebook." };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, message: "URL không hợp lệ." };
  }
  if (url.protocol !== "https:") return { ok: false, message: "URL phải bắt đầu bằng https://." };
  const host = url.hostname.toLowerCase();
  const facebook =
    host === "facebook.com" ||
    host.endsWith(".facebook.com") ||
    host === "fb.com" ||
    host.endsWith(".fb.com");
  if (!facebook) return { ok: false, message: "URL phải thuộc facebook.com." };
  const blob = `${url.pathname}${url.search}`;
  const looksPost =
    /\/(posts|permalink|videos|reel|photos|photo)\b/i.test(blob) ||
    /pfbid|story_fbid|fbid=/i.test(blob);
  if (!looksPost) {
    return { ok: false, message: "Cần URL bài viết (có /posts/, /videos/, /permalink/ hoặc pfbid)." };
  }
  return { ok: true, message: "URL bài viết hợp lệ. Hàng đợi xem trước chạy trên bài mẫu PM Travel." };
}

export function findAccount(id: string): FbAccount | undefined {
  return ACCOUNTS.find((row) => row.id === id);
}

export function findBrowser(id: string): BrowserProfile | undefined {
  return BROWSERS.find((row) => row.id === id);
}

export function findIdentity(id: string): FbIdentity | undefined {
  return IDENTITIES.find((row) => row.id === id);
}

export function findDestination(id: string): Destination | undefined {
  return DESTINATIONS.find((row) => row.id === id);
}
