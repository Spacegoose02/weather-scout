// The Weather Scout Android app attached to this project's GitHub releases.
// Anyone can host Weather Scout and the same APK works with every server, so
// every server vouches for that APK in /.well-known/assetlinks.json out of the
// box. Then the app opens full screen (no browser bar) without each family
// pasting a fingerprint.
//
// After the first signed release build, copy the "Signing fingerprint" from the
// Android app workflow's summary into certSha256 below. A server can still add
// its own fingerprints (an APK it built itself) with ANDROID_CERT_SHA256.
export const RELEASE_ANDROID_APP = {
  packageName: 'app.weatherscout.android',
  certSha256: [],
};

export const parseFingerprints = (v) => String(v || '').split(/[\s,]+/).map((f) => f.trim().toUpperCase()).filter(Boolean);
