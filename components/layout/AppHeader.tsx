"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

export default function AppHeader() {
  // ✅ Hooks SIEMPRE en el mismo orden
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [contratoId, setContratoId] = React.useState<string>("");

  const hideHeader = status === "loading" || !session || pathname === "/login";

  React.useEffect(() => {
    if (!session) return;

    const contratoFromUrl = searchParams.get("contrato");
    const key = "cc_last_contrato";

    const fromStorage =
      typeof window !== "undefined" ? window.localStorage.getItem(key) ?? "" : "";

    const next = contratoFromUrl || fromStorage || "";
    setContratoId(next);

    if (contratoFromUrl) {
      try {
        window.localStorage.setItem(key, contratoFromUrl);
      } catch {}
    }
  }, [searchParams, session]);

  if (hideHeader) return null;

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 16px",
        borderBottom: "1px solid #e5e7eb",
        background: "white",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Link href="/" style={{ fontWeight: 900, textDecoration: "none" }}>
          Control Costos
        </Link>

        {contratoId ? (
          <span
            style={{
              fontSize: 12,
              padding: "4px 8px",
              borderRadius: 6,
              background: "#f3f4f6",
              color: "#374151",
            }}
          >
            Contrato: {contratoId}
          </span>
        ) : (
          <span style={{ fontSize: 12, opacity: 0.6 }}>Sin contrato seleccionado</span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 13 }}>{session?.user?.email}</span>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            fontSize: 12,
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            background: "white",
            cursor: "pointer",
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
