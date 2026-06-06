import { getAuthContext } from "@/lib/auth";
import { StockView } from "./stock-view";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const { appRole } = await getAuthContext();
  return <StockView role={appRole} />;
}
