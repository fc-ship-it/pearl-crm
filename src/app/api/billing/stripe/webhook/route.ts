import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { applyStripeSubscription, applyFeaturedSubscription, getOrganization, getOrgBillingContactEmail, listPushSubscriptionsForOrgAdmins } from "@/lib/data";
import { constructWebhookEvent, getSubscription, normalizeSubscription, StripeNotConfiguredError } from "@/lib/stripe";
import { sendWelcomeEmail, sendPaymentFailedEmail } from "@/lib/notify";
import { sendPushToSubscriptions, PushNotConfiguredError } from "@/lib/push";

/** Push is best-effort everywhere in this webhook: a missing VAPID
 * configuration, or every admin simply not having enabled notifications
 * yet, must never turn into a failed webhook delivery (Stripe would just
 * retry the same event forever). The email path above this already covers
 * the "must not be missed" guarantee. */
async function pushToOrgAdmins(orgId: string, payload: { title: string; body: string; url?: string }): Promise<void> {
  try {
    const subs = await listPushSubscriptionsForOrgAdmins(orgId);
    await sendPushToSubscriptions(subs, payload);
  } catch (err) {
    if (!(err instanceof PushNotConfiguredError)) console.error("Push to org admins failed", orgId, err);
  }
}

export const runtime = "nodejs";

/** The durable path for keeping an org's billing status in sync with Stripe
 * — independent of whether the customer's browser ever makes it back to
 * /api/billing/stripe/confirm (they might close the tab, lose connection,
 * etc). We never trust a webhook body's claim about status beyond what
 * Stripe itself signed it with (see constructWebhookEvent) — no separate
 * "go ask the API again" round-trip is needed here, unlike the old Ziina
 * webhook, because Stripe's signing scheme lets us trust the payload once
 * the signature checks out. */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json({ error: "not configured" }, { status: 503 });
    }
    console.error("Stripe webhook signature check failed", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.client_reference_id || (session.metadata?.orgId as string | undefined);
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const isFeatured = session.metadata?.purpose === "match_featured";
        if (orgId && subscriptionId) {
          if (isFeatured) {
            const sub = await getSubscription(subscriptionId);
            await applyFeaturedSubscription(orgId, normalizeSubscription(sub));
            break;
          }
          const existingOrg = await getOrganization(orgId);
          const wasIncomplete = existingOrg?.subscription_status === "incomplete";
          const sub = await getSubscription(subscriptionId);
          await applyStripeSubscription(orgId, normalizeSubscription(sub));
          if (wasIncomplete) {
            const org = await getOrganization(orgId);
            const email = await getOrgBillingContactEmail(orgId);
            if (org && email) {
              await sendWelcomeEmail({ contactName: "there", contactEmail: email, orgName: org.name });
            }
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.orgId;
        if (orgId) {
          if (sub.metadata?.purpose === "match_featured") {
            await applyFeaturedSubscription(orgId, normalizeSubscription(sub));
          } else {
            await applyStripeSubscription(orgId, normalizeSubscription(sub));
          }
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // NOTE: `invoice.subscription` moved off the top level in recent
        // Stripe API versions — it now lives under
        // `invoice.parent.subscription_details.subscription` (same kind of
        // relocation as Subscription's current_period_end, see stripe.ts).
        const subRef = invoice.parent?.subscription_details?.subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        if (subId) {
          const sub = await getSubscription(subId);
          const orgId = sub.metadata?.orgId;
          if (orgId) {
            // A failed featured-listing invoice just quietly drops the
            // "in evidenza" badge (handled by applyFeaturedSubscription's
            // status check) — it must never touch the org's core plan/
            // subscription_status, so no payment-failed email either (that
            // email is specifically about losing access to Pearl itself).
            if (sub.metadata?.purpose === "match_featured") {
              await applyFeaturedSubscription(orgId, normalizeSubscription(sub));
            } else {
              await applyStripeSubscription(orgId, normalizeSubscription(sub));
              const org = await getOrganization(orgId);
              const email = await getOrgBillingContactEmail(orgId);
              if (org && email) await sendPaymentFailedEmail({ contactEmail: email, orgName: org.name });
              if (org) {
                await pushToOrgAdmins(orgId, {
                  title: "Pagamento non riuscito",
                  body: `Il pagamento per ${org.name} non è andato a buon fine — aggiorna il metodo di pagamento.`,
                  url: "/app/settings/billing",
                });
              }
            }
          }
        }
        break;
      }
      case "customer.subscription.trial_will_end": {
        // Fires ~3 days before a trial ends (needs to be added as a
        // subscribed event in the Stripe dashboard webhook config — see
        // README). Push-only: this is a heads-up, not the "you're now
        // blocked" moment (that's still handled by the trial actually
        // expiring), so no email here to avoid doubling up.
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.orgId;
        if (orgId && sub.metadata?.purpose !== "match_featured") {
          const org = await getOrganization(orgId);
          if (org) {
            await pushToOrgAdmins(orgId, {
              title: "Prova in scadenza",
              body: `Il periodo di prova di ${org.name} sta per terminare — scegli un piano per non perdere l'accesso.`,
              url: "/app/settings/billing",
            });
          }
        }
        break;
      }
      default:
        break; // not a type we act on
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Stripe webhook handling failed", event.type, err);
    // 500 so Stripe retries — unlike Ziina's webhook, Stripe's retry
    // schedule is well-documented and safe to rely on here.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
