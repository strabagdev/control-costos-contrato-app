"use client";

import React, { useEffect, useMemo, useState } from "react";

type Option = { id: string; label: string };

type PartidaRowRaw = any;

type PartidaRow = {
  partida_id: string;
  contrato_id: string;
  item: string;
  descripcion: string | null;
  familia_id: string | null;
  subfamilia_id: string | null;
  grupo_id: string | null;
  unidad_id: string | null;
  cantidad: number;
  precio_unitario: number;
  vigente: boolean;
  created_at: string | null;
};

type Props = {
  contratos: Option[];
  familias: Option[];
  subfamilias: Option[];
  grupos: Option[];
  unidades: Option[];
};

type FormState = {
  partida_id?: string;
  contrato_id: string;
  item: string;
  descripcion: string;
  familia_id: string;
  subfamilia_id: string;
  grupo_id: string;
  unidad_id: string;
  cantidad: string;
  precio_unitario: string;
  vigente: boolean;
};

function toNumber(v: any, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePartida(r: PartidaRowRaw): PartidaRow {
  const partida_id = (r?.partida_id ?? r?.id ?? "").toString();
  return {
    partida_id,
    contrato_id: (r?.contrato_id ?? "").toString(),
    item: (r?.item ?? "").toString(),
    descripcion: r?.descripcion ?? null,
    familia_id: r?.familia_id ?? null,
    subfamilia_id: r?.subfamilia_id ?? null,
    grupo_id: r?.grupo_id ?? null,
    unidad_id: r?.unidad_id ?? null,
    cantidad: toNumber(r?.cantidad, 0),
    precio_unitario: toNumber(r?.precio_unitario, 0),
    vigente: Boolean(r?.vigente),
    created_at: r?.created_at ?? null,
  };
}

function money(n: number) {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("es-CL");
}

function findLabel(options: Option[], id: string | null | undefined) {
  if (!id) return "";
  return options.find((o) => o.id === id)?.label ?? "";
}

export default function PartidasAdminClient({
  contratos,
  familias,
  subfamilias,
  grupos,
  unidades,
}: Props) {
  const [contratoId, setContratoId] = useState<string>(contratos[0]?.id ?? "");
  const [partidas, setPartidas] = useState<PartidaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [openForm, setOpenForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(() => ({
    contrato_id: contratos[0]?.id ?? "",
    item: "",
    descripcion: "",
    familia_id: "",
    subfamilia_id: "",
    grupo_id: "",
    unidad_id: "",
    cantidad: "0",
    precio_unitario: "0",
    vigente: true,
  }));

  const totals = useMemo(() => {
    const sum = partidas.reduce(
      (acc, p) => acc + (p.cantidad ?? 0) * (p.precio_unitario ?? 0),
      0
    );
    return { total: sum };
  }, [partidas]);

  async function loadPartidas(currentContratoId: string) {
    if (!currentContratoId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/partidas?contrato_id=${encodeURIComponent(currentContratoId)}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Error cargando partidas");

      const rows = Array.isArray(json.partidas) ? json.partidas : [];
      const normalized = rows.map(normalizePartida).filter((p) => Boolean(p.partida_id));

      setPartidas(normalized);
    } catch (e: any) {
      setError(e?.message ?? "Error cargando partidas");
      setPartidas([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!contratoId) return;
    loadPartidas(contratoId);
    setForm((prev) => ({ ...prev, contrato_id: contratoId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoId]);

  function resetFormForCreate() {
    setForm({
      contrato_id: contratoId,
      item: "",
      descripcion: "",
      familia_id: "",
      subfamilia_id: "",
      grupo_id: "",
      unidad_id: "",
      cantidad: "0",
      precio_unitario: "0",
      vigente: true,
    });
  }

  function openCreate() {
    resetFormForCreate();
    setOpenForm(true);
  }

  function openEdit(p: PartidaRow) {
    if (!p.partida_id) {
      setError("No se pudo identificar la partida (id). Revisa el GET /api/partidas.");
      return;
    }
    setForm({
      partida_id: p.partida_id,
      contrato_id: p.contrato_id,
      item: p.item ?? "",
      descripcion: p.descripcion ?? "",
      familia_id: p.familia_id ?? "",
      subfamilia_id: p.subfamilia_id ?? "",
      grupo_id: p.grupo_id ?? "",
      unidad_id: p.unidad_id ?? "",
      cantidad: String(p.cantidad ?? 0),
      precio_unitario: String(p.precio_unitario ?? 0),
      vigente: Boolean(p.vigente),
    });
    setOpenForm(true);
  }

  async function save() {
    setSaving(true);
    setError("");

    const payload: any = {
      contrato_id: form.contrato_id,
      item: form.item.trim(),
      descripcion: form.descripcion.trim(),
      familia_id: form.familia_id || null,
      subfamilia_id: form.subfamilia_id || null,
      grupo_id: form.grupo_id || null,
      unidad_id: form.unidad_id || null,
      cantidad: Number(form.cantidad),
      precio_unitario: Number(form.precio_unitario),
      vigente: Boolean(form.vigente),
    };

    try {
      if (!payload.contrato_id || !payload.item)
        throw new Error("contrato y item son obligatorios");
      if (!Number.isFinite(payload.cantidad) || payload.cantidad < 0)
        throw new Error("cantidad inválida");
      if (!Number.isFinite(payload.precio_unitario) || payload.precio_unitario < 0)
        throw new Error("precio unitario inválido");

      const isEdit = Boolean(form.partida_id);
      if (isEdit && !form.partida_id) {
        throw new Error("No se pudo identificar la partida (id).");
      }

      // Include id in payload too, in case route params are not being passed as expected
      if (isEdit) {
        payload.partida_id = form.partida_id;
        payload.id = form.partida_id;
      }

      const url = isEdit
        ? `/api/partidas/${encodeURIComponent(form.partida_id!)}`
        : "/api/partidas";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Error guardando");

      setOpenForm(false);
      await loadPartidas(contratoId);
    } catch (e: any) {
      setError(e?.message ?? "Error guardando");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Contrato</label>
          <select
            value={contratoId}
            onChange={(e) => setContratoId(e.target.value)}
            style={{ padding: "8px 10px", minWidth: 280 }}
          >
            {contratos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={openCreate}
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: "white", cursor: "pointer" }}
        >
          + Nueva partida
        </button>

        <div style={{ marginLeft: "auto", opacity: 0.8 }}>
          Total visible: <strong>${money(totals.total)}</strong>
        </div>
      </div>

      {error ? (
        <div style={{ padding: 10, border: "1px solid #f2c6c6", background: "#fff5f5", borderRadius: 8, marginBottom: 12 }}>
          {error}
        </div>
      ) : null}

      <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: 10, borderBottom: "1px solid #eee", display: "flex", gap: 10, alignItems: "center" }}>
          <strong>Partidas</strong>
          {loading ? <span style={{ opacity: 0.7 }}>(cargando...)</span> : <span style={{ opacity: 0.7 }}>({partidas.length})</span>}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", background: "#fafafa" }}>
                <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Item</th>
                <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Descripción</th>
                <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Familia</th>
                <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Subfamilia</th>
                <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Grupo</th>
                <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Unidad</th>
                <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Cantidad</th>
                <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>PU</th>
                <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Total</th>
                <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Vigente</th>
                <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {partidas.map((p) => {
                const total = (p.cantidad ?? 0) * (p.precio_unitario ?? 0);
                return (
                  <tr key={p.partida_id} style={{ borderBottom: "1px solid #f1f1f1" }}>
                    <td style={{ padding: 10, whiteSpace: "nowrap" }}>{p.item}</td>
                    <td style={{ padding: 10, minWidth: 280 }}>{p.descripcion ?? ""}</td>
                    <td style={{ padding: 10 }}>{findLabel(familias, p.familia_id)}</td>
                    <td style={{ padding: 10 }}>{findLabel(subfamilias, p.subfamilia_id)}</td>
                    <td style={{ padding: 10 }}>{findLabel(grupos, p.grupo_id)}</td>
                    <td style={{ padding: 10 }}>{findLabel(unidades, p.unidad_id)}</td>
                    <td style={{ padding: 10, textAlign: "right" }}>{money(p.cantidad ?? 0)}</td>
                    <td style={{ padding: 10, textAlign: "right" }}>${money(p.precio_unitario ?? 0)}</td>
                    <td style={{ padding: 10, textAlign: "right" }}>${money(total)}</td>
                    <td style={{ padding: 10 }}>
                      <span style={{ display: "inline-block", padding: "6px 10px", borderRadius: 999, border: "1px solid #ddd", background: p.vigente ? "#f0fff4" : "#fff5f5" }}>
                        {p.vigente ? "Sí" : "No"}
                      </span>
                    </td>
                    <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => openEdit(p)}
                        style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "white", cursor: "pointer" }}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && partidas.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: 14, opacity: 0.7 }}>
                    No hay partidas para este contrato.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {openForm ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenForm(false); }}
        >
          <div style={{ width: "100%", maxWidth: 760, background: "white", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <strong style={{ fontSize: 16 }}>{form.partida_id ? "Editar partida" : "Nueva partida"}</strong>
              <div style={{ marginLeft: "auto" }}>
                <button onClick={() => setOpenForm(false)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", background: "white", cursor: "pointer" }}>
                  Cerrar
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Contrato</label>
                <select value={form.contrato_id} onChange={(e) => setForm((p) => ({ ...p, contrato_id: e.target.value }))} style={{ padding: "8px 10px" }} disabled={Boolean(form.partida_id)}>
                  {contratos.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Item</label>
                <input value={form.item} onChange={(e) => setForm((p) => ({ ...p, item: e.target.value }))} style={{ padding: "8px 10px" }} placeholder="Ej: 1.2.3" />
              </div>

              <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Descripción</label>
                <input value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} style={{ padding: "8px 10px" }} placeholder="Descripción" />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Familia</label>
                <select value={form.familia_id} onChange={(e) => setForm((p) => ({ ...p, familia_id: e.target.value }))} style={{ padding: "8px 10px" }}>
                  <option value="">—</option>
                  {familias.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Subfamilia</label>
                <select value={form.subfamilia_id} onChange={(e) => setForm((p) => ({ ...p, subfamilia_id: e.target.value }))} style={{ padding: "8px 10px" }}>
                  <option value="">—</option>
                  {subfamilias.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Grupo</label>
                <select value={form.grupo_id} onChange={(e) => setForm((p) => ({ ...p, grupo_id: e.target.value }))} style={{ padding: "8px 10px" }}>
                  <option value="">—</option>
                  {grupos.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Unidad</label>
                <select value={form.unidad_id} onChange={(e) => setForm((p) => ({ ...p, unidad_id: e.target.value }))} style={{ padding: "8px 10px" }}>
                  <option value="">—</option>
                  {unidades.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Cantidad</label>
                <input value={form.cantidad} onChange={(e) => setForm((p) => ({ ...p, cantidad: e.target.value }))} style={{ padding: "8px 10px" }} inputMode="decimal" placeholder="0" />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Precio unitario</label>
                <input value={form.precio_unitario} onChange={(e) => setForm((p) => ({ ...p, precio_unitario: e.target.value }))} style={{ padding: "8px 10px" }} inputMode="decimal" placeholder="0" />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 12, opacity: 0.8 }}>Vigente</label>
                <select value={form.vigente ? "true" : "false"} onChange={(e) => setForm((p) => ({ ...p, vigente: e.target.value === "true" }))} style={{ padding: "8px 10px" }}>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
              <button onClick={() => setOpenForm(false)} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: "white", cursor: "pointer" }} disabled={saving}>
                Cancelar
              </button>
              <button onClick={save} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#111", color: "white", cursor: "pointer" }} disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
