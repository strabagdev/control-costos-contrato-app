"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Contrato = {
  contrato_id: string;
  nombre?: string | null;
};

export default function ContratoSelectorClient({
  contratos,
  selectedContratoId,
}: {
  contratos: Contrato[];
  selectedContratoId: string;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(selectedContratoId || "");

  // Si el server cambia el seleccionado (por querystring), sincronizamos.
  React.useEffect(() => {
    setValue(selectedContratoId || "");
  }, [selectedContratoId]);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setValue(next);

    try {
      window.localStorage.setItem("cc_last_contrato", next);
    } catch {}

    // MVP: usamos querystring para que el server cargue el contrato correcto
    router.replace(next ? `/?contrato=${encodeURIComponent(next)}` : "/");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, opacity: 0.75 }}>Contrato</span>
      <select
        value={value}
        onChange={onChange}
        style={{
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "white",
          minWidth: 260,
        }}
      >
        <option value="" disabled>
          Selecciona un contrato...
        </option>
        {contratos.map((c) => (
          <option key={c.contrato_id} value={c.contrato_id}>
            {c.nombre ? `${c.nombre} (${c.contrato_id.slice(0, 8)}…)` : c.contrato_id}
          </option>
        ))}
      </select>
    </div>
  );
}
