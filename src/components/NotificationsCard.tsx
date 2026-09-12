"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, CheckCircle2, AlertTriangle } from "lucide-react";

// Returns ArrayBuffer rather than Uint8Array<ArrayBufferLike> — with recent
// TS DOM lib versions, PushSubscriptionOptionsInit.applicationServerKey
// wants a plain ArrayBuffer (or string), and a Uint8Array's .buffer is
// typed as the broader ArrayBufferLike, which no longer satisfies it.
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray.buffer as ArrayBuffer;
}

type Status = "checking" | "unsupported" | "off" | "on" | "denied";

/**
 * Real push notifications ("so a salesperson can never forget a reminder or
 * task"), not just the in-app dashboard banner. Only works two ways a
 * browser can't fake: (1) the app has to be installed to the home screen
 * (Add to Home Screen / Install app) rather than open in a regular tab —
 * on desktop Chrome a pinned tab works too — and (2) on iPhone, iOS 16.4+.
 * On anything older this card just explains that instead of pretending to
 * offer a broken toggle.
 */
export default function NotificationsCard() {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        setStatus(sub ? "on" : "off");
      } catch {
        setStatus("off");
      }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const keyRes = await fetch("/api/push/public-key");
      const keyData = await keyRes.json().catch(() => ({}));
      if (!keyRes.ok || !keyData.publicKey) {
        setMessage({ kind: "error", text: keyData.error || "Le notifiche push non sono ancora configurate su questo deploy." });
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setStatus("on");
      setMessage({ kind: "success", text: "Notifiche attivate su questo dispositivo." });
    } catch (err) {
      setMessage({ kind: "error", text: "Non sono riuscito ad attivare le notifiche. Riprova." });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-2">
        {status === "on" ? <Bell size={16} color="var(--gold)" /> : <BellOff size={16} color="var(--ink-dim)" />}
        <h3 className="font-display text-sm" style={{ color: "var(--ink)" }}>
          Notifiche push
        </h3>
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--ink-dim)" }}>
        Ricevi sul telefono i promemoria scaduti e le attività in scadenza, anche ad app chiusa — così non dimentichi
        un follow-up. Funziona solo con Pearl installata sulla schermata Home (non in una scheda del browser); su
        iPhone serve iOS 16.4 o successivo.
      </p>

      {message && (
        <div
          className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg mb-3"
          style={
            message.kind === "success"
              ? { background: "rgba(23,166,115,0.08)", color: "var(--success)" }
              : { background: "rgba(229,72,77,0.08)", color: "var(--danger)" }
          }
        >
          {message.kind === "success" ? (
            <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {status === "checking" && (
        <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
          Verifica in corso…
        </p>
      )}
      {status === "unsupported" && (
        <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
          Questo browser non supporta le notifiche push, oppure Pearl non è ancora installata sulla schermata Home.
        </p>
      )}
      {status === "denied" && (
        <p className="text-xs" style={{ color: "var(--warning)" }}>
          Le notifiche sono bloccate per Pearl nelle impostazioni del browser/telefono — riattivale da lì per usare
          questa funzione.
        </p>
      )}
      {status === "off" && (
        <button
          onClick={enable}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-60"
          style={{ background: "var(--gold)", color: "var(--ink)" }}
        >
          {busy ? "Un attimo…" : "Attiva notifiche"}
        </button>
      )}
      {status === "on" && (
        <button
          onClick={disable}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-60"
          style={{ background: "var(--panel-2)", border: "1px solid var(--border)", color: "var(--ink)" }}
        >
          {busy ? "Un attimo…" : "Disattiva su questo dispositivo"}
        </button>
      )}
    </div>
  );
}
