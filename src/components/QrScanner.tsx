"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, Upload, X } from "lucide-react";

/**
 * Live-camera + upload-image QR scanner. Camera access can fail for
 * reasons that have nothing to do with this code (permission denied, no
 * camera, an embedded/sandboxed context that blocks getUserMedia) so it
 * always degrades to "upload a photo of the QR code" rather than dead-ending.
 */
export default function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStarting, setCameraStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access isn't available in this browser context.");
        setCameraStarting(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraStarting(false);
        tick();
      } catch (err) {
        setCameraError("Couldn't access the camera (permission denied or no camera found). Upload a photo instead.");
        setCameraStarting(false);
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data) {
            onResult(code.data);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFile(file: File) {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) onResult(code.data);
        else setCameraError("No QR code found in that image. Try a clearer photo.");
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(42,20,88,0.55)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card" style={{ width: "100%", maxWidth: 420, padding: 20, background: "var(--panel)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Camera size={16} color="var(--gold)" />
            <span className="font-display" style={{ fontSize: 14, color: "var(--ink)" }}>
              Scan a QR code
            </span>
          </div>
          <button onClick={onClose} aria-label="Close scanner">
            <X size={18} color="var(--ink-dim)" />
          </button>
        </div>

        <div style={{ borderRadius: 12, overflow: "hidden", background: "#000", aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          {!cameraError && (
            <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
          {cameraStarting && !cameraError && (
            <span style={{ position: "absolute", color: "#fff", fontSize: 12 }}>Starting camera…</span>
          )}
          {cameraError && (
            <span style={{ color: "#fff", fontSize: 12, padding: 20, textAlign: "center" }}>{cameraError}</span>
          )}
        </div>
        <canvas ref={canvasRef} style={{ display: "none" }} />

        <p style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 10 }}>
          Point the camera at a business-card QR code or a WhatsApp "click to chat" QR code — it fills in the contact form automatically.
        </p>

        <label
          className="btn-ghost"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginTop: 12,
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "10px 16px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <Upload size={14} /> Upload a photo of the QR code instead
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
      </div>
    </div>
  );
}
