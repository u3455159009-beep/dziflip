#!/usr/bin/env bash
# Builds Wakeify for iOS on EAS and submits it to TestFlight — non-interactively,
# from any machine (incl. a Linux cloud container). No secret is ever written
# into the repository: everything comes from environment variables, and the
# App Store Connect key is materialised only in a private temp dir that is
# deleted on exit.
#
# Required environment variables:
#   EXPO_TOKEN              expo.dev → Account settings → Access tokens
#   EXPO_ASC_KEY_ID         App Store Connect API key ID (10 chars)
#   EXPO_ASC_ISSUER_ID      App Store Connect issuer ID (UUID)
#   EXPO_APPLE_TEAM_ID      Apple Developer Team ID (10 chars)
#   EXPO_ASC_API_KEY_P8_BASE64   the downloaded AuthKey_XXXX.p8, base64-encoded
#     (or EXPO_ASC_API_KEY_P8 with the raw PEM text)
# Optional:
#   EXPO_APPLE_TEAM_TYPE    INDIVIDUAL (default) | COMPANY_OR_ORGANIZATION
#
# Usage:
#   scripts/eas-ios-testflight.sh check        # verify secrets + network, no build
#   scripts/eas-ios-testflight.sh credentials  # one-time: create cert/profile (prompts)
#   scripts/eas-ios-testflight.sh build        # build + auto-submit to TestFlight
set -euo pipefail
cd "$(dirname "$0")/.."

EAS="npx --yes eas-cli@24"
MODE="${1:-check}"

fail() { echo "✗ $*" >&2; exit 1; }
ok() { echo "✓ $*"; }

[ -n "${EXPO_TOKEN:-}" ] || fail "EXPO_TOKEN není nastavený"
for v in EXPO_ASC_KEY_ID EXPO_ASC_ISSUER_ID EXPO_APPLE_TEAM_ID; do
  [ -n "${!v:-}" ] || fail "$v není nastavený"
done
export EXPO_APPLE_TEAM_TYPE="${EXPO_APPLE_TEAM_TYPE:-INDIVIDUAL}"

KEYDIR="$(mktemp -d)"
chmod 700 "$KEYDIR"
trap 'rm -rf "$KEYDIR"' EXIT
KEYFILE="$KEYDIR/AuthKey_${EXPO_ASC_KEY_ID}.p8"
if [ -n "${EXPO_ASC_API_KEY_P8_BASE64:-}" ]; then
  printf '%s' "$EXPO_ASC_API_KEY_P8_BASE64" | base64 -d > "$KEYFILE" || fail "EXPO_ASC_API_KEY_P8_BASE64 není platné base64"
elif [ -n "${EXPO_ASC_API_KEY_P8:-}" ]; then
  printf '%s\n' "$EXPO_ASC_API_KEY_P8" > "$KEYFILE"
else
  fail "chybí EXPO_ASC_API_KEY_P8_BASE64 (nebo EXPO_ASC_API_KEY_P8)"
fi
chmod 600 "$KEYFILE"
grep -q "BEGIN PRIVATE KEY" "$KEYFILE" || fail "klíč .p8 nevypadá jako PEM (chybí BEGIN PRIVATE KEY)"
export EXPO_ASC_API_KEY_PATH="$KEYFILE"
ok "App Store Connect klíč připraven (dočasně, mimo repozitář)"

for host in https://api.expo.dev https://storage.googleapis.com https://api.appstoreconnect.apple.com; do
  out=$(curl -s -m 15 -w '\n%{http_code}' "$host" 2>/dev/null || true)
  if [ "${out##*$'\n'}" = "000" ] || printf '%s' "$out" | grep -qi "not in allowlist"; then
    fail "síť: $host je blokovaný — přidej ho do povolených domén"
  fi
done
ok "síť: api.expo.dev, storage.googleapis.com, api.appstoreconnect.apple.com dostupné"

WHO=$($EAS whoami 2>&1) || fail "EXPO_TOKEN neplatí: $WHO"
ok "Expo účet: $(echo "$WHO" | head -1)"

if ! node -e 'process.exit(require("./app.json").expo?.extra?.eas?.projectId ? 0 : 1)'; then
  echo "… EAS projekt ještě neexistuje → eas init"
  $EAS init --non-interactive --force
  ok "projectId zapsán do app.json (commitni ho)"
fi

case "$MODE" in
  check)
    ok "vše připraveno; další krok: $0 credentials (jen poprvé), pak $0 build"
    ;;
  credentials)
    # With EXPO_ASC_* set, eas-cli authenticates with the API key (no Apple ID / 2FA).
    $EAS credentials --platform ios
    ;;
  build)
    BUNDLE_ID=$(node -p 'require("./app.json").expo.ios.bundleIdentifier')
    if ! node -e 'process.exit(require("./eas.json").submit?.production?.ios?.ascAppId ? 0 : 1)'; then
      ASC_APP_ID=$(node scripts/asc-app-id.mjs "$BUNDLE_ID") || fail "nenašel jsem záznam aplikace $BUNDLE_ID v App Store Connect"
      node -e '
        const fs = require("fs"); const p = "eas.json"; const c = JSON.parse(fs.readFileSync(p, "utf8"));
        c.submit = c.submit || {}; c.submit.production = c.submit.production || {};
        c.submit.production.ios = { ...(c.submit.production.ios || {}), ascAppId: process.argv[1] };
        fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");' "$ASC_APP_ID"
      ok "ascAppId $ASC_APP_ID zapsán do eas.json (není tajný; commitni ho)"
    fi
    $EAS build --platform ios --profile production --non-interactive --auto-submit --wait
    ;;
  *)
    fail "neznámý režim: $MODE (check | credentials | build)"
    ;;
esac
