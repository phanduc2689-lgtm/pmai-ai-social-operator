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
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
      <span className={`size-2.5 shrink-0 rounded-full ${ok ? "bg-ok" : "bg-subtle"}`} />
      <div className="min-w-0">
        <p className="font-sans text-[10px] tracking-wide text-subtle uppercase">{label}</p>
        <p className="truncate font-sans text-xs font-medium">{text}</p>
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
  return (
    <p className={`border-b border-border px-4 py-1.5 font-sans text-[11px] md:px-8 ${ok ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn"}`}>{line}</p>
  );
}

export function PmaiApp() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-fg">
        <div className="text-center">
          <PmaiLogo className="mx-auto h-10" />
          <p className="mt-4 font-sans text-sm text-muted">Đang mở PMAI…</p>
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
    <div className="flex min-h-screen overflow-x-hidden bg-bg text-fg">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex h-16 items-center border-b border-border px-4">
          <PmaiLogo className="h-8" />
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = nav === item.id;
            const badge = item.id === "approve" ? pendingApprovals.length : item.id === "logs" ? needsCheck.length : 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setNav(item.id)}
                className={`flex h-11 items-center gap-2 rounded-md px-3 font-sans text-sm ${on ? "bg-accent text-accent-fg" : "hover:bg-info-bg"}`}
              >
                <Icon className="size-4" strokeWidth={1.75} />
                <span className="flex-1 text-left">{item.label}</span>
                {badge > 0 ? <span className="rounded-full bg-danger px-1.5 font-sans text-[10px] text-white">{badge}</span> : null}
              </button>
            );
          })}
        </nav>
        <p className="px-4 py-3 font-sans text-[10px] text-subtle">MVP1 · một operator · local</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-3 md:px-6">
          <span className="md:hidden">
            <PmaiLogo className="h-7" />
          </span>
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
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

        <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2 md:hidden">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setNav(item.id)}
              className={`h-10 shrink-0 rounded-md px-3 font-sans text-xs ${nav === item.id ? "bg-accent text-accent-fg" : "bg-surface"}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {toast ? <div className="mx-4 mt-3 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 font-sans text-sm text-danger">{toast}</div> : null}

        <main id="noi-dung" className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 md:px-8">
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
        {busy ? <div className="pointer-events-none fixed bottom-4 right-4 rounded-md bg-accent px-3 py-2 font-sans text-xs text-accent-fg">Đang xử lý…</div> : null}
        {!gate.ok && !firstRun ? <p className="sr-only">CTA Tạo bài đăng disabled: {gate.reason}</p> : null}
      </div>
    </div>
  );
}
