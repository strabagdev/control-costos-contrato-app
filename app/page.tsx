import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import Link from "next/link";
import { pool } from "@/lib/db";
import ContratoSelectorClient from "@/components/ContratoSelectorClient";

type SearchParams = { [key: string]: string | string[] | undefined };
type ColInfo = { column_name: string };

function isAdmin(session: any) {
  return (session?.user as any)?.role === "admin";
}

async function getUsuarioColumnMap() {
  const { rows } = await pool.query<ColInfo>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'usuario'`
  );

  const cols = new Set(rows.map((r) => r.column_name));
  const idCol = cols.has("usuario_id") ? "usuario_id" : cols.has("id") ? "id" : null;
  const emailCol = cols.has("email") ? "email" : null;

  if (!idCol || !emailCol) throw new Error("public.usuario: columnas requeridas no encontradas");

  return { idCol, emailCol };
}

async function resolveUsuarioId(session: any): Promise<string | null> {
  const direct =
    (session?.user as any)?.id ||
    (session?.user as any)?.usuario_id ||
    (session as any)?.user_id;

  if (direct && typeof direct === "string") return direct;

  const email = session?.user?.email;
  if (!email) return null;

  const map = await getUsuarioColumnMap();
  const { rows } = await pool.query(
    `SELECT ${map.idCol} AS usuario_id
     FROM public.usuario
     WHERE ${map.emailCol} = $1
     LIMIT 1`,
    [email]
  );

  return rows[0]?.usuario_id ?? null;
}

function firstParam(p: string | string[] | undefined) {
  if (!p) return "";
  return Array.isArray(p) ? (p[0] ?? "") : p;
}

function fmtCLP(value: any) {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? 0));
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(safe);
}

function fmtInt(value: any) {
  const n = typeof value === "number" ? value : parseInt(String(value ?? 0), 10);
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("es-CL").format(safe);
}

// Next.js newer versions can pass searchParams as a Promise in Server Components.
// We unwrap it with await to avoid: "sync-dynamic-apis"
export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const usuario_id = await resolveUsuarioId(session);

  const sp: SearchParams = (await (searchParams as any)) ?? {};

  // Contracts allowed for this user
  const contratosRes = usuario_id
    ? await pool.query(
        `SELECT c.contrato_id, c.nombre
         FROM public.user_contract uc
         JOIN public.contrato c ON c.contrato_id = uc.contrato_id
         WHERE uc.usuario_id = $1
         ORDER BY c.nombre`,
        [usuario_id]
      )
    : { rows: [] as any[] };

  const contratos = contratosRes.rows as { contrato_id: string; nombre: string }[];

  const requestedContrato = firstParam(sp.contrato);
  const defaultContrato = contratos[0]?.contrato_id ?? "";
  const selectedContratoId =
    contratos.find((c) => c.contrato_id === requestedContrato)?.contrato_id ?? defaultContrato;

  // Load KPIs for selected contract (if any)
  let kpis = {
    total_base: 0,
    total_vigente: 0,
    delta: 0,
    noc_count: 0,
  };

  if (selectedContratoId) {
    const baseAndVigente = await pool.query(
      `SELECT
         COALESCE(SUM(total) FILTER (WHERE noc_id IS NULL), 0) AS total_base,
         COALESCE(SUM(total) FILTER (WHERE vigente = true), 0) AS total_vigente
       FROM public.partida
       WHERE contrato_id = $1`,
      [selectedContratoId]
    );

    const nocCount = await pool.query(
      "SELECT COUNT(*)::int AS noc_count FROM public.noc WHERE contrato_id = $1",
      [selectedContratoId]
    );

    const tb = baseAndVigente.rows[0]?.total_base ?? 0;
    const tv = baseAndVigente.rows[0]?.total_vigente ?? 0;
    const toNum = (v: any) => (typeof v === "number" ? v : parseFloat(String(v ?? 0)));

    kpis = {
      total_base: tb,
      total_vigente: tv,
      delta: toNum(tv) - toNum(tb),
      noc_count: nocCount.rows[0]?.noc_count ?? 0,
    };
  }

  const selectedContratoName =
    contratos.find((c) => c.contrato_id === selectedContratoId)?.nombre ?? "";

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
          <p style={{ marginTop: 8, opacity: 0.8 }}>Control de Costos Contrato</p>

          {role === "admin" && (
            <p style={{ marginTop: 8 }}>
              <Link href="/admin/users">Administración → Usuarios</Link>
              {" · "}
              <Link href="/admin/partidas">Administración → Partidas base</Link>
              {" · "}
              <Link href="/admin/user-contracts">Administración → Contrato → Usuarios</Link>
              {" · "}
              <Link href="/admin/contratos">Administración → Contratos</Link>
            </p>
          )}
        </div>
        <LogoutButton />
      </div>

      {contratos.length === 0 ? (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            border: "1px solid rgba(239, 68, 68, 0.25)",
            background: "rgba(239, 68, 68, 0.06)",
            borderRadius: 10,
          }}
        >
          <div style={{ fontWeight: 900 }}>Sin contratos asignados</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Pide al admin que te asigne al menos un contrato para ver el dashboard.
          </div>
        </div>
      ) : contratos.length > 1 ? (
        <ContratoSelectorClient contratos={contratos} selectedContratoId={selectedContratoId} />
      ) : (
        <div style={{ marginTop: 14, opacity: 0.7, fontSize: 12 }}>
          Contrato: <b>{selectedContratoName}</b>
        </div>
      )}

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
    contrato: selectedContratoName || null,
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
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            {selectedContratoId ? fmtCLP(kpis.total_base) : "—"}
          </div>
        </div>
        <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
          <div style={{ opacity: 0.7, fontSize: 12 }}>Total Vigente</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            {selectedContratoId ? fmtCLP(kpis.total_vigente) : "—"}
          </div>
        </div>
        <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
          <div style={{ opacity: 0.7, fontSize: 12 }}>Δ Diferencia</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            {selectedContratoId ? fmtCLP(kpis.delta) : "—"}
          </div>
        </div>
        <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
          <div style={{ opacity: 0.7, fontSize: 12 }}># NOC</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            {selectedContratoId ? fmtInt(kpis.noc_count) : "—"}
          </div>
        </div>

      </div>

      {/* Accesos rápidos */}
      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <Link
          href={selectedContratoId ? `/admin/nocs?contrato=${selectedContratoId}` : "/admin/docs"}
          style={{
            padding: 16,
            border: "1px solid #ddd",
            borderRadius: 10,
            textDecoration: "none",
            color: "inherit",
            background: "white",
          }}
        >
          <div style={{ fontSize: 14, opacity: 0.7 }}>Gestión</div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>NOC</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
            Crear, editar y aplicar Notas de Cambio
          </div>
        </Link>
      </div>

      <p style={{ marginTop: 16, opacity: 0.7, fontSize: 12 }}>
        (Placeholder) Aquí después conectamos vistas SQL para KPIs y rankings por contrato.
      </p>
    </div>
  );
}
