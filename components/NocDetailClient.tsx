"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Role = "admin" | "editor" | "viewer";

type Noc = {
  noc_id: string;
  contrato_id: string;
  numero: string;
  motivo: string;
  fecha: string; // yyyy-mm-dd
};

type PartidaOption = {
  partida_id: string;
  item: string;
  descripcion: string;
  cantidad: any;
  precio_unitario: any;
  total: any;
};

type Line = {
  noc_linea_id: string;
  noc_id: string;
  partida_origen_id: string | null;
  partida_resultante_id: string | null;
  nueva_cantidad: any;
  nuevo_precio_unitario: any;
  observacion: string | null;
  created_at: string;

  origen_item: string | null;
  origen_descripcion: string | null;
  origen_cantidad: any;
  origen_precio_unitario: any;
  origen_total: any;
  origen_vigente: boolean | null;
};

function fmtNum(v: any) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return "";
  return String(n);
}

function toNumberOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function toNumberOrFallback(v: string, fallback: any) {
  const n = toNumberOrNull(v);
  if (n !== null) return n;
  const fb = typeof fallback === "number" ? fallback : parseFloat(String(fallback ?? ""));
  return Number.isFinite(fb) ? fb : 0;
}

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
          width: "min(720px, 100%)",
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

export default function NocDetailClient({
  noc,
  lines,
  partidas,
  role,
}: {
  noc: Noc;
  lines: Line[];
  partidas: PartidaOption[];
  role: Role;
}) {
  const router = useRouter();
  const readOnly = role === "viewer";
  const canWrite = role === "admin" || role === "editor";

  const [header, setHeader] = useState<Noc>(noc);
  const [savingHeader, setSavingHeader] = useState(false);
  const [headerMsg, setHeaderMsg] = useState<string | null>(null);

  const [rows, setRows] = useState<Line[]>(lines);
  const [busyLineId, setBusyLineId] = useState<string | null>(null);
  const [lineMsg, setLineMsg] = useState<string | null>(null);

  const [newPartidaId, setNewPartidaId] = useState<string>("");
  const [newCantidad, setNewCantidad] = useState<string>("");
  const [newPU, setNewPU] = useState<string>("");
  const [newObs, setNewObs] = useState<string>("");

  const [showApply, setShowApply] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  const partidaMap = useMemo(() => {
    const m = new Map<string, PartidaOption>();
    for (const p of partidas) m.set(p.partida_id, p);
    return m;
  }, [partidas]);

  const hasAppliedLines = useMemo(() => rows.some((r) => !!r.partida_resultante_id), [rows]);
  const canApply = canWrite && rows.length > 0 && !hasAppliedLines && !applying;

  async function saveHeader() {
    setHeaderMsg(null);
    setSavingHeader(true);
    try {
      const res = await fetch(`/api/nocs/${header.noc_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: header.numero,
          motivo: header.motivo,
          fecha: header.fecha || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "save failed");
      setHeaderMsg("OK");
      router.refresh();
    } catch (e: any) {
      setHeaderMsg(e?.message || "error");
    } finally {
      setSavingHeader(false);
      setTimeout(() => setHeaderMsg(null), 2000);
    }
  }

  async function addLine() {
    setLineMsg(null);

    if (!newPartidaId) {
      setLineMsg("Selecciona partida");
      return;
    }

    // ✅ Si el usuario deja cantidad/PU vacío, completamos con valores actuales de la partida.
    // Esto evita 400 si el backend exige valores finales (RN-10).
    const origen = partidaMap.get(newPartidaId);
    if (!origen) {
      setLineMsg("Partida origen no encontrada");
      return;
    }

    const finalCantidad = toNumberOrFallback(newCantidad, origen.cantidad);
    const finalPU = toNumberOrFallback(newPU, origen.precio_unitario);

    const payload = {
      partida_origen_id: newPartidaId,
      nueva_cantidad: finalCantidad,
      nuevo_precio_unitario: finalPU,
      observacion: newObs.trim() ? newObs.trim() : null,
    };

    setBusyLineId("NEW");
    try {
      const res = await fetch(`/api/nocs/${header.noc_id}/lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "add line failed");

      const created: Line = {
        ...(json.line as any),
        origen_item: origen.item ?? null,
        origen_descripcion: origen.descripcion ?? null,
        origen_cantidad: origen.cantidad ?? null,
        origen_precio_unitario: origen.precio_unitario ?? null,
        origen_total: origen.total ?? null,
        origen_vigente: true,
      };

      setRows((prev) => [...prev, created]);
      setNewPartidaId("");
      setNewCantidad("");
      setNewPU("");
      setNewObs("");
      setLineMsg("OK");
      router.refresh();
    } catch (e: any) {
      setLineMsg(e?.message || "error");
    } finally {
      setBusyLineId(null);
      setTimeout(() => setLineMsg(null), 2500);
    }
  }

  async function updateLine(
    noc_linea_id: string,
    args: {
      cantidadText: string;
      puText: string;
      obsText: string;
      origenCantidad: any;
      origenPU: any;
      currentCantidad: any;
      currentPU: any;
    }
  ) {
    setLineMsg(null);
    setBusyLineId(noc_linea_id);

    // ✅ Siempre enviamos ambos valores (finales). Si dejan vacío, cae a:
    // current -> origen
    const finalCantidad =
      toNumberOrNull(args.cantidadText) ??
      (Number.isFinite(parseFloat(String(args.currentCantidad ?? ""))) ? parseFloat(String(args.currentCantidad)) : null) ??
      toNumberOrFallback("", args.origenCantidad);

    const finalPU =
      toNumberOrNull(args.puText) ??
      (Number.isFinite(parseFloat(String(args.currentPU ?? ""))) ? parseFloat(String(args.currentPU)) : null) ??
      toNumberOrFallback("", args.origenPU);

    try {
      const res = await fetch(`/api/nocs/${header.noc_id}/lines`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noc_linea_id,
          nueva_cantidad: finalCantidad,
          nuevo_precio_unitario: finalPU,
          observacion: args.obsText.trim() ? args.obsText.trim() : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "update failed");
      setRows((prev) =>
        prev.map((r) => (r.noc_linea_id === noc_linea_id ? { ...r, ...(json.line as any) } : r))
      );
      setLineMsg("OK");
      router.refresh();
    } catch (e: any) {
      setLineMsg(e?.message || "error");
    } finally {
      setBusyLineId(null);
      setTimeout(() => setLineMsg(null), 2500);
    }
  }

  async function deleteLine(noc_linea_id: string) {
    setLineMsg(null);
    setBusyLineId(noc_linea_id);
    try {
      const res = await fetch(`/api/nocs/${header.noc_id}/lines`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noc_linea_id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "delete failed");
      setRows((prev) => prev.filter((r) => r.noc_linea_id !== noc_linea_id));
      setLineMsg("OK");
      router.refresh();
    } catch (e: any) {
      setLineMsg(e?.message || "error");
    } finally {
      setBusyLineId(null);
      setTimeout(() => setLineMsg(null), 2500);
    }
  }

  async function applyNoc() {
    setApplyMsg(null);
    setApplying(true);
    try {
      const res = await fetch(`/api/nocs/${header.noc_id}/apply`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "apply failed");
      setApplyMsg(`OK · aplicadas: ${json?.applied ?? "?"}`);
      setShowApply(false);
      router.refresh();
    } catch (e: any) {
      setApplyMsg(e?.message || "error");
    } finally {
      setApplying(false);
      setTimeout(() => setApplyMsg(null), 4000);
    }
  }

  return (
    <>
      <div style={{ marginTop: 14, border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>Header</div>
        <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Número</span>
            <input
              value={header.numero}
              disabled={readOnly}
              onChange={(e) => setHeader((h) => ({ ...h, numero: e.target.value }))}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Fecha</span>
            <input
              type="date"
              value={header.fecha}
              disabled={readOnly}
              onChange={(e) => setHeader((h) => ({ ...h, fecha: e.target.value }))}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            />
          </label>

          <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={saveHeader}
              disabled={readOnly || savingHeader}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: readOnly ? "#f5f5f5" : "white",
                cursor: readOnly ? "not-allowed" : "pointer",
                fontWeight: 800,
              }}
            >
              {savingHeader ? "Guardando..." : "Guardar header"}
            </button>

            {canWrite && (
              <button
                onClick={() => setShowApply(true)}
                disabled={!canApply}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(17,94,89,0.35)",
                  background: canApply ? "rgba(17,94,89,0.06)" : "#f5f5f5",
                  cursor: canApply ? "pointer" : "not-allowed",
                  fontWeight: 900,
                }}
              >
                Aplicar NOC
              </button>
            )}

            {headerMsg && <span style={{ fontSize: 12, opacity: 0.75 }}>{headerMsg}</span>}
            {applyMsg && <span style={{ fontSize: 12, opacity: 0.75 }}>{applyMsg}</span>}
          </div>

          <label style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Motivo</span>
            <input
              value={header.motivo}
              disabled={readOnly}
              onChange={(e) => setHeader((h) => ({ ...h, motivo: e.target.value }))}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            />
          </label>
        </div>
      </div>

      {showApply && (
        <Modal title="Aplicar NOC" onClose={() => (!applying ? setShowApply(false) : null)}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ opacity: 0.85 }}>Esta acción versionará partidas.</div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={() => setShowApply(false)}
                disabled={applying}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "white",
                  cursor: applying ? "not-allowed" : "pointer",
                  fontWeight: 800,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={applyNoc}
                disabled={!canApply}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(17,94,89,0.35)",
                  background: "rgba(17,94,89,0.12)",
                  cursor: !canApply ? "not-allowed" : "pointer",
                  fontWeight: 900,
                }}
              >
                {applying ? "Aplicando..." : "Confirmar y aplicar"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <div style={{ marginTop: 14, border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 900 }}>
          Líneas ({rows.length})
        </div>

        {!readOnly && !hasAppliedLines && (
          <div style={{ padding: 12, borderBottom: "1px solid #eee" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 2fr auto", gap: 10, alignItems: "end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Partida origen (vigente)</span>
                <select
                  value={newPartidaId}
                  onChange={(e) => setNewPartidaId(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                >
                  <option value="">— seleccionar —</option>
                  {partidas.map((p) => (
                    <option key={p.partida_id} value={p.partida_id}>
                      {p.item} · {p.descripcion}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Nueva cantidad</span>
                <input
                  value={newCantidad}
                  onChange={(e) => setNewCantidad(e.target.value)}
                  placeholder="(vacío = actual)"
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Nuevo PU</span>
                <input
                  value={newPU}
                  onChange={(e) => setNewPU(e.target.value)}
                  placeholder="(vacío = actual)"
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>Observación</span>
                <input
                  value={newObs}
                  onChange={(e) => setNewObs(e.target.value)}
                  placeholder="(opcional)"
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />
              </label>

              <button
                onClick={addLine}
                disabled={busyLineId === "NEW"}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "white",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                {busyLineId === "NEW" ? "Agregando..." : "Agregar"}
              </button>
            </div>
            {lineMsg && <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>{lineMsg}</div>}
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 12, opacity: 0.7 }}>
                <th style={{ padding: 10 }}>Partida</th>
                <th style={{ padding: 10 }}>Actual</th>
                <th style={{ padding: 10 }}>Nuevo</th>
                <th style={{ padding: 10 }}>Obs</th>
                <th style={{ padding: 10 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 12, opacity: 0.75 }}>
                    No hay líneas.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <LineRow
                    key={r.noc_linea_id}
                    r={r}
                    disabled={readOnly || !!r.partida_resultante_id || hasAppliedLines}
                    busy={busyLineId === r.noc_linea_id}
                    onSave={(cantidadText, puText, obsText) =>
                      updateLine(r.noc_linea_id, {
                        cantidadText,
                        puText,
                        obsText,
                        origenCantidad: r.origen_cantidad,
                        origenPU: r.origen_precio_unitario,
                        currentCantidad: r.nueva_cantidad,
                        currentPU: r.nuevo_precio_unitario,
                      })
                    }
                    onDelete={() => deleteLine(r.noc_linea_id)}
                    canWrite={canWrite}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function LineRow({
  r,
  disabled,
  busy,
  onSave,
  onDelete,
  canWrite,
}: {
  r: Line;
  disabled: boolean;
  busy: boolean;
  onSave: (cantidadText: string, puText: string, obsText: string) => void;
  onDelete: () => void;
  canWrite: boolean;
}) {
  const [editCant, setEditCant] = useState<string>(fmtNum(r.nueva_cantidad));
  const [editPU, setEditPU] = useState<string>(fmtNum(r.nuevo_precio_unitario));
  const [editObs, setEditObs] = useState<string>(r.observacion ?? "");

  const currentTxt = `${fmtNum(r.origen_cantidad)} × ${fmtNum(r.origen_precio_unitario)} = ${fmtNum(r.origen_total)}`;

  return (
    <tr style={{ borderTop: "1px solid #eee" }}>
      <td style={{ padding: 10, fontWeight: 800 }}>
        {r.origen_item ?? "—"} · <span style={{ opacity: 0.8 }}>{r.origen_descripcion ?? ""}</span>
      </td>

      <td style={{ padding: 10, fontSize: 12, opacity: 0.8 }}>{currentTxt}</td>

      <td style={{ padding: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={editCant}
            disabled={disabled}
            onChange={(e) => setEditCant(e.target.value)}
            placeholder="(vacío = actual)"
            style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", width: 120 }}
          />
          <input
            value={editPU}
            disabled={disabled}
            onChange={(e) => setEditPU(e.target.value)}
            placeholder="(vacío = actual)"
            style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", width: 120 }}
          />
        </div>
      </td>

      <td style={{ padding: 10 }}>
        <input
          value={editObs}
          disabled={disabled}
          onChange={(e) => setEditObs(e.target.value)}
          placeholder="—"
          style={{ padding: 8, borderRadius: 10, border: "1px solid #ddd", width: 260, maxWidth: "100%" }}
        />
      </td>

      <td style={{ padding: 10, textAlign: "right", whiteSpace: "nowrap" }}>
        {canWrite && (
          <>
            <button
              disabled={disabled || busy}
              onClick={() => onSave(editCant, editPU, editObs)}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "white",
                cursor: disabled ? "not-allowed" : "pointer",
                fontWeight: 800,
                marginRight: 8,
              }}
            >
              {busy ? "..." : "Guardar"}
            </button>

            <button
              disabled={disabled || busy}
              onClick={onDelete}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(239,68,68,0.35)",
                background: "rgba(239,68,68,0.06)",
                cursor: disabled ? "not-allowed" : "pointer",
                fontWeight: 800,
              }}
            >
              Eliminar
            </button>
          </>
        )}
      </td>
    </tr>
  );
}
