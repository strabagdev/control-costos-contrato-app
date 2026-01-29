import "./globals.css";
import AppHeader from "@/components/layout/AppHeader";
import AppFooter from "@/components/layout/AppFooter";

export const metadata = {
  title: "Control Center",
  description: "Plataforma de control",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AppHeader />
        <main className="app-main">
          <div className="app-container">{children}</div>
        </main>
        <AppFooter />
      </body>
    </html>
  );
}
