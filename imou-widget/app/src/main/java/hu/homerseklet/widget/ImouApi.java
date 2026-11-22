package hu.homerseklet.widget;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Minimal Imou Open API client (open.imoulife.com).
 * Signing and endpoints follow the official pyimouapi library.
 */
final class ImouApi {

    /** Temperature and humidity property refs of the ZTM1 sensor (thing model). */
    static final String REF_TEMP = "16000";
    static final String REF_HUM = "16100";

    static final class ApiException extends Exception {
        final String code;
        ApiException(String code, String msg) {
            super(code + ": " + msg);
            this.code = code;
        }
    }

    private final Store store;

    ImouApi(Store store) {
        this.store = store;
    }

    private static String md5(String s) throws Exception {
        byte[] d = MessageDigest.getInstance("MD5").digest(s.getBytes(StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        for (byte b : d) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private static String nonce() {
        byte[] b = new byte[16];
        new SecureRandom().nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    private JSONObject post(String endpoint, JSONObject params) throws Exception {
        long time = System.currentTimeMillis() / 1000L;
        String nonce = nonce();
        JSONObject system = new JSONObject()
                .put("ver", "1.0")
                .put("sign", md5("time:" + time + ",nonce:" + nonce + ",appSecret:" + store.appSecret()))
                .put("appId", store.appId())
                .put("time", time)
                .put("nonce", nonce);
        JSONObject body = new JSONObject()
                .put("system", system)
                .put("params", params)
                .put("id", UUID.randomUUID().toString());

        URL url = new URL("https://" + store.host() + endpoint);
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        try {
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream os = c.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            int status = c.getResponseCode();
            InputStream is = status >= 400 ? c.getErrorStream() : c.getInputStream();
            String text = readAll(is);
            if (status != 200) throw new ApiException("HTTP" + status, "a szerver hibát adott");
            JSONObject result = new JSONObject(text).getJSONObject("result");
            String code = result.optString("code");
            if (!"0".equals(code)) throw new ApiException(code, result.optString("msg"));
            JSONObject data = result.optJSONObject("data");
            return data != null ? data : new JSONObject();
        } finally {
            c.disconnect();
        }
    }

    private static String readAll(InputStream is) throws Exception {
        if (is == null) return "";
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
        is.close();
        return bos.toString("UTF-8");
    }

    private String token(boolean forceNew) throws Exception {
        if (!forceNew && store.token() != null && System.currentTimeMillis() < store.tokenExpiry()) {
            return store.token();
        }
        JSONObject data = post("/openapi/accessToken", new JSONObject());
        String domain = data.optString("currentDomain", "");
        if (!domain.isEmpty()) {
            domain = domain.replaceFirst("^https?://", "").replaceAll("/.*$", "");
            if (!domain.isEmpty()) store.setHost(domain);
        }
        long expSec = data.optLong("expireTime", 3 * 24 * 3600);
        // Keep a safety margin of 10 minutes.
        store.setToken(data.getString("accessToken"),
                System.currentTimeMillis() + Math.max(60, expSec - 600) * 1000L);
        return store.token();
    }

    /** Calls an endpoint with the token, refreshing it once if it expired. */
    private JSONObject call(String endpoint, JSONObject params) throws Exception {
        try {
            return post(endpoint, new JSONObject(params.toString()).put("token", token(false)));
        } catch (ApiException e) {
            if (!"TK1002".equals(e.code) && !"TK1001".equals(e.code)) throw e;
            return post(endpoint, new JSONObject(params.toString()).put("token", token(true)));
        }
    }

    /** All IoT devices of the account (the ones that have a productId). */
    List<Sensor> listIotDevices() throws Exception {
        List<Sensor> out = new ArrayList<>();
        for (int page = 1; page <= 20; page++) {
            JSONObject data = call("/openapi/listDeviceDetailsByPage",
                    new JSONObject().put("page", page).put("pageSize", 50));
            JSONArray list = data.optJSONArray("deviceList");
            if (list == null || list.length() == 0) break;
            for (int i = 0; i < list.length(); i++) {
                JSONObject d = list.getJSONObject(i);
                String productId = d.optString("productId", "");
                if (productId.isEmpty()) continue;
                String id = d.getString("deviceId");
                String pDev = d.optString("parentDeviceId", "");
                String pProd = d.optString("parentProductId", "");
                // An accessory paired to a gateway is addressed through its parent's ids.
                if (!pDev.isEmpty() && !pProd.isEmpty()) id = id + "_" + pDev + "_" + pProd;
                out.add(new Sensor(id, productId, d.optString("deviceName", id),
                        d.optString("deviceModel", "")));
            }
            if (list.length() < 50) break;
        }
        return out;
    }

    /** Reads temperature and humidity. Missing values come back as NaN. */
    double[] readSensor(Sensor s) throws Exception {
        JSONObject dev = new JSONObject()
                .put("deviceId", s.id)
                .put("channelId", JSONObject.NULL)
                .put("productId", s.productId)
                .put("properties", new JSONArray().put(REF_TEMP).put(REF_HUM));
        JSONObject data = call("/openapi/getIotDeviceProperties",
                new JSONObject().put("deviceList", new JSONArray().put(dev)));
        JSONArray list = data.optJSONArray("deviceList");
        JSONObject props = list != null && list.length() > 0
                ? list.getJSONObject(0).optJSONObject("properties") : null;
        return new double[] { num(props, REF_TEMP), num(props, REF_HUM) };
    }

    private static double num(JSONObject props, String key) {
        if (props == null || !props.has(key) || props.isNull(key)) return Double.NaN;
        try {
            return Double.parseDouble(props.get(key).toString());
        } catch (Exception e) {
            return Double.NaN;
        }
    }
}
