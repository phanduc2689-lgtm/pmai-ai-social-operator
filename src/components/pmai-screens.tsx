import { useState } from "react";
import type { usePmai } from "@/lib/pmai/use-pmai.ts";

export function Dashboard({
  api,
  onCompose,
  onApprove,
}: {
  api: ReturnType<typeof usePmai>;
  onCompose: () => void;
  onApprove: () => void;
}) {
  const { snap, gate, pendingApprovals, needsCheck } = api;
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
        {!gate.ok ? <p className="self-center font-sans text-sm text-muted">{gate.reason}</p> : null}
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          ["Chờ duyệt", pendingApprovals.length],
          ["Cần kiểm tra kết quả", needsCheck.length],
          ["Đã đăng", snap.tasks.filter((t) => t.status === "SUCCESS").length],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-xl border border-border bg-surface p-4">
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
    </section>
  );
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

  return (
    <section className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-2">
      <div>
        <h1 className="font-serif text-3xl">Tạo bài đăng</h1>
        <p className="mt-2 text-sm text-muted">AI soạn nháp local. Trình duyệt Facebook chỉ mở sau khi duyệt.</p>
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
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
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
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="inline-flex h-11 cursor-pointer items-center rounded-md border border-border px-3 text-sm">
                Thêm ảnh local
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) api.addImage(draft.id, { name: f.name, size: f.size, mimeType: f.type || "image/jpeg" });
                  }}
                />
              </label>
              <span className="text-xs text-muted">{draft.media.map((m) => m.name).join(", ") || "Chưa có ảnh"}</span>
            </div>
            <button type="button" className="mt-4 h-12 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg" onClick={() => api.submit(draft.id)}>
              Gửi duyệt
            </button>
          </>
        ) : (
          <p className="text-sm text-muted">Chưa có bản nháp.</p>
        )}
      </div>
    </section>
  );
}

export function Approve({ api }: { api: ReturnType<typeof usePmai> }) {
  const { snap } = api;
  const items = snap.approvals.filter((a) => a.status === "PENDING" || a.status === "APPROVED");
  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl">Duyệt</h1>
      {items.length === 0 ? <p className="mt-4 text-sm text-muted">Không có yêu cầu. Hàng đợi trống là tin tốt.</p> : null}
      <ul className="mt-6 space-y-4">
        {items.map((a) => {
          const c = snap.contents.find((x) => x.id === a.contentId);
          const t = snap.tasks.find((x) => x.id === a.taskId);
          const page = snap.pages.find((p) => p.id === a.pageTargetId);
          return (
            <li key={a.id} className="rounded-xl border border-border bg-surface p-5">
              <p className="text-xs text-subtle">
                {page?.name} · {a.status} · hash {a.contentRevisionHash.slice(0, 8)}
              </p>
              <p className="mt-3 whitespace-pre-wrap font-serif text-lg">{c?.body}</p>
              {c?.unverifiedClaims.length ? <p className="mt-2 text-sm text-warn">Chưa xác minh: {c.unverifiedClaims.join(" · ")}</p> : null}
              {a.status === "PENDING" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="h-11 rounded-md bg-accent px-4 text-sm text-accent-fg"
                    onClick={async () => {
                      await api.decide(a.id, "APPROVE");
                      if (t) await api.execute(t.id);
                    }}
                  >
                    Duyệt & cho phép đăng
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
              ) : t?.status === "QUEUED" ? (
                <button type="button" className="mt-4 h-11 rounded-md bg-accent px-4 text-sm text-accent-fg" onClick={() => t && api.execute(t.id)}>
                  Chạy đăng trên Chrome
                </button>
              ) : (
                <p className="mt-3 text-sm">
                  Task: {t?.status}
                  {t?.permalink ? ` · ${t.permalink}` : ""}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export { Accounts, HelpScreen, Logs, SettingsScreen } from "@/components/pmai-more.tsx";
