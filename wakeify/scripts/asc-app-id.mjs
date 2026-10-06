// Looks up the App Store Connect app record ("Apple ID" of the app) for a
// bundle identifier, using the App Store Connect API key from the environment
// (EXPO_ASC_KEY_ID, EXPO_ASC_ISSUER_ID, EXPO_ASC_API_KEY_PATH). Prints the
// numeric id, or exits 2 when no app record exists yet.
//   node scripts/asc-app-id.mjs app.wakeify
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const bundleId = process.argv[2];
const { EXPO_ASC_KEY_ID: kid, EXPO_ASC_ISSUER_ID: iss, EXPO_ASC_API_KEY_PATH: keyPath } = process.env;
if (!bundleId || !kid || !iss || !keyPath) {
  console.error('usage: node scripts/asc-app-id.mjs <bundleId>  (needs EXPO_ASC_KEY_ID, EXPO_ASC_ISSUER_ID, EXPO_ASC_API_KEY_PATH)');
  process.exit(1);
}
const b64url = (b) => Buffer.from(b).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = b64url(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' }));
const body = b64url(JSON.stringify({ iss, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }));
const sig = sign('sha256', Buffer.from(`${head}.${body}`), {
  key: createPrivateKey(readFileSync(keyPath)),
  dsaEncoding: 'ieee-p1363',
});
const res = await fetch(
  `https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&fields[apps]=bundleId,name`,
  { headers: { Authorization: `Bearer ${head}.${body}.${b64url(sig)}` } },
);
if (!res.ok) {
  console.error(`App Store Connect API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const app = (await res.json()).data?.find((a) => a.attributes?.bundleId === bundleId);
if (!app) {
  console.error(`Záznam aplikace pro ${bundleId} v App Store Connect neexistuje (vytvoř ho: Aplikace → + → Nová aplikace).`);
  process.exit(2);
}
console.log(app.id);
