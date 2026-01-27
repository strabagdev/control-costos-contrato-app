"use client";

import { useMemo, useState } from "react";

type ContratoRow = {
  contrato_id: string; // UUID autogenerado
  nombre: string;
  descripcion: string;
  partidas_count: number;
  noc_count: number;
  user_links_count: number;
};

type FormState = {
  nombre: string;
  descripcion: string;
};

export default function ContratosClient({
  initialContratos,
}: {
  initialContratos: ContratoRow[];
}) {
  const [contratos, setContratos] = useState<ContratoRow[]>(initialContratos);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string>(""); // contrato_id (UUID) oculto
  const [form, setForm] = useState<FormState>({ nombre: "", descripcion: "" });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return contratos;
    return contratos.filter((c) => {
      return (
        c.nombre.toLowerCase().includes(s) ||
        (c.descripcion ?? "").toLowerCase().includes(s) ||
        c.contrato_id.toLowerCase().includes(s)
      );
    });
  }, [contratos, q]);

  function openCreate() {
    setError("");
    setMode("create");
    setEditingId("");
    setForm({ nombre: "", descripcion: "" });
    setOpen(true);
  }

  function openEdit(c: ContratoRow) {
    setError("");
    setMode("edit");
    setEditingId(c.contrato_id);
    setForm({ nombre: c.nombre, descripcion: c.descripcion ?? "" });
    setOpen(true);
  }

  function close() {
    if (busy) return;
    setOpen(false);
  }

  function validateLocal(f: FormState) {
    const nombre = f.nombre.trim();
    if (!nombre) return "nombre requerido";
    return "";
  }

  async function refresh() {
    const r = await fetch("/api/contratos", { cache: "no-store" });
    const rj = await r.json().catch(() => null);
    if (r.ok) setContratos(rj?.contratos ?? []);
  }

  async function save() {
    const msg = validateLocal(form);
    if (msg) return setError(msg);

    setError("");
    setBusy(true);

    try {
      const payload = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim(),
      };

      const res =
        mode === "create"
          ? await fetch("/api/contratos", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch("/api/contratos", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contrato_id: editingId, ...payload }),
            });

      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "request failed");

      await refresh();
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: ContratoRow) {
    setError("");

    const blocked =
      (c.partidas_count ?? 0) > 0 ||
      (c.noc_count ?? 0) > 0 ||
      (c.user_links_count ?? 0) > 0;

    const confirmMsg = blocked
      ? `No se puede borrar: tiene dependencias (partidas:${c.partidas_count}, noc:${c.noc_count}, usuarios:${c.user_links_count}).`
      : `¿Eliminar contrato "${c.nombre}"?`;

    if (!confirm(confirmMsg)) return;
    if (blocked) return;

    setBusy(true);
    try {
      const res = await fetch("/api/contratos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contrato_id: c.contrato_id }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || "request failed");

      setContratos((curr) => curr.filter((x) => x.contrato_id !== c.contrato_id));
    } catch (e: any) {
      setError(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={openCreate} style={btnPrimary} disabled={busy}>
          + Nuevo contrato
        </button>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar (nombre, descripción, uuid)…"
          style={search}
        />
      </div>

      {error ? <div style={errorBox}>{error}</div> : null}

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thLeft}>Nombre</th>
              <th style={thLeft}>Descripción</th>
              <th style={thCenter}>Partidas</th>
              <th style={thCenter}>NOC</th>
              <th style={thCenter}>Users</th>
              <th style={thCenter}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const blocked =
                (c.partidas_count ?? 0) > 0 ||
                (c.noc_count ?? 0) > 0 ||
                (c.user_links_count ?? 0) > 0;

              return (
                <tr key={c.contrato_id}>
                  <td style={tdLeft}>
                    <div style={{ fontWeight: 900 }}>{c.nombre}</div>
                    <div style={{ opacity: 0.55, fontSize: 11, fontFamily: mono }}>
                      {c.contrato_id}
                    </div>
                  </td>
                  <td style={tdLeft}>
                    <span style={{ opacity: c.descripcion ? 1 : 0.6 }}>
                      {c.descripcion || "—"}
                    </span>
                  </td>
                  <td style={tdCenter}>{c.partidas_count ?? 0}</td>
                  <td style={tdCenter}>{c.noc_count ?? 0}</td>
                  <td style={tdCenter}>{c.user_links_count ?? 0}</td>
                  <td style={tdCenter}>
                    <button type="button" style={btn} onClick={() => openEdit(c)} disabled={busy}>
                      Editar
                    </button>{" "}
                    <button
                      type="button"
                      style={{
                        ...btnDanger,
                        ...(blocked ? { opacity: 0.5, cursor: "not-allowed" } : {}),
                      }}
                      onClick={() => remove(c)}
                      disabled={busy || blocked}
                      title={
                        blocked
                          ? "Bloqueado: tiene dependencias (partidas/NOC/users)"
                          : "Eliminar"
                      }
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 12, opacity: 0.7 }}>
                  Sin resultados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {open && (
        <div style={overlay} onClick={close}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <div style={{ fontWeight: 900 }}>
                {mode === "create" ? "Nuevo contrato" : "Editar contrato"}
              </div>
              <button type="button" onClick={close} style={iconBtn} disabled={busy}>
                ✕
              </button>
            </div>

            <div style={{ padding: 14, display: "grid", gap: 10 }}>
              <div>
                <label style={label}>nombre</label>
                <input
                  value={form.nombre}
                  onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
                  style={input}
                  disabled={busy}
                  placeholder="Nombre del contrato"
                />
              </div>

              <div>
                <label style={label}>descripción</label>
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
                  style={{ ...input, minHeight: 90 }}
                  disabled={busy}
                  placeholder="Opcional"
                />
              </div>

              {mode === "edit" ? (
                <div style={{ opacity: 0.7, fontSize: 12 }}>
                  ID (UUID): <span style={{ fontFamily: mono }}>{editingId}</span>
                </div>
              ) : null}

              {error ? <div style={errorBox}>{error}</div> : null}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button type="button" onClick={close} style={btn} disabled={busy}>
                  Cancelar
                </button>
                <button type="button" onClick={save} style={btnPrimary} disabled={busy}>
                  {busy ? "Guardando..." : "Guardar"}
                </button>
              </div>

              <p style={{ margin: 0, opacity: 0.7, fontSize: 12 }}>
                El contrato_id se genera automáticamente (UUID) y no se edita.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const mono = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

const card: React.CSSProperties = {
  marginTop: 12,
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
  whiteSpace: "nowrap",
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
  verticalAlign: "top",
};

const tdCenter: React.CSSProperties = {
  textAlign: "center",
  padding: "10px 10px",
  borderBottom: "1px solid #f2f2f2",
  whiteSpace: "nowrap",
  verticalAlign: "top",
};

const btn: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "white",
  cursor: "pointer",
  fontWeight: 800,
};

const btnPrimary: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid rgba(34, 96, 170, 0.35)",
  background: "rgba(34, 96, 170, 0.12)",
  cursor: "pointer",
  fontWeight: 900,
};

const btnDanger: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 10,
  border: "1px solid rgba(239, 68, 68, 0.35)",
  background: "rgba(239, 68, 68, 0.10)",
  cursor: "pointer",
  fontWeight: 900,
};

const search: React.CSSProperties = {
  flex: "1 1 260px",
  minWidth: 260,
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid #ddd",
  outline: "none",
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
  maxWidth: 560,
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

const iconBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "white",
  cursor: "pointer",
  fontWeight: 900,
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  opacity: 0.8,
  marginBottom: 6,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 10,
  border: "1px solid #ddd",
  outline: "none",
  fontSize: 13,
};

const errorBox: React.CSSProperties = {
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(239, 68, 68, 0.35)",
  background: "rgba(239, 68, 68, 0.08)",
  fontSize: 13,
};
