"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";

// Lightweight YouTube embed: shows our own poster (same pearl as the video)
// and only loads YouTube's player after the visitor clicks Play, so the
// landing page stays fast and no YouTube cookies are set before consent.
// youtube-nocookie.com is YouTube's privacy-enhanced embed domain.
export default function PromoVideo({ videoId, title }: { videoId: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden"
      style={{ aspectRatio: "16 / 9", border: "1px solid var(--border)", background: "#070b18" }}
    >
      {playing ? (
        <iframe
          className="absolute inset-0 w-full h-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 w-full h-full"
          aria-label={`Play video: ${title}`}
        >
          <Image src="/brand/pearl-video-poster.jpg" alt="" fill sizes="(max-width: 1200px) 100vw, 1200px" className="object-cover" />
          <span className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(7,11,24,0) 45%, rgba(7,11,24,0.75) 100%)" }} />
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full transition-transform group-hover:scale-110"
            style={{ width: 84, height: 84, background: "linear-gradient(135deg, var(--gold), var(--gold-soft))", boxShadow: "0 0 40px rgba(51,224,207,0.55)" }}
          >
            <Play size={34} fill="currentColor" style={{ color: "#151b2e", marginLeft: 4 }} />
          </span>
          <span className="absolute left-5 bottom-4 text-left">
            <span className="block font-display text-lg md:text-2xl" style={{ color: "#f0f2f7" }}>{title}</span>
            <span className="block text-xs md:text-sm mt-1" style={{ color: "#bfefff" }}>Watch the 2-minute film</span>
          </span>
        </button>
      )}
    </div>
  );
}
