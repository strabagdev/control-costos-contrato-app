export default function AppFooter() {
  return (
    <footer style={styles.footer}>
      <div style={styles.inner}>
        <span style={{ opacity: 0.8 }}>© {new Date().getFullYear()} Control Center</span>
        <span style={{ opacity: 0.65 }}>MVP · Próximamente: KPIs + reportes</span>
      </div>
    </footer>
  );
}

const styles: Record<string, React.CSSProperties> = {
  footer: {
    borderTop: "1px solid var(--border)",
    background: "#fff",
  },
  inner: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "14px 16px",
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    fontSize: 12,
    color: "var(--text)",
  },
};
