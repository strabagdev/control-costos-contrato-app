import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import Link from "next/link";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
            Dashboard (MVP)
          </h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>
            Control de Costos Contrato
          </p>

          {role === "admin" && (
            <p style={{ marginTop: 8 }}>
              <Link href="/admin/users">Administración → Usuarios</Link>
              {" · "}
              <Link href="/admin/partidas">Administración → Partidas base</Link>
            </p>
          )}
        </div>
        <LogoutButton />
      </div>

      <div
        style={{
          marginTop: 24,
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 10,
        }}
      >
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Sesión</h2>
        <pre style={{ margin: 0 }}>
{JSON.stringify(
  {
    email: session?.user?.email,
    name: session?.user?.name,
    role,
  },
  null,
  2
)}
        </pre>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
          <div style={{ opacity: 0.7, fontSize: 12 }}>Total Base</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>—</div>
        </div>
        <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
          <div style={{ opacity: 0.7, fontSize: 12 }}>Total Vigente</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>—</div>
        </div>
        <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
          <div style={{ opacity: 0.7, fontSize: 12 }}>Δ Diferencia</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>—</div>
        </div>
        <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
          <div style={{ opacity: 0.7, fontSize: 12 }}># NOC</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>—</div>
        </div>
      </div>

      <p style={{ marginTop: 16, opacity: 0.7, fontSize: 12 }}>
        (Placeholder) Aquí después conectamos vistas SQL para KPIs y rankings.
      </p>
    </div>
  );
}
