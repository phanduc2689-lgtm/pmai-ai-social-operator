import { destKindLabel, destType } from "./dest.ts";
import { PmaiError } from "./errors.ts";
import type {
  ScheduleMode,
  SubmitSchedule,
  Task,
  TaskStatus,
  WorkspaceState,
} from "./types.ts";

/** Poll while PMAI is open. Not a background OS service. */
export const SCHEDULER_POLL_MS = 2500;

export type SchedulerEnginePort = {
  recoverSchedule: (now?: Date) => { armed: number; missed: number };
  claimDueTasks: (now?: Date) => string[];
  readyScheduledQueueIds: () => string[];
};

export type QueueItem = {
  taskId: string;
  contentId: string;
  approvalId: string | null;
  scheduledAt: string | null;
  scheduleMode: ScheduleMode;
  status: TaskStatus;
  statusLabel: string;
  title: string;
  destName: string;
  destType: ReturnType<typeof destType>;
  destKindLabel: string;
  accountName: string;
  mediaLabel: string;
  remainingMs: number | null;
  remainingLabel: string;
  permalink: string | null;
  createdAt: string;
  canEdit: boolean;
  canReschedule: boolean;
  canCancel: boolean;
  canPublishNow: boolean;
};

/**
 * Build a Date from the operator's local calendar + clock.
 * `new Date(y, m, d, h, min)` uses the machine offset — never a hardcoded zone.
 */
export function fromLocalDateTime(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): Date {
  return new Date(year, monthIndex, day, hour, minute, second, 0);
}

export function parseDateInput(dateStr: string): { year: number; monthIndex: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || "").trim());
  if (!m) throw new PmaiError("SCHEMA_INVALID", "Ngày đăng không hợp lệ.");
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (!year || monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) {
    throw new PmaiError("SCHEMA_INVALID", "Ngày đăng không hợp lệ.");
  }
  return { year, monthIndex, day };
}

export function parseTimeInput(timeStr: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || "").trim());
  if (!m) throw new PmaiError("SCHEMA_INVALID", "Giờ đăng không hợp lệ.");
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new PmaiError("SCHEMA_INVALID", "Giờ đăng không hợp lệ.");
  }
  return { hour, minute };
}

/** Convert local date+time pickers into an ISO instant. */
export function localDateTimeToIso(dateStr: string, timeStr: string): string {
  const d = parseDateInput(dateStr);
  const t = parseTimeInput(timeStr);
  const dt = fromLocalDateTime(d.year, d.monthIndex, d.day, t.hour, t.minute);
  if (Number.isNaN(dt.getTime())) throw new PmaiError("SCHEMA_INVALID", "Thời gian đăng không hợp lệ.");
  return dt.toISOString();
}

export function resolveScheduledAt(schedule: SubmitSchedule | undefined, now = new Date()): string | null {
  if (!schedule || schedule.mode !== "SCHEDULED") return null;
  if (schedule.scheduledAt) {
    const dt = new Date(schedule.scheduledAt);
    if (Number.isNaN(dt.getTime())) throw new PmaiError("SCHEMA_INVALID", "Thời gian đăng không hợp lệ.");
    return dt.toISOString();
  }
  if (schedule.date && schedule.time) return localDateTimeToIso(schedule.date, schedule.time);
  throw new PmaiError("SCHEMA_INVALID", "Chọn ngày và giờ đăng.");
}

export function assertFutureLocal(iso: string, now = new Date()): void {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) throw new PmaiError("SCHEMA_INVALID", "Thời gian đăng không hợp lệ.");
  if (at <= now.getTime()) {
    throw new PmaiError("SCHEMA_INVALID", "Thời gian đăng phải lớn hơn thời gian hiện tại.");
  }
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** YYYY-MM-DD in the machine's local calendar — for <input type="date">. */
export function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** HH:MM in the machine's local clock — for <input type="time">. */
export function toTimeInputValue(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatLocalDate(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatLocalTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatLocalDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatLocalDate(d)} ${formatLocalTime(d)}`;
}

/** Runtime offset of this machine. Never a hardcoded zone. */
export function localOffsetLabel(now = new Date()): string {
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return `GMT${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

export function localTimeZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

export function localMachineClock(now = new Date()): string {
  const tz = localTimeZoneName();
  const core = `${formatLocalTime(now)} — ${localOffsetLabel(now)}`;
  return tz ? `${core} · ${tz}` : core;
}

export function remainingMs(scheduledAt: string | null | undefined, now = new Date()): number | null {
  if (!scheduledAt) return null;
  const at = new Date(scheduledAt).getTime();
  if (Number.isNaN(at)) return null;
  return at - now.getTime();
}

export function formatRemaining(ms: number | null): string {
  if (ms == null) return "";
  if (ms <= 0) return "Đang thực hiện...";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const hms = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  if (days > 0) return `Còn ${days} ngày ${hms}`;
  return `Còn ${hms}`;
}

export function taskStatusLabel(status: TaskStatus, countdownMs?: number | null): string {
  switch (status) {
    case "PENDING":
    case "VALIDATING":
      return "Đang kiểm tra";
    case "WAITING_APPROVAL":
      return "Chờ duyệt";
    case "QUEUED":
      return "Đang xếp hàng";
    case "SCHEDULED":
      if (countdownMs != null && countdownMs <= 0) return "Đang thực hiện...";
      return "Sắp đăng";
    case "RUNNING":
      return "Đang đăng";
    case "SUCCESS":
      return "Đăng thành công";
    case "NEEDS_VERIFICATION":
      return "Cần xử lý";
    case "FAILED":
      return "Đăng thất bại";
    case "REJECTED":
      return "Từ chối";
    case "CANCELLED":
      return "Đã hủy";
    case "STALE_APPROVAL":
      return "Cần duyệt lại";
    case "MISSED":
      return "Bị lỡ";
    default:
      return status;
  }
}

const QUEUE_STATUSES: TaskStatus[] = [
  "WAITING_APPROVAL",
  "SCHEDULED",
  "QUEUED",
  "RUNNING",
  "MISSED",
  "NEEDS_VERIFICATION",
];

function mediaLabelOf(state: WorkspaceState, contentId: string): string {
  const c = state.contents.find((x) => x.id === contentId);
  const attached = (c?.media ?? []).filter((m) => m.attach !== false);
  if (!attached.length) return "Text";
  if (attached.some((m) => m.type === "video")) return attached.length === 1 ? "1 video" : `${attached.length} video`;
  return `${attached.length} ảnh`;
}

function titleOf(state: WorkspaceState, contentId: string): string {
  const c = state.contents.find((x) => x.id === contentId);
  const body = (c?.body || c?.brief || "").replace(/\s+/g, " ").trim();
  if (!body) return "Bài chưa có nội dung";
  return body.length > 72 ? `${body.slice(0, 72)}…` : body;
}

export function buildPostQueue(state: WorkspaceState, now = new Date()): QueueItem[] {
  const pages = state.sessions.length ? state.sessions.flatMap((s) => s.pages) : state.pages;
  const rows: QueueItem[] = [];
  for (const t of state.tasks) {
    if (!QUEUE_STATUSES.includes(t.status)) continue;
    const dest = pages.find((p) => p.id === t.pageTargetId);
    const session =
      state.sessions.find((s) => s.pages.some((p) => p.id === t.pageTargetId)) ??
      state.sessions.find((s) => s.id === state.activeSessionId) ??
      null;
    const approval = state.approvals.find((a) => a.taskId === t.id) ?? null;
    const kind = destType(dest);
    const remain = remainingMs(t.scheduledAt, now);
    const running = t.status === "RUNNING";
    rows.push({
      taskId: t.id,
      contentId: t.contentId,
      approvalId: approval?.id ?? null,
      scheduledAt: t.scheduledAt ?? null,
      scheduleMode: t.scheduleMode === "SCHEDULED" ? "SCHEDULED" : "NOW",
      status: t.status,
      statusLabel: taskStatusLabel(t.status, remain),
      title: titleOf(state, t.contentId),
      destName: dest?.name ?? "Đích",
      destType: kind,
      destKindLabel: destKindLabel(kind),
      accountName: session?.identity?.displayName || session?.profile.name || state.identity?.displayName || "Session",
      mediaLabel: mediaLabelOf(state, t.contentId),
      remainingMs: remain,
      remainingLabel: t.scheduleMode === "SCHEDULED" ? formatRemaining(remain) : t.status === "QUEUED" ? "Đang xếp hàng" : "",
      permalink: t.permalink,
      createdAt: t.createdAt,
      canEdit: !running,
      canReschedule: (t.status === "SCHEDULED" || t.status === "MISSED") && !running,
      canCancel: (t.status === "SCHEDULED" || t.status === "MISSED" || t.status === "QUEUED") && !running,
      canPublishNow: t.status === "MISSED" && !running,
    });
  }
  rows.sort((a, b) => {
    const aAt = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
    const bAt = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
    if (aAt !== bAt) return aAt - bAt;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  return rows;
}

export function groupQueueByLocalDate(items: QueueItem[]): { key: string; label: string; items: QueueItem[] }[] {
  const groups = new Map<string, QueueItem[]>();
  const order: string[] = [];
  for (const item of items) {
    const d = item.scheduledAt ? new Date(item.scheduledAt) : new Date(item.createdAt);
    const key = toDateInputValue(d);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(item);
  }
  return order.map((key) => {
    const d = new Date(`${key}T00:00:00`);
    return { key, label: formatLocalDate(d), items: groups.get(key) ?? [] };
  });
}

export class SchedulerService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly engine: SchedulerEnginePort;
  private readonly opts: { intervalMs?: number; now?: () => Date };

  constructor(engine: SchedulerEnginePort, opts: { intervalMs?: number; now?: () => Date } = {}) {
    this.engine = engine;
    this.opts = opts;
  }

  get intervalMs(): number {
    return this.opts.intervalMs ?? SCHEDULER_POLL_MS;
  }

  recover(now?: Date) {
    return this.engine.recoverSchedule(now ?? this.opts.now?.());
  }

  /** Find due SCHEDULED tasks and move them to QUEUED. Idempotent. */
  tick(now?: Date): string[] {
    const claimed = this.engine.claimDueTasks(now ?? this.opts.now?.());
    const ready = this.engine.readyScheduledQueueIds();
    return [...new Set([...claimed, ...ready])];
  }

  start(onClaimed: (taskIds: string[]) => void) {
    this.stop();
    this.running = true;
    const pulse = () => {
      if (!this.running) return;
      try {
        const ids = this.tick();
        if (ids.length) onClaimed(ids);
      } catch {
        /* next pulse */
      }
    };
    pulse();
    this.timer = setInterval(pulse, this.intervalMs);
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export function isScheduledTask(t: Pick<Task, "scheduleMode" | "scheduledAt" | "status">): boolean {
  return t.scheduleMode === "SCHEDULED" && Boolean(t.scheduledAt);
}
