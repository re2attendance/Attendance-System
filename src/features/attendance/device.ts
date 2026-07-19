/**
 * A best-effort device fingerprint for the anti-proxy trail (ADR-003).
 *
 * This is NOT a security boundary and makes no claim to be unforgeable. It is a
 * signal: two submissions from one browser produce the same string, so a student
 * checking in a friend on the same phone leaves a visible pair. report_present
 * flags that pair; a human decides. A determined proxy can change the inputs,
 * and that is fine — the flag exists to make the easy case visible, not to win
 * an arms race the client can always ultimately win.
 *
 * Deliberately no canvas/WebGL probing: it is fragile, reads as tracking, and
 * trips privacy tooling. Stable, coarse, honest signals only.
 */
export function deviceFingerprint(): string | null {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return null;
  }

  const parts = [
    navigator.userAgent,
    navigator.language,
    // Screen shape is stable per device and coarse enough not to identify a
    // person — a signal, not a dossier.
    `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`,
    String(navigator.hardwareConcurrency ?? ""),
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
  ];

  return `fp1_${hash(parts.join("|"))}`;
}

/** cyrb53 — a small, fast, non-cryptographic string hash. Good enough to make a
 * stable short id from the parts above; nothing here is a secret. */
function hash(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
