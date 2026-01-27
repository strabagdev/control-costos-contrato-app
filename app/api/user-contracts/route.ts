import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

function isAdmin(session: any) {
  return (session?.user as any)?.role === "admin";
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const { user_id, contrato_id } = body || {};

  if (!user_id || !contrato_id) {
    return NextResponse.json({ error: "user_id and contrato_id required" }, { status: 400 });
  }

  try {
    await pool.query(
      "INSERT INTO user_contract (user_id, contrato_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [user_id, contrato_id]
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
  const { user_id, contrato_id } = body || {};

  if (!user_id || !contrato_id) {
    return NextResponse.json({ error: "user_id and contrato_id required" }, { status: 400 });
  }

  try {
    await pool.query(
      "DELETE FROM user_contract WHERE user_id = $1 AND contrato_id = $2",
      [user_id, contrato_id]
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}
