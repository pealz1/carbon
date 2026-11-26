import assert from "node:assert/strict";
import { test } from "vitest";
import website from "./worker.mjs";

const token = "x".repeat(43);
function gateway() {
  const requests = [];
  const env = {
    PRIVATE_SITE: "true",
    ASSETS: { fetch: (request) => new Response("asset " + new URL(request.url).pathname) },
    API: { fetch: async (request) => {
      requests.push(request);
      const credential = request.headers.get("Cookie") || request.headers.get("Authorization") || "";
      return new Response(null, { status: credential.includes(token) ? 204 : 401 });
    } },
    RELEASES: { head: async () => ({ size: 8 }), get: async () => ({ size: 8, body: "packages" }) },
  };
  const get = (path, headers, method) => website.fetch(new Request("https://getcarbon.cc" + path, { headers, method }), env);
  return { get, requests };
}

test("anonymous visits see the access page and cannot fetch the app, metadata, or branding", async () => {
  const { get } = gateway();
  for (const path of ["/", "/setup", "/changelog", "/index.html", "/sitemap.xml"]) {
    const result = await get(path);
    assert.equal(result.status, 302);
    assert.equal(new URL(result.headers.get("Location")).pathname, "/access");
  }
  assert.equal((await get("/assets/screenshots/app.webp")).status, 404);
  assert.equal((await get("/brand/carbon-mark.svg")).status, 404);
  assert.equal((await get("/downloads/latest.json")).status, 401);
  assert.equal((await get("/downloads/v0.10.1/setup.exe")).status, 401);
  assert.equal((await get("/access")).status, 200);
});

test("browser downloads and bearer updater requests use the authenticated origin", async () => {
  const { get, requests } = gateway();
  const cookie = { Cookie: "__Host-carbon_session=" + token };
  const html = await get("/", cookie);
  assert.equal(html.status, 200);
  assert.equal(html.headers.get("Cache-Control"), "private, no-store");
  const head = await get("/downloads/v0.10.1/setup.exe", cookie, "HEAD");
  assert.equal(head.headers.get("Content-Length"), "8");
  const results = await get("/downloads/latest.json", { Authorization: "Bearer " + token });
  assert.equal(await results.text(), "packages");
  assert.equal((await get("/", { Authorization: "Bearer " + token })).status, 302);
  assert.ok(requests.every((request) => new URL(request.url).origin === "https://api.getcarbon.cc"));
});

test("desktop login survives the redirect to the neutral access page", async () => {
  const { get } = gateway();
  const result = await get("/app-login?state=value");
  const redirect = new URL(result.headers.get("Location"));
  assert.equal(redirect.pathname, "/access");
  assert.equal(redirect.searchParams.get("mode"), "login");
  assert.equal(redirect.searchParams.get("next"), "/app-login?state=value");
});
