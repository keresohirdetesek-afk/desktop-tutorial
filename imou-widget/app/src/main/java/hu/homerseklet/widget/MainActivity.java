package hu.homerseklet.widget;

import android.app.Activity;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Setup screen: Imou developer keys, sensor search and naming. */
public class MainActivity extends Activity {

    private static final String[][] REGIONS = {
            { "Európa", "openapi-fk.easy4ip.com" },
            { "Ázsia / egyéb", "openapi.easy4ip.com" },
            { "Amerika", "openapi-or.easy4ip.com" },
    };

    private Store store;
    private EditText appId, appSecret;
    private RadioGroup region;
    private TextView status;
    private LinearLayout sensorBox;
    private Button searchBtn, saveBtn;
    private final List<Row> rows = new ArrayList<>();

    private static final class Row {
        final Sensor sensor;
        final CheckBox check;
        final EditText name;
        Row(Sensor s, CheckBox c, EditText n) { sensor = s; check = c; name = n; }
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v,
                getResources().getDisplayMetrics());
    }

    private TextView text(String s, int sp, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        if (bold) t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        t.setPadding(0, dp(12), 0, dp(4));
        return t;
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        store = new Store(this);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(24), dp(20), dp(32));

        root.addView(text("Imou hőmérő widget", 24, true));
        root.addView(text("1. Az open.imoulife.com oldalon jelentkezz be (ugyanazzal a fiókkal, "
                + "mint az Imou Life appban) → Console → My App → Create App. Az ott látható "
                + "AppId-t és AppSecret-et másold ide. FIGYELEM: ide NEM az e-mail címed és a "
                + "jelszavad kell!", 14, false));

        appId = new EditText(this);
        appId.setHint("AppId (pl. lc1a2b3c4d…)");
        appId.setSingleLine();
        appId.setText(store.appId());
        root.addView(appId);

        appSecret = new EditText(this);
        appSecret.setHint("AppSecret (hosszú kód, nem a jelszó)");
        appSecret.setSingleLine();
        appSecret.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        appSecret.setText(store.appSecret());
        root.addView(appSecret);

        root.addView(text("Régió (ahol az Imou-fiókod van):", 14, false));
        region = new RadioGroup(this);
        String host = store.host();
        int checked = 0;
        for (int i = 0; i < REGIONS.length; i++) {
            RadioButton rb = new RadioButton(this);
            rb.setId(View.generateViewId());
            rb.setText(REGIONS[i][0]);
            rb.setTag(REGIONS[i][1]);
            region.addView(rb);
            if (REGIONS[i][1].equals(host)) checked = i;
        }
        ((RadioButton) region.getChildAt(checked)).setChecked(true);
        root.addView(region);

        root.addView(text("2. Keresd meg a szenzorokat:", 14, false));
        searchBtn = new Button(this);
        searchBtn.setText("Szenzorok keresése");
        searchBtn.setOnClickListener(v -> search());
        root.addView(searchBtn);

        status = text("", 14, false);
        root.addView(status);

        sensorBox = new LinearLayout(this);
        sensorBox.setOrientation(LinearLayout.VERTICAL);
        root.addView(sensorBox);

        saveBtn = new Button(this);
        saveBtn.setText("Mentés és widget frissítése");
        saveBtn.setOnClickListener(v -> save());
        root.addView(saveBtn);

        root.addView(text("3. Tedd ki a widgetet: nyomd hosszan a kezdőképernyőt → Widgetek → "
                + "„Imou hőmérő”. 15 percenként magától frissül, koppintásra azonnal.", 14, false));

        ScrollView sv = new ScrollView(this);
        sv.addView(root);
        setContentView(sv);

        // Show the sensors already saved.
        List<Sensor> saved = store.sensors();
        if (!saved.isEmpty()) {
            showSensors(saved, saved);
            status.setText(lastStatus());
        }
    }

    private String lastStatus() {
        long t = store.lastOk();
        String s = t > 0 ? "Utolsó sikeres frissítés: "
                + new java.text.SimpleDateFormat("yyyy.MM.dd HH:mm", Locale.US).format(new java.util.Date(t))
                : "Még nem volt sikeres frissítés.";
        if (store.lastError() != null) s += "\nUtolsó hiba: " + store.lastError();
        return s;
    }

    private String selectedHost() {
        View v = region.findViewById(region.getCheckedRadioButtonId());
        return v != null ? (String) v.getTag() : Store.DEFAULT_HOST;
    }

    private void storeCredentials() {
        store.setCredentials(appId.getText().toString().trim(),
                appSecret.getText().toString().trim(), selectedHost());
    }

    private void search() {
        storeCredentials();
        if (store.appId().isEmpty() || store.appSecret().isEmpty()) {
            status.setText("Add meg az AppId-t és az AppSecret-et.");
            return;
        }
        if (store.appId().contains("@")) {
            status.setText("Az AppId mezőbe az e-mail címed került. Ide az open.imoulife.com "
                    + "oldalon (Console → My App) kapott AppId kell, a másik mezőbe pedig az "
                    + "AppSecret – nem a jelszavad.");
            return;
        }
        searchBtn.setEnabled(false);
        status.setText("Keresés…");
        List<Sensor> saved = store.sensors();
        new Thread(() -> {
            String msg;
            List<Sensor> found = new ArrayList<>();
            try {
                ImouApi api = new ImouApi(store);
                for (Sensor s : api.listIotDevices()) {
                    try {
                        double[] v = api.readSensor(s);
                        if (!Double.isNaN(v[0])) {
                            s.temp = v[0];
                            s.hum = v[1];
                            found.add(s);
                        }
                    } catch (Exception ignored) {
                        // Not a thermometer (plug, gateway, door sensor…).
                    }
                }
                msg = found.isEmpty()
                        ? "Nem találtam hőmérőt ezen a fiókon. Ugyanazzal a fiókkal regisztráltál, "
                        + "mint az Imou Life appban?"
                        : found.size() + " hőmérőt találtam. Pipáld ki, amit a widgeten látni szeretnél, "
                        + "és adhatsz nekik nevet:";
            } catch (ImouApi.ApiException e) {
                if ("SN1001".equals(e.code) || "SN1004".equals(e.code)) {
                    msg = "Hibás AppId vagy AppSecret (" + e.code + "). Az open.imoulife.com → Console → "
                            + "My App oldalról másold be őket, ne az e-mail címet és a jelszót.";
                } else {
                    msg = "Hiba: " + e.getMessage() + "\nPróbálj másik régiót.";
                }
            } catch (Exception e) {
                msg = "Nem sikerült kapcsolódni: " + e.getMessage() + "\nPróbálj másik régiót.";
            }
            final String m = msg;
            runOnUiThread(() -> {
                searchBtn.setEnabled(true);
                status.setText(m);
                if (!found.isEmpty()) showSensors(found, saved);
            });
        }).start();
    }

    private void showSensors(List<Sensor> list, List<Sensor> saved) {
        sensorBox.removeAllViews();
        rows.clear();
        for (Sensor s : list) {
            Sensor prev = null;
            for (Sensor x : saved) if (x.id.equals(s.id)) prev = x;
            LinearLayout line = new LinearLayout(this);
            line.setOrientation(LinearLayout.HORIZONTAL);
            line.setPadding(0, dp(4), 0, dp(4));

            CheckBox cb = new CheckBox(this);
            cb.setChecked(saved.isEmpty() || prev != null);
            line.addView(cb);

            EditText name = new EditText(this);
            name.setSingleLine();
            name.setText(prev != null ? prev.name : s.name);
            line.addView(name, new LinearLayout.LayoutParams(0,
                    LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

            TextView val = new TextView(this);
            val.setText(Double.isNaN(s.temp) ? "" :
                    String.format(Locale.forLanguageTag("hu"), "%.1f °C", s.temp));
            val.setPadding(dp(8), 0, 0, 0);
            line.addView(val);

            sensorBox.addView(line);
            rows.add(new Row(s, cb, name));
        }
    }

    private void save() {
        storeCredentials();
        List<Sensor> chosen = new ArrayList<>();
        for (Row r : rows) {
            if (!r.check.isChecked()) continue;
            String n = r.name.getText().toString().trim();
            if (!n.isEmpty()) r.sensor.name = n;
            chosen.add(r.sensor);
            if (chosen.size() == 4) break;
        }
        if (chosen.isEmpty()) {
            status.setText("Előbb keresd meg és pipáld ki a szenzorokat.");
            return;
        }
        store.setSensors(chosen);
        Updater.schedule(this);
        saveBtn.setEnabled(false);
        status.setText("Mentve, frissítés…");
        Updater.refreshAsync(this, () -> runOnUiThread(() -> {
            saveBtn.setEnabled(true);
            status.setText("Mentve. " + lastStatus());
        }));
    }
}
