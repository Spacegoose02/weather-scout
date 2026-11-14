package app.weatherscout.android;

import android.net.Uri;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * Opens the saved Weather Scout server full screen (a Trusted Web Activity).
 * Only StartActivity starts it, after checking a server is saved.
 */
public class TwaLauncherActivity extends LauncherActivity {
    @Override
    protected Uri getLaunchingUrl() {
        String base = ServerConfig.get(this);
        if (base == null) base = "https://localhost/"; // StartActivity makes sure this never happens.
        Uri data = getIntent().getData();
        // A link into the same server (from the widget) opens that page.
        if (data != null && data.toString().startsWith(base)) return data;
        // ?app=android lets the web app show "Change server" in its Settings.
        return Uri.parse(base).buildUpon().appendQueryParameter("app", "android").build();
    }
}
