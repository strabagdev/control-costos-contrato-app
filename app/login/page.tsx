"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: true,
        callbackUrl: "/",
      });

      // redirect:true usually navigates; but if not:
      if (res?.error) setError("Credenciales inválidas.");
    } catch {
      setError("No se pudo iniciar sesión.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 16,
        background:
          "radial-gradient(1200px 600px at 10% 10%, rgba(34, 96, 170, 0.25), transparent 60%), radial-gradient(900px 500px at 90% 20%, rgba(99, 102, 241, 0.18), transparent 55%), linear-gradient(180deg, #0b1220, #0a0f1a)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.06)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          backdropFilter: "blur(10px)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "22px 22px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              aria-hidden
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background:
                  "linear-gradient(135deg, rgba(34, 96, 170, 0.95), rgba(99, 102, 241, 0.95))",
                boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              }}
            />
            <div>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "white" }}>
                Control de Costos Contrato
              </h1>
              <p style={{ margin: "6px 0 0", fontSize: 13, opacity: 0.8, color: "white" }}>
                Inicia sesión para continuar
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} style={{ padding: 22 }}>
          <label style={{ display: "block", fontSize: 12, opacity: 0.85, color: "white" }}>
            Email
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            required
            placeholder="tu@email.com"
            style={{
              marginTop: 8,
              width: "100%",
              padding: "11px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.25)",
              color: "white",
              outline: "none",
            }}
          />

          <div style={{ height: 14 }} />

          <label style={{ display: "block", fontSize: 12, opacity: 0.85, color: "white" }}>
            Contraseña
          </label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            style={{
              marginTop: 8,
              width: "100%",
              padding: "11px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.25)",
              color: "white",
              outline: "none",
            }}
          />

          {error ? (
            <div
              style={{
                marginTop: 14,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(239, 68, 68, 0.35)",
                background: "rgba(239, 68, 68, 0.12)",
                color: "white",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 16,
              width: "100%",
              padding: "11px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background:
                "linear-gradient(135deg, rgba(34, 96, 170, 0.95), rgba(99, 102, 241, 0.95))",
              color: "white",
              fontWeight: 800,
              cursor: submitting ? "not-allowed" : "pointer",
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            }}
          >
            {submitting ? "Ingresando..." : "Ingresar"}
          </button>

          <p style={{ marginTop: 14, fontSize: 12, opacity: 0.75, color: "white" }}>
            Si no tienes acceso a un contrato, el dashboard te avisará.
          </p>
          <p style={{ marginTop: 14, fontSize: 12, opacity: 0.75, color: "white" }}>
             Usuario demo: admin@local.test / Admin123!
          </p>
        </form>
      </div>
    </main>
  );
}
