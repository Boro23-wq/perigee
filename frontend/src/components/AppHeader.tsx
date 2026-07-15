"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  PlusCircle,
  Scale,
  MessageCircle,
  UtensilsCrossed,
  Users,
  User as UserIcon,
  LogOut,
  LayoutGrid,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: Home, pinned: true },
  { href: "/log", label: "Log", icon: PlusCircle, pinned: true },
  { href: "/weight", label: "Weight", icon: Scale, pinned: true },
  { href: "/coach", label: "Coach", icon: MessageCircle, pinned: false },
  { href: "/recipes", label: "Recipes", icon: UtensilsCrossed, pinned: false },
  { href: "/partner", label: "Partner", icon: Users, pinned: false },
  { href: "/profile", label: "Profile", icon: UserIcon, pinned: false },
];

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="relative z-50 border-b border-border bg-surface">
        <div className="relative z-50 grid grid-cols-[1fr_auto_1fr] items-center px-4 py-3 sm:px-6 md:px-8">
          <div className="justify-self-start">
            <Logo />
          </div>

          <div className="hidden items-center gap-1 justify-self-center md:flex">
            {NAV_ITEMS.filter((item) => item.pinned).map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-accent-soft text-accent"
                      : "text-muted hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  <Icon size={14} strokeWidth={2} />
                  {label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-4 justify-self-end">
            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              className="flex items-center justify-center rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              {menuOpen ? <X size={16} /> : <LayoutGrid size={16} />}
            </button>
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
            >
              <LogOut size={14} strokeWidth={2} />
              Sign out
            </button>
          </div>
        </div>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <nav className="absolute right-4 top-full z-50 mt-1 w-56 rounded-xl border border-border bg-surface p-2 shadow-lg sm:right-6 md:right-8">
              {NAV_ITEMS.map(({ href, label, icon: Icon, pinned }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                      pinned ? "md:hidden" : ""
                    } ${
                      active
                        ? "bg-accent-soft text-accent"
                        : "text-muted hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <Icon size={14} strokeWidth={2} />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </>
        )}
      </header>
    </>
  );
}
