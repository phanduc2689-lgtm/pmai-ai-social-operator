import "@/reply.css";
import { useState } from "react";
import {
  LayoutDashboard,
  ListTodo,
  MessagesSquare,
  Settings,
} from "lucide-react";
import { FbStage } from "@/components/fb-stage.tsx";
import {
  ACCOUNTS,
  accountKindLabel,
  analyzeComment,
  browsersFor,
  DESTINATIONS,
  destKindLabel,
  identitiesFor,
  type Intent,
} from "@/lib/reply/catalog.ts";
import { useOperator, type NavId, type Operator } from "@/lib/reply/use-operator.ts";

const NAV: { id: NavId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "home", label: "Tổng quan", icon: LayoutDashboard },
  { id: "reply", label: "Phản hồi bình luận", icon: MessagesSquare },
  { id: "logs", label: "Nhật ký", icon: ListTodo },
  { id: "settings", label: "Cài đặt", icon: Settings },
];

const STEP_LABEL = ["Chọn tài khoản", "Chọn bài viết", "Hàng đợi reply"] as const;

const INTENT_CLASS: Record<Intent, string> = {
  itinerary: "tag tag-info",
  private: "tag tag-info",
  price: "tag tag-warn",
  slot: "tag tag-warn",
  consult: "tag tag-ok",
  season: "tag tag-ok",
  general: "tag",
};

export function OperatorApp() {
  const op = useOperator();
  return (
    <div className="shell">
      <aside className="aside">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            PM
          </span>
          <div>
            <strong>PMAI</strong>
            <p>AI Social Operator</p>
          </div>
        </div>
        <nav className="nav" aria-label="Điều hướng">
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = op.nav === item.id;
            return (
              <button key={item.id} type="button" className={on ? "nav-btn is-on" : "nav-btn"} onClick={() => op.setNav(item.id)}>
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <p className="aside-foot">v2.2 · phản hồi bình luận · local</p>
      </aside>
      <div className="col">
        <header className="header">
          <div className="header-title">
            <p className="eyebrow">PMAI</p>
            <h1>{NAV.find((item) => item.id === op.nav)?.label}</h1>
          </div>
          <div className="lights">
            <Light ok={op.browser?.status === "RUNNING"} label="Hồ sơ trình duyệt" value={op.browser?.name ?? "Chưa chọn"} />
            <Light ok={op.identity?.session === "CONNECTED"} label="Phiên Facebook" value={op.identity?.name ?? "Chưa chọn"} />
            <Light ok={op.destinationReady} label="Đích" value={op.destination ? destKindLabel(op.destination.type) : "Chưa chọn"} />
          </div>
        </header>
        <p className="live is-warn">
          Khung xem trước · chưa gắn Chrome trên máy bạn. Hàng đợi mô phỏng gõ, gửi và like — không đăng lên Facebook thật.
        </p>
        <div className="tabs" role="tablist" aria-label="Mục">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={op.nav === item.id}
              className={op.nav === item.id ? "tab is-on" : "tab"}
              onClick={() => op.setNav(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <main id="noi-dung" className="main">
          {op.nav === "home" ? <Home op={op} /> : null}
          {op.nav === "reply" ? <ReplyScreen op={op} /> : null}
          {op.nav === "logs" ? <Logs op={op} /> : null}
          {op.nav === "settings" ? <SettingsScreen op={op} /> : null}
        </main>
      </div>
    </div>
  );
}

function Light({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <div className="light">
      <span className={ok ? "dot is-ok" : "dot"} />
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function Home({ op }: { op: Operator }) {
  const sent = op.customers.filter((row) => row.reply).length;
  const liked = op.comments.filter((row) => row.liked).length;
  return (
    <div className="stack">
      <section className="card hero-card">
        <div>
          <p className="eyebrow">Hàng đợi có kiểm soát</p>
          <h2>Phản hồi bình luận trên bài của trang mình quản lý.</h2>
          <p className="lede">
            Chọn hồ sơ Chrome và đích READY, dán URL bài viết, rồi để PMAI lần lượt bấm Trả lời, gõ 3–5 giây và gửi.
            Like đi kèm hoặc chạy riêng. Mọi bước vào nhật ký.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              op.setNav("reply");
            }}
          >
            Mở phản hồi bình luận
          </button>
        </div>
        <dl className="stats">
          <div>
            <dt>Đích READY</dt>
            <dd>{DESTINATIONS.filter((row) => row.status === "READY").length}</dd>
          </div>
          <div>
            <dt>Chờ reply</dt>
            <dd>{op.pending.length}</dd>
          </div>
          <div>
            <dt>Đã gửi</dt>
            <dd>{sent}</dd>
          </div>
          <div>
            <dt>Đã like</dt>
            <dd>{liked}</dd>
          </div>
        </dl>
      </section>
      <section className="card">
        <header className="section-head">
          <h2>Nhật ký gần đây</h2>
          <button type="button" className="btn-ghost" onClick={() => op.setNav("logs")}>
            Xem hết
          </button>
        </header>
        {op.logs.length === 0 ? (
          <p className="muted">Chưa có hành động. Chạy hàng đợi để ghi log gõ, gửi và like.</p>
        ) : (
          <LogTable rows={op.logs.slice(0, 6)} />
        )}
      </section>
    </div>
  );
}

function ReplyScreen({ op }: { op: Operator }) {
  const canStep2 = op.destinationReady;
  const canStep3 = canStep2 && op.urlState.ok && op.lines.length > 0;
  return (
    <div className="stack">
      <ol className="steps">
        {STEP_LABEL.map((label, index) => {
          const n = (index + 1) as 1 | 2 | 3;
          const locked = (n === 2 && !canStep2) || (n === 3 && !canStep3);
          return (
            <li key={label}>
              <button
                type="button"
                className={op.step === n ? "step-btn is-on" : "step-btn"}
                disabled={locked}
                onClick={() => op.goto(n)}
              >
                <span>{n}</span>
                {label}
              </button>
            </li>
          );
        })}
      </ol>
      {op.step === 1 ? <StepAccount op={op} canNext={canStep2} /> : null}
      {op.step === 2 ? <StepPost op={op} canNext={canStep3} /> : null}
      {op.step === 3 ? <StepQueue op={op} /> : null}
    </div>
  );
}

function StepAccount({ op, canNext }: { op: Operator; canNext: boolean }) {
  const browsers = browsersFor(op.selection.accountId);
  const identities = identitiesFor(op.selection.accountId, op.selection.browserId);
  return (
    <div className="split">
      <section className="card">
        <p className="eyebrow">Bước 1</p>
        <h2>Chọn tài khoản</h2>
        <p className="muted">Chỉ đích đang READY mới hiện trong ô Destination.</p>
        <div className="fields">
          <label className="field">
            <span>Facebook Profile/Page</span>
            <select
              value={op.selection.accountId}
              onChange={(event) => op.setSelection((prev) => ({ ...prev, accountId: event.target.value }))}
            >
              {ACCOUNTS.map((account) => (
                <option key={account.id} value={account.id}>
                  {accountKindLabel(account.kind)} · {account.name}
                </option>
              ))}
            </select>
            <small>Trang hoặc profile Facebook mình quản lý.</small>
          </label>
          <label className="field">
            <span>Browser Profile</span>
            <select
              value={op.selection.browserId}
              onChange={(event) => op.setSelection((prev) => ({ ...prev, browserId: event.target.value }))}
            >
              {browsers.map((browser) => (
                <option key={browser.id} value={browser.id}>
                  {browser.name} · {browser.status}
                </option>
              ))}
            </select>
            <small>{op.browser ? op.browser.directory : "Chưa có hồ sơ."}</small>
          </label>
          <label className="field">
            <span>Facebook Identity</span>
            <select
              value={op.selection.identityId}
              onChange={(event) => op.setSelection((prev) => ({ ...prev, identityId: event.target.value }))}
            >
              {identities.map((identity) => (
                <option key={identity.id} value={identity.id}>
                  {identity.name} · {identity.session}
                </option>
              ))}
            </select>
            <small>Phiên đang đăng nhập trong hồ sơ Chrome đó.</small>
          </label>
          <label className="field">
            <span>Destination</span>
            <select
              value={op.selection.destinationId}
              disabled={op.readyDestinations.length === 0}
              onChange={(event) => op.setSelection((prev) => ({ ...prev, destinationId: event.target.value }))}
            >
              {op.readyDestinations.length === 0 ? <option value="">Không có đích READY</option> : null}
              {op.readyDestinations.map((dest) => (
                <option key={dest.id} value={dest.id}>
                  {destKindLabel(dest.type)} · {dest.name} · READY
                </option>
              ))}
            </select>
            {op.hiddenDestinations.length > 0 ? (
              <small className="warn-text">
                Đã ẩn {op.hiddenDestinations.map((dest) => `${dest.name} (${dest.status})`).join(", ")}.
              </small>
            ) : (
              <small>{op.readyDestinations.length} đích READY.</small>
            )}
          </label>
        </div>
        <div className="actions">
          <button type="button" className="btn" disabled={!canNext} onClick={() => op.goto(2)}>
            Sang bước 2
          </button>
        </div>
      </section>
      <aside className="card summary">
        <p className="eyebrow">Phiên sẽ chạy</p>
        <h2>{op.account?.name ?? "Chưa chọn"}</h2>
        <ul>
          <li>
            <span>Browser Profile</span>
            <strong>{op.browser?.name ?? "—"}</strong>
            <em>{op.browser?.status ?? ""}</em>
          </li>
          <li>
            <span>Facebook Identity</span>
            <strong>{op.identity?.name ?? "—"}</strong>
            <em>{op.identity?.session ?? ""}</em>
          </li>
          <li>
            <span>Destination</span>
            <strong>{op.destination ? `${destKindLabel(op.destination.type)} · ${op.destination.name}` : "Không có READY"}</strong>
            <em>{op.destinationReady ? "READY" : "Chặn"}</em>
          </li>
        </ul>
      </aside>
    </div>
  );
}

function StepPost({ op, canNext }: { op: Operator; canNext: boolean }) {
  const counts = new Map<string, number>();
  for (const comment of op.customers) {
    const label = analyzeComment(comment.body).label;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return (
    <div className="split">
      <section className="card">
        <p className="eyebrow">Bước 2</p>
        <h2>Chọn bài viết</h2>
        <label className="field">
          <span>Dán URL bài viết</span>
          <input
            value={op.postUrl}
            placeholder="https://www.facebook.com/pmtravel/posts/…"
            onChange={(event) => op.setPostUrl(event.target.value)}
            spellCheck={false}
          />
          <small className={op.urlState.ok ? "ok-text" : op.postUrl.trim() ? "warn-text" : ""}>{op.urlState.message}</small>
        </label>
        <div className="actions tight">
          <button type="button" className="btn-ghost" onClick={op.useSampleUrl}>
            Dán bài mẫu PM Travel
          </button>
        </div>
        <label className="field">
          <span>Nội dung reply — 1 dòng là 1 câu</span>
          <textarea
            value={op.replyDraft}
            rows={8}
            onChange={(event) => op.setReplyDraft(event.target.value)}
            spellCheck
          />
          <small>
            {op.lines.length} dòng. Mỗi comment lấy ngẫu nhiên một dòng, không lặp dòng vừa dùng.
          </small>
        </label>
        <div className="actions">
          <button type="button" className="btn-ghost" onClick={() => op.goto(1)}>
            Quay lại
          </button>
          <button type="button" className="btn" disabled={!canNext} onClick={() => op.goto(3)}>
            Sang hàng đợi
          </button>
        </div>
      </section>
      <aside className="card">
        <p className="eyebrow">Phân tích cục bộ</p>
        <h2>{op.customers.length} comment khách</h2>
        <p className="muted">Gắn nhãn theo từ khóa. Gemini sẽ thay bước này khi có API key.</p>
        <div className="tags">
          {[...counts.entries()].map(([label, count]) => (
            <span key={label} className="tag">
              {label} · {count}
            </span>
          ))}
        </div>
        <ul className="preview-list">
          {op.customers.map((comment) => {
            const intent = analyzeComment(comment.body);
            return (
              <li key={comment.id}>
                <div>
                  <strong>{comment.author}</strong>
                  <span className={INTENT_CLASS[intent.intent]}>{intent.label}</span>
                </div>
                <p>{comment.body}</p>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}

function StepQueue({ op }: { op: Operator }) {
  const typingProgress = op.phase.type === "typing" ? op.phase.progress : op.phase.type === "sending" ? 1 : 0;
  const done = op.customers.filter((row) => row.reply).length;
  const queueProgress = op.customers.length === 0 ? 0 : done / op.customers.length;
  const likingId = op.phase.type === "liking" ? op.phase.commentId : null;
  const replyArmedId = op.phase.type === "click-reply" ? op.phase.commentId : null;
  const status =
    op.paused
      ? "Đang tạm dừng"
      : op.phase.type === "typing"
        ? `Đang gõ · ${(op.phase.progress * 100).toFixed(0)}%`
        : op.phase.type === "sending"
          ? op.phase.via === "arrow"
            ? "Bấm mũi tên xanh"
            : "Bấm Enter"
          : op.phase.type === "click-reply"
            ? "Bấm Trả lời"
            : op.phase.type === "liking"
              ? "Like comment"
              : op.phase.type === "scrolling"
                ? "Sang comment tiếp theo"
                : op.running
                  ? "Đang chạy"
                  : "Sẵn sàng";

  return (
    <div className="work">
      <section className="card queue-panel">
        <p className="eyebrow">Bước 3</p>
        <h2>Lướt và reply</h2>
        <p className="status" aria-live="polite">
          {status}
        </p>
        <div className="meter" aria-hidden="true">
          <span style={{ transform: `scaleX(${op.phase.type === "typing" || op.phase.type === "sending" ? typingProgress : queueProgress})` }} />
        </div>
        <p className="muted">
          {done}/{op.customers.length} đã gửi. Gõ 3–5 giây như người thật, rồi gửi bằng mũi tên xanh hoặc Enter.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={op.likeWithReply}
            disabled={Boolean(op.running)}
            onChange={(event) => op.setLikeWithReply(event.target.checked)}
          />
          Like kèm mỗi comment sau khi gửi
        </label>
        <div className="actions stack-actions">
          {op.running && !op.paused ? (
            <button type="button" className="btn" onClick={op.pause}>
              Tạm dừng
            </button>
          ) : null}
          {op.paused ? (
            <button type="button" className="btn" onClick={op.resume}>
              Tiếp tục chạy
            </button>
          ) : null}
          {!op.running ? (
            <button
              type="button"
              className="btn"
              disabled={op.pending.length === 0 || op.lines.length === 0}
              onClick={() => void op.runReplies(op.pending.map((row) => row.id))}
            >
              Chạy hàng đợi
            </button>
          ) : null}
          {op.running || op.paused ? (
            <button type="button" className="btn-ghost" onClick={op.stop}>
              Dừng
            </button>
          ) : (
            <button
              type="button"
              className="btn-ghost"
              disabled={op.comments.every((row) => row.liked)}
              onClick={() => void op.likeAll()}
            >
              Like hàng loạt
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={op.resetThread} disabled={Boolean(op.running)}>
            Đặt lại bài
          </button>
          <button type="button" className="btn-ghost" onClick={() => op.goto(2)} disabled={Boolean(op.running)}>
            Quay lại bài viết
          </button>
        </div>
        <ul className="q-list">
          {op.customers.map((comment) => {
            const intent = analyzeComment(comment.body);
            const state = comment.reply ? "is-done" : comment.id === op.activeId ? "is-active" : "";
            return (
              <li key={comment.id} className={state}>
                <div>
                  <strong>{comment.author}</strong>
                  <span className={INTENT_CLASS[intent.intent]}>{comment.reply ? "Đã gửi" : intent.label}</span>
                </div>
                {!op.running && !comment.reply ? (
                  <button type="button" className="text-btn" onClick={() => void op.runReplies([comment.id])}>
                    Chỉ comment này
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
      <FbStage
        pageName={op.destination?.name ?? "PM Travel"}
        actorName={op.identity?.name ?? "PM Travel"}
        postUrl={op.postUrl}
        comments={op.comments}
        activeId={op.activeId}
        composerFor={op.composerFor}
        draft={op.draft}
        typing={op.typing}
        sendVia={op.sendVia}
        likingId={likingId}
        replyArmedId={replyArmedId}
        busy={Boolean(op.running)}
        onReply={(id) => void op.runReplies([id])}
        onLike={(id) => op.likeOne(id)}
      />
    </div>
  );
}

function Logs({ op }: { op: Operator }) {
  return (
    <section className="card">
      <header className="section-head">
        <div>
          <p className="eyebrow">Hành động</p>
          <h2>Nhật ký</h2>
        </div>
        <button type="button" className="btn-ghost" onClick={op.clearLogs} disabled={op.logs.length === 0}>
          Xóa nhật ký
        </button>
      </header>
      {op.logs.length === 0 ? <p className="muted">Nhật ký trống.</p> : <LogTable rows={op.logs} />}
    </section>
  );
}

function LogTable({ rows }: { rows: Operator["logs"] }) {
  return (
    <div className="log-wrap">
      <table className="log-table">
        <thead>
          <tr>
            <th>Giờ</th>
            <th>Hành động</th>
            <th>Đối tượng</th>
            <th>Chi tiết</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.result === "SKIP" ? "is-skip" : ""}>
              <td>{new Date(row.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
              <td>{row.action}</td>
              <td>{row.target}</td>
              <td>{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SettingsScreen({ op }: { op: Operator }) {
  const masked = op.gemini.apiKey ? `${"•".repeat(Math.min(12, op.gemini.apiKey.length))} ${op.gemini.apiKey.slice(-4)}` : "Chưa có key";
  return (
    <div className="split">
      <section className="card">
        <p className="eyebrow">Sắp nối</p>
        <h2>Reply bằng Gemini</h2>
        <p className="muted">
          Key chỉ lưu trên máy này. Bản này chưa gọi API. Khi bật, hàng đợi vẫn lấy câu ngẫu nhiên trong danh sách và ghi chú trong nhật ký.
        </p>
        <label className="field">
          <span>Model</span>
          <select
            value={op.gemini.model}
            onChange={(event) => op.setGemini((prev) => ({ ...prev, model: event.target.value }))}
          >
            <option value="gemini-2.5-flash">gemini-2.5-flash</option>
            <option value="gemini-2.5-pro">gemini-2.5-pro</option>
          </select>
        </label>
        <label className="field">
          <span>API key Gemini</span>
          <input
            type="password"
            autoComplete="off"
            value={op.gemini.apiKey}
            placeholder="Dán key — chưa gửi đi đâu"
            onChange={(event) => op.setGemini((prev) => ({ ...prev, apiKey: event.target.value }))}
          />
          <small>Đang lưu: {masked}</small>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={op.gemini.auto}
            onChange={(event) => op.setGemini((prev) => ({ ...prev, auto: event.target.checked }))}
          />
          Ưu tiên soạn reply bằng Gemini khi đã nối
        </label>
        {op.gemini.auto && !op.gemini.apiKey ? <p className="warn-text">Chưa có key. Hàng đợi không thể gọi Gemini.</p> : null}
        {op.gemini.auto && op.gemini.apiKey ? (
          <p className="ok-text">Key đã lưu. Lượt gọi Gemini sẽ thêm ở bản sau — hiện vẫn random trong danh sách.</p>
        ) : null}
      </section>
      <section className="card">
        <p className="eyebrow">Nhịp người thật</p>
        <h2>3–5 giây mỗi reply</h2>
        <p className="muted">
          Thời gian gõ cố định trong khoảng này, có ngắt ở dấu cách. Không rút ngắn. Giữa các comment có khoảng dừng để lướt xuống.
        </p>
        <ul className="plain">
          <li>Bấm Trả lời trên đúng comment.</li>
          <li>Gõ vào ô, hiện caret.</li>
          <li>Gửi bằng mũi tên xanh, hoặc Enter ở mỗi comment thứ ba.</li>
          <li>Like từng comment hoặc like hàng loạt.</li>
        </ul>
      </section>
    </div>
  );
}


export function ReplyWorkspace() {
  const op = useOperator();
  const [pane, setPane] = useState<"queue" | "log" | "gemini">("queue");
  return (
    <div className="reply-app">
      <div className="tabs" role="tablist" aria-label="Phản hồi bình luận">
        <button type="button" className={pane === "queue" ? "tab is-on" : "tab"} onClick={() => setPane("queue")}>
          Hàng đợi
        </button>
        <button type="button" className={pane === "log" ? "tab is-on" : "tab"} onClick={() => setPane("log")}>
          Nhật ký reply
        </button>
        <button type="button" className={pane === "gemini" ? "tab is-on" : "tab"} onClick={() => setPane("gemini")}>
          Gemini
        </button>
      </div>
      {pane === "queue" ? <ReplyScreen op={op} /> : null}
      {pane === "log" ? <Logs op={op} /> : null}
      {pane === "gemini" ? <SettingsScreen op={op} /> : null}
    </div>
  );
}
