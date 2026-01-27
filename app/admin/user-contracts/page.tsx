import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { pool } from "@/lib/db";

function isAdmin(session: any) {
  return (session?.user as any)?.role === "admin";
}

export default async function UserContractsAdminPage() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) redirect("/");

  const users = await pool.query(
    "SELECT id, email, name FROM users WHERE active = true ORDER BY email"
  );
  const contratos = await pool.query(
    "SELECT contrato_id, nombre FROM contrato ORDER BY nombre"
  );
  const links = await pool.query("SELECT * FROM user_contract");

  return (
    <pre style={{ padding: 16 }}>
      {JSON.stringify({ users: users.rows, contratos: contratos.rows, links: links.rows }, null, 2)}
    </pre>
  );
}
