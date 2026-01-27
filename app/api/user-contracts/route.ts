import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

function isAdmin(session: any) {
  return (session?.user as any)?.role === "admin";
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const contrato_id = (searchParams.get("contrato_id") ?? "").toString();

  if (!contrato_id) {
    return NextResponse.json({ error: "contrato_id required" }, { status: 400 });
  }

  try {
    const { rows } = await pool.query(
      "SELECT usuario_id FROM public.user_contract WHERE contrato_id = $1 ORDER BY usuario_id",
      [contrato_id]
    );
    return NextResponse.json({ usuario_ids: rows.map((r) => r.usuario_id) });
  } catch {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const { usuario_id, contrato_id } = body || {};

  if (!usuario_id || !contrato_id) {
    return NextResponse.json({ error: "usuario_id and contrato_id required" }, { status: 400 });
  }

  try {
    await pool.query(
      "INSERT INTO public.user_contract (usuario_id, contrato_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [usuario_id, contrato_id]
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const { usuario_id, contrato_id } = body || {};

  if (!usuario_id || !contrato_id) {
    return NextResponse.json({ error: "usuario_id and contrato_id required" }, { status: 400 });
  }

  try {
    await pool.query(
      "DELETE FROM public.user_contract WHERE usuario_id = $1 AND contrato_id = $2",
      [usuario_id, contrato_id]
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}
