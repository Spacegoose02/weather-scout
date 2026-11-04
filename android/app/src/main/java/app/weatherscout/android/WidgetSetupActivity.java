package app.weatherscout.android;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.text.InputType;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Setup for the home-screen widget. Only needed when your server requires
 * sign-in (AUTH_REQUIRED): paste an app key from Family & settings, Connected
 * apps. Otherwise just press Done.
 */
public class WidgetSetupActivity extends Activity {
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        setTitle(R.string.widgetSetupTitle);
        int widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        // If they back out of the first setup, Android removes the widget.
        if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) setResult(RESULT_CANCELED, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));

        SharedPreferences prefs = getSharedPreferences(WeatherWidget.PREFS, MODE_PRIVATE);
        int pad = (int) (20 * getResources().getDisplayMetrics().density);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(pad, pad, pad, pad);

        TextView help = new TextView(this);
        help.setText(R.string.widgetSetupHelp);
        box.addView(help);

        EditText key = new EditText(this);
        key.setHint("wsk_…");
        key.setSingleLine(true);
        key.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        key.setText(prefs.getString(WeatherWidget.KEY_APP_KEY, ""));
        box.addView(key, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button done = new Button(this);
        done.setText(R.string.widgetSetupDone);
        done.setOnClickListener((view) -> {
            prefs.edit().putString(WeatherWidget.KEY_APP_KEY, key.getText().toString().trim()).apply();
            WeatherWidget.updateAll(this);
            if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
            finish();
        });
        box.addView(done);
        setContentView(box);
    }
}
