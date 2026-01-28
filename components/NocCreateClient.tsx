"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 50,
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          background: "white",
          borderRadius: 14,
          border: "1px solid #ddd",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 14, borderBottom: "1px solid #eee", fontWeight: 900 }}>
          {title}
        </div>
        <div style={{ padding: 14 }}>{children}</div>
      </div>
    </div>
  );
}

export default function NocCreateClient({ contratoId }: { contratoId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [numero, setNumero] = useState("");
  const [fecha, setFecha] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function create() {
    setMsg(null);
    if (!numero.trim()) {
      setMsg("Número requerido");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/nocs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contrato_id: contratoId,
          numero: numero.trim(),
          fecha: fecha || null,
          motivo: motivo.trim() ? motivo.trim() : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "create failed");
      const noc_id = json?.noc?.noc_id;
      setOpen(false);
      setNumero("");
      setFecha("");
      setMotivo("");
      // refresca lista y navega al detalle
      router.refresh();
      if (noc_id) router.push(`/admin/nocs/${noc_id}`);
    } catch (e: any) {
      setMsg(e?.message || "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #ddd",
          background: "white",
          cursor: "pointer",
          fontWeight: 900,
        }}
      >
        + Nueva NOC
      </button>

      {open && (
        <Modal title="Nueva NOC (header)" onClose={() => (!busy ? setOpen(false) : null)}>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Número / Folio</span>
              <input
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                placeholder="Ej: NOC-001"
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Fecha</span>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Motivo</span>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                placeholder="(opcional)"
              />
            </label>

            {msg && <div style={{ fontSize: 12, opacity: 0.75 }}>{msg}</div>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "white",
                  cursor: busy ? "not-allowed" : "pointer",
                  fontWeight: 800,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={create}
                disabled={busy}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(17,94,89,0.35)",
                  background: "rgba(17,94,89,0.12)",
                  cursor: busy ? "not-allowed" : "pointer",
                  fontWeight: 900,
                }}
              >
                {busy ? "Creando..." : "Crear"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
