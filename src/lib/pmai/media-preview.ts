const urls = new Map<string, string>();

export function rememberPreview(mediaId: string, objectUrl: string) {
  const prev = urls.get(mediaId);
  if (prev && prev !== objectUrl) URL.revokeObjectURL(prev);
  urls.set(mediaId, objectUrl);
}

export function forgetPreview(mediaId: string) {
  const prev = urls.get(mediaId);
  if (prev) URL.revokeObjectURL(prev);
  urls.delete(mediaId);
}

export function previewOf(mediaId: string): string | undefined {
  return urls.get(mediaId);
}
