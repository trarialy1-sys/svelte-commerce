import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { Role } from "@/generated/prisma/client";
import { db, withOrg } from "@/lib/db";

// Public route (allow-listed in proxy.ts). Authenticity comes from the svix
// signature, not Clerk auth. Keep on the Node runtime (Prisma + pg).
export const runtime = "nodejs";

function emailOf(data: {
  email_addresses?: Array<{ id: string; email_address: string }>;
  primary_email_address_id?: string | null;
}): string | undefined {
  const list = data.email_addresses ?? [];
  const primary = list.find((e) => e.id === data.primary_email_address_id);
  return (primary ?? list[0])?.email_address;
}

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Missing CLERK_WEBHOOK_SECRET", { status: 500 });
  }

  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let evt: WebhookEvent;
  try {
    evt = new Webhook(secret).verify(payload, headers) as WebhookEvent;
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    await handleEvent(evt);
  } catch (err) {
    console.error("[clerk webhook] handler error", evt.type, err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

async function handleEvent(evt: WebhookEvent): Promise<void> {
  switch (evt.type) {
    case "organization.created":
    case "organization.updated": {
      const d = evt.data;
      await db.organization.upsert({
        where: { id: d.id },
        create: { id: d.id, name: d.name, slug: d.slug ?? null },
        update: { name: d.name, slug: d.slug ?? null },
      });
      break;
    }
    case "organization.deleted": {
      if (evt.data.id) {
        await db.organization
          .delete({ where: { id: evt.data.id } })
          .catch(() => {});
      }
      break;
    }

    case "user.created":
    case "user.updated": {
      const d = evt.data;
      const email = emailOf(d) ?? `${d.id}@placeholder.local`;
      const name =
        [d.first_name, d.last_name].filter(Boolean).join(" ") || null;
      await db.user.upsert({
        where: { id: d.id },
        create: { id: d.id, email, name, avatarUrl: d.image_url ?? null },
        update: { email, name, avatarUrl: d.image_url ?? null },
      });
      break;
    }
    case "user.deleted": {
      if (evt.data.id) {
        await db.user.delete({ where: { id: evt.data.id } }).catch(() => {});
      }
      break;
    }

    case "organizationMembership.created":
    case "organizationMembership.updated": {
      const d = evt.data;
      const orgId = d.organization.id;
      const userId = d.public_user_data.user_id;
      // Best-effort ensure parents exist (FK), tolerant of event ordering.
      await db.organization.upsert({
        where: { id: orgId },
        create: { id: orgId, name: d.organization.name, slug: d.organization.slug ?? null },
        update: { name: d.organization.name },
      });
      await db.user.upsert({
        where: { id: userId },
        create: {
          id: userId,
          email:
            d.public_user_data.identifier ?? `${userId}@placeholder.local`,
          name:
            [d.public_user_data.first_name, d.public_user_data.last_name]
              .filter(Boolean)
              .join(" ") || null,
          avatarUrl: d.public_user_data.image_url ?? null,
        },
        update: {},
      });
      // Membership is RLS-protected → set the org GUC. Role mapped on CREATE
      // only; never downgrade an existing (possibly promoted) DB role.
      await withOrg(orgId, (tx) =>
        tx.membership.upsert({
          where: { orgId_userId: { orgId, userId } },
          create: {
            orgId,
            userId,
            role: d.role === "org:admin" ? Role.ADMIN : Role.OPERATOR,
          },
          update: {},
        })
      );
      break;
    }
    case "organizationMembership.deleted": {
      const d = evt.data;
      const orgId = d.organization.id;
      const userId = d.public_user_data.user_id;
      await withOrg(orgId, (tx) =>
        tx.membership
          .deleteMany({ where: { orgId, userId } })
      ).catch(() => {});
      break;
    }

    default:
      // ignore other event types
      break;
  }
}
