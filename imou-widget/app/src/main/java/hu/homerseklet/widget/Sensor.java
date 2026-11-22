package hu.homerseklet.widget;

import org.json.JSONObject;

final class Sensor {
    final String id;
    final String productId;
    String name;
    final String model;
    double temp = Double.NaN;
    double hum = Double.NaN;

    Sensor(String id, String productId, String name, String model) {
        this.id = id;
        this.productId = productId;
        this.name = name;
        this.model = model;
    }

    JSONObject toJson() throws Exception {
        return new JSONObject().put("id", id).put("productId", productId).put("name", name)
                .put("model", model)
                .put("temp", Double.isNaN(temp) ? JSONObject.NULL : temp)
                .put("hum", Double.isNaN(hum) ? JSONObject.NULL : hum);
    }

    static Sensor fromJson(JSONObject o) {
        Sensor s = new Sensor(o.optString("id"), o.optString("productId"), o.optString("name"),
                o.optString("model"));
        s.temp = o.isNull("temp") ? Double.NaN : o.optDouble("temp", Double.NaN);
        s.hum = o.isNull("hum") ? Double.NaN : o.optDouble("hum", Double.NaN);
        return s;
    }
}
