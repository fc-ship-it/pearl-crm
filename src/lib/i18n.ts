// Lightweight, dependency-free i18n — no next-intl/i18next, consistent with
// this project's "zero heavy dependency" approach (see src/lib/google.ts).
// A flat string-keyed dictionary per locale, a translator() factory used by
// server pages (each page already calls getSession() itself, so it also
// resolves its own locale — see resolveUserLocale below), and LOCALES/dir
// metadata used by the client-side <LanguageSwitcher>.
//
// Coverage is intentionally NOT the whole app yet: the nav/app-shell chrome,
// Dashboard, and Statistics pages are translated first (the highest-traffic
// surfaces), with the rest of the app rolling out incrementally. Any key not
// yet defined for a page just isn't looked up there — it keeps rendering the
// plain English string that was already in the JSX, so nothing breaks, it's
// just not translated yet.

export type Locale = "en" | "it" | "ar";

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALES: { id: Locale; label: string; nativeLabel: string; dir: "ltr" | "rtl" }[] = [
  { id: "en", label: "English", nativeLabel: "English", dir: "ltr" },
  { id: "it", label: "Italian", nativeLabel: "Italiano", dir: "ltr" },
  { id: "ar", label: "Arabic", nativeLabel: "العربية", dir: "rtl" },
];

export function isLocale(x: string | null | undefined): x is Locale {
  return x === "en" || x === "it" || x === "ar";
}

export function localeDir(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

const en = {
  "nav.dashboard": "Dashboard",
  "nav.pipeline": "Pipeline",
  "nav.contacts": "Contacts",
  "nav.planWeek": "Plan my week",
  "nav.meetings": "AI Meetings",
  "nav.campaigns": "Campaigns & alerts",
  "nav.statistics": "Statistics",
  "nav.businessMatch": "Business Match",
  "nav.integrations": "Integrations",
  "nav.team": "Team",
  "nav.billing": "Plan & billing",
  "common.logout": "Log out",
  "common.collapseMenu": "Collapse menu",
  "common.expandMenu": "Expand menu",
  "common.freeTrial": "Free trial",
  "common.daysLeft": "{count} days left",
  "common.expired": "expired",
  "common.language": "Language",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.customize": "Customize",

  "dashboard.greeting": "Good morning, {name}",
  "dashboard.subtitle": "Here's what deserves your attention today.",
  "dashboard.stat.openPipeline": "Open pipeline value",
  "dashboard.stat.closedWon": "Closed won",
  "dashboard.stat.conversionRate": "Conversion rate",
  "dashboard.stat.dealsAtRisk": "Deals at risk",
  "dashboard.reactivateToday": "Reactivate today",
  "dashboard.viewPipeline": "View pipeline →",
  "dashboard.noQuietContacts": "No quiet contacts right now. Great work.",
  "dashboard.todaysActivity": "Today's activity",
  "dashboard.recentMeetings": "Recent AI meeting minutes",
  "dashboard.noMeetingsYet": "No meetings logged yet.",
  "dashboard.newMeeting": "+ New meeting",
  "dashboard.pipelineByStage": "Pipeline by stage",
  "dashboard.leadTemperature": "Lead temperature",
  "dashboard.fullStats": "Full stats →",
  "dashboard.customAlertsDue": "{count} custom alert(s) due",
  "dashboard.manageAlerts": "Manage alerts →",

  "statistics.title": "Statistics",
  "statistics.subtitle": "Pipeline, contacts, and lead-quality trends at a glance.",
  "statistics.stat.openPipeline": "Open pipeline value",
  "statistics.stat.closedWon": "Closed won value",
  "statistics.stat.totalContacts": "Total contacts",
  "statistics.stat.hotLeads": "Hot leads",
  "statistics.pipelineByStage": "Pipeline value by stage",
  "statistics.leadTemperature": "Lead temperature",
  "statistics.contactsBySource": "Contacts by source",
  "statistics.newContactsTrend": "New contacts, last 8 weeks",
  "statistics.noContactsYet": "No contacts yet.",
  "statistics.customizeWidgets": "Customize widgets",
  "statistics.customizeHelp": "Choose which cards show on this page, and their order.",
  "statistics.moveUp": "Move up",
  "statistics.moveDown": "Move down",
} as const;

type DictKey = keyof typeof en;

const it: Record<DictKey, string> = {
  "nav.dashboard": "Dashboard",
  "nav.pipeline": "Pipeline",
  "nav.contacts": "Contatti",
  "nav.planWeek": "Pianifica settimana",
  "nav.meetings": "Riunioni AI",
  "nav.campaigns": "Campagne e avvisi",
  "nav.statistics": "Statistiche",
  "nav.businessMatch": "Business Match",
  "nav.integrations": "Integrazioni",
  "nav.team": "Team",
  "nav.billing": "Piano e fatturazione",
  "common.logout": "Esci",
  "common.collapseMenu": "Comprimi menu",
  "common.expandMenu": "Espandi menu",
  "common.freeTrial": "Prova gratuita",
  "common.daysLeft": "{count} giorni rimasti",
  "common.expired": "scaduta",
  "common.language": "Lingua",
  "common.save": "Salva",
  "common.cancel": "Annulla",
  "common.customize": "Personalizza",

  "dashboard.greeting": "Buongiorno, {name}",
  "dashboard.subtitle": "Ecco cosa merita la tua attenzione oggi.",
  "dashboard.stat.openPipeline": "Valore pipeline aperta",
  "dashboard.stat.closedWon": "Trattative vinte",
  "dashboard.stat.conversionRate": "Tasso di conversione",
  "dashboard.stat.dealsAtRisk": "Trattative a rischio",
  "dashboard.reactivateToday": "Da riattivare oggi",
  "dashboard.viewPipeline": "Vai alla pipeline →",
  "dashboard.noQuietContacts": "Nessun contatto silenzioso al momento. Ottimo lavoro.",
  "dashboard.todaysActivity": "Attività di oggi",
  "dashboard.recentMeetings": "Ultimi verbali riunioni AI",
  "dashboard.noMeetingsYet": "Nessuna riunione registrata ancora.",
  "dashboard.newMeeting": "+ Nuova riunione",
  "dashboard.pipelineByStage": "Pipeline per fase",
  "dashboard.leadTemperature": "Temperatura dei lead",
  "dashboard.fullStats": "Tutte le statistiche →",
  "dashboard.customAlertsDue": "{count} avviso/i personalizzato/i in scadenza",
  "dashboard.manageAlerts": "Gestisci avvisi →",

  "statistics.title": "Statistiche",
  "statistics.subtitle": "Pipeline, contatti e qualità dei lead a colpo d'occhio.",
  "statistics.stat.openPipeline": "Valore pipeline aperta",
  "statistics.stat.closedWon": "Valore trattative vinte",
  "statistics.stat.totalContacts": "Contatti totali",
  "statistics.stat.hotLeads": "Lead caldi",
  "statistics.pipelineByStage": "Valore pipeline per fase",
  "statistics.leadTemperature": "Temperatura dei lead",
  "statistics.contactsBySource": "Contatti per fonte",
  "statistics.newContactsTrend": "Nuovi contatti, ultime 8 settimane",
  "statistics.noContactsYet": "Nessun contatto ancora.",
  "statistics.customizeWidgets": "Personalizza i widget",
  "statistics.customizeHelp": "Scegli quali riquadri mostrare in questa pagina, e in che ordine.",
  "statistics.moveUp": "Sposta su",
  "statistics.moveDown": "Sposta giù",
};

const ar: Record<DictKey, string> = {
  "nav.dashboard": "لوحة التحكم",
  "nav.pipeline": "مسار المبيعات",
  "nav.contacts": "جهات الاتصال",
  "nav.planWeek": "خطّط أسبوعي",
  "nav.meetings": "اجتماعات الذكاء الاصطناعي",
  "nav.campaigns": "الحملات والتنبيهات",
  "nav.statistics": "الإحصائيات",
  "nav.businessMatch": "شراكات الأعمال",
  "nav.integrations": "عمليات الدمج",
  "nav.team": "الفريق",
  "nav.billing": "الخطة والفوترة",
  "common.logout": "تسجيل الخروج",
  "common.collapseMenu": "طيّ القائمة",
  "common.expandMenu": "توسيع القائمة",
  "common.freeTrial": "نسخة تجريبية مجانية",
  "common.daysLeft": "متبقٍّ {count} يوم",
  "common.expired": "منتهية",
  "common.language": "اللغة",
  "common.save": "حفظ",
  "common.cancel": "إلغاء",
  "common.customize": "تخصيص",

  "dashboard.greeting": "صباح الخير، {name}",
  "dashboard.subtitle": "إليك ما يستحق اهتمامك اليوم.",
  "dashboard.stat.openPipeline": "قيمة المسار المفتوح",
  "dashboard.stat.closedWon": "صفقات مغلقة رابحة",
  "dashboard.stat.conversionRate": "معدل التحويل",
  "dashboard.stat.dealsAtRisk": "صفقات معرّضة للخطر",
  "dashboard.reactivateToday": "لإعادة التواصل اليوم",
  "dashboard.viewPipeline": "← عرض المسار",
  "dashboard.noQuietContacts": "لا توجد جهات اتصال صامتة الآن. عمل رائع.",
  "dashboard.todaysActivity": "نشاط اليوم",
  "dashboard.recentMeetings": "أحدث محاضر اجتماعات الذكاء الاصطناعي",
  "dashboard.noMeetingsYet": "لا توجد اجتماعات مسجَّلة بعد.",
  "dashboard.newMeeting": "+ اجتماع جديد",
  "dashboard.pipelineByStage": "المسار حسب المرحلة",
  "dashboard.leadTemperature": "درجة اهتمام العملاء المحتملين",
  "dashboard.fullStats": "← كل الإحصائيات",
  "dashboard.customAlertsDue": "{count} تنبيه مخصّص مستحق",
  "dashboard.manageAlerts": "← إدارة التنبيهات",

  "statistics.title": "الإحصائيات",
  "statistics.subtitle": "المسار وجهات الاتصال وجودة العملاء المحتملين بنظرة واحدة.",
  "statistics.stat.openPipeline": "قيمة المسار المفتوح",
  "statistics.stat.closedWon": "قيمة الصفقات المغلقة الرابحة",
  "statistics.stat.totalContacts": "إجمالي جهات الاتصال",
  "statistics.stat.hotLeads": "العملاء المحتملون الساخنون",
  "statistics.pipelineByStage": "قيمة المسار حسب المرحلة",
  "statistics.leadTemperature": "درجة اهتمام العملاء المحتملين",
  "statistics.contactsBySource": "جهات الاتصال حسب المصدر",
  "statistics.newContactsTrend": "جهات الاتصال الجديدة، آخر 8 أسابيع",
  "statistics.noContactsYet": "لا توجد جهات اتصال بعد.",
  "statistics.customizeWidgets": "تخصيص الودجات",
  "statistics.customizeHelp": "اختاري البطاقات التي تظهر في هذه الصفحة وترتيبها.",
  "statistics.moveUp": "تحريك لأعلى",
  "statistics.moveDown": "تحريك لأسفل",
};

const DICTIONARIES: Record<Locale, Record<string, string>> = { en, it, ar };

export function getDictionary(locale: Locale): Record<string, string> {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

/** `t("dashboard.greeting", { name: "Federica" })` → "Good morning, Federica".
 * Falls back to the English string, then to the raw key, so a missing
 * translation never renders blank. */
export function translator(locale: Locale) {
  const dict = getDictionary(locale);
  return function t(key: string, vars?: Record<string, string | number>): string {
    let str = dict[key] ?? en[key as DictKey] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return str;
  };
}
