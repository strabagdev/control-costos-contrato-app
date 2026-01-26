import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";
import bcrypt from "bcryptjs";

function isAdmin(session: any) {
  return (session?.user as any)?.role === "admin";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isEmail(value: string) {
  // Simple, good-enough email check for admin UI
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function getCtx(ctx: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await Promise.resolve(ctx.params);
  const id = (params?.id ?? "").toString();
  return { id };
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> | { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id: usuario_id } = await getCtx(ctx);

  if (!usuario_id || !isUuid(usuario_id)) {
    return NextResponse.json({ error: "not found", id: usuario_id }, { status: 404 });
  }

  const body = await req.json().catch(() => null);

  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  // ✅ Email editable
  if (body?.email !== undefined) {
    const email = (body.email ?? "").toString().trim().toLowerCase();
    if (!email || !isEmail(email)) {
      return NextResponse.json({ error: "invalid email" }, { status: 400 });
    }
    fields.push(`email = $${idx++}`);
    values.push(email);
  }

  if (body?.nombre !== undefined) {
    fields.push(`nombre = $${idx++}`);
    values.push(
      body.nombre === null || body.nombre === ""
        ? null
        : body.nombre.toString().trim()
    );
  }

  if (body?.rol !== undefined) {
    const rol = body.rol.toString();
    if (!["admin", "editor", "viewer"].includes(rol)) {
      return NextResponse.json({ error: "invalid role" }, { status: 400 });
    }
    fields.push(`rol = $${idx++}`);
    values.push(rol);
  }

  if (body?.activo !== undefined) {
    fields.push(`activo = $${idx++}`);
    values.push(Boolean(body.activo));
  }

  if (body?.password !== undefined) {
    const password = body.password.toString();
    if (password.length < 6) {
      return NextResponse.json({ error: "password too short" }, { status: 400 });
    }
    const password_hash = await bcrypt.hash(password, 10);
    fields.push(`password_hash = $${idx++}`);
    values.push(password_hash);
  }

  if (fields.length === 0) {
    return NextResponse.json({ error: "no changes" }, { status: 400 });
  }

  values.push(usuario_id);

  const sql = `
    UPDATE usuario
    SET ${fields.join(", ")}, updated_at = NOW()
    WHERE usuario_id = $${idx}::uuid
    RETURNING usuario_id, email, nombre, rol, activo, created_at
  `;

  try {
    const { rows } = await pool.query(sql, values);
    if (!rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ user: rows[0] });
  } catch (e: any) {
    const msg = (e?.message ?? "").toString();
    if (msg.includes("uq_usuario_email")) {
      return NextResponse.json({ error: "email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> | { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id: usuario_id } = await getCtx(ctx);

  if (!usuario_id || !isUuid(usuario_id)) {
    return NextResponse.json({ error: "not found", id: usuario_id }, { status: 404 });
  }

  // ✅ Validación 1: no borrar tu propia cuenta logueada
  const myEmail = (session?.user?.email ?? "").toString().trim().toLowerCase();

  const { rows: targetRows } = await pool.query(
    "SELECT usuario_id, email, rol FROM usuario WHERE usuario_id = $1::uuid",
    [usuario_id]
  );

  const target = targetRows[0];
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (target.email?.toString().trim().toLowerCase() === myEmail) {
    return NextResponse.json({ error: "cannot delete your own user" }, { status: 400 });
  }

  // ✅ Validación 2: no borrar el último admin
  if (target.rol === "admin") {
    const { rows: admins } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM usuario WHERE rol = 'admin' AND activo = TRUE"
    );
    if ((admins[0]?.n ?? 0) <= 1) {
      return NextResponse.json({ error: "cannot delete last admin" }, { status: 400 });
    }
  }

  // Hard delete (MVP). Si quieres auditoría, lo cambiamos a soft-delete luego.
  await pool.query("DELETE FROM usuario WHERE usuario_id = $1::uuid", [usuario_id]);

  return NextResponse.json({ ok: true });
}
