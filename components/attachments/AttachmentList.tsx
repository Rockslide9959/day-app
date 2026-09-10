"use client";

import { useEffect, useRef, useState } from "react";

export type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

// Attachment list + upload for a single to-do, event/task or notebook
// entry, keyed by linkedType/linkedId — same loose-reference convention as
// Timer. Images get an inline thumbnail; other files are download links.
export default function AttachmentList({
  linkedType,
  linkedId,
}: {
  linkedType: "todo" | "schedule" | "notebook";
  linkedId: string;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/attachments?linkedType=${linkedType}&linkedId=${linkedId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAttachments(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [linkedType, linkedId]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setUploading(true);
    setError("");
    try {
      // Upload sequentially so a partial failure still leaves the earlier
      // files attached, and prepend each as it lands.
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        form.append("linkedType", linkedType);
        form.append("linkedId", linkedId);
        const res = await fetch("/api/attachments", { method: "POST", body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || `Couldn't upload ${file.name}`);
        }
        const attachment = await res.json();
        setAttachments((prev) => [attachment, ...prev]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload file. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/attachments/${id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800 crimson:border-crimson-border">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 crimson:text-crimson-text-muted">Attachments</p>

      {!loading && attachments.length > 0 && (
        <ul className="space-y-2">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs shadow-sm dark:bg-zinc-900 crimson:bg-crimson-surface"
            >
              {isImage(a.mimeType) && (
                <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded blob served from our API; next/image can't optimize it */}
                  <img
                    src={`/api/attachments/${a.id}`}
                    alt={a.fileName}
                    loading="lazy"
                    decoding="async"
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                </a>
              )}
              <a
                href={`/api/attachments/${a.id}${isImage(a.mimeType) ? "?download=1" : ""}`}
                className="min-w-0 flex-1 truncate text-zinc-600 hover:underline dark:text-zinc-300 crimson:text-crimson-text-secondary"
              >
                {isImage(a.mimeType) ? "🖼️" : "📎"} {a.fileName}
                <span className="ml-1 text-zinc-400 crimson:text-crimson-text-muted">({formatFileSize(a.fileSize)})</span>
              </a>
              <button
                type="button"
                onClick={() => handleDelete(a.id)}
                className="shrink-0 px-1 text-zinc-300 hover:text-red-500 crimson:text-crimson-text-secondary crimson:hover:text-crimson-accent"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-red-500 crimson:text-crimson-highlight">{error}</p>}

      <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full rounded-xl border border-dashed border-zinc-200 py-2 text-xs text-zinc-500 disabled:opacity-40 dark:border-zinc-800 crimson:border-crimson-border crimson:text-crimson-text-secondary"
      >
        {uploading ? "Uploading…" : "+ Attach files or images"}
      </button>
    </div>
  );
}
