"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      style={{ padding: 10, cursor: "pointer" }}
    >
      Cerrar sesión
    </button>
  );
}
