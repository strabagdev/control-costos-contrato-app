import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";
import NocDetailClient from "@/components/NocDetailClient";

type ColInfo = { column_name: string };
type Params = { id: string };
type SearchParams = { [key: string]: string | string[] | undefined };

function roleOf(session: any) {
  return (session?.user as any)?.role as string | undefined;
}

function canAccess(session: any) {
  const r = roleOf(session);
  return r === "admin" || r === "editor" || r === "viewer";
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

async function assertContractAccess(usuario_id: string, contrato_id: string) {
  const allow = await pool.query(
    `SELECT 1
     FROM public.user_contract
     WHERE usuario_id = $1 AND contrato_id = $2
     LIMIT 1`,
    [usuario_id, contrato_id]
  );
  return allow.rowCount > 0;
}

function fmtDate(value: any) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function firstParam(p: string | string[] | undefined) {
  if (!p) return "";
  return Array.isArray(p) ? (p[0] ?? "") : p;
}

export default async function AdminNocDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params> | Params;
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!canAccess(session)) redirect("/");

  const usuario_id = await resolveUsuarioId(session);
  if (!usuario_id) redirect("/");

  const p = (await (params as any)) as Params;
  const sp: SearchParams = (await (searchParams as any)) ?? {};
  const contratoFromQuery = firstParam(sp.contrato);

  const noc_id = (p?.id ?? "").toString();
  if (!noc_id) redirect("/admin/nocs");

  const nocRes = await pool.query(
    `SELECT noc_id, contrato_id, numero, motivo, fecha, status, is_dirty, applied_at, applied_by, created_at
     FROM public.noc
     WHERE noc_id = $1`,
    [noc_id]
  );
  const noc = nocRes.rows[0];
  if (!noc) redirect("/admin/nocs");

  const ok = await assertContractAccess(usuario_id, noc.contrato_id);
  if (!ok) redirect("/");

  const linesRes = await pool.query(
    `SELECT
       nl.noc_linea_id,
       nl.noc_id,
       nl.partida_origen_id,
       nl.partida_resultante_id,
       nl.nueva_cantidad,
       nl.nuevo_precio_unitario,
       nl.observacion,
       nl.created_at,
       p.item AS origen_item,
       p.descripcion AS origen_descripcion,
       p.cantidad AS origen_cantidad,
       p.precio_unitario AS origen_precio_unitario,
       p.total AS origen_total,
       p.vigente AS origen_vigente
     FROM public.noc_linea nl
     LEFT JOIN public.partida p ON p.partida_id = nl.partida_origen_id
     WHERE nl.noc_id = $1
     ORDER BY nl.created_at ASC`,
    [noc_id]
  );

  const partidasRes = await pool.query(
    `SELECT partida_id, item, descripcion, cantidad, precio_unitario, total
     FROM public.partida
     WHERE contrato_id = $1 AND vigente = true
     ORDER BY item`,
    [noc.contrato_id]
  );

  const role = roleOf(session);

  const backHref = contratoFromQuery
    ? `/admin/nocs?contrato=${contratoFromQuery}`
    : "/admin/nocs";

  return (
    <div style={{ maxWidth: 1100, margin: "40px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>NOC · {noc.numero}</h1>
          <p style={{ marginTop: 8, opacity: 0.75 }}>
            Detalle (Hito 3B): header + líneas. <b>Sin aplicar</b>.
          </p>
          <p style={{ marginTop: 8 }}>
            <Link href={backHref}>← Volver a NOCs</Link>
          </p>
        </div>
        <div style={{ fontSize: 12, opacity: 0.7, alignSelf: "flex-end" }}>
          Rol: <b>{role}</b>
        </div>
      </div>

      <NocDetailClient
        noc={{
          noc_id: noc.noc_id,
          contrato_id: noc.contrato_id,
          numero: noc.numero,
          motivo: noc.motivo ?? "",
          fecha: fmtDate(noc.fecha),
          status: (noc.status ?? "draft"),
          is_dirty: Boolean(noc.is_dirty),
        }}
        lines={linesRes.rows}
        partidas={partidasRes.rows}
        role={role ?? "viewer"}
      />
    </div>
  );
}
