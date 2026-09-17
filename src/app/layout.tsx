import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "dziflip — analýza flipů nemovitostí",
  description: "Osobní nástroj pro analýzu a plánování flipů nemovitostí v ČR"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body className="min-h-screen bg-paper font-sans antialiased">
        <header className="border-b border-line bg-paper/80 backdrop-blur sticky top-0 z-30">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="font-serif text-xl tracking-tight text-ink">
              dzi<span className="text-beige-500">flip</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm text-muted">
              <Link href="/" className="hover:text-ink transition-colors">
                Nová analýza
              </Link>
              <Link href="/projects" className="hover:text-ink transition-colors">
                Projekty
              </Link>
              <Link href="/compare" className="hover:text-ink transition-colors">
                Porovnání
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
