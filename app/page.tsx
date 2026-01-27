import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import Link from "next/link";
import { pool } from "@/lib/db";

type Contrato = { id: string; nombre: string };

function isAdmin(session: any) {
  return (session?.user as any)?.role === "admin";
}

async function getContratosForSession(session: any): Promise<Contrato[]> {
  if (!session) return [];

  if (isAdmin(session)) {
    const { rows } = await pool.query(
      "SELECT contrato_id AS id, nombre FROM public.contrato ORDER BY nombre"
    );
    return rows;
  }

  const email = ((session.user as any)?.email ?? "").toString().trim();
  if (!email) return [];

  const u = await pool.query(
    "SELECT usuario_id FROM public.usuario WHERE lower(email) = lower($1) LIMIT 1",
    [email]
  );
  const usuario_id = u.rows?.[0]?.usuario_id;
  if (!usuario_id) return [];

  const { rows } = await pool.query(
    `SELECT c.contrato_id AS id, c.nombre
     FROM public.contrato c
     JOIN public.user_contract uc ON uc.contrato_id = c.contrato_id
     WHERE uc.usuario_id = $1
     ORDER BY c.nombre`,
    [usuario_id]
  );

  return rows;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: { contrato_id?: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
        <p>No autenticado</p>
      </div>
    );
  }

  const role = (session?.user as any)?.role;

  const contratos = await getContratosForSession(session);
  const requestedContratoId = (searchParams?.contrato_id ?? "").toString();

  const contratoActivo =
    contratos.length === 1
      ? contratos[0]
      : contratos.find((c) => c.id === requestedContratoId) ?? null;

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
              {" · "}
              <Link href="/admin/user-contracts">
                Administración → Contratos por usuario
              </Link>
            </p>
          )}
        </div>
        <LogoutButton />
      </div>

      {/* Contratos permitidos por usuario */}
      <div
        style={{
          marginTop: 16,
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 10,
        }}
      >
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Contrato</h2>

        {contratos.length === 0 ? (
          <p style={{ margin: 0, opacity: 0.8 }}>
            No tienes contratos asignados. Contacta a un administrador.
          </p>
        ) : contratos.length === 1 ? (
          <p style={{ margin: 0 }}>
            Contrato activo: <strong>{contratos[0].nombre}</strong>
          </p>
        ) : (
          <form method="GET" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select
              name="contrato_id"
              defaultValue={contratoActivo?.id ?? contratos[0].id}
              style={{ padding: "8px 10px", minWidth: 280 }}
            >
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <button
              type="submit"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: "white",
                cursor: "pointer",
              }}
            >
              Ver
            </button>

            {contratoActivo ? (
              <span style={{ alignSelf: "center", opacity: 0.8 }}>
                Activo: <strong>{contratoActivo.nombre}</strong>
              </span>
            ) : (
              <span style={{ alignSelf: "center", opacity: 0.7 }}>
                Selecciona un contrato y presiona “Ver”.
              </span>
            )}
          </form>
        )}
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
