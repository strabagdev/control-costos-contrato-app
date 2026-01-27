"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Contrato = { contrato_id: string; nombre: string };

export default function ContratoSelectorClient({
  contratos,
  selectedContratoId,
}: {
  contratos: Contrato[];
  selectedContratoId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const value = useMemo(() => {
    return selectedContratoId || contratos[0]?.contrato_id || "";
  }, [selectedContratoId, contratos]);

  function setContrato(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("contrato", id);
    router.push(`/?${next.toString()}`);
  }

  return (
    <div
      style={{
        marginTop: 14,
        padding: 12,
        border: "1px solid #ddd",
        borderRadius: 10,
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
        Contrato
      </div>

      <select
        value={value}
        onChange={(e) => setContrato(e.target.value)}
        style={{
          padding: "9px 10px",
          borderRadius: 10,
          border: "1px solid #ddd",
          background: "white",
          fontSize: 13,
          minWidth: 320,
        }}
      >
        {contratos.map((c) => (
          <option key={c.contrato_id} value={c.contrato_id}>
            {c.nombre}
          </option>
        ))}
      </select>

      <div style={{ fontSize: 12, opacity: 0.65 }}>
        (cambia la data del dashboard)
      </div>
    </div>
  );
}
