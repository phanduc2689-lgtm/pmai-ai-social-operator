import { useEffect, useState } from "react";
import { BookOpen, FileText, LayoutDashboard, ListTodo, Settings, Shield, Users } from "lucide-react";
import { FirstRun } from "@/components/pmai-first-run.tsx";
import { PmaiLogo } from "@/components/pmai-logo.tsx";
import { Accounts, Approve, Compose, Dashboard, HelpScreen, Logs, SettingsScreen } from "@/components/pmai-screens.tsx";
import { hasElectronHost, hostInvoke } from "@/lib/pmai/ipc.ts";
import { usePmai } from "@/lib/pmai/use-pmai.ts";

type NavId = "home" | "compose" | "approve" | "accounts" | "logs" | "settings" | "help";

const NAV: { id: NavId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "home", label: "Tổng quan", icon: LayoutDashboard },
  { id: "compose", label: "Tạo bài đăng", icon: FileText },
  { id: "approve", label: "Duyệt", icon: Shield },
  { id: "accounts", label: "Tài khoản", icon: Users },
  { id: "logs", label: "Nhật ký", icon: ListTodo },
  { id: "settings", label: "Cài đặt", icon: Settings },
  { id: "help", label: "Hướng dẫn", icon: BookOpen },
];

function Light({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <div className="pmai-light">
      <span className={`pmai-dot ${ok ? "is-ok" : ""}`} />
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-subtle)" }}>{label}</p>
        <p style={{ margin: 2, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</p>
      </div>
    </div>
  );
}

function ChromeLiveBar() {
  const [line, setLine] = useState("Chrome: chưa gắn (preview web không điều khiển Chrome máy bạn)");
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!hasElectronHost()) return;
    let stop = false;
    async function tick() {
      const st = await hostInvoke<{ cdpAvailable: boolean; live: boolean; liveMode: string | null; locked: boolean }>("chrome.status");
      let extra = "";
      if (st.ok && st.data?.live) {
        const ob = await hostInvoke<{ url: string; pageState: string; pageName: string | null }>("chrome.observe");
        if (ob.ok && ob.data) extra = ` · ${ob.data.pageState} · ${ob.data.url}`;
      }
      if (stop) return;
      if (!st.ok) {
        setOk(false);
        setLine(st.error?.message ?? "Chrome IPC lỗi");
      } else {
        const d = st.data;
        const connected = Boolean(d?.live || d?.cdpAvailable);
        setOk(connected);
        setLine(
          `Chrome ${d?.live ? "đã gắn" : "chưa gắn"} · CDP ${d?.cdpAvailable ? "9222 mở" : "tắt"}${d?.liveMode ? ` · ${d.liveMode}` : ""}${d?.locked ? " · đang khóa hồ sơ" : ""}${extra}`,
        );
      }
      if (!stop) setTimeout(tick, 4000);
    }
    void tick();
    return () => {
      stop = true;
    };
  }, []);
  return <p className={`pmai-live ${ok ? "is-ok" : "is-warn"}`}>{line}</p>;
}

export function PmaiApp() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="pmai-shell" style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <PmaiLogo />
          <p className="pmai-hint">Đang mở PMAI…</p>
        </div>
      </div>
    );
  }
  return <PmaiShell />;
}

function PmaiShell() {
  const api = usePmai();
  const { snap, lights, gate, pendingApprovals, needsCheck, busy, toast } = api;
  const [nav, setNav] = useState<NavId>("home");
  const [draftId, setDraftId] = useState<string | null>(null);
  const firstRun = snap.firstRunStep < 4;

  return (
    <div className="pmai-shell">
      <aside className="pmai-aside">
        <div className="pmai-brand">
          <PmaiLogo />
        </div>
        <nav className="pmai-nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = nav === item.id;
            const badge = item.id === "approve" ? pendingApprovals.length : item.id === "logs" ? needsCheck.length : 0;
            return (
              <button key={item.id} type="button" onClick={() => setNav(item.id)} className={`pmai-nav-btn ${on ? "is-on" : ""}`}>
                <Icon size={16} strokeWidth={1.75} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {badge > 0 ? (
                  <span style={{ background: "var(--color-danger)", color: "#fff", borderRadius: 999, padding: "1px 7px", fontSize: 10 }}>{badge}</span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <p style={{ padding: "12px 16px", fontSize: 11, color: "var(--color-subtle)" }}>MVP1 · một operator · local</p>
      </aside>

      <div className="pmai-col">
        <header className="pmai-header">
          <span className="pmai-tabs" style={{ display: "inline-flex", border: 0, padding: 0 }}>
            <PmaiLogo />
          </span>
          <div className="pmai-lights">
            <Light label="Hồ sơ trình duyệt" ok={lights.profile === "RUNNING"} text={snap.profile?.name ?? "Chưa có"} />
            <Light
              label="Phiên Facebook"
              ok={lights.session === "CONNECTED"}
              text={lights.session === "CONNECTED" ? (snap.identity?.displayName ?? "Đã login") : lights.session}
            />
            <Light label="Trang đích" ok={lights.page === "VERIFIED"} text={snap.pages.find((p) => p.id === snap.selectedPageId)?.name ?? "Chưa chọn"} />
          </div>
        </header>
        <ChromeLiveBar />

        <div className="pmai-tabs">
          {NAV.map((item) => (
            <button key={item.id} type="button" onClick={() => setNav(item.id)} className={`pmai-tab ${nav === item.id ? "is-on" : ""}`}>
              {item.label}
            </button>
          ))}
        </div>

        {toast ? (
          <div style={{ margin: "12px 16px 0", padding: "10px 12px", borderRadius: 8, background: "var(--color-danger-bg)", color: "var(--color-danger)", fontSize: 14 }}>
            {toast}
          </div>
        ) : null}

        <main id="noi-dung" className="pmai-main">
          {firstRun && nav === "home" ? (
            <FirstRun api={api} />
          ) : nav === "home" ? (
            <Dashboard api={api} onCompose={() => setNav("compose")} onApprove={() => setNav("approve")} />
          ) : nav === "compose" ? (
            <Compose api={api} draftId={draftId} setDraftId={setDraftId} />
          ) : nav === "approve" ? (
            <Approve api={api} />
          ) : nav === "accounts" ? (
            <Accounts api={api} />
          ) : nav === "logs" ? (
            <Logs api={api} />
          ) : nav === "help" ? (
            <HelpScreen />
          ) : (
            <SettingsScreen api={api} />
          )}
        </main>
        {busy ? (
          <div style={{ position: "fixed", right: 16, bottom: 16, background: "var(--color-accent)", color: "var(--color-accent-fg)", padding: "8px 12px", borderRadius: 8, fontSize: 12 }}>
            Đang xử lý…
          </div>
        ) : null}
        {!gate.ok && !firstRun ? <p className="sr-only">CTA Tạo bài đăng disabled: {gate.reason}</p> : null}
      </div>
    </div>
  );
}
