import { redirect } from "next/navigation";

// `/` is auth-gated by the proxy; signed-in users go straight to the shell.
export const dynamic = "force-dynamic";

export default function RootPage() {
  redirect("/dashboard");
}
