"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@local.test");
  const [password, setPassword] = useState("Admin123!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: true,
      callbackUrl: "/",
    });

    if (res?.error) setError("Credenciales inválidas");
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
        Control de Costos Contrato
      </h1>

      <form onSubmit={onSubmit}>
        <label style={{ display: "block", marginBottom: 6 }}>Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          style={{ width: "100%", padding: 10, marginBottom: 12 }}
        />

        <label style={{ display: "block", marginBottom: 6 }}>Password</label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          style={{ width: "100%", padding: 10, marginBottom: 12 }}
        />

        <button
          type="submit"
          disabled={loading}
          style={{ width: "100%", padding: 10, cursor: "pointer" }}
        >
          {loading ? "Ingresando..." : "Ingresar"}
        </button>

        {error && <p style={{ color: "crimson", marginTop: 12 }}>{error}</p>}
      </form>

      <p style={{ marginTop: 16, opacity: 0.8, fontSize: 12 }}>
        Usuario demo: admin@local.test / Admin123!
      </p>
    </div>
  );
}
