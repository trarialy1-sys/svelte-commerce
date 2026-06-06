import { getAuthContext } from "@/lib/auth";
import { ModulePage } from "@/components/module/module-page";
import { customersConfig } from "@/modules/customers/config";

export default async function CustomersPage() {
  const { appRole } = await getAuthContext();
  return <ModulePage config={customersConfig} role={appRole} />;
}
