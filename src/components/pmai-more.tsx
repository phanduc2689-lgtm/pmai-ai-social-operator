import { useState } from "react";
import { Check, CircleAlert, Download } from "lucide-react";
import { PmaiLogo } from "@/components/pmai-logo.tsx";
import { downloadPublicFile } from "@/lib/pmai/download.ts";
import { hasElectronHost } from "@/lib/pmai/ipc.ts";
import type { usePmai } from "@/lib/pmai/use-pmai.ts";

const CLONE = `git clone https://github.com/phanduc2689-lgtm/pmai-ai-social-operator.git
cd pmai-ai-social-operator
CAI-DAT-WINDOWS.bat`;

export function Accounts({ api }: { api: ReturnType<typeof usePmai> }) {
  const { snap } = api;
  const [pageName, setPageName] = useState("");
  const [pageUrl, setPageUrl] = useState("https://www.facebook.com/");
  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl">Tài khoản</h1>
      <p className="mt-2 text-sm text-muted">MVP1 một operator. Không lưu mật khẩu Facebook. Không copy cookie.</p>
      <div className="mt-6 space-y-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-subtle">Hồ sơ Chrome</p>
          <p className="font-medium">
            {snap.profile?.name ?? "—"} ({snap.profile?.mode ?? "—"})
          </p>
          {snap.profile?.chromeDirectory ? <p className="text-xs text-muted">{snap.profile.chromeDirectory}</p> : null}
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-subtle">Thêm Trang Facebook thật</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input className="h-11 rounded-md border border-border px-3 text-sm" placeholder="Tên Trang" value={pageName} onChange={(e) => setPageName(e.target.value)} />
            <input
              className="h-11 rounded-md border border-border px-3 text-sm"
              placeholder="https://www.facebook.com/ten-trang"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
            />
          </div>
          <button type="button" className="mt-2 h-11 rounded-md bg-accent px-4 text-sm text-accent-fg" onClick={() => api.addPage(pageName, pageUrl)}>
            Thêm trang
          </button>
        </div>
        {snap.pages.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => api.selectPage(p.id)}
            className={`flex w-full items-center justify-between rounded-xl border p-4 text-left ${
              p.id === snap.selectedPageId ? "border-accent bg-info-bg" : "border-border bg-surface"
            }`}
          >
            <span>
              <span className="block font-medium">{p.name}</span>
              <span className="text-xs text-muted">{p.url}</span>
            </span>
            {p.id === snap.selectedPageId ? <Check className="size-4" /> : null}
          </button>
        ))}
      </div>
    </section>
  );
}

export function Logs({ api }: { api: ReturnType<typeof usePmai> }) {
  const { snap, needsCheck } = api;
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="font-serif text-3xl">Nhật ký</h1>
      {needsCheck.map((t) => (
        <div key={t.id} className="mt-4 flex items-start gap-2 rounded-md bg-warn-bg p-3 text-sm">
          <CircleAlert className="mt-0.5 size-4 text-warn" />
          Task {t.id.slice(-6)} cần kiểm tra kết quả.
        </div>
      ))}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left font-sans text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-subtle">
              <th className="py-2">Thời gian</th>
              <th>Hành động</th>
              <th>Kết quả</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {snap.activities.map((a) => (
              <tr key={a.id} className="border-b border-border/60">
                <td className="py-2 align-top text-xs text-muted">{a.at.slice(11, 19)}</td>
                <td className="align-top">{a.action}</td>
                <td className="align-top">{a.result}</td>
                <td className="align-top text-muted">{a.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function HelpScreen() {
  const steps = [
    ["1. Cài bản thật trên Windows", "Clone GitHub rồi chạy CAI-DAT-WINDOWS.bat. Preview web không gắn được Chrome của bạn."],
    ["2. Hồ sơ Chrome", "App tự quét User Data, chọn sẵn hồ sơ đã login Facebook, rồi kết nối CDP. Đóng hết Chrome nếu bị khóa hồ sơ."],
    ["3. Đăng nhập", "Nếu Facebook đã login, bước này tự xong. Nếu thấy màn login: login tay trên cửa sổ Chrome."],
    ["4. Chọn Trang đích", "Dán URL Page Facebook thật sẽ nhận bài."],
    ["5. Soạn nháp", "Tạo bài đăng → Soạn bản nháp. Sửa chữ, thêm ảnh local. Chưa mở composer Facebook."],
    ["6. Duyệt & cho phép đăng", "Gửi duyệt → Duyệt & cho phép đăng. Chrome mới gõ bài và bấm Đăng."],
    ["7. Kết quả", "SUCCESS = đã ghi permalink. Cần kiểm tra kết quả = có thể đã lên — không đăng lại ngay."],
  ];
  const electron = hasElectronHost();
  return (
    <section className="mx-auto max-w-2xl">
      <PmaiLogo className="mb-4 h-9" />
      <h1 className="font-serif text-3xl">Hướng dẫn sử dụng</h1>
      <p className="mt-2 text-sm text-muted">AI soạn nháp — bạn duyệt — Chrome trên máy mới đăng.</p>
      <pre className="mt-3 overflow-x-auto rounded-md bg-code p-3 font-mono text-xs text-code-fg">{CLONE}</pre>
      {!electron ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadPublicFile("/PMAI-HDSD-MVP1.docx", "PMAI-HDSD-MVP1.docx")}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 font-sans text-sm font-medium text-accent-fg"
          >
            <Download className="size-4" strokeWidth={1.75} />
            Tải HDSD Word
          </button>
        </div>
      ) : null}
      <ol className="mt-8 space-y-4">
        {steps.map(([t, d]) => (
          <li key={t} className="rounded-xl border border-border bg-surface p-4">
            <h2 className="font-sans text-sm font-medium">{t}</h2>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SettingsScreen({ api }: { api: ReturnType<typeof usePmai> }) {
  const { snap } = api;
  const [provider, setProvider] = useState(snap.llm.provider);
  const [model, setModel] = useState(snap.llm.model);
  const [key, setKey] = useState("");
  const [facts, setFacts] = useState(snap.brandFacts);

  return (
    <section className="mx-auto max-w-xl space-y-8">
      <h1 className="font-serif text-3xl">Cài đặt</h1>
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-sans text-sm font-medium">AI · BYOK</h2>
        <p className="mt-1 text-sm text-muted">Bạn tự trả phí nhà cung cấp. Key không hiện lại đầy đủ, không vào log.</p>
        <select className="mt-3 h-11 w-full rounded-md border border-border px-3" value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
          <option value="mock">Demo (không gọi API)</option>
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
          <option value="anthropic">Anthropic</option>
          <option value="xai">xAI / Grok</option>
        </select>
        <input className="mt-2 h-11 w-full rounded-md border border-border px-3" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" />
        <input
          className="mt-2 h-11 w-full rounded-md border border-border px-3"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="API key — dán một lần"
          autoComplete="off"
        />
        <p className="mt-2 text-xs text-muted">
          Đang dùng: {snap.llm.provider} {snap.llm.keyMasked || "(không có khóa)"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="h-11 rounded-md bg-accent px-4 text-sm text-accent-fg" onClick={() => api.setLlm(provider, model, key || null)}>
            Lưu
          </button>
          <button type="button" className="h-11 rounded-md border border-border px-4 text-sm" onClick={() => api.testLlm()}>
            Kiểm tra kết nối
          </button>
          <button type="button" className="h-11 rounded-md border border-border px-4 text-sm" onClick={() => api.clearKey()}>
            Xóa khóa API
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-sans text-sm font-medium">Brand Facts</h2>
        {(["hotline", "pageName", "priceNote", "policyNote"] as const).map((k) => (
          <input
            key={k}
            className="mt-2 h-11 w-full rounded-md border border-border px-3"
            placeholder={k}
            value={facts[k]}
            onChange={(e) => setFacts({ ...facts, [k]: e.target.value })}
          />
        ))}
        <button
          type="button"
          className="mt-3 h-11 rounded-md bg-accent px-4 text-sm text-accent-fg"
          onClick={() => {
            api.setBrand(facts);
            api.refresh();
          }}
        >
          Lưu Brand Facts
        </button>
      </div>
      <button type="button" className="text-sm text-muted underline" onClick={() => api.reset()}>
        Xóa dữ liệu local (demo)
      </button>
    </section>
  );
}
