/* Térkép (Leaflet). A könyvtár a repóban van, nem CDN-ről töltjük.
   A térképcsempék viszont az OpenStreetMap szervereiről érkeznek — ez az
   egyetlen külső kérés, amit az app magától indít, és kikapcsolható.   */

const L = window.L;

export const CSEMPE = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attrib: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> közreműködők',
  maxZoom: 19,
};

// Magyarország közepe, ha még nincs helyzet
const KEZDO = [47.1625, 19.5033];

const SZIN = {
  ok: '#3ddc84',
  hatar: '#ffbe4d',
  birsag: '#ff5f56',
  semleges: '#4da3ff',
};

export class Terkep {
  constructor(elem, { onTap } = {}) {
    L.Icon.Default.imagePath = 'vendor/leaflet/images/';
    this.map = L.map(elem, { zoomControl: true, attributionControl: true }).setView(KEZDO, 7);
    this.csempeReteg = null;
    this.csempekBe();

    this.nyomvonal = L.layerGroup().addTo(this.map);
    this.jelolok = L.layerGroup().addTo(this.map);
    this.pozicio = L.layerGroup().addTo(this.map);
    this.kovet = true;

    this.map.on('click', (e) => onTap?.({ lat: e.latlng.lat, lon: e.latlng.lng }));
    this.map.on('dragstart', () => { this.kovet = false; });
  }

  csempekBe() {
    if (this.csempeReteg) return;
    this.csempeReteg = L.tileLayer(CSEMPE.url, {
      maxZoom: CSEMPE.maxZoom,
      attribution: CSEMPE.attrib,
    }).addTo(this.map);
  }

  csempekKi() {
    if (!this.csempeReteg) return;
    this.map.removeLayer(this.csempeReteg);
    this.csempeReteg = null;
  }

  frissit() {
    this.map.invalidateSize();
  }

  /** Szakasz eleje/vége jelölő + a kiváltási kör. */
  kapukRajz(start, end, sugar) {
    this.jelolok.clearLayers();
    const rajz = (pont, cimke, szin) => {
      if (!pont) return;
      L.circle([pont.lat, pont.lon], {
        radius: sugar,
        color: szin,
        weight: 1,
        fillOpacity: 0.12,
      }).addTo(this.jelolok);
      L.marker([pont.lat, pont.lon], { title: cimke })
        .bindTooltip(cimke, { permanent: false })
        .addTo(this.jelolok);
    };
    rajz(start, 'Szakasz eleje', SZIN.ok);
    rajz(end, 'Szakasz vége', SZIN.birsag);
  }

  /** A megtett nyomvonal, szakaszonként a bírság szerinti színnel. */
  nyomvonalRajz(pontok, szakaszok) {
    this.nyomvonal.clearLayers();
    if (pontok.length < 2) return;

    if (!szakaszok || szakaszok.length === 0) {
      L.polyline(pontok.map((p) => [p.lat, p.lon]), {
        color: SZIN.semleges,
        weight: 5,
        opacity: 0.9,
      }).addTo(this.nyomvonal);
      return;
    }

    for (const sz of szakaszok) {
      const resz = pontok.slice(sz.i0, sz.i1 + 1).map((p) => [p.lat, p.lon]);
      if (resz.length < 2) continue;
      const e = sz.ertekeles;
      const szin = !e ? SZIN.semleges : e.birsagos ? SZIN.birsag : e.tartalek <= 5 ? SZIN.hatar : SZIN.ok;
      L.polyline(resz, { color: szin, weight: 6, opacity: 0.9 })
        .bindTooltip(
          `${sz.limit} km/h — ${sz.cimke}${e ? `<br>átlag: ${e.mert.toFixed(1).replace('.', ',')} km/h` : ''}`,
          { sticky: true }
        )
        .addTo(this.nyomvonal);
    }
  }

  /** Aktuális helyzet + pontossági kör. */
  pozicioRajz(p) {
    this.pozicio.clearLayers();
    if (!p) return;
    L.circle([p.lat, p.lon], {
      radius: p.acc || 10,
      color: SZIN.semleges,
      weight: 1,
      fillOpacity: 0.1,
    }).addTo(this.pozicio);
    L.circleMarker([p.lat, p.lon], {
      radius: 7,
      color: '#fff',
      weight: 2,
      fillColor: SZIN.semleges,
      fillOpacity: 1,
    }).addTo(this.pozicio);
    // követéskor csak középre húzunk: a nagyítás a felhasználóé marad
    if (this.kovet) this.map.panTo([p.lat, p.lon], { animate: true });
  }

  kovetesVissza() {
    this.kovet = true;
  }

  /* Nyitáskor kb. 150 km-es kivágat: ekkora területen már látszik a
     szakasz mindkét vége, így könnyű kijelölni a kapukat.            */
  kezdoNezet(p, atmeroKm = 150) {
    if (!p) return;
    const szelesseg = this.map.getSize().x || 390;
    const mPerPx = (atmeroKm * 1000) / szelesseg;
    const foldMPerPx = (156543.03392 * Math.cos((p.lat * Math.PI) / 180));
    const zoom = Math.round(Math.log2(foldMPerPx / mPerPx));
    this.map.setView([p.lat, p.lon], Math.max(3, Math.min(19, zoom)));
    this.kovet = false;
  }

  illeszt(pontok) {
    const lista = pontok.filter(Boolean).map((p) => [p.lat, p.lon]);
    if (lista.length === 0) return;
    if (lista.length === 1) this.map.setView(lista[0], 15);
    else this.map.fitBounds(L.latLngBounds(lista).pad(0.2));
    this.kovet = false;
  }
}
