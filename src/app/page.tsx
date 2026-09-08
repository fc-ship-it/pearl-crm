import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Star,
  Check,
  Minus,
  Kanban,
  Bell,
  Video,
  Mail,
  BarChart3,
  Users,
  ShieldCheck,
} from "lucide-react";
import InteractivePipelineDemo from "@/components/landing/InteractivePipelineDemo";
import RoiCalculator from "@/components/landing/RoiCalculator";
import FaqAccordion from "@/components/landing/FaqAccordion";
import ChatWidget from "@/components/landing/ChatWidget";

const FEATURES = [
  { icon: Kanban, title: "Visual pipeline", desc: "Drag&drop kanban with value, probability and forecast per stage." },
  { icon: Bell, title: "Time × value alerts", desc: "Always know who to reach out to today, ranked by real urgency." },
  { icon: Video, title: "AI meeting minutes", desc: "Notes or transcript → key points, decisions, automatic tasks." },
  { icon: Mail, title: "Gmail, WhatsApp, Calendar", desc: "Every email, message and appointment in the contact's timeline." },
  { icon: BarChart3, title: "Widget dashboard", desc: "Pipeline, alerts, activity and monthly performance at a glance." },
  { icon: Users, title: "Team or individual view", desc: "The sales director sees everything, the rep sees their own." },
];

export default function LandingPage() {
  return (
    <div style={{ background: "var(--bg)" }}>
      {/* NAV */}
      <header className="sticky top-0 z-40 backdrop-blur border-b" style={{ borderColor: "var(--border)", background: "rgba(247,244,251,0.85)" }}>
        <div className="max-w-[1200px] mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/brand/pearl-logo-64.png" alt="" width={20} height={20} />
            <span className="font-display text-sm" style={{ color: "var(--ink)" }}>
              PEARL
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm" style={{ color: "var(--ink-dim)" }}>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm hidden sm:block" style={{ color: "var(--ink-dim)" }}>
              Log in
            </Link>
            <Link href="/signup" className="btn-glow text-sm px-4 py-2 rounded-xl font-medium" style={{ background: "var(--gold)", color: "var(--ink)" }}>
              Try it free
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden max-w-[1200px] mx-auto px-5 pt-16 pb-14 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        <div className="hero-blob hero-blob-1" />
        <div className="hero-blob hero-blob-2" />
        <div className="hero-blob hero-blob-3" />
        <div className="relative z-10 fade-up">
          <span className="text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-full inline-flex items-center" style={{ background: "rgba(212,168,67,0.12)", color: "var(--gold)" }}>
            <span className="live-dot pulse-dot" />
            AI-first CRM for sales teams
          </span>
          <h1 className="font-display text-3xl md:text-[44px] leading-tight mt-4" style={{ color: "var(--ink)" }}>
            Stop losing deals across email, WhatsApp and{" "}
            <span style={{ background: "linear-gradient(90deg, var(--cyan), var(--magenta))", WebkitBackgroundClip: "text", color: "transparent" }}>
              disconnected spreadsheets
            </span>
            .
          </h1>
          <p className="text-base mt-5" style={{ color: "var(--ink-dim)" }}>
            Pearl automatically logs every interaction, tells you exactly who to reach out to today, and turns
            meetings into tasks — so you spend less time on admin and more time closing.
          </p>
          <div className="flex flex-wrap gap-3 mt-7">
            <Link
              href="/signup"
              className="btn-glow flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium"
              style={{ background: "linear-gradient(135deg, var(--gold), var(--gold-soft))", color: "var(--ink)" }}
            >
              Start your free trial <ArrowRight size={16} />
            </Link>
            <Link href="/login" className="btn-glow flex items-center gap-2 px-5 py-3 rounded-xl text-sm" style={{ border: "1px solid var(--border)", color: "var(--ink)" }}>
              Try the demo
            </Link>
          </div>
          <div className="flex items-center gap-2 mt-6 text-xs" style={{ color: "var(--ink-dim)" }}>
            <div className="flex text-[13px]" style={{ color: "var(--gold)" }}>
              {"★★★★★"}
            </div>
            <span>Built on the AHEAD LLC AI-first method · no card required for the demo</span>
          </div>
        </div>
        <div className="relative z-10 fade-up fade-up-delay-1">
          <InteractivePipelineDemo />
        </div>
      </section>

      {/* BRAND SHOWCASE */}
      <section className="max-w-[1200px] mx-auto px-5 pb-16">
        <div className="relative rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <Image
            src="/brand/pearl-hero.jpg"
            alt="Pearl CRM Platform — by AHEAD LLC, Dubai"
            width={1600}
            height={893}
            className="w-full h-auto block"
            priority
          />
        </div>
      </section>

      {/* SOCIAL PROOF STRIP */}
      <section className="border-y" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-[1200px] mx-auto px-5 py-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs" style={{ color: "var(--ink-dim)" }}>
          <span className="flex items-center gap-1">
            <Star size={13} color="var(--gold)" fill="var(--gold)" /> 4.9/5 average rating
          </span>
          <span>Built for sales teams across the UAE 🇦🇪 and beyond</span>
          <span>Support in English</span>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="max-w-[1200px] mx-auto px-5 py-16">
        <div className="text-center max-w-[600px] mx-auto mb-10">
          <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--cyan)" }}>
            What's included
          </span>
          <h2 className="font-display text-2xl mt-2" style={{ color: "var(--ink)" }}>
            Everything you need, nothing you don't.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: "rgba(212,168,67,0.12)" }}>
                <f.icon size={18} color="var(--gold)" />
              </div>
              <div className="text-sm font-medium mb-1" style={{ color: "var(--ink)" }}>
                {f.title}
              </div>
              <div className="text-xs" style={{ color: "var(--ink-dim)" }}>
                {f.desc}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3" style={{ border: "1px dashed var(--border)" }}>
          <span className="text-sm" style={{ color: "var(--ink-dim)" }}>
            And these are just a few of the features included.
          </span>
          <span className="text-xs px-3 py-1.5 rounded-full font-mono" style={{ background: "var(--panel-2)", color: "var(--gold)" }}>
            +20 features
          </span>
        </div>
      </section>

      {/* COMPARISON */}
      <section className="max-w-[1200px] mx-auto px-5 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-6">
            <h3 className="text-sm font-medium mb-4" style={{ color: "var(--ink-dim)" }}>
              Without Pearl
            </h3>
            <ul className="space-y-3">
              {["Contacts lost across spreadsheets, email and WhatsApp", "No alert on who you haven't heard from in weeks", "Meeting minutes written by hand (or never)", "Reports built by hand every month-end"].map((t) => (
                <li key={t} className="flex items-start gap-3 text-sm" style={{ color: "var(--ink-dim)" }}>
                  <span className="w-4 h-4 rounded flex items-center justify-center mt-0.5 shrink-0" style={{ background: "var(--panel-2)" }}>
                    <Minus size={11} color="var(--ink-dim)" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-6" style={{ border: "1px solid var(--gold)" }}>
            <h3 className="text-sm font-medium mb-4" style={{ color: "var(--gold)" }}>
              With Pearl
            </h3>
            <ul className="space-y-3">
              {["Every interaction automatically logged in the timeline", "Alerts prioritized by silence time × deal value", "Structured minutes generated from notes or transcript", "Dashboard always up to date, zero manual work"].map((t) => (
                <li key={t} className="flex items-start gap-3 text-sm" style={{ color: "var(--ink)" }}>
                  <span className="w-4 h-4 rounded flex items-center justify-center mt-0.5 shrink-0" style={{ background: "rgba(52,211,153,0.15)" }}>
                    <Check size={11} color="var(--success)" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ROI CALCULATOR */}
      <section className="max-w-[900px] mx-auto px-5 py-16">
        <div className="text-center mb-8">
          <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--magenta)" }}>
            Let's do the math
          </span>
          <h2 className="font-display text-2xl mt-2" style={{ color: "var(--ink)" }}>
            How much time does your team lose chasing contacts?
          </h2>
        </div>
        <RoiCalculator />
      </section>

      {/* PRICING */}
      <section id="pricing" className="max-w-[1200px] mx-auto px-5 py-16">
        <div className="text-center max-w-[600px] mx-auto mb-10">
          <h2 className="font-display text-2xl" style={{ color: "var(--ink)" }}>
            One price, all included.
          </h2>
          <p className="text-sm mt-2" style={{ color: "var(--ink-dim)" }}>
            No hidden costs, no extra tools to pay for separately.
          </p>
        </div>
        <div className="max-w-[420px] mx-auto card p-6" style={{ border: "1px solid var(--gold)" }}>
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={16} color="var(--gold)" />
            <span className="text-xs" style={{ color: "var(--ink-dim)" }}>
              Free trial
            </span>
          </div>
          <div className="font-display text-3xl mb-1" style={{ color: "var(--ink)" }}>
            7 days
          </div>
          <p className="text-sm mb-5" style={{ color: "var(--ink-dim)" }}>
            No card required in this demo.
          </p>
          <Link
            href="/signup"
            className="btn-glow block text-center py-3 rounded-xl text-sm font-medium"
            style={{ background: "linear-gradient(135deg, var(--gold), var(--gold-soft))", color: "var(--ink)" }}
          >
            Start free trial
          </Link>
          <p className="text-xs text-center mt-3" style={{ color: "var(--ink-dim)" }}>
            See paid plans after logging in, under Settings.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-[1200px] mx-auto px-5 py-16">
        <div className="text-center mb-10">
          <h2 className="font-display text-2xl" style={{ color: "var(--ink)" }}>
            Frequently asked questions
          </h2>
        </div>
        <FaqAccordion />
      </section>

      {/* FOOTER */}
      <footer className="border-t" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-[1200px] mx-auto px-5 py-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Image src="/brand/pearl-logo-64.png" alt="" width={18} height={18} />
              <span className="font-display text-sm" style={{ color: "var(--ink)" }}>
                PEARL
              </span>
            </div>
            <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
              A product by AHEAD LLC — Dubai Silicon Oasis, Office A2 Digital Park, Dubai, UAE
            </p>
          </div>
          <div className="text-xs" style={{ color: "var(--ink-dim)" }}>
            <div className="text-sm mb-2" style={{ color: "var(--ink)" }}>
              Contact
            </div>
            ceo@ahead-llc.com
            <br />
            +971 58 548 38 03
            <br />
            www.ahead-llc.com
          </div>
          <div className="text-xs" style={{ color: "var(--ink-dim)" }}>
            <div className="text-sm mb-2" style={{ color: "var(--ink)" }}>
              Legal
            </div>
            <Link href="/privacy">Privacy</Link>
            <br />
            <Link href="/terms">Terms & conditions</Link>
          </div>
        </div>
        <div className="text-center text-[11px] pb-6" style={{ color: "var(--ink-dim)" }}>
          © {new Date().getFullYear()} AHEAD LLC. All rights reserved. Demo MVP — sample data.
        </div>
      </footer>

      <ChatWidget />
    </div>
  );
}
