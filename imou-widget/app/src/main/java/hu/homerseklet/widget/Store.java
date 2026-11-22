package hu.homerseklet.widget;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.ArrayList;
import java.util.List;

import org.json.JSONArray;

/** Settings and last readings, kept only in the app's private storage on the phone. */
final class Store {
    static final String DEFAULT_HOST = "openapi-fk.easy4ip.com";

    private final SharedPreferences p;

    Store(Context c) {
        p = c.getApplicationContext().getSharedPreferences("imou", Context.MODE_PRIVATE);
    }

    String appId() { return p.getString("appId", ""); }
    String appSecret() { return p.getString("appSecret", ""); }
    String host() { return p.getString("host", DEFAULT_HOST); }
    String token() { return p.getString("token", null); }
    long tokenExpiry() { return p.getLong("tokenExp", 0); }
    long lastOk() { return p.getLong("lastOk", 0); }
    String lastError() { return p.getString("lastError", null); }

    boolean configured() {
        return !appId().isEmpty() && !appSecret().isEmpty() && !sensors().isEmpty();
    }

    void setCredentials(String appId, String secret, String host) {
        boolean changed = !appId.equals(appId()) || !secret.equals(appSecret()) || !host.equals(host());
        SharedPreferences.Editor e = p.edit()
                .putString("appId", appId).putString("appSecret", secret).putString("host", host);
        if (changed) e.remove("token").remove("tokenExp");
        e.apply();
    }

    void setHost(String host) { p.edit().putString("host", host).apply(); }

    void setToken(String token, long expiry) {
        p.edit().putString("token", token).putLong("tokenExp", expiry).apply();
    }

    void setResult(long okTime, String error) {
        SharedPreferences.Editor e = p.edit();
        if (okTime > 0) e.putLong("lastOk", okTime);
        if (error == null) e.remove("lastError"); else e.putString("lastError", error);
        e.apply();
    }

    List<Sensor> sensors() {
        List<Sensor> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(p.getString("sensors", "[]"));
            for (int i = 0; i < a.length(); i++) out.add(Sensor.fromJson(a.getJSONObject(i)));
        } catch (Exception ignored) {
        }
        return out;
    }

    void setSensors(List<Sensor> list) {
        JSONArray a = new JSONArray();
        try {
            for (Sensor s : list) a.put(s.toJson());
        } catch (Exception ignored) {
        }
        p.edit().putString("sensors", a.toString()).apply();
    }
}
