import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

function isAdmin(session: any) {
  return (session?.user as any)?.role === "admin";
}

export default async function AppHeader() {
  const session = await getServerSession(authOptions);
  const admin = isAdmin(session);

  return (
    <header style={styles.header}>
      <div style={styles.inner}>
        <div style={styles.brand}>
          <div style={styles.logo}>CC</div>
          <div style={{ lineHeight: 1.1 }}>
            <div style={styles.title}>Control Center</div>
            <div style={styles.sub}>Control de Costos Contrato</div>
          </div>
        </div>

        <div style={styles.right}>
          <nav style={styles.nav}>
            <IconLink href="/" label="Dashboard" icon="🏠" />
            <IconLink href="/admin/nocs" label="NOCs" icon="📄" />
            {admin ? <IconLink href="/admin/users" label="Usuarios" icon="👤" /> : null}
          </nav>

          <div style={styles.user}>
            <div style={styles.userText}>
              <div style={styles.userName}>
                {session?.user?.name ?? session?.user?.email ?? ""}
              </div>
              <div style={styles.userRole}>{(session?.user as any)?.role ?? ""}</div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </div>
    </header>
  );
}

function IconLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link href={href} aria-label={label} title={label} style={styles.iconBtn}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
    </Link>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    position: "sticky",
    top: 0,
    zIndex: 50,
    background: "var(--header-bg)",
    color: "var(--header-text)",
    borderBottom: "1px solid rgba(2,6,23,0.9)",
  },
  inner: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "10px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  brand: { display: "flex", alignItems: "center", gap: 12 },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "rgba(2,6,23,0.95)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    letterSpacing: 0.5,
  },
  title: { fontSize: 14, fontWeight: 900 },
  sub: { fontSize: 11, opacity: 0.85, marginTop: 3 },

  right: { display: "flex", alignItems: "center", gap: 12 },
  nav: { display: "flex", gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.10)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    color: "inherit",
  },

  user: { display: "flex", alignItems: "center", gap: 10 },
  userText: { display: "none" }, // mobile first (we can enhance later)
  userName: { fontSize: 12, fontWeight: 800 },
  userRole: { fontSize: 11, opacity: 0.8, marginTop: 2 },
};
