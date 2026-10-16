// Cloudflare Worker: passordbeskyttet lydstrøm fra R2 + statiske filer (public/).
// Secrets: PASSWORD (selve passordet) og TOKEN_SECRET (tilfeldig streng).

async function hmacToken(secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("lydbok-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/api/login" && req.method === "POST") {
      const { password } = await req.json().catch(() => ({}));
      if (typeof password !== "string" || !safeEqual(password, env.PASSWORD)) {
        await new Promise((r) => setTimeout(r, 500));
        return json({ error: "Feil passord" }, 401);
      }
      return json({ token: await hmacToken(env.TOKEN_SECRET) });
    }

    if (url.pathname.startsWith("/api/audio/")) {
      const token = url.searchParams.get("t") || "";
      if (!safeEqual(token, await hmacToken(env.TOKEN_SECRET))) return new Response("Ingen tilgang", { status: 401 });
      const key = decodeURIComponent(url.pathname.slice("/api/audio/".length));
      if (!key || key.includes("..")) return new Response("Ugyldig", { status: 400 });

      const rangeHeader = req.headers.get("range");
      const obj = await env.AUDIO.get(key, rangeHeader ? { range: req.headers } : undefined);
      if (!obj) return new Response("Finnes ikke", { status: 404 });

      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set("accept-ranges", "bytes");
      headers.set("cache-control", "private, max-age=3600");
      if (!headers.get("content-type") || headers.get("content-type") === "application/octet-stream")
        headers.set("content-type", /\.(m4b|m4a)$/i.test(key) ? "audio/mp4" : /\.(ogg|opus)$/i.test(key) ? "audio/ogg" : "audio/mpeg");
      if (obj.range && rangeHeader) {
        const { offset = 0, length = obj.size - offset } = obj.range;
        headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
        headers.set("content-length", String(length));
        return new Response(obj.body, { status: 206, headers });
      }
      headers.set("content-length", String(obj.size));
      return new Response(obj.body, { headers });
    }

    return env.ASSETS.fetch(req);
  },
};
