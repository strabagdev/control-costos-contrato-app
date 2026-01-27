"use client";

import { useEffect, useMemo, useState } from "react";

type ContratoRow = { contrato_id: string; nombre: string };

type UserRow = {
  usuario_id: string;
  email: string;
  name?: string | null;
  role?: string | null;
  active?: boolean | null;
};

export default function UserContractsSelectorClient({
  contratos,
}: {
  contratos: ContratoRow[];
}) {
  const [contractQ, setContractQ] = useState("");
  const [selectedId, setSelectedId] = useState<string>(contratos[0]?.contrato_id ?? "");

  const [users, setUsers] = useState<UserRow[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [userQ, setUserQ] = useState("");

  const [loading, setLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState("");
  const [error, setError] = useState("");

  const filteredContratos = useMemo(() => {
    const q = contractQ.trim().toLowerCase();
    if (!q) return contratos;
    return contratos.filter((c) => c.nombre.toLowerCase().includes(q));
  }, [contratos, contractQ]);

  const selectedContrato = useMemo(
    () => contratos.find((c) => c.contrato_id === selectedId) ?? null,
    [contratos, selectedId]
  );

  const filteredUsers = useMemo(() => {
    const q = userQ.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const a = (u.email ?? "").toLowerCase();
      const b = (u.name ?? "").toString().toLowerCase();
      const r = (u.role ?? "").toString().toLowerCase();
      return a.includes(q) || b.includes(q) || r.includes(q);
    });
  }, [users, userQ]);

  async function loadForContrato(contrato_id: string) {
    if (!contrato_id) return;
    setError("");
    setLoading(true);

    try {
      const [uRes, aRes] = await Promise.all([
        fetch("/api/users", { cache: "no-store" }),
        fetch(`/api/user-contracts?contrato_id=${encodeURIComponent(contrato_id)}`, {
          cache: "no-store",
        }),
      ]);

      if (!uRes.ok) throw new Error("No se pudieron cargar usuarios.");
      if (!aRes.ok) throw new Error("No se pudieron cargar asignaciones.");

      const uJson = await uRes.json();
      const aJson = await aRes.json();

      setUsers(uJson.users ?? []);
      setAssigned(new Set<string>((aJson.usuario_ids ?? []).map((x: any) => String(x))));
    } catch (e: any) {
      setError(e?.message || "Error");
      setUsers([]);
      setAssigned(new Set());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadForContrato(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function toggleUser(usuario_id: string) {
    if (!selectedId) return;

    const exists = assigned.has(usuario_id);
    setBusyUserId(usuario_id);
    setError("");

    const prev = new Set(assigned);
    const next = new Set(assigned);
    if (exists) next.delete(usuario_id);
    else next.add(usuario_id);
    setAssigned(next);

    try {
      const res = await fetch("/api/user-contracts", {
        method: exists ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id, contrato_id: selectedId }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "request failed");
      }
    } catch (e: any) {
      setAssigned(prev);
      setError(e?.message || "Error");
    } finally {
      setBusyUserId("");
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={gridTop}>
        <div style={card}>
          <div style={label}>Contrato</div>

          <input
            value={contractQ}
            onChange={(e) => setContractQ(e.target.value)}
            placeholder="Buscar contrato…"
            style={search}
          />

          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={select}
          >
            {filteredContratos.map((c) => (
              <option key={c.contrato_id} value={c.contrato_id}>
                {c.nombre}
              </option>
            ))}
          </select>

          <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
            Seleccionado:{" "}
            <span style={{ fontWeight: 900 }}>
              {selectedContrato?.nombre ?? "—"}
            </span>
          </div>
        </div>

        <div style={card}>
          <div style={label}>Usuarios</div>

          <input
            value={userQ}
            onChange={(e) => setUserQ(e.target.value)}
            placeholder="Buscar usuario (email, nombre, rol)…"
            style={search}
          />

          <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
            Asignados: <b>{assigned.size}</b>
            {loading ? <span> · Cargando…</span> : null}
          </div>

          {error ? <div style={errorBox}>{error}</div> : null}
        </div>
      </div>

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thLeft}>Usuario</th>
              <th style={thCenter}>Rol</th>
              <th style={thCenter}>Asignado</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => {
              const checked = assigned.has(u.usuario_id);
              const disabled = busyUserId === u.usuario_id;

              return (
                <tr key={u.usuario_id}>
                  <td style={tdLeft}>
                    <div style={{ fontWeight: 800 }}>{u.email}</div>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>
                      {(u.name ?? "").toString() || "—"}
                    </div>
                  </td>
                  <td style={tdCenter}>{(u.role ?? "—").toString()}</td>
                  <td style={tdCenter}>
                    <button
                      type="button"
                      onClick={() => toggleUser(u.usuario_id)}
                      disabled={disabled || loading}
                      style={{
                        ...pill,
                        ...(checked ? pillOn : pillOff),
                        ...(disabled || loading ? { opacity: 0.6, cursor: "not-allowed" } : {}),
                      }}
                      title={checked ? "Quitar" : "Asignar"}
                    >
                      {checked ? "Asignado" : "No"}
                    </button>
                  </td>
                </tr>
              );
            })}

            {!loading && filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: 12, opacity: 0.7 }}>
                  Sin resultados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const gridTop: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 12,
  marginBottom: 12,
};

const card: React.CSSProperties = {
  padding: 12,
  border: "1px solid #ddd",
  borderRadius: 10,
  background: "white",
  overflowX: "auto",
};

const label: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
  marginBottom: 8,
};

const search: React.CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 10,
  border: "1px solid #ddd",
  outline: "none",
  fontSize: 13,
};

const select: React.CSSProperties = {
  width: "100%",
  marginTop: 10,
  padding: "9px 10px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "white",
  fontSize: 13,
};

const thLeft: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid #eee",
};

const thCenter: React.CSSProperties = {
  textAlign: "center",
  padding: "10px 10px",
  borderBottom: "1px solid #eee",
  whiteSpace: "nowrap",
};

const tdLeft: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid #f2f2f2",
};

const tdCenter: React.CSSProperties = {
  textAlign: "center",
  padding: "10px 10px",
  borderBottom: "1px solid #f2f2f2",
  whiteSpace: "nowrap",
};

const pill: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid #ddd",
  background: "white",
  cursor: "pointer",
  fontWeight: 900,
  minWidth: 96,
};

const pillOn: React.CSSProperties = {
  background: "rgba(34, 197, 94, 0.10)",
  border: "1px solid rgba(34, 197, 94, 0.35)",
};

const pillOff: React.CSSProperties = {
  background: "rgba(148, 163, 184, 0.12)",
  border: "1px solid rgba(148, 163, 184, 0.35)",
};

const errorBox: React.CSSProperties = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(239, 68, 68, 0.35)",
  background: "rgba(239, 68, 68, 0.08)",
  fontSize: 13,
};
