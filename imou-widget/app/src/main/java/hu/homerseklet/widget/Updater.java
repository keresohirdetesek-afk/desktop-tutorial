package hu.homerseklet.widget;

import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/** Fetches the readings and draws every widget instance. */
final class Updater {
    private static final int JOB_ID = 4711;
    private static final long PERIOD_MS = 15 * 60 * 1000L;

    private static final int[] ROWS = { R.id.row1, R.id.row2, R.id.row3, R.id.row4 };
    private static final int[] NAMES = { R.id.name1, R.id.name2, R.id.name3, R.id.name4 };
    private static final int[] TEMPS = { R.id.temp1, R.id.temp2, R.id.temp3, R.id.temp4 };
    private static final int[] HUMS = { R.id.hum1, R.id.hum2, R.id.hum3, R.id.hum4 };

    private Updater() {}

    /** Blocking: call it off the main thread. */
    static synchronized void refresh(Context ctx) {
        Store store = new Store(ctx);
        if (!store.configured()) {
            render(ctx, false);
            return;
        }
        render(ctx, true);
        List<Sensor> sensors = store.sensors();
        ImouApi api = new ImouApi(store);
        String error = null;
        int ok = 0;
        for (Sensor s : sensors) {
            try {
                double[] v = api.readSensor(s);
                if (!Double.isNaN(v[0])) s.temp = v[0];
                if (!Double.isNaN(v[1])) s.hum = v[1];
                ok++;
            } catch (Exception e) {
                error = e.getMessage();
            }
        }
        store.setSensors(sensors);
        store.setResult(ok > 0 ? System.currentTimeMillis() : 0, error);
        render(ctx, false);
    }

    static void render(Context ctx, boolean loading) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, TempWidget.class));
        if (ids.length == 0) return;
        Store store = new Store(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget);
        List<Sensor> sensors = store.sensors();
        boolean configured = store.configured();

        for (int i = 0; i < ROWS.length; i++) {
            if (configured && i < sensors.size()) {
                Sensor s = sensors.get(i);
                v.setViewVisibility(ROWS[i], android.view.View.VISIBLE);
                v.setTextViewText(NAMES[i], s.name);
                v.setTextViewText(TEMPS[i], Double.isNaN(s.temp) ? "–" :
                        String.format(Locale.forLanguageTag("hu"), "%.1f°", s.temp));
                v.setTextViewText(HUMS[i], Double.isNaN(s.hum) ? "" :
                        String.format(Locale.forLanguageTag("hu"), "%.0f%%", s.hum));
            } else {
                v.setViewVisibility(ROWS[i], android.view.View.GONE);
            }
        }

        String footer;
        if (!configured) {
            footer = "Koppints a beállításhoz";
        } else if (loading) {
            footer = "frissítés…";
        } else {
            long t = store.lastOk();
            String time = t > 0 ? new SimpleDateFormat("HH:mm", Locale.US).format(new Date(t)) : "–";
            footer = store.lastError() != null ? "⚠ " + time + " (nem sikerült)" : "↻ " + time;
        }
        v.setTextViewText(R.id.footer, footer);

        Intent click;
        if (configured) {
            click = new Intent(ctx, TempWidget.class).setAction(TempWidget.ACTION_REFRESH);
            v.setOnClickPendingIntent(R.id.root, PendingIntent.getBroadcast(ctx, 0, click,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        } else {
            click = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            v.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(ctx, 0, click,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        mgr.updateAppWidget(ids, v);
    }

    static void schedule(Context ctx) {
        JobScheduler js = ctx.getSystemService(JobScheduler.class);
        if (js == null || js.getPendingJob(JOB_ID) != null) return;
        js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(ctx, RefreshJob.class))
                .setPeriodic(PERIOD_MS)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build());
    }

    static void cancel(Context ctx) {
        JobScheduler js = ctx.getSystemService(JobScheduler.class);
        if (js != null) js.cancel(JOB_ID);
    }

    /** Runs a refresh on a background thread. */
    static void refreshAsync(Context ctx, Runnable done) {
        Context app = ctx.getApplicationContext();
        new Thread(() -> {
            try {
                refresh(app);
            } finally {
                if (done != null) done.run();
            }
        }, "imou-refresh").start();
    }
}
