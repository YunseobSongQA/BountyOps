// Shared Web Push transport for Cloudflare Pages Functions (Workers runtime).
//
// The `web-push` npm package depends on Node's `crypto`/`https` and does NOT run
// on the Workers runtime, so this implements the protocol directly with the
// Web Crypto API:
//   - RFC 8291 "aes128gcm" payload encryption (ECDH P-256 + HKDF-SHA256 + AES-GCM)
//   - RFC 8292 VAPID auth (ES256 JWT signed with the server VAPID private key)
//
// Env vars used: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT.

const enc = new TextEncoder();

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes) {
  const arr = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

// --- VAPID (RFC 8292) -------------------------------------------------------

async function importVapidSigningKey(publicKey, privateKey) {
  const pub = b64urlToBytes(publicKey); // 65 bytes: 0x04 || x(32) || y(32)
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: bytesToB64url(b64urlToBytes(privateKey)), // 32-byte scalar
    ext: true,
  };
  return crypto.subtle.importKey(
    "jwk", jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"]
  );
}

async function createVapidJWT(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT || "mailto:admin@example.com",
  };
  const signingInput =
    bytesToB64url(enc.encode(JSON.stringify(header))) + "." +
    bytesToB64url(enc.encode(JSON.stringify(payload)));

  const key = await importVapidSigningKey(env.VAPID_PUBLIC, env.VAPID_PRIVATE);
  // Web Crypto ECDSA produces the raw r||s (IEEE P1363) signature ES256 needs.
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput)
  );
  return signingInput + "." + bytesToB64url(new Uint8Array(sig));
}

// --- Payload encryption (RFC 8291 / RFC 8188 aes128gcm) ---------------------

async function hkdf(ikmKey, salt, info, bits) {
  const out = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info }, ikmKey, bits
  );
  return new Uint8Array(out);
}

async function encryptPayload(subscription, payload) {
  const uaPublic = b64urlToBytes(subscription.keys.p256dh); // 65 bytes
  const authSecret = b64urlToBytes(subscription.keys.auth); // 16 bytes
  const plaintext = enc.encode(payload);

  // Ephemeral (application server) ECDH key pair.
  const asKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  const asPublicRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", asKeyPair.publicKey)
  ); // 65 bytes

  const uaKey = await crypto.subtle.importKey(
    "raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []
  );
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: uaKey }, asKeyPair.privateKey, 256
  ));

  // RFC 8291 §3.4: IKM = HKDF(salt=auth, ikm=ecdh, info="WebPush: info"||0||ua||as)
  const ecdhKey = await crypto.subtle.importKey(
    "raw", ecdhSecret, "HKDF", false, ["deriveBits"]
  );
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublicRaw);
  const ikm = await hkdf(ecdhKey, authSecret, keyInfo, 256);

  // RFC 8188: derive content-encryption key (CEK) and nonce from a random salt.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const ikmKey = await crypto.subtle.importKey(
    "raw", ikm, "HKDF", false, ["deriveBits"]
  );
  const cek = await hkdf(ikmKey, salt, enc.encode("Content-Encoding: aes128gcm\0"), 128);
  const nonce = await hkdf(ikmKey, salt, enc.encode("Content-Encoding: nonce\0"), 96);

  const aesKey = await crypto.subtle.importKey(
    "raw", cek, { name: "AES-GCM" }, false, ["encrypt"]
  );
  // Single record: plaintext followed by the 0x02 last-record delimiter.
  const record = concat(plaintext, new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, record
  ));

  // aes128gcm header: salt(16) || rs(4=4096) || idlen(1) || keyid(as_public 65)
  const header = concat(
    salt,
    new Uint8Array([0x00, 0x00, 0x10, 0x00]),
    new Uint8Array([asPublicRaw.length]),
    asPublicRaw
  );
  return concat(header, ciphertext);
}

// --- Transport --------------------------------------------------------------

async function sendOne(subscription, message, env) {
  const body = await encryptPayload(subscription, message);
  const jwt = await createVapidJWT(subscription.endpoint, env);
  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "86400",
    },
    body,
  });
}

// Send `message` (a string — typically JSON the service worker reads as
// {title, body}) to every subscription stored under the "sub:" KV prefix.
// Returns { sent, failed }. Subscriptions the push service reports as gone
// (404/410) are pruned from KV.
export async function sendToAll(message, env) {
  let sent = 0, failed = 0;
  let cursor;

  do {
    const list = await env.KV.list({ prefix: "sub:", cursor });
    for (const entry of list.keys) {
      const raw = await env.KV.get(entry.name);
      if (!raw) continue;
      let sub;
      try { sub = JSON.parse(raw); } catch (_) { failed++; continue; }
      try {
        const res = await sendOne(sub, message, env);
        if (res.ok) {
          sent++;
        } else {
          failed++;
          if (res.status === 404 || res.status === 410) {
            await env.KV.delete(entry.name);
          }
        }
      } catch (_) {
        failed++;
      }
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  return { sent, failed };
}
