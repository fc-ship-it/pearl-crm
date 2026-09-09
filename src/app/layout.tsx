import type { Metadata, Viewport } from "next";
import "./globals.css";

// A custom `viewport` export replaces Next's default entirely — it does NOT
// merge with it — so omitting width/initialScale here (as this only had
// themeColor before) means mobile browsers get no viewport meta tag at all
// and render the page at desktop width, then scale it down to fit. That's
// almost certainly why the installed phone app looked "not optimized at
// all": everything tiny, pinch-to-zoom required, no responsive behavior.
export const viewport: Viewport = {
  themeColor: "#151b2e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Pearl — AI-first CRM for sales teams, by AHEAD LLC",
  description:
    "The CRM that logs the results on its own, reminds you when it's time to reach back out, and turns meetings into action. Free 7-day trial.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Pearl",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;900&family=Plus+Jakarta+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
