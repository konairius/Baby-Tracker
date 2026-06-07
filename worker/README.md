# Sync backend — Cloudflare Worker + KV

This tiny Worker is the backend for the Share/Sync feature. It's a **zero-knowledge
encrypted-blob store**: it only ever sees ciphertext, never your data or your key.
You deploy it once; everyone using your site then syncs through it.

## What you need

- A free [Cloudflare account](https://dash.cloudflare.com/sign-up).
- Node.js installed (for the `wrangler` CLI).

## Deploy (about 5 minutes)

From this `worker/` folder:

```bash
# 1. Log in to Cloudflare
npx wrangler login

# 2. Create the KV namespace that stores the encrypted blobs
npx wrangler kv namespace create BABY_KV
#    -> copy the printed id into wrangler.toml (replace PASTE_YOUR_KV_NAMESPACE_ID_HERE)

# 3. Deploy
npx wrangler deploy
```

`wrangler deploy` prints your Worker URL, e.g.:

```
https://baby-tracker-sync.YOUR-SUBDOMAIN.workers.dev
```

## Wire it into the app

Open `../sync.js` and set the `SYNC_URL` constant to that URL (no trailing slash):

```js
const SYNC_URL = "https://baby-tracker-sync.YOUR-SUBDOMAIN.workers.dev";
```

Commit and push. The site's **🔗 Share / sync** button now works for everyone:
"Create a shared space" uploads an encrypted copy and produces a private link; anyone
who opens that link syncs the same baby's log.

## How the security works

- Each shared "space" has a random id and a random **AES-256-GCM** key. Both live only
  in the share link's URL `#fragment`, which browsers **never send to the server**.
- The browser encrypts every change before upload and decrypts after download. The
  Worker stores `{ version, ciphertext }` and can't read either field's meaning.
- The space id is a high-entropy secret capability — knowing the link is what grants
  access. There are no accounts.

## Notes & limits

- **Anyone with the link has full read/write access.** To revoke, create a new space
  and re-share; the old link keeps pointing at the old (now-stale) data.
- KV has no atomic compare-and-set, so two simultaneous writers can briefly race. The
  client uses per-entry, newest-wins merging plus retries, so writes converge on the
  next sync — fine for a handful of family members, not for high-concurrency use.
- Free-tier KV is generous (plenty for this use case). The Worker caps blobs at ~2 MB.
