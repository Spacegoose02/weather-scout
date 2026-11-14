package app.weatherscout.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;

import javax.net.ssl.SSLException;

/**
 * Asks which Weather Scout server to open. Shown the first time the app starts,
 * and again from "Change server" (the app icon's long-press menu, or Settings in
 * the web app). It checks the address really is a Weather Scout server before
 * saving it: GET /api/config must answer with Weather Scout's settings. That
 * route is open even on servers that need sign-in.
 */
public class ServerSetupActivity extends Activity {
    static final String EXTRA_FIRST_RUN = "first_run";

    private EditText address;
    private Button connect;
    private ProgressBar spinner;
    private TextView status;
    private volatile boolean checking;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setStatusBarColor(getColor(R.color.themeColor));
        String current = ServerConfig.get(this);
        boolean firstRun = current == null;

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(24);
        box.setPadding(pad, dp(40), pad, pad);
        box.setBackgroundColor(getColor(R.color.backgroundColor));

        TextView title = new TextView(this);
        title.setText(firstRun ? R.string.serverSetupWelcome : R.string.serverSetupChange);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(getColor(R.color.themeColor));
        box.addView(title);

        TextView help = text(getString(R.string.serverSetupHelp), 16);
        help.setPadding(0, dp(12), 0, dp(4));
        box.addView(help);
        if (!firstRun) {
            TextView now = text(getString(R.string.serverSetupCurrent, ServerConfig.label(current)), 14);
            now.setPadding(0, dp(4), 0, 0);
            box.addView(now);
        }

        address = new EditText(this);
        address.setHint(R.string.serverSetupHint);
        address.setSingleLine(true);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        if (current != null) address.setText(current.replaceAll("/$", ""));
        address.setOnEditorActionListener((v, actionId, event) -> {
            boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_DOWN;
            if (actionId == EditorInfo.IME_ACTION_GO || enter) {
                start();
                return true;
            }
            return false;
        });
        LinearLayout.LayoutParams wide = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        wide.topMargin = dp(16);
        box.addView(address, wide);

        status = text("", 15);
        status.setPadding(0, dp(8), 0, dp(8));
        status.setVisibility(View.GONE);
        box.addView(status);

        spinner = new ProgressBar(this);
        spinner.setIndeterminate(true);
        spinner.setVisibility(View.GONE);
        LinearLayout.LayoutParams center = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        center.gravity = Gravity.CENTER_HORIZONTAL;
        box.addView(spinner, center);

        connect = new Button(this);
        connect.setText(R.string.serverSetupConnect);
        connect.setOnClickListener((v) -> start());
        LinearLayout.LayoutParams btn = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        btn.topMargin = dp(8);
        box.addView(connect, btn);

        if (!firstRun) {
            Button cancel = new Button(this, null, android.R.attr.borderlessButtonStyle);
            cancel.setText(R.string.serverSetupCancel);
            cancel.setOnClickListener((v) -> finish());
            box.addView(cancel, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(getColor(R.color.backgroundColor));
        scroll.addView(box);
        setContentView(scroll);
        if (firstRun) address.requestFocus();
    }

    private void start() {
        if (checking) return;
        String typed = address.getText().toString();
        if (typed.trim().isEmpty()) {
            showError(getString(R.string.serverSetupEmpty));
            return;
        }
        String base = ServerConfig.normalize(typed);
        if (base == null) {
            showError(getString(R.string.serverSetupBadAddress));
            return;
        }
        if (!ServerConfig.isHttps(base)) {
            new AlertDialog.Builder(this)
                .setTitle(R.string.serverSetupInsecureTitle)
                .setMessage(R.string.serverSetupInsecure)
                .setPositiveButton(R.string.serverSetupInsecureOk, (d, w) -> check(base))
                .setNegativeButton(R.string.serverSetupCancel, null)
                .show();
            return;
        }
        check(base);
    }

    private void check(String base) {
        checking = true;
        connect.setEnabled(false);
        spinner.setVisibility(View.VISIBLE);
        status.setTextColor(Color.DKGRAY);
        status.setText(getString(R.string.serverSetupChecking, ServerConfig.label(base)));
        status.setVisibility(View.VISIBLE);
        new Thread(() -> {
            String found = null;
            String error;
            try {
                found = verify(base);
                error = null;
            } catch (UnknownHostException e) {
                error = getString(R.string.serverSetupNotFound, ServerConfig.label(base));
            } catch (SSLException e) {
                error = getString(R.string.serverSetupCert, ServerConfig.label(base));
            } catch (HttpError e) {
                error = getString(R.string.serverSetupHttpError, ServerConfig.label(base), e.code);
            } catch (SignInFirst e) {
                // A sign-in page (Authelia, Cloudflare Access...) in front of the
                // server. Can't check past it, so let them decide.
                runOnUiThread(() -> askAboutSignIn(base));
                return;
            } catch (NotWeatherScout e) {
                error = getString(R.string.serverSetupNotWeatherScout, ServerConfig.label(base));
            } catch (Exception e) {
                // Timeouts, refused connections and the like.
                error = getString(R.string.serverSetupNoAnswer, ServerConfig.label(base));
            }
            final String ok = found;
            final String err = error;
            runOnUiThread(() -> {
                checking = false;
                if (isFinishing() || isDestroyed()) return;
                spinner.setVisibility(View.GONE);
                connect.setEnabled(true);
                if (ok != null) done(ok);
                else showError(err);
            });
        }).start();
    }

    private void askAboutSignIn(String base) {
        checking = false;
        if (isFinishing() || isDestroyed()) return;
        spinner.setVisibility(View.GONE);
        connect.setEnabled(true);
        status.setVisibility(View.GONE);
        new AlertDialog.Builder(this)
            .setTitle(R.string.serverSetupSignInTitle)
            .setMessage(getString(R.string.serverSetupSignIn, ServerConfig.label(base)))
            .setPositiveButton(R.string.serverSetupInsecureOk, (d, w) -> done(base))
            .setNegativeButton(R.string.serverSetupCancel, null)
            .show();
    }

    private void done(String base) {
        String before = ServerConfig.get(this);
        ServerConfig.save(this, base);
        if (before != null && !ServerConfig.sameServer(before, base)) {
            // App keys belong to one server; the widget needs a new one there.
            getSharedPreferences(WeatherWidget.PREFS, MODE_PRIVATE).edit().remove(WeatherWidget.KEY_APP_KEY).apply();
        }
        WeatherWidget.updateAll(this);
        startActivity(new Intent(this, StartActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
        finish();
    }

    private void showError(String message) {
        status.setTextColor(Color.rgb(0xB3, 0x26, 0x1E));
        status.setText(message);
        status.setVisibility(View.VISIBLE);
    }

    static final class HttpError extends Exception {
        final int code;
        HttpError(int code) { this.code = code; }
    }

    static final class NotWeatherScout extends Exception {}

    /** The address sent us to a sign-in page on another site. */
    static final class SignInFirst extends Exception {}

    /**
     * Fetches base + "api/config" and returns the base address to save: the
     * same one, or where the server redirected to (http to https, a new name).
     */
    static String verify(String base) throws Exception {
        String url = base + "api/config";
        String startHost = new URL(url).getHost();
        for (int hop = 0; hop < 5; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(10000);
            c.setReadTimeout(10000);
            c.setRequestProperty("Accept", "application/json");
            try {
                int code = c.getResponseCode();
                if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                    url = new URL(new URL(url), c.getHeaderField("Location")).toString();
                    continue;
                }
                if (code != 200) throw new HttpError(code);
                JSONObject cfg;
                try (InputStream in = c.getInputStream()) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0 && out.size() < 2_000_000) out.write(buf, 0, n);
                    cfg = new JSONObject(out.toString("UTF-8"));
                } catch (org.json.JSONException e) {
                    if (!new URL(url).getHost().equalsIgnoreCase(startHost)) throw new SignInFirst();
                    throw new NotWeatherScout();
                }
                // Weather Scout's /api/config always has these.
                if (!cfg.has("auth") || !cfg.has("units") || !cfg.has("defaultLocation")) throw new NotWeatherScout();
                if (!url.endsWith("/api/config")) throw new NotWeatherScout();
                String landed = ServerConfig.normalize(url.substring(0, url.length() - "api/config".length()));
                return landed != null ? landed : base;
            } finally {
                c.disconnect();
            }
        }
        throw new SocketTimeoutException("Too many redirects");
    }

    private TextView text(String s, int sp) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(Color.rgb(0x1F, 0x29, 0x37));
        return t;
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density);
    }
}
