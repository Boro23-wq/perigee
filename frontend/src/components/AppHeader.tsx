"use client";

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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "./Logo";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/log", label: "Log", icon: PlusCircle },
  { href: "/weight", label: "Weight", icon: Scale },
  { href: "/coach", label: "Coach", icon: MessageCircle },
  { href: "/recipes", label: "Recipes", icon: UtensilsCrossed },
  { href: "/partner", label: "Partner", icon: Users },
  { href: "/profile", label: "Profile", icon: UserIcon },
];

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3 sm:px-8">
        <Link href="/dashboard" aria-label="Dashboard">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                title={label}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                <Icon size={18} strokeWidth={2} />
              </Link>
            );
          })}
          <button
            onClick={handleLogout}
            aria-label="Log out"
            title="Log out"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <LogOut size={18} strokeWidth={2} />
          </button>
        </nav>
      </div>
    </header>
  );
}
