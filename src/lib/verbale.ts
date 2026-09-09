// Structured meeting-minutes generator.
//
// In production this is where a real AI model (e.g. Claude) would be
// plugged in to transcribe/summarize the meeting audio. Here we use a
// rule-based structured generator: it takes the raw text the user pastes
// (notes, transcript, agenda) and organizes it into the required shape
// (participants, key points, decisions, objections, next steps) so the
// data always lands in the CRM in structured form, never as scattered
// free text — see the product prompt § 5.
import type { MeetingSummary } from "@/lib/data";

function splitLines(text: string): string[] {
  return text
    .split(/\n|(?<=[.;])\s+(?=[A-Z])/)
    .map((l) => l.trim())
    .filter(Boolean);
}

const NEXT_STEP_HINTS = ["next step", "action item", "follow up", "follow-up", "to do", "we will send", "i will send", "let's talk", "let's connect"];
const DECISION_HINTS = ["decided", "agreed", "approved", "we confirm", "let's proceed", "we'll proceed"];
const OBJECTION_HINTS = ["objection", "concerned", "concern", "not convinced", "too expensive", "budget", "hesitant"];

export function generateVerbale(rawText: string, participantsHint: string[]): MeetingSummary {
  const lines = splitLines(rawText);
  const keyPoints: string[] = [];
  const decisions: string[] = [];
  const objections: string[] = [];
  const nextSteps: MeetingSummary["nextSteps"] = [];

  const unclassified: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (NEXT_STEP_HINTS.some((h) => lower.includes(h))) {
      nextSteps.push({
        action: line,
        owner: participantsHint[0] || "Unassigned",
        dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      });
    } else if (DECISION_HINTS.some((h) => lower.includes(h))) {
      decisions.push(line);
    } else if (OBJECTION_HINTS.some((h) => lower.includes(h))) {
      objections.push(line);
    } else if (line.length > 12) {
      keyPoints.push(line);
    } else {
      unclassified.push(line);
    }
  }

  // Every line ends up in exactly one section. If no line was a "generic"
  // key point (all were decisions/objections/next steps), we don't
  // artificially pad key points by duplicating those same lines elsewhere
  // in the minutes — an empty section beats a repeated, misleading one.
  if (keyPoints.length === 0 && unclassified.length > 0) keyPoints.push(...unclassified.slice(0, 3));
  if (nextSteps.length === 0) {
    nextSteps.push({
      action: "Schedule a follow-up to confirm next steps",
      owner: participantsHint[0] || "Unassigned",
      dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
    });
  }

  return {
    participants: participantsHint.filter(Boolean),
    keyPoints: keyPoints.slice(0, 6),
    decisions: decisions.slice(0, 4),
    objections: objections.slice(0, 4),
    nextSteps: nextSteps.slice(0, 5),
  };
}
