import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  // Settings is a tabbed section; land on the first tab.
  redirect("/settings/organization");
}
