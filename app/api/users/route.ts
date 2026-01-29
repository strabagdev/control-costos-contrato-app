import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

function isAdmin(session: any) {
  // soporta role/rol en session.user (según callbacks)
  const u: any = session?.user;
  return (u?.role ?? u?.rol) === "admin";
}

type ColInfo = { column_name: string };

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
  const nombreCol = cols.has("nombre") ? "nombre" : cols.has("name") ? "name" : null;
  const activoCol = cols.has("activo") ? "activo" : cols.has("active") ? "active" : null;
  const rolCol = cols.has("rol") ? "rol" : cols.has("role") ? "role" : null;
  const passCol = cols.has("password_hash")
    ? "password_hash"
    : cols.has("password")
      ? "password"
      : null;

  if (!idCol || !emailCol) {
    throw new Error("public.usuario: columnas requeridas no encontradas");
  }

  return { idCol, emailCol, nombreCol, activoCol, rolCol, passCol };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const map = await getUsuarioColumnMap();

  const selectParts: string[] = [];
  selectParts.push(`${map.idCol} AS usuario_id`);
  selectParts.push(`${map.emailCol} AS email`);
  if (map.nombreCol) selectParts.push(`${map.nombreCol} AS nombre`);
  if (map.rolCol) selectParts.push(`${map.rolCol} AS rol`);
  if (map.activoCol) selectParts.push(`${map.activoCol} AS activo`);

  const { rows } = await pool.query(
    `SELECT ${selectParts.join(", ")} FROM public.usuario ORDER BY ${map.emailCol} ASC`
  );

  return NextResponse.json({ users: rows });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({} as any));

  const email = (body?.email ?? "").toString().trim().toLowerCase();
  const password = (body?.password ?? "").toString();
  const nombre = body?.nombre != null ? body.nombre.toString().trim() : null;
  const rol = (body?.rol ?? body?.role ?? "user").toString();
  const activo = body?.activo ?? body?.active ?? true;

  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });
  if (!password || password.length < 6)
    return NextResponse.json({ error: "password required (min 6)" }, { status: 400 });

  const map = await getUsuarioColumnMap();

  // Si no hay columna para password, no podemos crear usuarios (pero tu esquema usa password_hash).
  if (!map.passCol) {
    return NextResponse.json(
      { error: "usuario table missing password_hash/password column" },
      { status: 500 }
    );
  }

  // Inserta con hash usando pgcrypto crypt(). Requiere extensión pgcrypto habilitada.
  // NOTA: usamos gen_salt('bf') (bcrypt) para compatibilidad con tu login (crypt).
  const cols: string[] = [map.emailCol, map.passCol];
  const vals: string[] = ["$1", "crypt($2, gen_salt('bf'))"];
  const params: any[] = [email, password];
  let p = 2;

  if (map.nombreCol) {
    cols.push(map.nombreCol);
    vals.push(`$${++p}`);
    params.push(nombre);
  }
  if (map.rolCol) {
    cols.push(map.rolCol);
    vals.push(`$${++p}`);
    params.push(rol);
  }
  if (map.activoCol) {
    cols.push(map.activoCol);
    vals.push(`$${++p}`);
    params.push(Boolean(activo));
  }

  // RETURNING
  const returning: string[] = [];
  returning.push(`${map.idCol} AS usuario_id`);
  returning.push(`${map.emailCol} AS email`);
  if (map.nombreCol) returning.push(`${map.nombreCol} AS nombre`);
  if (map.rolCol) returning.push(`${map.rolCol} AS rol`);
  if (map.activoCol) returning.push(`${map.activoCol} AS activo`);

  try {
    const { rows } = await pool.query(
      `INSERT INTO public.usuario (${cols.join(", ")})
       VALUES (${vals.join(", ")})
       RETURNING ${returning.join(", ")}`,
      params
    );

    return NextResponse.json({ user: rows[0] }, { status: 201 });
  } catch (e: any) {
    // unique violation
    if (e?.code === "23505") {
      return NextResponse.json({ error: "email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: e?.message ?? "insert failed" }, { status: 500 });
  }
}
