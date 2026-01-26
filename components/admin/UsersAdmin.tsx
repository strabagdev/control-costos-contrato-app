"use client";

import { useEffect, useMemo, useState } from "react";

type Role = "admin" | "editor" | "viewer";

type UserRow = {
  usuario_id: string;
  email: string;
  nombre: string | null;
  rol: Role;
  activo: boolean;
  created_at: string;
};

const styles = {
  page: {
    maxWidth: 1100,
    margin: "40px auto",
    padding: 16,
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    color: "#111",
  } as const,
  headerRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  } as const,
  h1: { fontSize: 24, fontWeight: 800, margin: 0 } as const,
  sub: { marginTop: 8, opacity: 0.8 } as const,
  card: {
    marginTop: 18,
    padding: 16,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  } as const,
  cardTitle: { fontSize: 16, marginTop: 0, marginBottom: 12 } as const,
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  } as const,
  label: { display: "block", marginBottom: 6, fontSize: 12, opacity: 0.85 } as const,
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    background: "#fff",
    outline: "none",
  } as const,
  select: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    background: "#fff",
    outline: "none",
  } as const,
  btn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #111827",
    background: "#111827",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  } as const,
  btnGhost: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#111",
    cursor: "pointer",
    fontWeight: 600,
  } as const,
  btnSmall: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  } as const,
  btnDanger: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #b91c1c",
    background: "#b91c1c",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  } as const,
  disabled: { opacity: 0.5, cursor: "not-allowed" } as const,
  errorBox: {
    marginTop: 12,
    padding: 12,
    border: "1px solid #fecaca",
    borderRadius: 12,
    color: "#b91c1c",
    background: "#fef2f2",
  } as const,
  okBox: {
    marginTop: 12,
    padding: 12,
    border: "1px solid #bbf7d0",
    borderRadius: 12,
    color: "#166534",
    background: "#f0fdf4",
  } as const,
  tableWrap: { overflowX: "auto" } as const,
  table: { width: "100%", borderCollapse: "collapse" } as const,
  th: {
    textAlign: "left",
    padding: 10,
    borderBottom: "1px solid #e5e7eb",
    fontSize: 12,
    opacity: 0.9,
  } as const,
  td: { padding: 10, borderBottom: "1px solid #f3f4f6", verticalAlign: "top" } as const,
  rowActions: { display: "flex", gap: 8, flexWrap: "wrap" } as const,

  // modal
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  } as const,
  modal: {
    width: "100%",
    maxWidth: 560,
    background: "#fff",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    boxShadow: "0 12px 30px rgba(0,0,0,0.2)",
    padding: 16,
  } as const,
  modalTitle: { fontSize: 16, fontWeight: 800, margin: 0 } as const,
  modalSub: { marginTop: 6, opacity: 0.75, fontSize: 12 } as const,
  modalFooter: { marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 } as const,
};

export default function UsersAdmin() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<Role>("viewer");
  const [password, setPassword] = useState("");

  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [newPass, setNewPass] = useState("");

  const [deleteFor, setDeleteFor] = useState<UserRow | null>(null);

  const canCreate = useMemo(() => {
    return email.trim().length > 0 && password.trim().length >= 6;
  }, [email, password]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRows(data.users);
    } catch (e: any) {
      setError(e?.message ?? "Error cargando usuarios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function flashOk(msg: string) {
    setOk(msg);
    setTimeout(() => setOk(null), 2500);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          nombre: nombre || null,
          rol,
          password,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEmail("");
      setNombre("");
      setPassword("");
      setRol("viewer");
      await load();
      flashOk("Usuario creado.");
    } catch (e: any) {
      setError(e?.message ?? "Error creando usuario");
    }
  }

  async function updateUser(
    usuario_id: string,
    patch: Partial<Pick<UserRow, "email" | "nombre" | "rol" | "activo">>
  ) {
    setError(null);
    try {
      const res = await fetch(`/api/users/${usuario_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
      flashOk("Usuario actualizado.");
    } catch (e: any) {
      setError(e?.message ?? "Error actualizando usuario");
    }
  }

  async function doResetPassword() {
    if (!resetFor) return;

    const pass = newPass.trim();
    if (pass.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setError(null);
    try {
      const res = await fetch(`/api/users/${resetFor.usuario_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pass }),
      });
      if (!res.ok) throw new Error(await res.text());
      setResetFor(null);
      setNewPass("");
      flashOk("Password actualizado.");
    } catch (e: any) {
      setError(e?.message ?? "Error reseteando password");
    }
  }

  async function doDeleteUser() {
    if (!deleteFor) return;

    setError(null);
    try {
      const res = await fetch(`/api/users/${deleteFor.usuario_id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      setDeleteFor(null);
      await load();
      flashOk("Usuario eliminado.");
    } catch (e: any) {
      setError(e?.message ?? "Error eliminando usuario");
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.h1}>Usuarios</h1>
          <p style={styles.sub}>Mantención de cuentas (solo admin).</p>
        </div>
        <button onClick={load} style={styles.btnGhost}>
          Recargar
        </button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}
      {ok && <div style={styles.okBox}>{ok}</div>}

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Crear usuario</h2>

        <form onSubmit={createUser} style={styles.grid2}>
          <div>
            <label style={styles.label}>Email *</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="usuario@empresa.cl"
              style={styles.input}
            />
          </div>

          <div>
            <label style={styles.label}>Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              type="text"
              placeholder="Nombre Apellido"
              style={styles.input}
            />
          </div>

          <div>
            <label style={styles.label}>Rol</label>
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value as Role)}
              style={styles.select}
            >
              <option value="viewer">viewer</option>
              <option value="editor">editor</option>
              <option value="admin">admin</option>
            </select>
          </div>

          <div>
            <label style={styles.label}>Password inicial * (mín 6)</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="********"
              style={styles.input}
            />
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              disabled={!canCreate}
              type="submit"
              style={{
                ...styles.btn,
                ...(canCreate ? {} : styles.disabled),
              }}
            >
              Crear
            </button>
            <button
              type="button"
              onClick={() => {
                setEmail("");
                setNombre("");
                setPassword("");
                setRol("viewer");
              }}
              style={styles.btnGhost}
            >
              Limpiar
            </button>
          </div>
        </form>
      </div>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Listado</h2>

        {loading ? (
          <p>Cargando...</p>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Nombre</th>
                  <th style={styles.th}>Rol</th>
                  <th style={styles.th}>Activo</th>
                  <th style={styles.th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.usuario_id}>
                    <td style={styles.td}>
                      <input
                        defaultValue={u.email}
                        onBlur={(e) =>
                          updateUser(u.usuario_id, {
                            email: e.target.value,
                          })
                        }
                        style={styles.input}
                      />
                    </td>

                    <td style={styles.td}>
                      <input
                        defaultValue={u.nombre ?? ""}
                        onBlur={(e) =>
                          updateUser(u.usuario_id, {
                            nombre: e.target.value ? e.target.value : null,
                          })
                        }
                        style={styles.input}
                      />
                    </td>

                    <td style={styles.td}>
                      <select
                        value={u.rol}
                        onChange={(e) =>
                          updateUser(u.usuario_id, { rol: e.target.value as Role })
                        }
                        style={styles.select}
                      >
                        <option value="viewer">viewer</option>
                        <option value="editor">editor</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>

                    <td style={styles.td}>
                      <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <input
                          type="checkbox"
                          checked={u.activo}
                          onChange={(e) =>
                            updateUser(u.usuario_id, { activo: e.target.checked })
                          }
                        />
                        <span style={{ fontSize: 12, opacity: 0.8 }}>
                          {u.activo ? "Sí" : "No"}
                        </span>
                      </label>
                    </td>

                    <td style={styles.td}>
                      <div style={styles.rowActions}>
                        <button
                          onClick={() => {
                            setError(null);
                            setResetFor(u);
                            setNewPass("");
                          }}
                          style={styles.btnSmall}
                        >
                          Reset password
                        </button>

                        <button
                          onClick={() => {
                            setError(null);
                            setDeleteFor(u);
                          }}
                          style={styles.btnDanger}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ ...styles.td, opacity: 0.7 }}>
                      Sin usuarios
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reset password modal */}
      {resetFor && (
        <div
          style={styles.modalOverlay}
          onMouseDown={() => setResetFor(null)}
          role="dialog"
          aria-modal="true"
        >
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Reset password</h3>
            <p style={styles.modalSub}>
              Usuario: <b>{resetFor.email}</b>
            </p>

            <div style={{ marginTop: 12 }}>
              <label style={styles.label}>Nueva contraseña (mín 6)</label>
              <input
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                type="password"
                style={styles.input}
                autoFocus
              />
            </div>

            <div style={styles.modalFooter}>
              <button onClick={() => setResetFor(null)} style={styles.btnGhost}>
                Cancelar
              </button>
              <button onClick={doResetPassword} style={styles.btn}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteFor && (
        <div
          style={styles.modalOverlay}
          onMouseDown={() => setDeleteFor(null)}
          role="dialog"
          aria-modal="true"
        >
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Eliminar usuario</h3>
            <p style={styles.modalSub}>
              Se eliminará permanentemente: <b>{deleteFor.email}</b>
            </p>
            <p style={{ marginTop: 12, opacity: 0.8, fontSize: 13 }}>
              Validaciones: no puedes borrarte a ti mismo y no puedes borrar el último admin activo.
            </p>

            <div style={styles.modalFooter}>
              <button onClick={() => setDeleteFor(null)} style={styles.btnGhost}>
                Cancelar
              </button>
              <button onClick={doDeleteUser} style={styles.btnDanger}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      <p style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>
        Nota: Eliminar es hard-delete (MVP). Si quieres auditoría, lo cambiamos a soft-delete.
      </p>
    </div>
  );
}
