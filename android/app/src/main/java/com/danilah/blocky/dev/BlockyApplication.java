package com.danilah.blocky.dev;

import android.app.Application;
import io.appmetrica.analytics.AppMetrica;
import io.appmetrica.analytics.AppMetricaConfig;

public class BlockyApplication extends Application {
  static boolean analyticsEnabled;
  @Override public void onCreate() {
    super.onCreate();
    String key = getString(R.string.appmetrica_api_key);
    if (key.isEmpty()) return;
    try {
      AppMetrica.activate(this, AppMetricaConfig.newConfigBuilder(key)
        .withLocationTracking(false).withAdvIdentifiersTracking(false).build());
      analyticsEnabled = true;
    } catch (RuntimeException ignored) { analyticsEnabled = false; }
  }
}
