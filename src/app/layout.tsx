import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "dziflip — analýza flipů nemovitostí",
  description: "Osobní nástroj pro analýzu a plánování flipů nemovitostí v ČR"
};

async function getUnreadAlertCount(): Promise<number> {
  try {
    return await prisma.alert.count({ where: { readAt: null } });
  } catch {
    return 0;
  }
}

async function getUnreadSmsCount(): Promise<number> {
  try {
    const [unreadAssigned, unassigned] = await Promise.all([
      prisma.smsMessage.count({ where: { direction: "INBOUND", readAt: null, projectId: { not: null } } }),
      prisma.smsMessage.count({ where: { projectId: null } })
    ]);
    return unreadAssigned + unassigned;
  } catch {
    return 0;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [unreadAlerts, unreadSms] = await Promise.all([getUnreadAlertCount(), getUnreadSmsCount()]);

  return (
    <html lang="cs">
      <body className="min-h-screen bg-paper font-sans antialiased">
        <header className="border-b border-line bg-paper/80 backdrop-blur sticky top-0 z-30">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="font-serif text-xl tracking-tight text-ink">
              dzi<span className="text-beige-500">flip</span>
            </Link>
            <nav className="flex items-center gap-5 text-sm text-muted">
              <Link href="/" className="hover:text-ink transition-colors">
                Nová analýza
              </Link>
              <Link href="/feed" className="hover:text-ink transition-colors">
                Deal Feed
              </Link>
              <Link href="/radar" className="hover:text-ink transition-colors">
                Deal Radar
              </Link>
              <Link href="/alerts" className="relative hover:text-ink transition-colors">
                Alerty
                {unreadAlerts > 0 && (
                  <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-band-bad px-1 text-[10px] font-medium text-white">
                    {unreadAlerts}
                  </span>
                )}
              </Link>
              <Link href="/messages" className="relative hover:text-ink transition-colors">
                Zprávy
                {unreadSms > 0 && (
                  <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-band-bad px-1 text-[10px] font-medium text-white">
                    {unreadSms}
                  </span>
                )}
              </Link>
              <Link href="/projects" className="hover:text-ink transition-colors">
                Projekty
              </Link>
              <Link href="/shopping" className="hover:text-ink transition-colors">
                Nákupy
              </Link>
              <Link href="/compare" className="hover:text-ink transition-colors">
                Porovnání
              </Link>
              <Link href="/settings" className="hover:text-ink transition-colors">
                Nastavení
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
