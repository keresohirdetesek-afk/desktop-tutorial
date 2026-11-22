package hu.homerseklet.widget;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Refreshes the widget every 15 minutes (Android's minimum for periodic jobs). */
public class RefreshJob extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        Updater.refreshAsync(this, () -> jobFinished(params, false));
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
