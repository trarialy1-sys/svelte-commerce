import { getAuthContext } from "@/lib/auth";
import { OrdersView } from "./orders-view";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const { appRole } = await getAuthContext();
  return <OrdersView role={appRole} />;
}
