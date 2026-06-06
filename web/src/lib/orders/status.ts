import "server-only";

import { OrderStatus, Prisma } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";

export interface SetStatusOpts {
  /** Free-text reason, stored on the order for cancel/unreachable outcomes. */
  reason?: string | null;
  /** Callback date for REPORTEE (Reporter). */
  callbackAt?: Date | null;
  /** Clerk user id of the operator performing the action (for audit + confirmedBy). */
  actorUserId?: string | null;
}

/**
 * Statuses that carry a free-text "reason" (why the order didn't convert).
 */
const REASON_STATUSES = new Set<OrderStatus>([
  OrderStatus.ANNULEE,
  OrderStatus.INJOIGNABLE,
  OrderStatus.NUMERO_ERRONE,
  OrderStatus.DOUBLON,
  OrderStatus.HORS_ZONE,
]);

/**
 * Apply a confirmation outcome to a single order. Org-scoped (RLS) and audited.
 * Authorization is enforced by the caller (`requireOrgRole('OPERATOR')`).
 *
 *  - CONFIRMEE       → stamp confirmedById + confirmedAt
 *  - REPORTEE        → store callbackAt
 *  - PAS_DE_REPONSE  → increment attemptCount
 *  - ANNULEE / INJOIGNABLE / NUMERO_ERRONE / DOUBLON / HORS_ZONE → store statusReason
 */
export async function setOrderStatus(
  orgId: string,
  orderId: string,
  status: OrderStatus,
  opts: SetStatusOpts = {}
): Promise<{ id: string; status: OrderStatus }> {
  const odb = getOrgDb(orgId);
  const data: Prisma.OrderUpdateInput = { status };

  if (status === OrderStatus.CONFIRMEE) {
    data.confirmedById = opts.actorUserId ?? null;
    data.confirmedAt = new Date();
  } else if (status === OrderStatus.REPORTEE) {
    data.callbackAt = opts.callbackAt ?? null;
  } else if (status === OrderStatus.PAS_DE_REPONSE) {
    data.attemptCount = { increment: 1 };
  }

  if (REASON_STATUSES.has(status)) {
    data.statusReason = opts.reason ?? null;
  }

  const updated = await odb.order.update({
    where: { id: orderId },
    data,
    select: { id: true, status: true },
  });

  await odb.auditLog.create({
    data: {
      orgId,
      actorUserId: opts.actorUserId ?? null,
      action: `order.status.${status.toLowerCase()}`,
      entity: "Order",
      entityId: orderId,
      meta: {
        status,
        ...(opts.reason ? { reason: opts.reason } : {}),
        ...(opts.callbackAt
          ? { callbackAt: opts.callbackAt.toISOString() }
          : {}),
      },
    },
  });

  return updated;
}
