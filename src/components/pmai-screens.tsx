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
          <p className="pmai-hint">Trang Facebook sẽ nhận bài. Nếu chưa có, mở Tài khoản để thêm URL Page.</p>
          <p style={{ marginTop: 12, fontWeight: 600 }}>{snap.pages.find((p) => p.id === snap.selectedPageId)?.name ?? "Chưa chọn trang"}</p>
        </div>
        <div className="pmai-step">
          <p className="pmai-step-n">Bước 2</p>
          <h2 style={{ margin: "6px 0 8px", fontSize: 18 }}>Soạn bản nháp</h2>
          <p className="pmai-hint">AI chỉ viết local. Chrome chưa mở composer cho đến khi bạn duyệt.</p>
          <button type="button" className="pmai-btn" style={{ marginTop: 12 }} onClick={onCompose} disabled={!gate.ok}>
            Tạo bài đăng
          </button>
          {!gate.ok ? <p className="pmai-hint" style={{ marginTop: 8 }}>{gate.reason}</p> : null}
        </div>
        <div className="pmai-step">
          <p className="pmai-step-n">Bước 3</p>
          <h2 style={{ margin: "6px 0 8px", fontSize: 18 }}>Duyệt rồi đăng</h2>
          <p className="pmai-hint">Human approval bắt buộc. Sau duyệt, PMAI gõ + đăng trên Chrome đã gắn.</p>
          <button type="button" className="pmai-btn-ghost" style={{ marginTop: 12 }} onClick={onApprove}>
            Mở hàng duyệt ({pendingApprovals.length})
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginTop: 24 }}>
        {[
          ["Chờ duyệt", pendingApprovals.length],
          ["Cần kiểm tra", needsCheck.length],
          ["Đã đăng", snap.tasks.filter((t) => t.status === "SUCCESS").length],
        ].map(([k, v]) => (
          <div key={String(k)} className="pmai-card">
            <p className="pmai-step-n">{k}</p>
            <p style={{ fontFamily: "var(--font-serif)", fontSize: 32, margin: "8px 0 0" }}>{v}</p>
          </div>
        ))}
      </div>

      {needsCheck.length ? (
        <div className="pmai-card" style={{ marginTop: 20, background: "var(--color-warn-bg)" }}>
          <p style={{ margin: 0, fontWeight: 600, color: "var(--color-warn)" }}>Cần kiểm tra kết quả — bài có thể đã lên</p>
          {needsCheck.map((t) => (
            <div key={t.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
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
        <p className="pmai-hint" style={{ marginTop: 8 }}>AI soạn nháp local. Trình duyệt Facebook chỉ mở sau khi duyệt.</p>
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
        {!gate.ok ? <p className="pmai-hint" style={{ marginTop: 8 }}>{gate.reason}</p> : null}
      </div>
      <div className="pmai-card">
        {draft ? (
          <>
            <p className="pmai-step-n">Bản nháp AI · {draft.status}</p>
            <textarea
              style={{ marginTop: 12, minHeight: 180, width: "100%", borderRadius: 8, border: "1px solid var(--color-border)", padding: 12, fontFamily: "var(--font-serif)", fontSize: 16 }}
              value={draft.body}
              onChange={(e) => api.updateDraft(draft.id, e.target.value, draft.media)}
            />
            {draft.unverifiedClaims.length ? (
              <ul style={{ marginTop: 12, padding: 12, background: "var(--color-warn-bg)", color: "var(--color-warn)", borderRadius: 8 }}>
                {draft.unverifiedClaims.map((c) => (
                  <li key={c}>Chưa xác minh — {c}</li>
                ))}
              </ul>
            ) : null}
            <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <label className="pmai-btn-ghost" style={{ cursor: "pointer" }}>
                Thêm ảnh local
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) api.addImage(draft.id, { name: f.name, size: f.size, mimeType: f.type || "image/jpeg" });
                  }}
                />
              </label>
              <span className="pmai-hint">{draft.media.map((m) => m.name).join(", ") || "Chưa có ảnh"}</span>
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
      {items.length === 0 ? <p className="pmai-hint" style={{ marginTop: 16 }}>Không có yêu cầu. Hàng đợi trống là tin tốt.</p> : null}
      <ul style={{ listStyle: "none", padding: 0, margin: "24px 0 0", display: "grid", gap: 16 }}>
        {items.map((a) => {
          const c = snap.contents.find((x) => x.id === a.contentId);
          const t = snap.tasks.find((x) => x.id === a.taskId);
          const page = snap.pages.find((p) => p.id === a.pageTargetId);
          return (
            <li key={a.id} className="pmai-card">
              <p className="pmai-step-n">
                {page?.name} · {a.status} · hash {a.contentRevisionHash.slice(0, 8)}
              </p>
              <p style={{ marginTop: 12, whiteSpace: "pre-wrap", fontFamily: "var(--font-serif)", fontSize: 18 }}>{c?.body}</p>
              {c?.unverifiedClaims.length ? <p style={{ marginTop: 8, color: "var(--color-warn)" }}>Chưa xác minh: {c.unverifiedClaims.join(" · ")}</p> : null}
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
                    Từ chối bài này
                  </button>
                  <button type="button" className="pmai-btn-ghost" onClick={() => api.decide(a.id, "CANCEL")}>
                    Hủy task
                  </button>
                  {c ? (
                    <button type="button" className="pmai-btn-ghost" onClick={() => api.clone(c.id)}>
                      Nhân bản để sửa
                    </button>
                  ) : null}
                </div>
              ) : t?.status === "QUEUED" ? (
                <button type="button" className="pmai-btn" style={{ marginTop: 16 }} onClick={() => t && api.execute(t.id)}>
                  Chạy đăng trên Chrome
                </button>
              ) : (
                <p className="pmai-hint" style={{ marginTop: 12 }}>
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
