import { useEffect, useRef, useState } from "react";
import { CalendarClock, ImagePlus, Link2, MoreVertical, Trash2 } from "lucide-react";
import { hasElectronHost } from "@/lib/pmai/ipc.ts";
import { attachedMedia, formatBytes } from "@/lib/pmai/media.ts";
import { previewOf } from "@/lib/pmai/media-preview.ts";
import { destGlyph, destKindLabel, destType, destinationsOf, allPagesOf } from "@/lib/pmai/dest.ts";
import {
  buildPostQueue,
  formatLocalDateTime,
  formatLocalTime,
  groupQueueByLocalDate,
  localMachineClock,
  localOffsetLabel,
  toDateInputValue,
  toTimeInputValue,
  type QueueItem,
} from "@/lib/pmai/scheduler.ts";
import type { DestinationType, MediaAsset } from "@/lib/pmai/types.ts";
import type { usePmai } from "@/lib/pmai/use-pmai.ts";

function statusTone(status: QueueItem["status"]): string {
  if (status === "SUCCESS") return "text-ok";
  if (status === "FAILED" || status === "MISSED") return "text-danger";
  if (status === "RUNNING" || status === "QUEUED") return "text-accent";
  if (status === "NEEDS_VERIFICATION" || status === "STALE_APPROVAL") return "text-warn";
  return "text-muted";
}

function PostQueue({
  api,
  onOpenDraft,
  compact = false,
}: {
  api: ReturnType<typeof usePmai>;
  onOpenDraft?: (contentId: string) => void;
  compact?: boolean;
}) {
  const { snap } = api;
  const [now, setNow] = useState(() => new Date());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const items = buildPostQueue(snap, now);
  const groups = groupQueueByLocalDate(items);

  function openReschedule(item: QueueItem) {
    const base = item.scheduledAt ? new Date(item.scheduledAt) : new Date(now.getTime() + 60 * 60 * 1000);
    if (base.getTime() <= now.getTime()) base.setTime(now.getTime() + 15 * 60 * 1000);
    setDate(toDateInputValue(base));
    setTime(toTimeInputValue(base));
    setRescheduleId(item.taskId);
    setMenuFor(null);
  }

  if (!items.length) {
    return (
      <div className="mt-8 rounded-xl border border-border bg-surface p-5">
        <p className="font-sans text-xs font-medium uppercase tracking-wide text-subtle">Hàng đợi đăng bài</p>
        <p className="mt-2 text-sm text-muted">Chưa có bài chờ. Soạn và duyệt xong, lịch sẽ hiện ở đây.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-xl border border-border bg-surface p-5 shadow-panel">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-sans text-xs font-medium uppercase tracking-wide text-subtle">Hàng đợi đăng bài</p>
          <h2 className="mt-1 font-serif text-2xl">{items.length} bài đang chờ</h2>
        </div>
        <p className="font-sans text-xs text-muted">{localMachineClock(now)}</p>
      </div>
      <div className="mt-5 space-y-6">
        {groups.map((g) => (
          <div key={g.key}>
            <p className="mb-2 font-sans text-xs font-medium uppercase tracking-wide text-subtle">{g.label}</p>
            <ul className="space-y-2">
              {g.items.map((item) => {
                const content = snap.contents.find((c) => c.id === item.contentId);
                return (
                  <li key={item.taskId} className="rounded-lg border border-border bg-bg p-3">
                    <div className="flex gap-3">
                      <div className="w-14 shrink-0 pt-0.5 font-sans text-sm font-medium">
                        {item.scheduledAt ? formatLocalTime(new Date(item.scheduledAt)) : "—"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{item.accountName}</p>
                        <p className="truncate text-sm text-muted">{item.title}</p>
                        <p className="mt-1 text-xs text-muted">
                          {destGlyph(item.destType)} {item.destKindLabel} · {item.destName} · {item.mediaLabel}
                        </p>
                        {item.status === "MISSED" ? (
                          <p className="mt-2 text-sm text-danger">
                            Lịch đăng đã quá giờ. Thời gian dự kiến: {formatLocalDateTime(item.scheduledAt)}. Hiện tại:{" "}
                            {formatLocalDateTime(now)}
                          </p>
                        ) : null}
                        {viewId === item.taskId && content ? (
                          <p className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-surface p-3 font-serif text-sm">
                            {content.body}
                          </p>
                        ) : null}
                        {rescheduleId === item.taskId ? (
                          <div className="mt-3 flex flex-wrap items-end gap-2">
                            <label className="text-xs text-muted">
                              Ngày
                              <input
                                type="date"
                                className="mt-1 block h-11 rounded-md border border-border bg-surface px-3 text-sm"
                                min={toDateInputValue(now)}
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                              />
                            </label>
                            <label className="text-xs text-muted">
                              Giờ
                              <input
                                type="time"
                                className="mt-1 block h-11 rounded-md border border-border bg-surface px-3 text-sm"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                              />
                            </label>
                            <button
                              type="button"
                              className="h-11 rounded-md bg-accent px-3 text-sm text-accent-fg"
                              onClick={async () => {
                                await api.reschedule(item.taskId, { mode: "SCHEDULED", date, time });
                                setRescheduleId(null);
                              }}
                            >
                              Lưu lịch
                            </button>
                            <button type="button" className="h-11 rounded-md border border-border px-3 text-sm" onClick={() => setRescheduleId(null)}>
                              Đóng
                            </button>
                          </div>
                        ) : null}
                        {item.status === "MISSED" ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="h-11 rounded-md bg-accent px-3 text-sm text-accent-fg"
                              onClick={() => api.publishMissedNow(item.taskId)}
                            >
                              Đăng ngay
                            </button>
                            <button
                              type="button"
                              className="h-11 rounded-md border border-border px-3 text-sm"
                              onClick={() => api.cancelScheduled(item.taskId)}
                            >
                              Hủy
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="relative shrink-0 text-right">
                        <p className={`text-xs font-medium ${statusTone(item.status)}`}>● {item.statusLabel}</p>
                        {item.remainingLabel ? <p className="mt-1 font-mono text-xs text-muted">{item.remainingLabel}</p> : null}
                        {!compact ? (
                          <button
                            type="button"
                            className="mt-2 inline-flex size-9 items-center justify-center rounded-md border border-border"
                            aria-label="Thao tác"
                            onClick={() => setMenuFor((cur) => (cur === item.taskId ? null : item.taskId))}
                          >
                            <MoreVertical className="size-4" />
                          </button>
                        ) : null}
                        {menuFor === item.taskId ? (
                          <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-border bg-surface py-1 text-left text-sm shadow-panel">
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left hover:bg-info-bg"
                              onClick={() => {
                                setViewId((cur) => (cur === item.taskId ? null : item.taskId));
                                setMenuFor(null);
                              }}
                            >
                              Xem bài
                            </button>
                            {item.canEdit && onOpenDraft ? (
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left hover:bg-info-bg"
                                onClick={() => {
                                  onOpenDraft(item.contentId);
                                  setMenuFor(null);
                                }}
                              >
                                Chỉnh sửa
                              </button>
                            ) : null}
                            {item.canReschedule ? (
                              <button type="button" className="block w-full px-3 py-2 text-left hover:bg-info-bg" onClick={() => openReschedule(item)}>
                                Đổi lịch
                              </button>
                            ) : null}
                            {item.canCancel ? (
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-danger hover:bg-danger-bg"
                                onClick={() => {
                                  void api.cancelScheduled(item.taskId);
                                  setMenuFor(null);
                                }}
                              >
                                Hủy lịch
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left hover:bg-info-bg"
                              onClick={() => {
                                setViewId(item.taskId);
                                setMenuFor(null);
                              }}
                            >
                              Xem chi tiết
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Dashboard({
  api,
  onCompose,
  onApprove,
  onOpenDraft,
}: {
  api: ReturnType<typeof usePmai>;
  onCompose: () => void;
  onApprove: () => void;
  onOpenDraft?: (contentId: string) => void;
}) {
  const { snap, gate, pendingApprovals, needsCheck } = api;
  const scheduled = snap.tasks.filter((t) => t.status === "SCHEDULED").length;
  const missed = snap.tasks.filter((t) => t.status === "MISSED").length;
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="font-serif text-3xl">Tổng quan</h1>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onCompose}
          disabled={!gate.ok}
          className="h-12 rounded-md bg-accent px-5 font-sans text-sm font-medium text-accent-fg disabled:opacity-40"
        >
          Tạo bài đăng
        </button>
        {snap.sessions.some((s) => s.enabled) && snap.tasks.some((t) => t.status === "QUEUED") ? (
          <button
            type="button"
            onClick={() => api.executeEnabled()}
            className="h-12 rounded-md border border-accent px-5 font-sans text-sm font-medium text-accent"
          >
            Chạy {snap.sessions.filter((s) => s.enabled).length} session đã chọn
          </button>
        ) : null}
        {!gate.ok ? <p className="self-center font-sans text-sm text-muted">{gate.reason}</p> : null}
      </div>
      {snap.sessions.length > 1 ? (
        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {snap.sessions.map((s) => (
            <li key={s.id} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
              <p className="font-medium">
                {s.enabled ? "●" : "○"} {s.profile.name}
              </p>
              <p className="text-xs text-muted">
                {s.identity?.displayName ?? "Chưa login"} · {s.pages.length} đích · {s.enabled ? "sẽ chạy" : "bỏ qua"}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Chờ duyệt", pendingApprovals.length],
          ["Đã lên lịch", scheduled],
          ["Bị lỡ", missed],
          ["Đã đăng", snap.tasks.filter((t) => t.status === "SUCCESS").length],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-xl border border-border bg-surface p-4 shadow-panel">
            <p className="font-sans text-xs text-subtle uppercase">{k}</p>
            <p className="mt-2 font-serif text-3xl">{v}</p>
          </div>
        ))}
      </div>
      {needsCheck.length ? (
        <div className="mt-6 rounded-xl border border-warn/40 bg-warn-bg p-4">
          <p className="font-sans text-sm font-medium text-warn">Cần kiểm tra kết quả — bài có thể đã lên</p>
          {needsCheck.map((t) => (
            <div key={t.id} className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="h-11 rounded-md bg-accent px-3 text-sm text-accent-fg" onClick={() => api.confirm(t.id, true)}>
                Đã thấy bài
              </button>
              <button type="button" className="h-11 rounded-md border border-border px-3 text-sm" onClick={() => api.confirm(t.id, false)}>
                Không thấy bài
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {pendingApprovals.length ? (
        <button type="button" onClick={onApprove} className="mt-6 font-sans text-sm text-accent underline">
          Có {pendingApprovals.length} bài chờ duyệt
        </button>
      ) : null}
      <PostQueue api={api} onOpenDraft={onOpenDraft} />
    </section>
  );
}

function MediaThumb({ m }: { m: MediaAsset }) {
  const src = previewOf(m.id);
  return (
    <div className="relative aspect-square overflow-hidden rounded-md bg-info-bg">
      {m.type === "video" ? (
        src ? (
          <video src={src} className="size-full object-cover" muted playsInline />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted">Video</div>
        )
      ) : src ? (
        <img src={src} alt={m.name} className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center p-2 text-center text-xs text-muted">{m.name}</div>
      )}
    </div>
  );
}

function MediaLibrary({
  draftId,
  media,
  api,
}: {
  draftId: string;
  media: MediaAsset[];
  api: ReturnType<typeof usePmai>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState("");

  async function takeFiles(files: FileList | File[] | null) {
    if (!files || (files as FileList).length === 0) return;
    await api.ingestFiles(draftId, files);
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <p className="font-sans text-xs font-medium uppercase tracking-wide text-subtle">Media</p>
      <button
        type="button"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void takeFiles(e.dataTransfer.files);
        }}
        onClick={async () => {
          if (hasElectronHost()) {
            const ok = await api.pickFromDisk(draftId);
            if (!ok) inputRef.current?.click();
            return;
          }
          inputRef.current?.click();
        }}
        className={`flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center ${
          over ? "border-accent bg-info-bg" : "border-border bg-bg"
        }`}
      >
        <ImagePlus className="size-5 text-accent" strokeWidth={1.6} />
        <span className="font-sans text-sm font-medium">+ Chọn ảnh/video</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          multiple
          className="hidden"
          onChange={(e) => {
            void takeFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </button>
      <p className="text-center text-xs text-muted">hoặc</p>
      <div className="flex gap-2">
        <input
          className="h-11 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-sm"
          placeholder="https://… hoặc C:\\Users\\Admin\\Pictures\\a.jpg"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="button"
          className="inline-flex h-11 items-center gap-1 rounded-md border border-border px-3 text-sm"
          onClick={() => {
            void api.importMediaUrl(draftId, url);
            setUrl("");
          }}
        >
          <Link2 className="size-4" />
          Import URL
        </button>
      </div>
      <p className="text-[11px] text-muted">
        Electron dùng hộp thoại PMAI (path Windows thật). Không bấm Open của Facebook — Playwright gắn file bằng
        input ẩn.
      </p>
      {media.length ? (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {media.map((m) => {
            const ready = Boolean((m.localPath || m.sourceUrl || "").trim());
            return (
              <li key={m.id} className="rounded-lg border border-border bg-bg p-2">
                <div className="flex gap-2">
                  <div className="w-16 shrink-0">
                    <MediaThumb m={m} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted">
                      {m.type} · {formatBytes(m.size)}
                      {m.attach === false ? " · bỏ kèm" : ""}
                    </p>
                    <p className={`mt-1 truncate text-[11px] ${ready ? "text-muted" : "text-warn"}`}>
                      {m.localPath || m.sourceUrl || "chưa có path máy — chọn lại"}
                    </p>
                    <label className="mt-1 flex min-h-9 items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={m.attach !== false}
                        onChange={(e) => api.toggleMedia(draftId, m.id, e.target.checked)}
                      />
                      Đăng kèm
                    </label>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center gap-1 text-xs text-danger"
                      onClick={() => api.removeMedia(draftId, m.id)}
                    >
                      <Trash2 className="size-3.5" />
                      Xóa
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted">Chưa chọn file. Tối đa 10 ảnh, hoặc 1 video — không lẫn hai loại.</p>
      )}
    </div>
  );
}

function defaultScheduleTime(): { date: string; time: string } {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 60);
  d.setSeconds(0, 0);
  return { date: toDateInputValue(d), time: toTimeInputValue(d) };
}

export function Compose({
  api,
  draftId,
  setDraftId,
}: {
  api: ReturnType<typeof usePmai>;
  draftId: string | null;
  setDraftId: (id: string | null) => void;
}) {
  const { snap, gate } = api;
  const [brief, setBrief] = useState("Tour Hà Giang mùa thu, 2 ngày 1 đêm");
  const draft = snap.contents.find((c) => c.id === draftId) ?? snap.contents[0];
  const selected = snap.pages.find((p) => p.id === snap.selectedPageId);
  const [kind, setKind] = useState<DestinationType>(selected ? destType(selected) : "PAGE");
  const options = destinationsOf(snap.pages, kind);
  const [when, setWhen] = useState<"NOW" | "SCHEDULED">("NOW");
  const initial = defaultScheduleTime();
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [clock, setClock] = useState(() => localMachineClock());

  useEffect(() => {
    const id = setInterval(() => setClock(localMachineClock()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-2">
      <div>
        <h1 className="font-serif text-3xl">Tạo bài đăng</h1>
        <p className="mt-2 text-sm text-muted">
          AI soạn nháp local. Ảnh/video lưu path máy bạn. Chrome chỉ mở sau khi duyệt.
        </p>
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Đăng lên</p>
          <select
            className="mt-2 h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
            value={kind}
            onChange={(e) => {
              const next = e.target.value as DestinationType;
              setKind(next);
              const first = destinationsOf(snap.pages, next)[0];
              if (first) void api.selectPage(first.id);
            }}
          >
            <option value="PROFILE">👤 Trang cá nhân</option>
            <option value="PAGE">📄 Fanpage</option>
            <option value="GROUP">👥 Group</option>
          </select>
          <p className="mt-3 text-xs text-subtle">Đích</p>
          {options.length ? (
            <select
              className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
              value={selected && destType(selected) === kind ? selected.id : ""}
              onChange={(e) => void api.selectPage(e.target.value)}
            >
              <option value="" disabled>
                Chọn {destKindLabel(kind)}
              </option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="mt-2 text-sm text-muted">Chưa có {destKindLabel(kind).toLowerCase()}. Thêm ở Tài khoản.</p>
          )}
          {selected && destType(selected) === kind ? (
            <p className="mt-2 text-xs text-muted">
              {destGlyph(kind)} {selected.name} · {destKindLabel(kind)}
            </p>
          ) : null}
        </div>

        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-subtle">
            <CalendarClock className="size-3.5" />
            Thời gian đăng
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`h-11 rounded-md border text-sm ${when === "NOW" ? "border-accent bg-info-bg font-medium" : "border-border bg-bg"}`}
              onClick={() => setWhen("NOW")}
            >
              Đăng ngay
            </button>
            <button
              type="button"
              className={`h-11 rounded-md border text-sm ${when === "SCHEDULED" ? "border-accent bg-info-bg font-medium" : "border-border bg-bg"}`}
              onClick={() => {
                setWhen("SCHEDULED");
                const next = defaultScheduleTime();
                setDate(next.date);
                setTime(next.time);
              }}
            >
              Lên lịch
            </button>
          </div>
          {when === "SCHEDULED" ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">
                Ngày
                <input
                  type="date"
                  className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
                  min={toDateInputValue(new Date())}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="text-xs text-muted">
                Giờ
                <input
                  type="time"
                  className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3 text-sm"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            </div>
          ) : null}
          <p className="mt-3 text-xs text-muted">Giờ máy tính: {clock}</p>
          <label className="mt-2 flex min-h-9 items-center gap-2 text-xs text-muted">
            <input type="checkbox" className="size-4" checked readOnly />
            Sử dụng giờ máy tính ({localOffsetLabel()})
          </label>
        </div>

        <textarea
          className="mt-4 min-h-32 w-full rounded-md border border-border bg-surface p-3 font-sans text-sm"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
        <button
          type="button"
          disabled={!gate.ok}
          className="mt-3 h-12 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg disabled:opacity-40"
          onClick={async () => {
            const c = await api.createDraft(brief);
            if (c) setDraftId(c.id);
          }}
        >
          Soạn bản nháp
        </button>
        {!gate.ok ? <p className="mt-2 text-sm text-muted">{gate.reason}</p> : null}

        {draft ? (
          <div className="mt-8">
            <p className="font-sans text-xs text-subtle uppercase">Media kèm bài · {draft.status}</p>
            <div className="mt-3">
              <MediaLibrary draftId={draft.id} media={draft.media} api={api} />
            </div>
          </div>
        ) : null}
      </div>
      <div className="rounded-xl border border-border bg-surface p-5 shadow-panel">
        {draft ? (
          <>
            <p className="font-sans text-xs text-subtle uppercase">Bản nháp AI · {draft.status}</p>
            <textarea
              className="mt-3 min-h-48 w-full rounded-md border border-border p-3 font-serif text-base"
              value={draft.body}
              onChange={(e) => api.updateDraft(draft.id, e.target.value, draft.media)}
            />
            {draft.unverifiedClaims.length ? (
              <ul className="mt-3 space-y-1 rounded-md bg-warn-bg p-3 text-sm text-warn">
                {draft.unverifiedClaims.map((c) => (
                  <li key={c}>Chưa xác minh — {c}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-4 rounded-xl border border-border bg-bg p-4">
              <p className="text-xs text-subtle uppercase">Xem trước composer</p>
              <p className="mt-2 whitespace-pre-wrap font-serif text-sm">{draft.body}</p>
              {draft.media.filter((m) => m.attach !== false).length ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {draft.media
                    .filter((m) => m.attach !== false)
                    .map((m) => (
                      <MediaThumb key={m.id} m={m} />
                    ))}
                </div>
              ) : null}
            </div>
            {hasElectronHost() && attachedMedia(draft.media).some((m) => !m.localPath && !m.sourceUrl) ? (
              <p className="mt-3 text-sm text-warn">
                Ảnh chưa có đường dẫn máy. Bấm «Chọn từ máy» (hộp thoại PMAI). Không dùng id med_.
              </p>
            ) : null}
            <button
              type="button"
              className="mt-4 h-12 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg"
              disabled={hasElectronHost() && attachedMedia(draft.media).some((m) => !m.localPath && !m.sourceUrl)}
              onClick={() =>
                api.submit(draft.id, when === "SCHEDULED" ? { mode: "SCHEDULED", date, time } : { mode: "NOW" })
              }
            >
              {when === "SCHEDULED" ? "Gửi duyệt lịch đăng" : "Gửi duyệt"}
            </button>
            {when === "SCHEDULED" ? (
              <p className="mt-2 text-xs text-muted">
                Sẽ đăng lúc {date.split("-").reverse().join("/")} {time} theo giờ máy tính. Vẫn cần duyệt trước.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted">Chưa có bản nháp. Soạn bên trái trước.</p>
        )}
      </div>
    </section>
  );
}

function ApprovalCard({
  a,
  api,
}: {
  a: ReturnType<typeof usePmai>["snap"]["approvals"][number];
  api: ReturnType<typeof usePmai>;
}) {
  const { snap } = api;
  const c = snap.contents.find((x) => x.id === a.contentId);
  const t = snap.tasks.find((x) => x.id === a.taskId);
  const dest = allPagesOf(snap).find((p) => p.id === a.pageTargetId);
  const kind = destType(dest);
  const shots = c?.media.filter((m) => m.attach !== false) ?? [];
  const scheduled = t?.scheduleMode === "SCHEDULED";
  return (
    <li className="rounded-xl border border-border bg-surface p-5 shadow-panel">
      <p className="text-xs text-subtle">
        {destGlyph(kind)} {destKindLabel(kind)} · {dest?.name} · {a.status} · hash {a.contentRevisionHash.slice(0, 8)}
      </p>
      {scheduled && t?.scheduledAt ? (
        <p className="mt-1 text-xs text-accent">Lịch: {formatLocalDateTime(t.scheduledAt)} · {localOffsetLabel()}</p>
      ) : null}
      {kind === "PAGE" ? (
        <p className="mt-1 text-xs text-muted">Đăng với tư cách Fanpage · tài khoản {snap.identity?.displayName ?? "—"}</p>
      ) : kind === "GROUP" ? (
        <p className="mt-1 text-xs text-muted">Đăng vào group bằng {snap.identity?.displayName ?? "—"} · không bật ẩn danh</p>
      ) : (
        <p className="mt-1 text-xs text-muted">Đăng lên trang cá nhân {dest?.name ?? snap.identity?.displayName}</p>
      )}
      <p className="mt-3 whitespace-pre-wrap font-serif text-lg">{c?.body}</p>
      {shots.length ? (
        <div className="mt-3 space-y-2">
          {shots.map((m) => (
            <div key={m.id} className="flex gap-2">
              <div className="w-16 shrink-0">
                <MediaThumb m={m} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm">{m.name}</p>
                <p className={`truncate text-[11px] ${m.localPath || m.sourceUrl ? "text-muted" : "text-warn"}`}>
                  {m.localPath || m.sourceUrl || "thiếu path máy — không đăng được"}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">Không đính kèm media</p>
      )}
      {c?.unverifiedClaims.length ? <p className="mt-2 text-sm text-warn">Chưa xác minh: {c.unverifiedClaims.join(" · ")}</p> : null}
      {a.status === "PENDING" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="h-11 rounded-md bg-accent px-4 text-sm text-accent-fg"
            onClick={async () => {
              await api.decide(a.id, "APPROVE");
              if (!t) return;
              const after = api.engine.snapshot().tasks.find((x) => x.id === t.id);
              if (after?.status === "QUEUED") await api.execute(after.id);
            }}
          >
            {scheduled ? "Duyệt & lên lịch" : "Duyệt & cho phép đăng"}
          </button>
          <button type="button" className="h-11 rounded-md border border-border px-4 text-sm" onClick={() => api.decide(a.id, "REJECT")}>
            Từ chối bài này
          </button>
          <button type="button" className="h-11 rounded-md border border-border px-4 text-sm" onClick={() => api.decide(a.id, "CANCEL")}>
            Hủy task
          </button>
          {c ? (
            <button type="button" className="h-11 rounded-md border border-border px-4 text-sm" onClick={() => api.clone(c.id)}>
              Nhân bản để sửa
            </button>
          ) : null}
        </div>
      ) : t?.status === "QUEUED" && t.scheduleMode !== "SCHEDULED" ? (
        <button type="button" className="mt-4 h-11 rounded-md bg-accent px-4 text-sm text-accent-fg" onClick={() => t && api.execute(t.id)}>
          Chạy đăng trên Chrome
        </button>
      ) : t?.status === "SCHEDULED" ? (
        <p className="mt-3 text-sm text-accent">Đã lên lịch · {formatLocalDateTime(t.scheduledAt)}</p>
      ) : t?.status === "MISSED" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <p className="w-full text-sm text-danger">Lịch đăng đã quá giờ.</p>
          <button type="button" className="h-11 rounded-md bg-accent px-4 text-sm text-accent-fg" onClick={() => api.publishMissedNow(t.id)}>
            Đăng ngay
          </button>
          <button type="button" className="h-11 rounded-md border border-border px-4 text-sm" onClick={() => api.cancelScheduled(t.id)}>
            Hủy
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm">
          Task: {t?.status}
          {t?.permalink ? ` · ${t.permalink}` : ""}
        </p>
      )}
    </li>
  );
}

export function Approve({ api, onOpenDraft }: { api: ReturnType<typeof usePmai>; onOpenDraft?: (contentId: string) => void }) {
  const { snap } = api;
  const pending = snap.approvals.filter((a) => a.status === "PENDING");
  const scheduledApprovals = snap.approvals.filter((a) => {
    if (a.status !== "APPROVED") return false;
    const t = snap.tasks.find((x) => x.id === a.taskId);
    return t?.status === "SCHEDULED" || t?.status === "MISSED" || (t?.status === "QUEUED" && t.scheduleMode === "SCHEDULED");
  });
  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl">Duyệt</h1>

      <div className="mt-6 rounded-xl border border-border bg-surface p-4">
        <p className="font-sans text-xs font-medium uppercase tracking-wide text-subtle">Chờ duyệt</p>
        <p className="mt-1 font-serif text-2xl">{pending.length} bài</p>
      </div>
      {pending.length === 0 ? <p className="mt-4 text-sm text-muted">Không có yêu cầu chờ duyệt.</p> : null}
      <ul className="mt-4 space-y-4">
        {pending.map((a) => (
          <ApprovalCard key={a.id} a={a} api={api} />
        ))}
      </ul>

      <div className="mt-10 rounded-xl border border-border bg-surface p-4">
        <p className="font-sans text-xs font-medium uppercase tracking-wide text-subtle">Đã lên lịch</p>
        <p className="mt-1 font-serif text-2xl">{scheduledApprovals.length} bài</p>
      </div>
      {scheduledApprovals.length ? (
        <ul className="mt-4 space-y-4">
          {scheduledApprovals
            .slice()
            .sort((a, b) => {
              const ta = snap.tasks.find((x) => x.id === a.taskId)?.scheduledAt ?? "";
              const tb = snap.tasks.find((x) => x.id === b.taskId)?.scheduledAt ?? "";
              return ta.localeCompare(tb);
            })
            .map((a) => (
              <ApprovalCard key={a.id} a={a} api={api} />
            ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">Chưa có bài đã duyệt để lên lịch.</p>
      )}

      <PostQueue api={api} onOpenDraft={onOpenDraft} />
    </section>
  );
}

export { Accounts, HelpScreen, Logs, SettingsScreen } from "@/components/pmai-more.tsx";
