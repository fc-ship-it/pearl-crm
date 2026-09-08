import { getSession } from "@/lib/auth";
import { listContacts, listDeals } from "@/lib/data";
import NewMeetingForm from "@/components/NewMeetingForm";

export default async function NewMeetingPage() {
  const session = await getSession();
  const contacts = listContacts(session!.orgId);
  const deals = listDeals(session!.orgId);

  return (
    <div className="max-w-[700px]">
      <h1 className="font-display text-xl mb-1" style={{ color: "var(--ink)" }}>
        New meeting
      </h1>
      <p className="text-sm mb-5" style={{ color: "var(--ink-dim)" }}>
        Paste your notes or transcript: the AI structures the minutes and creates the next-step tasks.
      </p>
      <NewMeetingForm contacts={contacts} deals={deals} />
    </div>
  );
}
