import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";
import NocCreateClient from "@/components/NocCreateClient";

type SearchParams = { [key: string]: string | string[] | undefined };
type ColInfo = { column_name: string };

function roleOf(session: any) {
  return (session?.user as any)?.role as string | undefined;
}

function canAccessNocs(session: any) {
  const r = roleOf(session);
  return r === "admin" || r === "editor" || r === "viewer";
}

function canCreateNoc(session: any) {
  const r = roleOf(session);
  return r === "admin" || r === "editor";
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

function fmtDate(value: any) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

export default async function AdminNocsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!canAccessNocs(session)) redirect("/");

  const usuario_id = await resolveUsuarioId(session);
  if (!usuario_id) redirect("/");

  const sp: SearchParams = (await (searchParams as any)) ?? {};
  const requestedContrato = firstParam(sp.contrato);

  // Contratos permitidos para este usuario
  const contratosRes = await pool.query(
    `SELECT c.contrato_id, c.nombre
     FROM public.user_contract uc
     JOIN public.contrato c ON c.contrato_id = uc.contrato_id
     WHERE uc.usuario_id = $1
     ORDER BY c.nombre`,
    [usuario_id]
  );

  const contratos = contratosRes.rows as { contrato_id: string; nombre: string }[];

  if (contratos.length === 0) {
    return (
      <div style={{ maxWidth: 1100, margin: "40px auto", padding: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>NOCs</h1>
        <p style={{ marginTop: 10, opacity: 0.75 }}>
          Sin contratos asignados. Pide al admin que te asigne un contrato.
        </p>
        <p style={{ marginTop: 12 }}>
          <Link href="/">← Volver al dashboard</Link>
        </p>
      </div>
    );
  }

  // En esta vista NO se elige contrato: viene definido desde el dashboard via ?contrato=
  if (!requestedContrato) {
    // Si faltó el contrato en la URL, volvemos al dashboard para evitar mostrar NOCs de otro contrato.
    redirect("/");
  }

  const selectedContratoId =
    contratos.find((c) => c.contrato_id === requestedContrato)?.contrato_id ?? "";

  if (!selectedContratoId) {
    // Contrato inválido o no permitido para el usuario
    redirect("/");
  }

  const selectedContratoName =
    contratos.find((c) => c.contrato_id === selectedContratoId)?.nombre ?? "";

  // NOCs del contrato seleccionado + conteo de líneas
  const nocsRes = await pool.query(
    `SELECT
       n.noc_id,
       n.contrato_id,
       n.numero,
       n.motivo,
       n.fecha,
       n.created_at,
       COUNT(nl.noc_linea_id)::int AS line_count
     FROM public.noc n
     LEFT JOIN public.noc_linea nl ON nl.noc_id = n.noc_id
     WHERE n.contrato_id = $1
     GROUP BY n.noc_id
     ORDER BY COALESCE(n.fecha, n.created_at::date) DESC, n.created_at DESC`,
    [selectedContratoId]
  );

  const nocs = nocsRes.rows as Array<{
    noc_id: string;
    contrato_id: string;
    numero: string;
    motivo: string | null;
    fecha: string | null;
    created_at: string;
    line_count: number;
  }>;

  const role = roleOf(session);
  const allowCreate = canCreateNoc(session);

  return (
    <div style={{ maxWidth: 1100, margin: "40px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>NOCs</h1>
          <p style={{ marginTop: 8, opacity: 0.75 }}>
            Contrato seleccionado: <b>{selectedContratoName}</b>
          </p>
          <p style={{ marginTop: 8 }}>
            <Link href={`/?contrato=${selectedContratoId}`}>← Volver al dashboard</Link>
          </p>
        </div>

        {allowCreate && (
          <div style={{ alignSelf: "flex-end" }}>
            <NocCreateClient contratoId={selectedContratoId} />
          </div>
        )}
      </div>

      <div style={{ marginTop: 18, border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>
          NOCs del contrato
        </div>

        {nocs.length === 0 ? (
          <div style={{ padding: 14, opacity: 0.75 }}>No hay NOCs para este contrato.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 12, opacity: 0.7 }}>
                <th style={{ padding: "10px 12px" }}>NOC</th>
                <th style={{ padding: "10px 12px" }}>Fecha</th>
                <th style={{ padding: "10px 12px" }}>Motivo</th>
                <th style={{ padding: "10px 12px" }}># Líneas</th>
                <th style={{ padding: "10px 12px" }}></th>
              </tr>
            </thead>
            <tbody>
              {nocs.map((n) => (
                <tr key={n.noc_id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 800 }}>{n.numero}</td>
                  <td style={{ padding: "10px 12px" }}>{fmtDate(n.fecha)}</td>
                  <td style={{ padding: "10px 12px", opacity: 0.85 }}>{n.motivo ?? "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{n.line_count ?? 0}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" }}>
                    <Link href={`/admin/nocs/${n.noc_id}?contrato=${selectedContratoId}`}>Ver →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ marginTop: 14, fontSize: 12, opacity: 0.65 }}>
        Nota: Create NOC solo crea header. Líneas se gestionan dentro del detalle.
      </p>
    </div>
  );
}
