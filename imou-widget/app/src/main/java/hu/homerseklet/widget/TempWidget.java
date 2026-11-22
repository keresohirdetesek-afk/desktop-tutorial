package hu.homerseklet.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;

public class TempWidget extends AppWidgetProvider {
    static final String ACTION_REFRESH = "hu.homerseklet.widget.REFRESH";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (ACTION_REFRESH.equals(intent.getAction())) {
            PendingResult pr = goAsync();
            Updater.refreshAsync(ctx, pr::finish);
            return;
        }
        super.onReceive(ctx, intent);
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        Updater.schedule(ctx);
        Updater.render(ctx, false);
        PendingResult pr = goAsync();
        Updater.refreshAsync(ctx, pr::finish);
    }

    @Override
    public void onEnabled(Context ctx) {
        Updater.schedule(ctx);
    }

    @Override
    public void onDisabled(Context ctx) {
        Updater.cancel(ctx);
    }
}
