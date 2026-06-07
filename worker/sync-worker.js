/* Baby Food Tracker — sync backend (Cloudflare Worker + KV).
 *
 * A zero-knowledge encrypted-blob store. It keeps, per "space" id:
 *   { version: <int>, ciphertext: <string> }
 * and never sees plaintext or keys — the browser encrypts/decrypts everything.
 *
 * Endpoints (id must be 16–128 url-safe chars):
 *   GET  /space/:id            -> { version, ciphertext } | 404 { version:0, ciphertext:null }
 *   PUT  /space/:id            body { expectedVersion, ciphertext }
 *                              -> 200 { version }  (on match, stores version+1)
 *                              -> 409 { version, ciphertext }  (version mismatch)
 *
 * Requires a KV namespace bound as BABY_KV (see README.md).
 */

const CORS = {
  "Access-Control-Allow-Origin": "*", // safe: only ciphertext is exchanged
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ "content-type": "application/json" }, CORS),
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/space\/([A-Za-z0-9_-]{16,128})$/);
    if (!match) return json({ error: "not_found" }, 404);
    const key = "space:" + match[1];

    if (request.method === "GET") {
      const raw = await env.BABY_KV.get(key);
      if (!raw) return json({ version: 0, ciphertext: null }, 404);
      const cur = JSON.parse(raw);
      return json({ version: cur.version, ciphertext: cur.ciphertext }, 200);
    }

    if (request.method === "PUT") {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: "bad_json" }, 400);
      }
      const expected = Number(body.expectedVersion) || 0;
      const ciphertext = body.ciphertext;
      if (typeof ciphertext !== "string" || ciphertext.length > 2000000) {
        return json({ error: "bad_ciphertext" }, 400);
      }

      const raw = await env.BABY_KV.get(key);
      const cur = raw ? JSON.parse(raw) : { version: 0, ciphertext: null };
      if (cur.version !== expected) {
        return json({ conflict: true, version: cur.version, ciphertext: cur.ciphertext }, 409);
      }

      const next = { version: expected + 1, ciphertext: ciphertext };
      await env.BABY_KV.put(key, JSON.stringify(next));
      return json({ version: next.version }, 200);
    }

    return json({ error: "method_not_allowed" }, 405);
  },
};
