import { useEffect, useState } from "react";
import { usePmai } from "@/lib/pmai/use-pmai.ts";
import { hasElectronHost, hostInvoke } from "@/lib/pmai/ipc.ts";

export function PmaiApp() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <p className="p-8 text-sm text-muted">Đang mở PMAI…</p>;
  return <Shell />;
}

function Shell() {
  const api = usePmai();
  const { snap, lights, gate, busy, toast } = api;
  const [nav, setNav] = useState("home");
  const firstRun = snap.firstRunStep < 4;
  const tabs = ["home", "compose", "approve", "accounts", "logs", "settings", "help"] as const;
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="grid grid-cols-3 gap-2 border-b border-border bg-surface px-4 py-3 text-xs">
        <span>Hồ sơ: {lights.profile === "RUNNING" ? snap.profile?.name : "Chưa có"}</span>
        <span>Facebook: {snap.identity?.displayName ?? lights.session}</span>
        <span>Trang: {snap.pages.find((p) => p.id === snap.selectedPageId)?.name ?? "Chưa chọn"}</span>
      </header>
      <nav className="flex flex-wrap gap-1 border-b border-border px-2 py-2">
        {tabs.map((id) => (
          <button key={id} type="button" className={`h-10 rounded-md px-3 text-xs ${nav === id ? "bg-accent text-accent-fg" : "bg-surface"}`} onClick={() => setNav(id)}>{id}</button>
        ))}
      </nav>
      {toast ? <div className="m-4 rounded-md bg-danger-bg p-3 text-sm text-danger">{toast}</div> : null}
      <main className="px-4 py-6 md:px-8">
        {firstRun && nav === "home" ? <FirstRun api={api} /> : nav === "compose" ? <Compose api={api} /> : nav === "approve" ? <Approve api={api} /> : nav === "help" ? <Help /> : (
          <section className="mx-auto max-w-2xl">
            <h1 className="font-serif text-3xl">Tổng quan</h1>
            <p className="mt-2 text-sm text-muted">{gate.ok ? "Sẵn sàng soạn bài." : gate.reason}</p>
            <button type="button" disabled={!gate.ok} className="mt-4 h-12 rounded-md bg-accent px-5 text-sm text-accent-fg disabled:opacity-40" onClick={() => setNav("compose")}>Tạo bài đăng</button>
            {api.needsCheck.map((t) => (
              <div key={t.id} className="mt-4 rounded-md bg-warn-bg p-3 text-sm">
                Cần kiểm tra kết quả
                <button type="button" className="ml-2 underline" onClick={() => api.confirm(t.id, true)}>Đã thấy</button>
                <button type="button" className="ml-2 underline" onClick={() => api.confirm(t.id, false)}>Không thấy</button>
              </div>
            ))}
            {nav === "accounts" ? <Accounts api={api} /> : null}
            {nav === "logs" ? <ul className="mt-4 text-sm">{snap.activities.map((a) => <li key={a.id}>{a.action} · {a.result} · {a.detail}</li>)}</ul> : null}
            {nav === "settings" ? <Settings api={api} /> : null}
          </section>
        )}
      </main>
      {busy ? <div className="fixed bottom-4 right-4 rounded-md bg-accent px-3 py-2 text-xs text-accent-fg">Đang xử lý…</div> : null}
    </div>
  );
}

function FirstRun({ api }: { api: ReturnType<typeof usePmai> }) {
  const { snap } = api;
  const [name, setName] = useState("Hồ sơ 1");
  const [fbName, setFbName] = useState("PM Travel");
  const [list, setList] = useState<{ directory: string; displayName: string; facebookLikely: boolean; locked: boolean; userDataDir: string }[]>([]);
  const [picked, setPicked] = useState("");
  const [msg, setMsg] = useState("Đang tìm Chrome…");
  const [pageName, setPageName] = useState("");
  const [pageUrl, setPageUrl] = useState("https://www.facebook.com/");
  const electron = hasElectronHost();
  useEffect(() => {
    void (async () => {
      const r = await hostInvoke<typeof list>("chrome.listProfiles");
      if (!r.ok) { setMsg(r.error?.message ?? "Chạy CAI-DAT-WINDOWS.bat trên Windows"); return; }
      const rows = r.data ?? [];
      setList(rows);
      const auto = rows.find((p) => p.facebookLikely && !p.locked) ?? rows.find((p) => p.facebookLikely) ?? rows[0];
      if (auto) { setPicked(auto.directory); setName(auto.displayName); setMsg(auto.facebookLikely ? `Đã chọn sẵn: ${auto.displayName}` : `Có ${rows.length} hồ sơ`); }
      else setMsg("Không thấy Chrome User Data");
    })();
  }, []);
  async function connect() {
    const sel = list.find((p) => p.directory === picked);
    const launched = await hostInvoke<{ pageState: string; pageName: string | null }>("chrome.launch", { directory: picked || "Default" });
    await api.createProfile(sel?.displayName || name, "ATTACH_EXISTING", { chromeDirectory: picked, userDataDir: sel?.userDataDir, facebookLikely: sel?.facebookLikely });
    if (launched.ok && launched.data && launched.data.pageState !== "login") await api.markLoggedIn(launched.data.pageName || sel?.displayName || "Facebook", { seedDemo: false });
    else if (!launched.ok) api.setToast(launched.error?.message ?? "Không mở Chrome");
  }
  return (
    <section className="mx-auto max-w-xl space-y-6">
      <h1 className="font-serif text-3xl">Dùng Chrome đã login Facebook</h1>
      {!electron ? <pre className="overflow-x-auto rounded-md bg-code p-3 font-mono text-[11px] text-code-fg">git clone https://github.com/phanduc2689-lgtm/pmai-ai-social-operator.git{"\n"}cd pmai-ai-social-operator{"\n"}npm install{"\n"}npx playwright install chrome{"\n"}CAI-DAT-WINDOWS.bat</pre> : null}
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-sm text-muted">{msg}</p>
        {list.map((p) => (
          <button key={p.directory} type="button" onClick={() => { setPicked(p.directory); setName(p.displayName); }} className={`mt-2 flex w-full justify-between rounded-md border px-3 py-3 text-left text-sm ${picked === p.directory ? "border-accent bg-info-bg" : "border-border"}`}>
            <span>{p.displayName} <span className="text-xs text-muted">{p.directory}</span></span>
            <span className="text-xs">{p.facebookLikely ? "Facebook có vẻ đã login" : ""}{p.locked ? " · đang mở" : ""}</span>
          </button>
        ))}
        <button type="button" className="mt-3 h-11 rounded-md bg-accent px-4 text-sm text-accent-fg disabled:opacity-40" disabled={snap.firstRunStep > 1 || !picked} onClick={() => connect()}>Kết nối hồ sơ đã chọn</button>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="font-medium">Xác nhận đăng nhập</p>
        <input className="mt-2 h-11 w-full rounded-md border border-border px-3" value={fbName} onChange={(e) => setFbName(e.target.value)} />
        <button type="button" className="mt-2 h-11 rounded-md bg-accent px-4 text-sm text-accent-fg disabled:opacity-40" disabled={snap.firstRunStep !== 2} onClick={() => api.markLoggedIn(fbName, { seedDemo: !electron })}>Tôi đã đăng nhập</button>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="font-medium">Trang Facebook thật</p>
        <input className="mt-2 h-11 w-full rounded-md border border-border px-3" placeholder="Tên Trang" value={pageName} onChange={(e) => setPageName(e.target.value)} />
        <input className="mt-2 h-11 w-full rounded-md border border-border px-3" value={pageUrl} onChange={(e) => setPageUrl(e.target.value)} />
        <button type="button" className="mt-2 h-11 rounded-md border border-border px-4 text-sm" disabled={snap.firstRunStep < 3} onClick={async () => { const p = await api.addPage(pageName, pageUrl); if (p) await api.selectPage(p.id); }}>Thêm và chọn</button>
        {snap.pages.map((p) => <button key={p.id} type="button" className="mt-2 block w-full rounded-md border border-border px-3 py-2 text-left text-sm" onClick={() => api.selectPage(p.id)}>{p.name} · {p.url}</button>)}
      </div>
    </section>
  );
}

function Compose({ api }: { api: ReturnType<typeof usePmai> }) {
  const { snap, gate } = api;
  const [brief, setBrief] = useState("Tour Hà Giang 2 ngày 1 đêm");
  const draft = snap.contents[0];
  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl">Tạo bài đăng</h1>
      <textarea className="mt-4 min-h-28 w-full rounded-md border border-border p-3" value={brief} onChange={(e) => setBrief(e.target.value)} />
      <button type="button" disabled={!gate.ok} className="mt-3 h-12 rounded-md bg-accent px-5 text-sm text-accent-fg disabled:opacity-40" onClick={() => api.createDraft(brief)}>Soạn nháp</button>
      {draft ? (
        <>
          <textarea className="mt-4 min-h-40 w-full rounded-md border border-border p-3 font-serif" value={draft.body} onChange={(e) => api.updateDraft(draft.id, e.target.value, draft.media)} />
          <button type="button" className="mt-3 h-12 rounded-md bg-accent px-5 text-sm text-accent-fg" onClick={() => api.submit(draft.id)}>Gửi duyệt</button>
        </>
      ) : null}
    </section>
  );
}

function Approve({ api }: { api: ReturnType<typeof usePmai> }) {
  const items = api.snap.approvals.filter((a) => a.status === "PENDING" || a.status === "APPROVED");
  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl">Duyệt</h1>
      {items.map((a) => {
        const c = api.snap.contents.find((x) => x.id === a.contentId);
        const t = api.snap.tasks.find((x) => x.id === a.taskId);
        return (
          <div key={a.id} className="mt-4 rounded-xl border border-border bg-surface p-5">
            <p className="whitespace-pre-wrap font-serif">{c?.body}</p>
            {a.status === "PENDING" ? (
              <button type="button" className="mt-3 h-11 rounded-md bg-accent px-4 text-sm text-accent-fg" onClick={async () => { await api.decide(a.id, "APPROVE"); if (t) await api.execute(t.id); }}>Duyệt & cho phép đăng</button>
            ) : <p className="mt-2 text-sm">{t?.status}</p>}
          </div>
        );
      })}
    </section>
  );
}

function Accounts({ api }: { api: ReturnType<typeof usePmai> }) {
  return <p className="mt-4 text-sm">{api.snap.profile?.name} · {api.snap.profile?.chromeDirectory}</p>;
}
function Settings({ api }: { api: ReturnType<typeof usePmai> }) {
  return <button type="button" className="mt-4 text-sm underline" onClick={() => api.reset()}>Xóa dữ liệu local</button>;
}
function Help() {
  return <pre className="mx-auto max-w-2xl overflow-x-auto rounded-md bg-code p-3 font-mono text-xs text-code-fg">git clone https://github.com/phanduc2689-lgtm/pmai-ai-social-operator.git{"\n"}npm install{"\n"}npx playwright install chrome{"\n"}CAI-DAT-WINDOWS.bat</pre>;
}
