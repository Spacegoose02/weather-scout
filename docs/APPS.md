# Phone and desktop apps

Weather Scout is a web app, so every device already gets the full app at your https
address. This page covers the two "real app" options: an **Android app** you can install
from an APK (one APK for every server), and a **Windows 11 widget** on the Widgets board. Both open your own server,
so there is nothing else to host and every new Weather Scout feature shows up in them on
its own.

Both work best with Weather Scout on **https** (see "HTTPS" in the README). GPS, alerts and
the app link all depend on it.

## Android app

The Android app is a [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity):
a tiny app (`android/`) that opens your Weather Scout address full screen in Chrome. Because
it is really Chrome, "Use my location", severe weather push alerts and sign-in all work the
same as on the web, and the app never needs an update when the server does.

Anyone can host Weather Scout, so **the same APK works with every server**. The first time it
opens, it asks for your server's address (for example `https://wx.example.com`), checks that a
Weather Scout server answers there and remembers it. To switch later, long-press the app icon
and pick **Change server**, or open ⚙️ *Settings* in the app and press **Change server**.

### Install it

Download `weather-scout-<version>.apk` from the project's
[GitHub releases](https://github.com/spacegoose02/weather-scout/releases) on the phone, open it and allow "Install unknown apps" for
your browser or Files app when Android asks. Open Weather Scout, type your server's address
and press **Connect**. Updates install over the old version.

**If you see a browser bar at the top** of the app, Android couldn't confirm your server
trusts this APK. Every Weather Scout server vouches for the released APK automatically once
its fingerprint is in `shared/android-app.js` (see below), so update your server. If you built
your own APK, put its fingerprint in *Family & settings* → *App settings* → *Alerts, sign-out &
Android app* → *Android app fingerprint* (or `ANDROID_CERT_SHA256`), and set *Android package
name* if you changed it. Check `https://<your address>/.well-known/assetlinks.json` lists it.
Android checks again after you reinstall or clear Chrome's data. The app still works with the
bar; it just isn't full screen.

**Plain http** addresses work too after a warning, but the app then shows a browser bar and
"Use my location" and alerts don't work, so use https (see "HTTPS" in the README).

**Alerts on the phone:** open the app, go to *Settings → Alert settings* and turn them on,
just like on the web. The app asks for Android's notification permission the first time.

### Signing the release APK (whoever runs the GitHub repository)

GitHub Actions builds the APK (*Actions → Android app*). Release APKs need a signing key, kept
in GitHub secrets, so every release installs over the last one. One-time setup:

1. **Make a signing key** on any computer with Java:

   ```bash
   scripts/android-keystore.sh weather-scout.jks
   ```

   It asks for a password and prints the values below. Keep `weather-scout.jks` and the
   password safe and **outside the repository** (`*.jks` is git-ignored). If you lose it,
   everyone has to uninstall and reinstall the app.

2. **Add four GitHub Actions secrets** (repository *Settings → Secrets and variables →
   Actions → Secrets → New repository secret*):

   | Secret | Value |
   | --- | --- |
   | `ANDROID_KEYSTORE_BASE64` | the keystore as one line of text: `base64 -w0 weather-scout.jks` (macOS: `base64 -i weather-scout.jks`; Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("weather-scout.jks"))`) |
   | `ANDROID_KEYSTORE_PASSWORD` | the password you chose |
   | `ANDROID_KEY_ALIAS` | `weather-scout` |
   | `ANDROID_KEY_PASSWORD` | optional: only if the key has its own password (the script uses the same one, so skip it) |

3. **Build:** *Actions → Android app → Run workflow*, or publish a release (for example
   `v0.13.0`) and `weather-scout-0.13.0.apk` is attached to it. The run's summary shows the
   **signing fingerprint**.

4. **Let every server trust it:** paste that fingerprint into `certSha256` in
   `shared/android-app.js` and commit it, once. From the next server release on, every
   Weather Scout server lists it in `/.well-known/assetlinks.json`, so the app opens full
   screen for everyone without any setup on their side. (Until then, a server can paste it
   into *Android app fingerprint*.)

Optional repository *Variables*: `ANDROID_APP_NAME` (launcher name, default "Weather Scout")
and `ANDROID_PACKAGE_NAME` (default `app.weatherscout.android`; changing it makes a separate
app that each server has to trust by hand).

Without the secrets, the workflow still builds a `-debug.apk` (under the run's *Artifacts*)
with a throwaway key so you can try it, but each build has a different key, so it won't update
in place and the browser bar stays visible. Releases skip the APK with a notice instead of
failing. If a secret is wrong, the run stops and says which one.

**Building it yourself:** with Android Studio or the Android SDK and Java 17,
`cd android && ./gradlew assembleDebug`. See the comments at the top of
`android/app/build.gradle` for the options.

### Home-screen widget

The Android app comes with a **Weather Scout** home-screen widget: the temperature, the
next two hours of rain or snow ("Rain in 15 min"), today's high and low and the top NWS
alert. Long-press the home screen, pick *Widgets*, then *Weather Scout*. Android refreshes
it about every 30 minutes (the shortest it allows); tap **↻** to refresh now, or the widget
to open the app. It shows the home place (`DEFAULT_LAT`/`DEFAULT_LON`) of the server the app is set to.

If your server has `AUTH_REQUIRED=true`, the widget can't use your browser's sign-in. Make
an app key (Family & settings → Connected apps → *Make a key*), tap **⚙** on the widget and
paste it there.

## Watch and tiny screens

Open **`/watch.html`** on your server from a watch's browser (Wear OS), a car screen or a
phone lock-screen shortcut: big temperature, the rain countdown, high and low and the top
alert on black, refreshed every 5 minutes. It uses your sign-in and saved place like the app.
Add `?lat=..&lon=..` for another place, or `?key=wsk_…` (an app key) on a device that can't
sign in.

## Windows 11 widget

Weather Scout's web app manifest defines a **Today** widget for the Windows 11 Widgets board
(press **Win + W**): Rocky, the temperature, high and low, rain chance, the top NWS alert,
the playground rating and what to wear, with *Open Weather Scout* and *Refresh* buttons.
The service worker keeps it fresh about every 15 minutes while Windows lets it.

![Today widget](../web/public/widgets/today-screenshot.png)

Windows only shows web app widgets for apps installed as a **Windows app package**, not for a
site you installed from Edge's menu. [PWABuilder](https://www.pwabuilder.com) makes that
package for free from your address:

1. Make sure your Weather Scout https address is **reachable from the internet** while you
   do this (PWABuilder reads the manifest from its own servers). A reverse proxy with a
   public hostname or a Cloudflare Tunnel works. For Tailscale, `tailscale funnel 8080`
   briefly, then turn it off.
2. On pwabuilder.com, enter the address and choose **Package for stores → Windows →
   Generate package** and pick the *test package* (sideload) option.
3. Unzip it on the Windows 11 PC and run `install.ps1` from the folder (right-click → *Run
   with PowerShell*). Windows may ask you to turn on *Developer Mode* (Settings → System →
   For developers) for sideloaded apps.
4. Open Weather Scout once from the Start menu (and sign in if your server requires it),
   then press **Win + W → +** (*Add widgets*) and pick **Weather Scout today**.

The widget uses the same sign-in as the app: if the server has `AUTH_REQUIRED=true`, it
shows "Open Weather Scout and sign in" until you do. Its data comes from
`/api/widget/summary`, which uses the server's home location (`DEFAULT_LAT`/`DEFAULT_LON`).
The card layout is the Adaptive Card in `web/public/widgets/today.json` if you want to change
it; the package doesn't need rebuilding for layout or data changes.

**No widget, just a window?** Any Windows PC can also install Weather Scout from Edge or
Chrome (address bar → *Install*), pin it to the taskbar and get alerts as Windows
notifications.
