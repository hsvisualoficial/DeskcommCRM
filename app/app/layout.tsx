import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isMfaEnrolled, loadAuthUser, requiresMfa, resolveActiveOrg } from "@/lib/auth/server";
import { AuthProvider } from "@/hooks/auth/AuthProvider";
import { AppShell } from "./_components/AppShell";
import { MfaEnrollGate } from "@/components/auth/MfaEnrollGate";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await loadAuthUser();
  if (!user) redirect("/login");

  const activeOrg = await resolveActiveOrg(user);

  // Read sidebar collapsed state SSR to avoid flash.
  const store = await cookies();
  const collapsed = store.get("sidebar_collapsed")?.value === "1";

  const enrolled = await isMfaEnrolled();
  const mustEnroll = requiresMfa(activeOrg?.role, user.is_platform_admin) && !enrolled;

  return (
    <AuthProvider user={user} activeOrg={activeOrg}>
      {mustEnroll ? <MfaEnrollGate /> : <AppShell sidebarCollapsed={collapsed}>{children}</AppShell>}
    </AuthProvider>
  );
}
