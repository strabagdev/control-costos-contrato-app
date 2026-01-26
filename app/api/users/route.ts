import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";
import bcrypt from "bcryptjs";

function isAdmin(session: any) {
  return (session?.user as any)?.role === "admin";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { rows } = await pool.query(
    `SELECT usuario_id, email, nombre, rol, activo, created_at
     FROM usuario
     ORDER BY created_at DESC`
  );

  return NextResponse.json({ users: rows });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);

  const email = (body?.email ?? "").toString().trim().toLowerCase();
  const nombre = body?.nombre !== undefined ? (body.nombre ? body.nombre.toString().trim() : null) : null;
  const rol = (body?.rol ?? "viewer").toString();
  const password = (body?.password ?? "").toString();

  if (!email || !password) return NextResponse.json({ error: "email and password required" }, { status: 400 });
  if (!["admin", "editor", "viewer"].includes(rol)) return NextResponse.json({ error: "invalid role" }, { status: 400 });

  const password_hash = await bcrypt.hash(password, 10);

  try {
    const { rows } = await pool.query(
      `INSERT INTO usuario (email, nombre, password_hash, rol, activo)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING usuario_id, email, nombre, rol, activo, created_at`,
      [email, nombre, password_hash, rol]
    );

    return NextResponse.json({ user: rows[0] }, { status: 201 });
  } catch (e: any) {
    const msg = (e?.message ?? "").toString();
    if (msg.includes("uq_usuario_email")) {
      return NextResponse.json({ error: "email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}
