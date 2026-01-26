import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import UsersAdmin from "@/components/admin/UsersAdmin";

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;

  if (role !== "admin") {
    return (
      <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
          403 – No autorizado
        </h1>
        <p style={{ opacity: 0.8 }}>Esta sección es solo para administradores.</p>
      </div>
    );
  }

  return <UsersAdmin />;
}
