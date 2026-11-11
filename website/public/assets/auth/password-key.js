/*
  Turns a password into the `passwordKey` the accounts API expects (contract: cloud/API.md).
  The password never leaves the browser:

    salt        = SHA-256("carbon-pw-v1|" + email.trim().toLowerCase())
    passwordKey = base64url(Argon2id(UTF-8 password, salt, m = 19456 KiB, t = 2, p = 1, 32 bytes))

  Known answer (also asserted by cloud/test/password.test.ts and cloud/scripts/check-auth-pages.mjs):
    "Correct-horse-battery-9" + "user@example.com" -> "HsWoShqVEiezR8PQA7giCAb6O3PFeAJNBvChwMJmrcc"

  Argon2 is the self-hosted MIT build of @phi-ag/argon2 0.6.2 (WebAssembly SIMD). Compiling it
  needs CSP script-src 'wasm-unsafe-eval'.
*/
import Argon2 from "../argon2/0.6.2/argon2.js";

const WASM_URL = "/assets/argon2/0.6.2/argon2.wasm";
const ARGON2ID = 2;
const VERSION_13 = 0x13;
export const UNSUPPORTED = "This browser can’t secure your password. Update it, or try a current version of Edge, Chrome, Firefox or Safari.";

let loading = null;
let memo = { input: "", key: "" };

export class UnsupportedBrowserError extends Error {
  constructor(cause) {
    super(UNSUPPORTED);
    this.name = "UnsupportedBrowserError";
    this.cause = cause;
  }
}

/** Downloads and compiles the Argon2 module once (plain instantiate, so any Content-Type works). */
function argon2() {
  loading ??= (async () => {
    const res = await window.fetch(WASM_URL);
    if (!res.ok) throw new Error(`Argon2 module: HTTP ${res.status}`);
    const { instance } = await WebAssembly.instantiate(await res.arrayBuffer());
    return new Argon2(instance);
  })().catch((err) => {
    loading = null;
    throw new UnsupportedBrowserError(err);
  });
  return loading;
}

export const normalizeEmail = (email) => String(email).trim().toLowerCase();

function base64url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Derives the passwordKey for this email and password (remembers the last result). */
export async function derivePasswordKey(password, email) {
  const input = `${normalizeEmail(email)}\u0000${password}`;
  if (memo.input === input) return memo.key;
  const engine = await argon2();
  const salt = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`carbon-pw-v1|${normalizeEmail(email)}`)),
  );
  const { hash } = engine.hash(password, {
    salt,
    hashLength: 32,
    timeCost: 2,
    memoryCost: 19456,
    parallelism: 1,
    type: ARGON2ID,
    version: VERSION_13,
  });
  memo = { input, key: base64url(hash) };
  return memo.key;
}

/** Starts the download early (e.g. when a password field gets focus) so the first submit is quick. */
export function preloadArgon2() {
  argon2().catch(() => { /* reported when a key is actually needed */ });
}
