import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { pool } from "@/lib/db";
import UserContractsSelectorClient from "./user-contracts-selector-client";

function isAdmin(session: any) {
  return (session?.user as any)?.role === "admin";
}

export default async function UserContractsAdminPage() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) redirect("/");

  const contratos = await pool.query(
    `SELECT c.contrato_id, c.nombre
     FROM public.contrato c
     ORDER BY c.nombre`
  );

  return (
    <div style={{ maxWidth: 1100, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>
        Admin · Contrato → Usuarios
      </h1>
      <p style={{ marginTop: 8, opacity: 0.75 }}>
        Selecciona un contrato y asigna usuarios (guardado inmediato).
      </p>

      <UserContractsSelectorClient contratos={contratos.rows} />
    </div>
  );
}
