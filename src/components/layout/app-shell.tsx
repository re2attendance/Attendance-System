import { logout } from "@/features/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import type { CurrentUser } from "@/lib/auth/session";

/**
 * The signed-in shell.
 *
 * Minimal on purpose. §11.4 specifies a 232px sidebar and a 56px bottom tab bar
 * per role — but nav needs somewhere to navigate to, and the surfaces it points
 * at arrive in Phases 4-8. Building the sidebar now would mean building a menu
 * of links to pages that say "not built yet", which is worse than no menu.
 *
 * So: a topbar that identifies who you are and lets you leave. The nav lands
 * with the screens it serves.
 */
export function AppShell({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      {/* 52px topbar, hairline bottom border, no fill (§11.4). */}
      <header className="sticky top-0 z-10 h-13 border-b border-line bg-wash">
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between gap-4 px-6">
          <span className="text-14 font-semibold text-ink">Attendance</span>

          <div className="flex items-center gap-2">
            <span className="hidden text-13 text-mute sm:inline">
              {user.fullName}
            </span>
            <ThemeToggle />
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-6 py-8">{children}</main>
    </div>
  );
}
