import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

function isAdmin(session: any) {
  return (session?.user as any)?.role === "admin";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    if (isAdmin(session)) {
      const { rows } = await pool.query(
        "SELECT contrato_id AS id, nombre FROM contrato ORDER BY nombre"
      );
      return NextResponse.json({ contratos: rows });
    }

    const { rows } = await pool.query(
      `SELECT c.contrato_id AS id, c.nombre
       FROM contrato c
       JOIN user_contract uc ON uc.contrato_id = c.contrato_id
       WHERE uc.user_id = $1
       ORDER BY c.nombre`,
      [(session.user as any).id]
    );

    return NextResponse.json({ contratos: rows });
  } catch {
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}
