const API_ORIGIN = "https://api.getcarbon.cc";
const ONBOARDING = new Map([["/login", "login"], ["/signup", "signup"], ["/verify", "verify"], ["/forgot", "forgot"], ["/reset", "reset"]]);
const PUBLIC = new Set([
  "/access", "/access.css", "/access.js", "/robots.txt",
  ...["api", "flows", "ui", "password-key", "common-passwords", "forgot", "reset"].map((name) => "/assets/auth/" + name + ".js"),
  "/assets/argon2/0.6.2/argon2.js", "/assets/argon2/0.6.2/argon2.wasm",
]);
const SESSION = /(?:^|;\s*)__Host-carbon_session=([A-Za-z0-9_-]{43})(?=;|$)/;
const TERMS = new Set(["/terms", "/acceptable-use", "/privacy"]);
const DOWNLOAD = /^\/downloads\/((?:catalog\.json|latest\.json)|v\d+\.\d+\.\d+\/[A-Za-z0-9._-]+)$/;
const SHARED_CONTENT = /^\/v1\/library\/(?:shared|people)\//;
const permissions = new Map();

function uncached(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function accessPage(url, mode = "key") {
  const target = new URL("/access", url.origin);
  if (mode !== "key") target.searchParams.set("mode", mode);
  if (url.pathname === "/app-login") {
    target.searchParams.set("mode", "login");
    target.searchParams.set("next", url.pathname + url.search);
  }
  return uncached(Response.redirect(target, 302));
}

function authenticate(request, api, bearer = false) {
  const cookies = request.headers.get("Cookie") || "";
  const auth = bearer ? request.headers.get("Authorization") : null;
  const token = auth || SESSION.exec(cookies)?.[1];
  if (!token) return Promise.resolve(false);
  const saved = permissions.get(token);
  if (saved && saved.until > Date.now()) return saved.result;
  const headers = new Headers();
  if (auth) headers.set("Authorization", auth);
  else headers.set("Cookie", "__Host-carbon_session=" + token);
  const address = request.headers.get("CF-Connecting-IP");
  if (address) headers.set("CF-Connecting-IP", address);
  const result = api.fetch(new Request(API_ORIGIN + "/v1/access/session", { headers })).then((response) => response.status === 204, () => false);
  if (permissions.size >= 256) permissions.delete(permissions.keys().next().value);
  permissions.set(token, { until: Date.now() + 3000, result });
  return result;
}

async function artifact(request, key, bucket) {
  if (!bucket) return new Response("Downloads unavailable", { status: 503 });
  const object = request.method === "HEAD" ? await bucket.head(key) : await bucket.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "Content-Length": String(object.size),
    "Content-Type": key.endsWith(".json") ? "application/json" : "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  if (!key.endsWith(".json")) headers.set("Content-Disposition", 'attachment; filename="' + key.split("/").at(-1) + '"');
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.getcarbon.cc") {
      url.hostname = "getcarbon.cc";
      return uncached(Response.redirect(url, 308));
    }
    if (url.pathname.startsWith("/v1/")) {
      if (env.PRIVATE_SITE === "true" && SHARED_CONTENT.test(url.pathname) && !(await authenticate(request, env.API))) {
        return uncached(new Response(null, { status: 401 }));
      }
      return uncached(await env.API.fetch(new Request(API_ORIGIN + url.pathname + url.search, request)));
    }
    if (url.pathname.startsWith("/downloads/")) {
      const match = DOWNLOAD.exec(url.pathname);
      if (!match || !["GET", "HEAD"].includes(request.method)) return new Response("Not found", { status: 404 });
      if (!(await authenticate(request, env.API, true))) return uncached(new Response("Sign in to download.", { status: 401 }));
      return uncached(await artifact(request, match[1], env.RELEASES));
    }
    if (env.PRIVATE_SITE !== "true") return env.ASSETS.fetch(request);
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Not found", { status: 404 });
    if (PUBLIC.has(url.pathname)) return uncached(await env.ASSETS.fetch(request));
    if (await authenticate(request, env.API)) return uncached(await env.ASSETS.fetch(request));
    if (TERMS.has(url.pathname) && (request.headers.get("Cookie") || "").includes("__Host-carbon_invite=")) {
      const response = await env.API.fetch(new Request(API_ORIGIN + "/v1/access/consent", { headers: { Cookie: request.headers.get("Cookie") } }));
      if (response.status === 204) return uncached(await env.ASSETS.fetch(request));
    }
    if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/brand/")) {
      return uncached(new Response("Not found", { status: 404 }));
    }
    return accessPage(url, ONBOARDING.get(url.pathname.replace(/\/$/, "")) || "key");
  },
};
