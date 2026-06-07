/* End-to-end encrypted sharing/sync for Baby Food Tracker.
 *
 * Model: a "space" = one shared log, identified by a random id and protected by
 * a random AES-256-GCM key. Both live in the share link's URL #fragment, which
 * browsers never send to the server. The backend (a Cloudflare Worker + KV)
 * only ever stores ciphertext + a version number — it cannot read the data.
 *
 * Multi-writer merge: entries carry an `updatedAt` and a `deleted` tombstone;
 * on each sync we pull, merge by id (newest wins), and push with optimistic
 * concurrency (retry on version conflict).
 */
(function () {
  "use strict";

  // ── CONFIGURE ME ──────────────────────────────────────────────────────────
  // After deploying the Cloudflare Worker (see worker/README.md), put its URL
  // here, e.g. "https://baby-tracker-sync.yourname.workers.dev". Leave empty to
  // disable sharing.
  const SYNC_URL = "";
  // ──────────────────────────────────────────────────────────────────────────

  const SPACE_STORAGE = "baby-food-tracker.space";
  const POLL_MS = 12000;
  const PUSH_DEBOUNCE_MS = 600;

  let hooks = null; // { getEntries, applyMerged, onStatus }
  let space = null; // { id, k, cryptoKey }
  let curStatus = "off";
  let pushTimer = null;
  let pollTimer = null;
  let syncing = false;
  let pendingPush = false;

  // ── base64url helpers ──
  function bytesToB64url(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlToBytes(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // ── crypto (AES-256-GCM) ──
  function importKey(rawBytes) {
    return crypto.subtle.importKey("raw", rawBytes, { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
  }
  async function encryptJSON(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, space.cryptoKey, data)
    );
    const out = new Uint8Array(iv.length + ct.length);
    out.set(iv, 0);
    out.set(ct, iv.length);
    return bytesToB64url(out);
  }
  async function decryptJSON(b64) {
    const buf = b64urlToBytes(b64);
    const iv = buf.slice(0, 12);
    const ct = buf.slice(12);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, space.cryptoKey, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  }

  // ── merge (newest-wins per entry id) ──
  function mergeEntries(a, b) {
    const map = new Map();
    for (const e of a) map.set(e.id, e);
    for (const e of b) {
      const cur = map.get(e.id);
      if (!cur || (e.updatedAt || 0) >= (cur.updatedAt || 0)) map.set(e.id, e);
    }
    return Array.from(map.values());
  }
  // Stable signature to tell whether two entry sets are equivalent.
  function signature(list) {
    return list
      .map((e) => [e.id, e.date, e.time, e.provided, e.notConsumed, e.deleted ? 1 : 0, e.updatedAt].join("|"))
      .sort()
      .join("\n");
  }

  // ── status ──
  function state() {
    return { configured: !!SYNC_URL, sharing: !!space, status: curStatus };
  }
  function setStatus(s) {
    curStatus = s;
    if (hooks && hooks.onStatus) hooks.onStatus(state());
  }

  // ── network ──
  async function serverGet() {
    const res = await fetch(SYNC_URL + "/space/" + encodeURIComponent(space.id), {
      method: "GET",
    });
    if (res.status === 404) return { version: 0, ciphertext: null };
    if (!res.ok) throw new Error("sync GET failed: " + res.status);
    return res.json();
  }
  async function serverPut(expectedVersion, ciphertext) {
    const res = await fetch(SYNC_URL + "/space/" + encodeURIComponent(space.id), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: expectedVersion, ciphertext: ciphertext }),
    });
    if (res.status === 409) {
      const body = await res.json();
      return { conflict: true, version: body.version, ciphertext: body.ciphertext };
    }
    if (!res.ok) throw new Error("sync PUT failed: " + res.status);
    return res.json(); // { version }
  }

  // ── sync cycle: pull → merge → push (with retry on conflict) ──
  async function syncNow() {
    if (!space || !SYNC_URL || syncing) {
      if (space && SYNC_URL) pendingPush = true;
      return;
    }
    syncing = true;
    setStatus("syncing");
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const remote = await serverGet();
        let remoteEntries = [];
        if (remote.ciphertext) remoteEntries = await decryptJSON(remote.ciphertext);

        const merged = mergeEntries(remoteEntries, hooks.getEntries());
        hooks.applyMerged(merged); // reflect others' changes locally

        if (signature(merged) === signature(remoteEntries)) {
          setStatus("synced");
          break;
        }
        const put = await serverPut(remote.version, await encryptJSON(merged));
        if (put.conflict) continue; // someone wrote first — re-pull and retry
        setStatus("synced");
        break;
      }
    } catch (err) {
      console.error("Sync failed:", err);
      setStatus("offline");
    } finally {
      syncing = false;
      if (pendingPush) {
        pendingPush = false;
        setTimeout(syncNow, 250);
      }
    }
  }

  function localChanged() {
    if (!space) return;
    pendingPush = true;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(syncNow, PUSH_DEBOUNCE_MS);
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(syncNow, POLL_MS);
  }
  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  // ── space lifecycle ──
  async function adoptSpace(id, k) {
    space = { id: id, k: k, cryptoKey: await importKey(b64urlToBytes(k)) };
    try {
      localStorage.setItem(SPACE_STORAGE, JSON.stringify({ id: id, k: k }));
    } catch (e) {
      /* ignore */
    }
  }

  async function loadSpace() {
    // 1) From the share link's #fragment (then strip it from the address bar).
    const frag = new URLSearchParams((location.hash || "").replace(/^#/, ""));
    const fid = frag.get("s");
    const fk = frag.get("k");
    if (fid && fk) {
      await adoptSpace(fid, fk);
      try {
        history.replaceState(null, "", location.pathname + location.search);
      } catch (e) {
        /* ignore */
      }
      return;
    }
    // 2) From a previously adopted space on this device.
    try {
      const saved = JSON.parse(localStorage.getItem(SPACE_STORAGE) || "null");
      if (saved && saved.id && saved.k) await adoptSpace(saved.id, saved.k);
    } catch (e) {
      /* ignore */
    }
  }

  function shareLink() {
    if (!space) return null;
    return location.origin + location.pathname + "#s=" + space.id + "&k=" + space.k;
  }

  async function createSpace() {
    const idBytes = crypto.getRandomValues(new Uint8Array(16));
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    await adoptSpace(bytesToB64url(idBytes), bytesToB64url(keyBytes));
    await syncNow(); // push current local data into the new space
    startPolling();
    return shareLink();
  }

  function leave() {
    stopPolling();
    clearTimeout(pushTimer);
    try {
      localStorage.removeItem(SPACE_STORAGE);
    } catch (e) {
      /* ignore */
    }
    space = null;
    setStatus("off");
  }

  async function init(h) {
    hooks = h;
    if (!SYNC_URL) {
      setStatus("off"); // not configured; state().configured === false
      return;
    }
    await loadSpace();
    if (space) {
      await syncNow();
      startPolling();
    } else {
      setStatus("off");
    }
  }

  // Re-sync when the tab regains focus (catches changes made elsewhere).
  window.addEventListener("focus", function () {
    if (space) syncNow();
  });

  window.BabySync = {
    init: init,
    state: state,
    shareLink: shareLink,
    createSpace: createSpace,
    leave: leave,
    syncNow: syncNow,
    localChanged: localChanged,
  };
})();
