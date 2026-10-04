// Handwriting/notes transcription via the Anthropic API (Claude's vision
// capability) — turns a photographed paper note into usable text, e.g. the
// handwritten notes a salesperson takes by hand during a site visit
// ("sopralluogo") and photographs instead of re-typing. Same best-effort,
// plain-`fetch` pattern as every other optional external integration in this
// project (see notify.ts for Resend): if ANTHROPIC_API_KEY isn't set, this
// returns a clear "not configured" result instead of throwing, so the photo
// itself always still saves (see /api/attachments) — the user can always
// type the text in by hand instead, same as before this existed.
//
// `generateVerbale` in verbale.ts (meeting minutes) deliberately stays
// rule-based for now — see README.md § "Why the meeting minutes don't call
// a real AI model" — this is a separate, narrower use of the same API,
// wired up because handwriting transcription has no honest rule-based
// substitute the way keyword-classifying a typed transcript does.

// Only the shape this file actually reads from the Messages API response —
// not the full response schema.
type AnthropicMessageResponse = {
  content?: Array<{ type: string; text?: string }>;
};

const MODEL = "claude-haiku-4-5"; // fast + inexpensive; plenty accurate for OCR-style transcription of one photographed note. Swap for a stronger model only if transcription quality turns out to be the bottleneck.

export type TranscribeError = "not_configured" | "api_error" | "network";
export type TranscribeResult = { ok: true; text: string } | { ok: false; error: TranscribeError };

export function transcribeErrorMessage(error: TranscribeError): string {
  if (error === "not_configured") {
    return "Trascrizione AI non configurata — aggiungi ANTHROPIC_API_KEY nelle variabili d'ambiente (vedi README). Nel frattempo puoi scrivere il testo a mano qui sotto.";
  }
  return "Non sono riuscito a leggere la foto in questo momento. Riprova, oppure scrivi il testo a mano qui sotto.";
}

export async function transcribeNotePhoto(input: { base64: string; mimeType: string }): Promise<TranscribeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[vision] ANTHROPIC_API_KEY not set — cannot transcribe note photo");
    return { ok: false, error: "not_configured" };
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: input.mimeType, data: input.base64 } },
              {
                type: "text",
                text:
                  "Transcribe exactly the handwritten or printed text visible in this photo of a paper note. " +
                  "Output only the transcribed text, in the same language it's written in, preserving line " +
                  "breaks where they carry meaning (separate items, bullet points). Mark any word you truly " +
                  "cannot make out as [illegible]. Do not translate, summarize, or add any commentary.",
              },
            ],
          },
        ],
      }),
    });
    const data: AnthropicMessageResponse | null = await res.json().catch(() => null);
    if (!res.ok) {
      console.error("[vision] Anthropic API error", res.status, data);
      return { ok: false, error: "api_error" };
    }
    const block = data?.content?.find((b) => b.type === "text");
    const text = (block?.text || "").trim();
    return { ok: true, text: text || "(nessun testo rilevato nella foto)" };
  } catch (err) {
    console.error("[vision] failed to reach Anthropic API", err);
    return { ok: false, error: "network" };
  }
}
