import { ParcelStatus } from "@/generated/prisma/client";

/** COD pipeline groupings — shared by the dashboard, CRM and Finance. */
export const PARCEL_IN_TRANSIT: ParcelStatus[] = [
  ParcelStatus.CREE,
  ParcelStatus.RAMASSE,
  ParcelStatus.EN_TRANSIT,
];

export const PARCEL_DELIVERED: ParcelStatus[] = [ParcelStatus.LIVRE];

export const PARCEL_PROBLEM: ParcelStatus[] = [
  ParcelStatus.RETOURNE,
  ParcelStatus.REFUSE,
];

export const PARCEL_ALL: ParcelStatus[] = [
  ...PARCEL_IN_TRANSIT,
  ...PARCEL_DELIVERED,
  ...PARCEL_PROBLEM,
];
