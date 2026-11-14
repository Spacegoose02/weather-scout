#!/usr/bin/env bash
# Makes the signing key for the Weather Scout Android app and prints what to
# paste into GitHub (Settings > Secrets and variables > Actions) and the server.
# Needs keytool (comes with Java). Keep the .jks file and passwords somewhere
# safe and OUT of the repository: losing them means users must reinstall.
#
#   scripts/android-keystore.sh [weather-scout.jks]
set -euo pipefail
out="${1:-weather-scout.jks}"
alias=weather-scout
[ -e "$out" ] && { echo "$out already exists; not overwriting it." >&2; exit 1; }
read -rsp "Choose a keystore password (6+ characters): " pass; echo
keytool -genkeypair -v -keystore "$out" -alias "$alias" -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$pass" -keypass "$pass" -dname "CN=Weather Scout" >/dev/null 2>&1
fp=$(keytool -list -v -keystore "$out" -alias "$alias" -storepass "$pass" | awk '/SHA256:/ {print $2; exit}')
echo
echo "Made $out. Add these GitHub Actions secrets:"
echo "  ANDROID_KEYSTORE_BASE64   (the output of: base64 -w0 $out)"
echo "  ANDROID_KEYSTORE_PASSWORD (the password you just typed)"
echo "  ANDROID_KEY_ALIAS         $alias"
echo
echo "Then, so every Weather Scout server trusts the app, put this fingerprint in"
echo "certSha256 in shared/android-app.js (or ANDROID_CERT_SHA256 on one server):"
echo "  $fp"
