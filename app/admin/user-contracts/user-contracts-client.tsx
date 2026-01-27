"use client";

import { useMemo, useState } from "react";

type ContratoRow = {
  contrato_id: string;
  nombre: string;
  assigned_count: number;
};

type UserRow = {
  usuario_id: string;
  email: string;
  name?: string | null;
  role?: string | null;
  active?: boolean | null;
};

export default function ContractUsersClient({
  contratos,
}: {
  contratos: ContratoRow[];
}) {
  const [openContrato, setOpenContrato] = useState<ContratoRow | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string>("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string>("");

  const [localContratos, setLocalContratos] = useState<ContratoRow[]>(contratos);

  const filteredUsers = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return users;
    return users.filter((u) => {
      const a = (u.email ?? "").toLowerCase();
      const b = (u.name ?? "").toString().toLowerCase();
      const r = (u.role ?? "").toString().toLowerCase();
      return a.includes(query) || b.includes(query) || r.includes(query);
    });
  }, [users, q]);

  async function openModal(contrato: ContratoRow) {
    setError("");
    setOpenContrato(contrato);
    setQ("");
    setLoading(true);

    try {
      const [uRes, aRes] = await Promise.all([
        fetch("/api/users", { cache: "no-store" }),
        fetch(`/api/user-contracts?contrato_id=${encodeURIComponent(contrato.contrato_id)}`, {
          cache: "no-store",
        }),
      ]);

      if (!uRes.ok) throw new Error("No se pudieron cargar usuarios.");
      if (!aRes.ok) throw new Error("No se pudieron cargar asignaciones.");

      const uJson = await uRes.json();
      const aJson = await aRes.json();

      setUsers(uJson.users ?? []);
      const s = new Set<string>((aJson.usuario_ids ?? []).map((x: any) => String(x)));
      setAssigned(s);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  function closeModal() {
    setOpenContrato(null);
    setUsers([]);
    setAssigned(new Set());
    setBusyUserId("");
    setError("");
    setQ("");
    setLoading(false);
  }

  async function toggleUser(usuario_id: string) {
    if (!openContrato) return;
    const contrato_id = openContrato.contrato_id;

    const exists = assigned.has(usuario_id);
    setBusyUserId(usuario_id);
    setError("");

    // optimistic assigned set
    const prevAssigned = new Set(assigned);
    const nextAssigned = new Set(assigned);
    if (exists) nextAssigned.delete(usuario_id);
    else nextAssigned.add(usuario_id);
    setAssigned(nextAssigned);

    // optimistic contract count
    setLocalContratos((curr) =>
      curr.map((c) =>
        c.contrato_id === contrato_id
          ? { ...c, assigned_count: Math.max(0, (c.assigned_count ?? 0) + (exists ? -1 : 1)) }
          : c
      )
    );

    try {
      const res = await fetch("/api/user-contracts", {
        method: exists ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id, contrato_id }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "request failed");
      }
    } catch (e: any) {
      // rollback
      setAssigned(prevAssigned);
      setLocalContratos((curr) =>
        curr.map((c) =>
          c.contrato_id === contrato_id ? { ...c, assigned_count: openContrato.assigned_count } : c
        )
      );
      setError(e?.message || "Error");
    } finally {
      setBusyUserId("");
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thLeft}>Contrato</th>
              <th style={thCenter}>Usuarios asignados</th>
              <th style={thCenter}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {localContratos.map((c) => (
              <tr key={c.contrato_id}>
                <td style={tdLeft}>
                  <div style={{ fontWeight: 900 }}>{c.nombre}</div>
                  <div style={{ opacity: 0.65, fontSize: 12 }}>{c.contrato_id}</div>
                </td>
                <td style={tdCenter}>{c.assigned_count ?? 0}</td>
                <td style={tdCenter}>
                  <button
                    type="button"
                    onClick={() => openModal(c)}
                    style={btn}
                    title="Asignar usuarios"
                  >
                    Administrar usuarios
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openContrato && (
        <div style={overlay} onClick={closeModal}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900 }}>
                  Contrato: {openContrato.nombre}
                </div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>{openContrato.contrato_id}</div>
              </div>
              <button type="button" onClick={closeModal} style={iconBtn} aria-label="Cerrar">
                ✕
              </button>
            </div>

            <div style={{ padding: 14, borderBottom: "1px solid #eee" }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar usuario (email, nombre, rol)…"
                style={search}
              />
              {error ? <div style={errorBox}>{error}</div> : null}
            </div>

            <div style={{ padding: 14, maxHeight: "60vh", overflow: "auto" }}>
              {loading ? (
                <div style={{ opacity: 0.75 }}>Cargando…</div>
              ) : (
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
                              disabled={disabled}
                              style={{
                                ...pill,
                                ...(checked ? pillOn : pillOff),
                                ...(disabled ? { opacity: 0.6, cursor: "not-allowed" } : {}),
                              }}
                              title={checked ? "Quitar" : "Asignar"}
                            >
                              {checked ? "Asignado" : "No"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ padding: 12, opacity: 0.7 }}>
                          Sin resultados.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              )}
            </div>

            <div style={modalFooter}>
              <div style={{ opacity: 0.7, fontSize: 12 }}>
                Tip: si un usuario no ve contratos en el dashboard, asigna aquí.
              </div>
              <button type="button" onClick={closeModal} style={btnLight}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  padding: 12,
  border: "1px solid #ddd",
  borderRadius: 10,
  overflowX: "auto",
  background: "white",
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

const btn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "white",
  cursor: "pointer",
  fontWeight: 800,
};

const btnLight: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "white",
  cursor: "pointer",
  fontWeight: 800,
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "grid",
  placeItems: "center",
  padding: 16,
  zIndex: 9999,
};

const modal: React.CSSProperties = {
  width: "100%",
  maxWidth: 860,
  borderRadius: 14,
  background: "white",
  border: "1px solid #ddd",
  boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
  overflow: "hidden",
};

const modalHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: 14,
  borderBottom: "1px solid #eee",
};

const modalFooter: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: 14,
  borderTop: "1px solid #eee",
};

const iconBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "white",
  cursor: "pointer",
  fontWeight: 900,
};

const search: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  outline: "none",
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
