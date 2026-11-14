package app.weatherscout.android;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import java.util.Locale;

/**
 * The Weather Scout server this app opens. Anyone can host Weather Scout, so
 * the address isn't built into the APK: the setup screen asks for it the first
 * time and saves it here. Stored as a base address that always ends in "/",
 * for example "https://wx.example.com/" or "https://example.com/weather/".
 */
final class ServerConfig {
    private static final String PREFS = "server";
    private static final String KEY_URL = "url";

    private ServerConfig() {}

    /** The saved base address (ending in "/"), or null before setup. */
    static String get(Context context) {
        String url = prefs(context).getString(KEY_URL, null);
        return url == null || url.isEmpty() ? null : url;
    }

    static void save(Context context, String base) {
        prefs(context).edit().putString(KEY_URL, base).apply();
    }

    /**
     * Turns what someone typed ("wx.example.com", "https://wx.example.com/",
     * "https://example.com/weather/index.html") into a base address ending in
     * "/". No scheme means https. Returns null when it can't be an address.
     */
    static String normalize(String typed) {
        if (typed == null) return null;
        String s = typed.trim();
        if (s.isEmpty() || s.contains(" ")) return null;
        if (!s.contains("://")) s = "https://" + s;
        Uri u = Uri.parse(s);
        String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
        String host = u.getHost();
        if (!scheme.equals("https") && !scheme.equals("http")) return null;
        if (host == null || host.isEmpty() || u.getUserInfo() != null) return null;
        host = host.toLowerCase(Locale.ROOT);
        if (host.contains(":") && !host.startsWith("[")) host = "[" + host + "]"; // IPv6
        StringBuilder out = new StringBuilder(scheme).append("://").append(host);
        int port = u.getPort();
        boolean defaultPort = port == -1 || (scheme.equals("https") && port == 443) || (scheme.equals("http") && port == 80);
        if (!defaultPort) out.append(':').append(port);
        String path = u.getPath() == null ? "" : u.getPath();
        path = path.replaceAll("/index\\.html?$", "/").replaceAll("/+$", "");
        out.append(path).append('/');
        return out.toString();
    }

    /** "wx.example.com" (plus the path, if any) for showing to people. */
    static String label(String base) {
        if (base == null) return "";
        return base.replaceFirst("^https?://", "").replaceAll("/$", "");
    }

    static boolean isHttps(String base) {
        return base != null && base.startsWith("https://");
    }

    static boolean sameServer(String a, String b) {
        return a != null && a.equals(b);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
