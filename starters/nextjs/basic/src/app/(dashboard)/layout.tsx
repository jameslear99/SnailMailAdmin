import { AdminShell } from "@/components/admin-shell";
import { AuthGate } from "@/components/auth-gate";

export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate>
      <AdminShell>{children}</AdminShell>
    </AuthGate>
  );
}
