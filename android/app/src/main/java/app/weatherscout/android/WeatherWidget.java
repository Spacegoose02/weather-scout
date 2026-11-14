package app.weatherscout.android;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.DateFormat;
import java.util.Date;

/**
 * Weather Scout home-screen widget: temperature, the next two hours of rain
 * ("Rain in 15 min"), today's high and low and the top alert. Android refreshes
 * it about every 30 minutes; tapping it opens the app, and the small "↻" button
 * refreshes now. Data comes from GET /api/connect/widget on your server. When the
 * server needs sign-in, add an app key in the widget's setup screen (⚙). The
 * server is the one picked in the app's setup screen (ServerConfig).
 */
public class WeatherWidget extends AppWidgetProvider {
    static final String ACTION_REFRESH = "app.weatherscout.android.WIDGET_REFRESH";
    static final String PREFS = "weather_widget";
    static final String KEY_APP_KEY = "app_key";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        refresh(context, manager, ids, goAsync());
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, WeatherWidget.class));
            refresh(context, manager, ids, goAsync());
        }
    }

    /** Asks Android to redraw every Weather Scout widget (after the setup screen saves). */
    static void updateAll(Context context) {
        Intent i = new Intent(context, WeatherWidget.class).setAction(ACTION_REFRESH);
        context.sendBroadcast(i);
    }

    private static void refresh(Context context, AppWidgetManager manager, int[] ids, PendingResult pending) {
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                RemoteViews views = build(app);
                for (int id : ids) manager.updateAppWidget(id, views);
            } finally {
                pending.finish();
            }
        }).start();
    }

    private static RemoteViews build(Context context) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_weather);
        String base = ServerConfig.get(context);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;

        Intent open = new Intent(context, StartActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 0, open, flags));
        Intent again = new Intent(context, WeatherWidget.class).setAction(ACTION_REFRESH);
        v.setOnClickPendingIntent(R.id.widget_refresh, PendingIntent.getBroadcast(context, 1, again, flags));
        Intent setup = new Intent(context, WidgetSetupActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.widget_setup, PendingIntent.getActivity(context, 2, setup, flags));

        if (base == null) {
            v.setTextViewText(R.id.widget_label, context.getString(R.string.widgetNoServer));
            v.setTextViewText(R.id.widget_rain, "");
            v.setViewVisibility(R.id.widget_alert, View.GONE);
            return v;
        }

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String key = prefs.getString(KEY_APP_KEY, "");
        try {
            JSONObject d = fetch(base + "api/connect/widget", key);
            v.setTextViewText(R.id.widget_temp, d.optString("temp", "--"));
            v.setTextViewText(R.id.widget_label, d.optString("label", ""));
            v.setTextViewText(R.id.widget_place, d.optString("place", ""));
            v.setTextViewText(R.id.widget_rain, d.optString("rainSoon", ""));
            v.setTextViewText(R.id.widget_hilo, d.optString("hiLo", ""));
            boolean alert = d.optBoolean("hasAlert", false);
            v.setViewVisibility(R.id.widget_alert, alert ? View.VISIBLE : View.GONE);
            v.setTextViewText(R.id.widget_alert, d.optString("alert", ""));
            v.setTextViewText(R.id.widget_updated, DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date()));
        } catch (NeedsKey e) {
            v.setTextViewText(R.id.widget_label, context.getString(R.string.widgetNeedsKey));
            v.setTextViewText(R.id.widget_rain, "");
            v.setViewVisibility(R.id.widget_alert, View.GONE);
        } catch (Exception e) {
            // Keep the last numbers on screen; just say it could not refresh.
            v.setTextViewText(R.id.widget_updated, context.getString(R.string.widgetOffline));
        }
        return v;
    }

    static final class NeedsKey extends Exception {}

    static JSONObject fetch(String address, String key) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(address).openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(8000);
        c.setRequestProperty("Accept", "application/json");
        if (key != null && !key.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + key);
        try {
            int code = c.getResponseCode();
            if (code == 401) throw new NeedsKey();
            if (code != 200) throw new Exception("HTTP " + code);
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return new JSONObject(out.toString("UTF-8"));
            }
        } finally {
            c.disconnect();
        }
    }
}
