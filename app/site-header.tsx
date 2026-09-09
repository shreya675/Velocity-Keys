"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Bell, ChevronDown, CircleHelp, History, Keyboard, LogOut, Menu, Settings, UserRound, X } from "lucide-react";
import type { ClientUser } from "@/lib/types";
import type { ActiveView } from "@/lib/navigation";

type Notification = { id: string; title: string; detail: string; icon: React.ReactNode };
const primary = [["practice", "Practice"], ["race", "Race"], ["daily", "Daily"], ["friends", "Friends"], ["leaderboard", "Leaderboard"]] as const;
const account = [
  { href: "/profile", label: "Your profile", icon: UserRound },
  { href: "/history", label: "Typing history", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help & shortcuts", icon: CircleHelp }
];

export function SiteHeader({ user, activeView, notifications, friendCount, onReadNotifications, onLogout, raceHref = "/race" }: {
  user: ClientUser; activeView: ActiveView; notifications: Notification[]; friendCount: number;
  onReadNotifications: () => void; onLogout: () => void; raceHref?: string;
}) {
  const [open, setOpen] = useState<"account" | "notifications" | "mobile" | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  const notificationsButton = useRef<HTMLButtonElement>(null);
  const mobileButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(null); }, [activeView]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!headerRef.current?.contains(event.target as Node)) setOpen(null); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation();
      (open === "account" ? accountButton : open === "notifications" ? notificationsButton : mobileButton).current?.focus();
      setOpen(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [open]);
  const href = (view: string) => view === "race" ? raceHref : `/${view}`;
  const close = () => setOpen(null);

  return <header ref={headerRef} className="site-header sticky top-0 z-40 border-b border-line bg-panel/95 backdrop-blur-md" onBlur={(event) => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(null);
  }}>
    <a href="#page-content" className="sr-only z-50 rounded bg-mint px-4 py-2 text-panel focus:not-sr-only focus:absolute focus:left-4 focus:top-4">Skip to content</a>
    <div className="mx-auto flex h-[72px] max-w-[1440px] items-center gap-8 px-5 lg:h-20 lg:px-8">
      <Link href="/practice" onClick={close} aria-label="Velocity Keys home" className="nav-brand flex shrink-0 items-center gap-2.5 text-lg font-bold tracking-tight lg:text-[22px]">
        <span className="nav-brand-icon flex h-8 w-8 items-center justify-center rounded-lg bg-mint text-panel lg:h-10 lg:w-10"><Keyboard className="h-5 w-5 lg:h-6 lg:w-6" /></span>
        <span aria-hidden="true" className="nav-wordmark">{"velocitykeys.".split("").map((letter, index) => (
          <span key={index} className={`nav-letter ${index === 12 ? "text-mint" : index >= 8 ? "font-normal text-muted" : ""}`} style={{ "--letter-delay": `${index * 45}ms` } as CSSProperties}><span>{letter}</span></span>
        ))}</span>
      </Link>
      <nav aria-label="Main navigation" className="hidden h-full items-center gap-6 lg:flex">
        {primary.map(([view, label]) => <Link key={view} href={href(view)} onClick={close} aria-current={activeView === view ? "page" : undefined} className={`relative flex h-full items-center gap-1.5 border-b-2 pt-0.5 text-[15px] font-medium transition-colors ${activeView === view ? "border-mint text-ink" : "border-transparent text-muted hover:text-ink"}`}>
          {label}{view === "friends" && friendCount > 0 && <span aria-label={`${friendCount} friend notifications`} className="h-1.5 w-1.5 rounded-full bg-mint" />}
        </Link>)}
      </nav>
      <div aria-hidden="true" className="nav-typing-track pointer-events-none relative hidden h-10 min-w-24 flex-1 overflow-hidden xl:block">
        <span className="nav-track-line" />
        <span className="nav-track-runner"><span /></span>
        {["W", "P", "M"].map((letter, index) => <span key={letter} className="nav-track-key" style={{ left: `${22 + index * 26}%`, animationDelay: `${index * 900 + 600}ms` }}>{letter}</span>)}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <div className="relative">
          <button ref={notificationsButton} aria-label="Notifications" aria-expanded={open === "notifications"} aria-controls="notification-panel" className="header-icon relative" onClick={() => { setOpen(open === "notifications" ? null : "notifications"); onReadNotifications(); }}>
            <Bell className="h-[18px] w-[18px]" />{notifications.length > 0 && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-mint" />}
          </button>
          {open === "notifications" && <section id="notification-panel" aria-label="Notifications" className="header-popover right-0 w-[min(340px,calc(100vw-2rem))]">
            <div className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="text-sm font-semibold">Notifications</h2><button aria-label="Close notifications" className="text-muted hover:text-ink" onClick={close}><X className="h-4 w-4" /></button></div>
            <div className="max-h-80 overflow-y-auto p-2">{notifications.map((item) => <div key={item.id} className="flex gap-3 rounded-lg px-2 py-3">{item.icon}<div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs leading-5 text-muted">{item.detail}</p></div></div>)}
              {!notifications.length && <p className="px-3 py-7 text-center text-sm text-muted">You’re all caught up.</p>}
            </div>
          </section>}
        </div>
        <div className="relative border-l border-line pl-3">
          <button ref={accountButton} aria-label="Account menu" aria-expanded={open === "account"} aria-controls="account-panel" className="flex items-center gap-2 rounded-lg p-1 text-muted transition hover:text-ink" onClick={() => setOpen(open === "account" ? null : "account")}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-mint/25 bg-mint/10 text-xs font-bold text-mint">{user.username.slice(0, 2).toUpperCase()}</span>
            <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${open === "account" ? "rotate-180" : ""}`} />
          </button>
          {open === "account" && <div id="account-panel" className="header-popover right-0 w-64">
            <div className="border-b border-line px-4 py-4"><p className="truncate text-sm font-semibold">{user.username}</p><p className="mt-1 text-xs text-muted">{user.rating.toLocaleString()} rating</p></div>
            <nav aria-label="Account navigation" className="p-1.5">{account.map(({ href: path, label, icon: Icon }) => <Link key={path} href={path} onClick={close} aria-current={path === `/${activeView}` ? "page" : undefined} className="account-link"><Icon className="h-4 w-4 text-muted" />{label}</Link>)}</nav>
            <div className="border-t border-line p-1.5"><button className="account-link w-full text-coral" onClick={() => { close(); onLogout(); }}><LogOut className="h-4 w-4" />Sign out</button></div>
          </div>}
        </div>
        <button ref={mobileButton} className="header-icon lg:hidden" aria-label={open === "mobile" ? "Close navigation" : "Open navigation"} aria-expanded={open === "mobile"} aria-controls="mobile-navigation" onClick={() => setOpen(open === "mobile" ? null : "mobile")}>
          {open === "mobile" ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
    </div>
    {open === "mobile" && <nav id="mobile-navigation" aria-label="Mobile navigation" className="border-t border-line px-4 py-3 lg:hidden">
      {primary.map(([view, label]) => <Link key={view} href={href(view)} onClick={close} aria-current={activeView === view ? "page" : undefined} className={`block rounded-lg px-4 py-3 text-sm font-medium ${activeView === view ? "bg-mint/10 text-mint" : "text-muted hover:bg-surface"}`}>{label}</Link>)}
    </nav>}
  </header>;
}
