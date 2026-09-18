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
    <section style={{ maxWidth: 860, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 32, margin: 0 }}>Làm gì tiếp theo</h1>
      <p className="pmai-hint" style={{ marginTop: 8 }}>
        Chrome đã login xong. Luồng chuẩn: chọn trang → soạn nháp → duyệt → PMAI đăng trên Chrome.
      </p>
      <div className="pmai-steps">
        <div className="pmai-step">
          <p className="pmai-step-n">Bước 1</p>
          <h2 style={{ margin: "6px 0 8px", fontSize: 18 }}>Chọn trang đích</h2>
          <p style={{ marginTop: 12, fontWeight: 600 }}>{snap.pages.find((p) => p.id === snap.selectedPageId)?.name ?? "Chưa chọn trang"}</p>
        </div>
        <div className="pmai-step">
          <p className="pmai-step-n">Bước 2</p>
          <h2 style={{ margin: "6px 0 8px", fontSize: 18 }}>Soạn bản nháp</h2>
          <button type="button" className="pmai-btn" style={{ marginTop: 12 }} onClick={onCompose} disabled={!gate.ok}>
            Tạo bài đăng
          </button>
        </div>
        <div className="pmai-step">
          <p className="pmai-step-n">Bước 3</p>
          <h2 style={{ margin: "6px 0 8px", fontSize: 18 }}>Duyệt rồi đăng</h2>
          <button type="button" className="pmai-btn-ghost" style={{ marginTop: 12 }} onClick={onApprove}>
            Mở hàng duyệt ({pendingApprovals.length})
          </button>
        </div>
      </div>
      {needsCheck.length ? (
        <div className="pmai-card" style={{ marginTop: 20, background: "var(--color-warn-bg)" }}>
          {needsCheck.map((t) => (
            <div key={t.id} style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="button" className="pmai-btn" onClick={() => api.confirm(t.id, true)}>
                Đã thấy bài
              </button>
              <button type="button" className="pmai-btn-ghost" onClick={() => api.confirm(t.id, false)}>
                Không thấy bài
              </button>
            </div>
          ))}
        </div>
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
    <section style={{ display: "grid", gap: 24, maxWidth: 980, margin: "0 auto" }} className="lg:grid-cols-2">
      <div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 32, margin: 0 }}>Tạo bài đăng</h1>
        <p className="pmai-hint" style={{ marginTop: 8 }}>
          Chọn nhiều ảnh local — app lưu đường dẫn. Tick ảnh nào đăng kèm caption.
        </p>
        <textarea
          style={{ marginTop: 16, minHeight: 120, width: "100%", borderRadius: 8, border: "1px solid var(--color-border)", padding: 12, font: "inherit" }}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
        <button
          type="button"
          className="pmai-btn"
          style={{ marginTop: 12 }}
          disabled={!gate.ok}
          onClick={async () => {
            const c = await api.createDraft(brief);
            if (c) setDraftId(c.id);
          }}
        >
          Soạn bản nháp
        </button>
      </div>
      <div className="pmai-card">
        {draft ? (
          <>
            <p className="pmai-step-n">Bản nháp · {draft.status}</p>
            <textarea
              style={{ marginTop: 12, minHeight: 160, width: "100%", borderRadius: 8, border: "1px solid var(--color-border)", padding: 12, fontFamily: "var(--font-serif)", fontSize: 16 }}
              value={draft.body}
              onChange={(e) => api.updateDraft(draft.id, e.target.value, draft.media)}
            />
            <div style={{ marginTop: 16 }}>
              <button type="button" className="pmai-btn-ghost" onClick={() => api.pickImages(draft.id)}>
                Chọn ảnh từ máy (nhiều file)
              </button>
              <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
                {draft.media.map((m) => (
                  <li key={m.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={m.attach !== false}
                      onChange={(e) => api.toggleMedia(draft.id, m.id, e.target.checked)}
                    />
                    <span style={{ fontSize: 13 }}>
                      <strong>{m.name}</strong>
                      <br />
                      <span className="pmai-hint">{m.localPath || "(chưa có đường dẫn — chọn lại bằng nút ở trên)"}</span>
                    </span>
                    <button type="button" className="pmai-btn-ghost" onClick={() => api.removeMedia(draft.id, m.id)}>
                      Xóa
                    </button>
                  </li>
                ))}
              </ul>
              {!draft.media.length ? <p className="pmai-hint">Chưa chọn ảnh. Caption vẫn đăng được.</p> : null}
            </div>
            <button type="button" className="pmai-btn" style={{ marginTop: 16 }} onClick={() => api.submit(draft.id)}>
              Gửi duyệt
            </button>
          </>
        ) : (
          <p className="pmai-hint">Chưa có bản nháp.</p>
        )}
      </div>
    </section>
  );
}

export function Approve({ api }: { api: ReturnType<typeof usePmai> }) {
  const { snap } = api;
  const items = snap.approvals.filter((a) => a.status === "PENDING" || a.status === "APPROVED");
  return (
    <section style={{ maxWidth: 680, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 32, margin: 0 }}>Duyệt</h1>
      {items.length === 0 ? <p className="pmai-hint" style={{ marginTop: 16 }}>Không có yêu cầu.</p> : null}
      <ul style={{ listStyle: "none", padding: 0, margin: "24px 0 0", display: "grid", gap: 16 }}>
        {items.map((a) => {
          const c = snap.contents.find((x) => x.id === a.contentId);
          const t = snap.tasks.find((x) => x.id === a.taskId);
          const page = snap.pages.find((p) => p.id === a.pageTargetId);
          const shots = (c?.media ?? []).filter((m) => m.attach !== false);
          return (
            <li key={a.id} className="pmai-card">
              <p className="pmai-step-n">
                {page?.name} · {a.status}
              </p>
              <p style={{ marginTop: 12, whiteSpace: "pre-wrap", fontFamily: "var(--font-serif)", fontSize: 18 }}>{c?.body}</p>
              {shots.length ? (
                <p className="pmai-hint" style={{ marginTop: 8 }}>
                  Ảnh kèm: {shots.map((m) => m.name).join(", ")}
                </p>
              ) : null}
              {a.status === "PENDING" ? (
                <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button
                    type="button"
                    className="pmai-btn"
                    onClick={async () => {
                      await api.decide(a.id, "APPROVE");
                      if (t) await api.execute(t.id);
                    }}
                  >
                    Duyệt & cho phép đăng
                  </button>
                  <button type="button" className="pmai-btn-ghost" onClick={() => api.decide(a.id, "REJECT")}>
                    Từ chối
                  </button>
                </div>
              ) : (
                <p className="pmai-hint" style={{ marginTop: 12 }}>
                  Task: {t?.status}
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
