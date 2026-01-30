"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

type Contrato = { contrato_id: string; nombre?: string | null };

export default function AppHeader() {
  // ✅ Hooks SIEMPRE en el mismo orden
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [contratos, setContratos] = React.useState<Contrato[]>([]);
  const [loadingContratos, setLoadingContratos] = React.useState(false);

  const [contratoId, setContratoId] = React.useState<string>("");

  const hideHeader = status === "loading" || !session || pathname === "/login";

  // 1) Cargar contratos permitidos para el usuario (por nombre)
  React.useEffect(() => {
    if (!session) return;

    let cancelled = false;
    setLoadingContratos(true);

    fetch("/api/me/contracts", { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json().catch(() => ({} as any));
        if (!r.ok) throw new Error(data?.error || "failed");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setContratos(Array.isArray(data?.contratos) ? data.contratos : []);
      })
      .catch(() => {
        if (cancelled) return;
        setContratos([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingContratos(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  // 2) Resolver contrato activo: URL > localStorage > primer contrato permitido
  React.useEffect(() => {
    if (!session) return;

    const contratoFromUrl = searchParams.get("contrato");
    const key = "cc_last_contrato";

    const fromStorage =
      typeof window !== "undefined" ? window.localStorage.getItem(key) ?? "" : "";

    const allowed = new Set(contratos.map((c) => c.contrato_id));
    const firstAllowed = contratos[0]?.contrato_id ?? "";

    // Preferimos URL si es válido
    if (contratoFromUrl && allowed.has(contratoFromUrl)) {
      setContratoId(contratoFromUrl);
      try {
        window.localStorage.setItem(key, contratoFromUrl);
      } catch {}
      return;
    }

    // Luego localStorage si es válido
    if (fromStorage && allowed.has(fromStorage)) {
      setContratoId(fromStorage);
      return;
    }

    // Si no hay nada válido, usamos el primero permitido
    if (firstAllowed) {
      setContratoId(firstAllowed);
      try {
        window.localStorage.setItem(key, firstAllowed);
      } catch {}

      // En MVP, también reflejamos en la URL para que el server cargue data correcta
      // (solo si no hay contrato en la URL)
      if (!contratoFromUrl) {
        router.replace(`/?contrato=${encodeURIComponent(firstAllowed)}`);
        router.refresh();
      }
    } else {
      setContratoId("");
    }
  }, [searchParams, session, contratos, router]);

  function onChangeContrato(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setContratoId(next);

    try {
      window.localStorage.setItem("cc_last_contrato", next);
    } catch {}

    router.replace(next ? `/?contrato=${encodeURIComponent(next)}` : "/");
    router.refresh();
  }

  const contratoActual = contratos.find((c) => c.contrato_id === contratoId);
  const contratoLabel = contratoActual?.nombre ?? (contratoId ? contratoId : "");

  // 🔒 Recién aquí retornamos condicionalmente (sin romper Rules of Hooks)
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
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Link href="/" style={{ fontWeight: 900, textDecoration: "none" }}>
          Control Costos
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Contrato</span>

          <select
            value={contratoId}
            onChange={onChangeContrato}
            disabled={loadingContratos || contratos.length === 0}
            style={{
              padding: "7px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "white",
              minWidth: 280,
            }}
            title={contratoLabel}
          >
            {contratos.length === 0 ? (
              <option value="">
                {loadingContratos ? "Cargando..." : "Sin contratos asignados"}
              </option>
            ) : null}

            {contratos.map((c) => (
              <option key={c.contrato_id} value={c.contrato_id}>
                {c.nombre ? c.nombre : c.contrato_id}
              </option>
            ))}
          </select>

          {/* Referencia compacta (sin molestar): muestra UUID solo si no hay nombre */}
          {contratoId && contratoActual?.nombre ? (
            <span style={{ fontSize: 12, opacity: 0.55 }}>
              {contratoId.slice(0, 8)}…
            </span>
          ) : null}
        </div>
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
