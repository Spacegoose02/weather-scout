package app.weatherscout.android;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import java.util.Collections;

/**
 * What the launcher icon (and the widget) opens. With no server saved yet it
 * shows the setup screen; otherwise it opens the web app full screen. It also
 * keeps the "Change server" item in the icon's long-press menu.
 */
public class StartActivity extends Activity {
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        addChangeServerShortcut();
        String base = ServerConfig.get(this);
        Intent next;
        if (base == null) {
            next = new Intent(this, ServerSetupActivity.class).putExtra(ServerSetupActivity.EXTRA_FIRST_RUN, true);
        } else {
            next = new Intent(this, TwaLauncherActivity.class);
            Uri data = getIntent().getData();
            if (data != null) next.setData(data);
        }
        startActivity(next);
        finish();
    }

    private void addChangeServerShortcut() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return;
        try {
            ShortcutManager sm = getSystemService(ShortcutManager.class);
            if (sm == null) return;
            Intent change = new Intent(Intent.ACTION_VIEW, Uri.parse("weatherscout://server"), this, ServerSetupActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            ShortcutInfo info = new ShortcutInfo.Builder(this, "change_server")
                .setShortLabel(getString(R.string.serverShortcutShort))
                .setLongLabel(getString(R.string.serverShortcutLong))
                .setIcon(Icon.createWithResource(this, R.mipmap.ic_launcher))
                .setIntent(change)
                .build();
            sm.setDynamicShortcuts(Collections.singletonList(info));
        } catch (RuntimeException ignored) {
            // A launcher that limits shortcuts shouldn't stop the app opening.
        }
    }
}
