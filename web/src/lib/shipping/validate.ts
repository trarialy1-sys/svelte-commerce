/**
 * Pre-send validation for OzonExpress parcels. Pure (no I/O) so it runs both
 * server-side (before calling the API, to avoid a wasted request + Ozon's
 * generic "Some fields Empty") and client-side (to flag incomplete orders in
 * the shipping list before the operator hits "Envoyer").
 */
import { formatPhone } from "./ozon-helpers";

export interface ShippableFields {
  /** Receiver / customer name. */
  customerName?: string | null;
  /** Raw phone (normalized via formatPhone before checking). */
  phone?: string | null;
  address?: string | null;
  /** COD price; must be > 0. */
  price: number;
}

/**
 * Return the human (French) labels of the required fields that are missing or
 * invalid for a shipment. Empty array = ready to send. City resolution is
 * checked separately (it has its own picker UI).
 */
export function missingShippingFields(o: ShippableFields): string[] {
  const missing: string[] = [];
  if (!o.customerName || !o.customerName.trim()) missing.push("destinataire");
  const phone = formatPhone(o.phone);
  if (!(phone.length === 10 && phone.startsWith("0"))) missing.push("téléphone");
  if (!o.address || !o.address.trim()) missing.push("adresse");
  if (!(Number(o.price) > 0)) missing.push("prix");
  return missing;
}
