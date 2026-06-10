import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Order Supervisor Console",
  description: "AI-Powered Workflow Monitoring Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} flex min-h-screen bg-[#f4f5f7] text-[#0d0d0d] antialiased`}>
        {/* Persistent Dark Sidebar */}
        <aside className="w-60 bg-[#0d0d0d] text-white flex flex-col shrink-0 font-mono-dev">
          {/* Logo */}
          <div className="h-16 flex items-center px-5 border-b border-white/8 gap-2.5">
            <div className="w-2 h-2 bg-[#4ade80] animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.6)]"></div>
            <span className="font-black text-xs tracking-widest text-[#4ade80] uppercase">
              Supervisor
            </span>
          </div>

          <nav className="flex-1 p-3 space-y-0.5">
            <Link
              href="/"
              className="flex items-center gap-3 px-3 py-2.5 text-[#9ca3af] hover:text-white hover:bg-white/6 text-[11px] font-semibold uppercase tracking-widest transition-all"
            >
              Dashboard
            </Link>
            <Link
              href="/supervisors"
              className="flex items-center gap-3 px-3 py-2.5 text-[#9ca3af] hover:text-[#a78bfa] hover:bg-white/6 text-[11px] font-semibold uppercase tracking-widest transition-all"
            >
              Supervisors
            </Link>
            <Link
              href="/runs"
              className="flex items-center gap-3 px-3 py-2.5 text-[#9ca3af] hover:text-[#22d3ee] hover:bg-white/6 text-[11px] font-semibold uppercase tracking-widest transition-all"
            >
              Order Runs
            </Link>
          </nav>

          <div className="p-4 border-t border-white/8 text-[10px] text-[#4b5563] font-bold uppercase tracking-widest">
            v1.0.0
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden tb-grid">
          {/* Top Header */}
          <header className="h-16 bg-white/90 backdrop-blur-md border-b border-[#e2e5ea] flex items-center justify-between px-8 z-20 shrink-0">
            <h1 className="text-xs font-extrabold tracking-widest text-[#0d0d0d] uppercase font-mono-dev">
              Order Monitoring Cockpit
            </h1>
            <div className="flex items-center gap-3 text-xs font-mono-dev">
              <span className="flex items-center gap-2 bg-[#f0fdf4] text-[#15803d] px-3 py-1.5 border border-[#bbf7d0] font-bold text-[10px] uppercase tracking-wider">
                <span className="w-1.5 h-1.5 bg-[#4ade80] rounded-full animate-pulse"></span>
                API Connected
              </span>
            </div>
          </header>

          <main className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
