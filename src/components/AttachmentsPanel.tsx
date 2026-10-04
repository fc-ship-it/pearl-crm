"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileText, RefreshCw, Trash2 } from "lucide-react";
import type { Attachment } from "@/lib/data";

type Target = { contactId?: string; dealId?: string; meetingId?: string };

function targetQuery(target: Target): string {
  const p = new URLSearchParams();
  if (target.contactId) p.set("contactId", target.contactId);
  if (target.dealId) p.set("dealId", target.dealId);
  if (target.meetingId) p.set("meetingId", target.meetingId);
  return p.toString();
}

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.72;

/** Resizes + compresses a photo client-side (via canvas, same approach as
 * QrScanner.tsx's image handling) before it's ever sent to the server — a
 * raw phone photo can be 4-12MB; this gets it down to a few hundred KB,
 * which matters since every photo is stored as base64 directly in Postgres
 * (see the `attachments` table in db.ts) rather than a separate object
 * store. */
function compressImage(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lettura del file non riuscita."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Immagine non valida."));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width >= height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas non disponibile."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        resolve({ base64: dataUrl.split(",")[1] || "", mimeType: "image/jpeg" });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Photo attachments for a contact, deal or meeting — plain site-inspection
 * photos ("+ Aggiungi foto") or a photographed handwritten note that Pearl
 * transcribes automatically via AI ("+ Trascrivi appunti"). Pass exactly one
 * of contactId/dealId/meetingId; the panel fetches, uploads and deletes
 * scoped to that one entity via /api/attachments.
 *
 * Works fully even without ANTHROPIC_API_KEY configured (see vision.ts): the
 * photo still saves, transcription just comes back "failed" with a clear
 * reason, and the textarea below it lets the text be typed in by hand —
 * upgrading to automatic the moment the key is added, no re-upload needed.
 */
export default function AttachmentsPanel({ contactId, dealId, meetingId }: Target) {
  const router = useRouter();
  const target: Target = { contactId, dealId, meetingId };
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [uploading, setUploading] = useState<"photo" | "note" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Transcription failure reasons aren't stored in the database (only the
  // "failed" status is) — kept here instead, keyed by attachment id, so the
  // "why" is still shown right after it happens without a schema change for
  // what's otherwise transient, one-time-useful info.
  const [transcriptionErrors, setTranscriptionErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`/api/attachments?${targetQuery(target)}`)
      .then((res) => (res.ok ? res.json() : { attachments: [] }))
      .then((data) => setItems(data.attachments || []))
      .catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, dealId, meetingId]);

  async function handleUpload(file: File, kind: "photo" | "note") {
    setError(null);
    setUploading(kind);
    try {
      const { base64, mimeType } = await compressImage(file);
      const res = await fetch("/api/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, kind, fileName: file.name, mimeType, dataBase64: base64 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Caricamento non riuscito.");
        return;
      }
      setItems((prev) => [data.attachment, ...(prev || [])]);
      if (data.transcriptionError) {
        setTranscriptionErrors((prev) => ({ ...prev, [data.attachment.id]: data.transcriptionError }));
      }
      router.refresh();
    } catch {
      setError("Non sono riuscito a elaborare questa foto. Riprova con un'altra immagine.");
    } finally {
      setUploading(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Eliminare questa foto?")) return;
    setItems((prev) => (prev || []).filter((a) => a.id !== id));
    await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function handleRetranscribe(id: string) {
    setTranscriptionErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setItems((prev) => (prev || []).map((a) => (a.id === id ? { ...a, transcriptionStatus: "processing" } : a)));
    const res = await fetch(`/api/attachments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retranscribe" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && data.error) {
      setTranscriptionErrors((prev) => ({ ...prev, [id]: data.error }));
    }
    setItems((prev) =>
      (prev || []).map((a) =>
        a.id === id
          ? {
              ...a,
              transcriptionStatus: res.ok ? "done" : "failed",
              transcription: res.ok ? data.transcription : a.transcription,
            }
          : a
      )
    );
  }

  async function handleSaveTranscription(id: string, text: string) {
    await fetch(`/api/attachments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcription: text }),
    });
    setItems((prev) => (prev || []).map((a) => (a.id === id ? { ...a, transcription: text, transcriptionStatus: "done" } : a)));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <label
          className="btn-ghost"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "8px 14px",
            fontSize: 13,
            cursor: uploading ? "default" : "pointer",
            opacity: uploading && uploading !== "photo" ? 0.5 : 1,
          }}
        >
          <Camera size={14} />
          {uploading === "photo" ? "Caricamento…" : "+ Aggiungi foto"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            disabled={!!uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) handleUpload(file, "photo");
            }}
          />
        </label>
        <label
          className="btn-ghost"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "8px 14px",
            fontSize: 13,
            cursor: uploading ? "default" : "pointer",
            opacity: uploading && uploading !== "note" ? 0.5 : 1,
          }}
        >
          <FileText size={14} />
          {uploading === "note" ? "Trascrizione in corso…" : "+ Trascrivi appunti"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            disabled={!!uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) handleUpload(file, "note");
            }}
          />
        </label>
      </div>

      {error && (
        <p className="text-xs mb-3" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {items === null && (
        <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
          Caricamento…
        </p>
      )}
      {items !== null && items.length === 0 && (
        <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
          Nessuna foto ancora — aggiungi una foto del sopralluogo, o fotografa un appunto scritto a mano per farlo trascrivere.
        </p>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {(items || []).map((a) => (
          <AttachmentCard
            // Remounts (resetting the card's local draft state) whenever the
            // transcription text itself changes from outside — a fresh AI
            // result after "Riprova" — rather than syncing it with an
            // effect; see AttachmentCard's own note.
            key={`${a.id}:${a.transcription ?? ""}`}
            attachment={a}
            errorMessage={transcriptionErrors[a.id]}
            onDelete={() => handleDelete(a.id)}
            onRetranscribe={() => handleRetranscribe(a.id)}
            onSaveTranscription={(text) => handleSaveTranscription(a.id, text)}
          />
        ))}
      </div>
    </div>
  );
}

function AttachmentCard({
  attachment,
  errorMessage,
  onDelete,
  onRetranscribe,
  onSaveTranscription,
}: {
  attachment: Attachment;
  errorMessage?: string;
  onDelete: () => void;
  onRetranscribe: () => void;
  onSaveTranscription: (text: string) => Promise<void>;
}) {
  const dataUrl = `data:${attachment.mimeType};base64,${attachment.dataBase64}`;
  // Initialized once per mount; the parent remounts this card (via its
  // `key`, see AttachmentsPanel above) whenever attachment.transcription
  // changes from outside — a fresh AI result after "Riprova" — so this never
  // needs to be synced back to the prop with an effect, and never clobbers
  // text the user is still typing on an unrelated re-render of the list.
  const [draft, setDraft] = useState(attachment.transcription || "");
  const [saving, setSaving] = useState(false);

  return (
    <div className="rounded-xl p-3" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
      <a href={dataUrl} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element -- this is a
            data: URI held in memory/the DB already, not a URL next/image
            could fetch and optimize */}
        <img
          src={dataUrl}
          alt={attachment.fileName || "Foto"}
          style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 8, display: "block" }}
        />
      </a>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px]" style={{ color: "var(--ink-dim)" }}>
          {new Date(attachment.createdAt).toLocaleDateString("it-IT")}
        </span>
        <button type="button" onClick={onDelete} aria-label="Elimina foto">
          <Trash2 size={13} color="var(--ink-dim)" />
        </button>
      </div>

      {attachment.kind === "note" && (
        <div className="mt-2">
          {attachment.transcriptionStatus === "processing" && (
            <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
              Trascrizione in corso…
            </p>
          )}
          {attachment.transcriptionStatus === "failed" && (
            <div className="mb-2">
              {errorMessage && (
                <p className="text-[11px] mb-1" style={{ color: "var(--warning)" }}>
                  {errorMessage}
                </p>
              )}
              <button
                type="button"
                onClick={onRetranscribe}
                className="text-[11px] flex items-center gap-1"
                style={{ color: "var(--cyan)" }}
              >
                <RefreshCw size={11} /> Riprova trascrizione AI
              </button>
            </div>
          )}
          {attachment.transcriptionStatus !== "processing" && (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Scrivi qui il testo degli appunti…"
                rows={4}
                className="w-full text-xs rounded-lg p-2"
                style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--ink)", resize: "vertical" }}
              />
              {draft !== (attachment.transcription || "") && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    await onSaveTranscription(draft);
                    setSaving(false);
                  }}
                  className="text-[11px] mt-1.5 px-2.5 py-1 rounded-lg font-medium disabled:opacity-60"
                  style={{ background: "var(--gold)", color: "var(--ink)" }}
                >
                  {saving ? "Salvataggio…" : "Salva testo"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
