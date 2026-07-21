/**
 * Phase 0 pipeline check — throwaway scaffolding, NOT production UI.
 *
 * Its only job is to prove the deployment pipeline end to end: Vercel builds the
 * app, the environment variables arrive, and the browser can reach Supabase.
 * It is deliberately unstyled. The real interface is gated on reference designs
 * (BUILD-PLAN.md §2.5, §10) and will replace this file entirely.
 */

export const dynamic = "force-dynamic";

async function checkSupabase(): Promise<{ ok: boolean; detail: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return { ok: false, detail: "NEXT_PUBLIC_SUPABASE_URL is not set" };

  try {
    const res = await fetch(`${url}/auth/v1/health`, { cache: "no-store" });
    return res.ok
      ? { ok: true, detail: `reachable (${res.status})` }
      : { ok: false, detail: `responded ${res.status}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "unreachable" };
  }
}

export default async function PipelineCheck() {
  const supabase = await checkSupabase();

  const checks = [
    ["Supabase URL", Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)],
    ["Supabase publishable key", Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)],
    ["University email domain", Boolean(process.env.NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN)],
    ["Supabase reachable", supabase.ok],
  ] as const;

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", lineHeight: 1.6 }}>
      <h1>Attendance System — Phase 0</h1>
      <p>Deployment pipeline check. This page is scaffolding and will be replaced.</p>
      <ul>
        {checks.map(([label, ok]) => (
          <li key={label}>
            {ok ? "PASS" : "FAIL"} — {label}
          </li>
        ))}
      </ul>
      <p>Supabase: {supabase.detail}</p>
    </main>
  );
}
