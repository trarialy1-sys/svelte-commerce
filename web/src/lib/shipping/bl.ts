import "server-only";

import { DeliveryNoteStatus } from "@/generated/prisma/client";
import { getOrgDb } from "@/lib/db";
import { getOzonClient } from "./ozon";
import { errMsg, findBLRef } from "./ozon-helpers";

export interface BLResult {
  ref: string;
  pdfUrl: string;
  labelsUrl: string;
  parcelCount: number;
}

/**
 * Build ONE Bon de Livraison from a list of parcel tracking codes — a faithful
 * port of the 3-step flow in `ozon-send.js`:
 *   1) add-delivery-note            → read the BL ref
 *   2) add-parcel-to-delivery-note  → { Ref, Codes[i] }
 *   3) save-delivery-note           → { Ref }
 * Then persist the DeliveryNote (+ links to local Parcels found by tracking).
 *
 * ⚠️ add-delivery-note ALWAYS creates a NEW note — callers must warn the user
 * before invoking it again.
 */
export async function createDeliveryNote(
  orgId: string,
  codes: string[],
  actorUserId?: string | null
): Promise<BLResult> {
  if (codes.length === 0) throw new Error("Aucun code de colis à grouper.");
  const { post } = await getOzonClient(orgId);

  // 1) create the note
  const j1 = await post("add-delivery-note", new FormData());
  const ref = findBLRef(j1);
  if (!ref) throw new Error(`Référence BL introuvable : ${errMsg(j1)}`);

  // 2) attach the codes
  const fd2 = new FormData();
  fd2.append("Ref", ref);
  codes.forEach((c, i) => fd2.append(`Codes[${i}]`, c));
  await post("add-parcel-to-delivery-note", fd2);

  // 3) save it
  const fd3 = new FormData();
  fd3.append("Ref", ref);
  await post("save-delivery-note", fd3);

  const pdfUrl = `https://client.ozonexpress.ma/pdf-delivery-note?dn-ref=${ref}`;
  const labelsUrl = `https://client.ozonexpress.ma/pdf-delivery-note-tickets?dn-ref=${ref}`;

  // persist locally (+ link any parcels we have for these codes)
  const odb = getOrgDb(orgId);
  const parcels = await odb.parcel.findMany({
    where: { tracking: { in: codes } },
    select: { id: true },
  });
  const dn = await odb.deliveryNote.create({
    data: {
      orgId,
      ref,
      status: DeliveryNoteStatus.SAVED,
      parcelCount: codes.length,
      pdfUrl,
      labelsUrl,
    },
    select: { id: true },
  });
  for (const p of parcels) {
    await odb.deliveryNoteParcel.create({
      data: { orgId, deliveryNoteId: dn.id, parcelId: p.id },
    });
  }
  await odb.auditLog.create({
    data: {
      orgId,
      actorUserId: actorUserId ?? null,
      action: "shipping.bl_created",
      entity: "DeliveryNote",
      entityId: ref,
      meta: { ref, parcelCount: codes.length },
    },
  });

  return { ref, pdfUrl, labelsUrl, parcelCount: codes.length };
}

/**
 * BL-only path: build a BL for codes whose parcels ALREADY exist at Ozon
 * (e.g. "Tracking Number Used Before"). Same 3-step flow — the parcels weren't
 * (re)created via add-parcel, so we never risk a duplicate shipment.
 */
export async function buildBLOnly(
  orgId: string,
  codes: string[],
  actorUserId?: string | null
): Promise<BLResult> {
  return createDeliveryNote(orgId, codes, actorUserId);
}
