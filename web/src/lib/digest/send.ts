import "server-only";

import { Role } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { appBaseUrl, emailConfigured, fromHeader, sendEmail } from "@/lib/email/resend";
import { buildDigest } from "./summary";
import { renderDigest } from "./email";

export interface DigestRunResult {
  configured: boolean;
  skipped: boolean; // empty day → no send
  sent: number;
  failed: number;
  recipients: number;
}

function realEmail(email: string | null | undefined): email is string {
  return !!email && !email.endsWith("@placeholder.local");
}

/**
 * Build + send one org's previous-day digest to its owner/admin recipients
 * (opted-in, with a real email). Empty days are skipped. `testTo` overrides the
 * recipient list (manual test) and bypasses the empty-day skip.
 */
export async function sendOrgDigest(
  orgId: string,
  opts: { testTo?: string } = {}
): Promise<DigestRunResult> {
  if (!emailConfigured()) {
    return { configured: false, skipped: false, sent: 0, failed: 0, recipients: 0 };
  }

  const summary = await buildDigest(orgId);
  if (summary.isEmpty && !opts.testTo) {
    return { configured: true, skipped: true, sent: 0, failed: 0, recipients: 0 };
  }

  const odb = getOrgDb(orgId);
  let recipients: string[];
  if (opts.testTo) {
    recipients = [opts.testTo];
  } else {
    const members = await odb.membership.findMany({
      where: { role: { in: [Role.OWNER, Role.ADMIN] }, digestOptIn: true },
      select: { user: { select: { email: true } } },
    });
    recipients = members
      .map((m) => m.user?.email)
      .filter(realEmail)
      .filter((e, i, a) => a.indexOf(e) === i);
  }

  if (recipients.length === 0) {
    return { configured: true, skipped: true, sent: 0, failed: 0, recipients: 0 };
  }

  const { subject, html, text } = renderDigest(summary, appBaseUrl());
  const from = fromHeader(summary.org.name);

  let sent = 0;
  let failed = 0;
  for (const to of recipients) {
    const res = await sendEmail({ to, from, subject, html, text });
    if (res.ok) sent++;
    else failed++;
    await odb.emailLog.create({
      data: {
        orgId,
        to,
        type: "daily_digest",
        status: res.ok ? "sent" : "failed",
        error: res.ok ? null : (res.error ?? "unknown").slice(0, 500),
      },
    });
  }

  return { configured: true, skipped: false, sent, failed, recipients: recipients.length };
}
