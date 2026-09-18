export async function downloadPublicFile(path: string, filename: string): Promise<void> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Không tải được ${filename}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
