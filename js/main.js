/* main.js
 * — Initializes Leaflet
 * — Renders WSC hydrometric point(s) and WSA layers
 */

(async function () {
  const { CONFIG, fetchHydrometricRealtime, fetchArcGISLayerGeoJSON, tryOrNull } = window;

  // 1) Base map
  const map = L.map("map", {
    center: [50.45, -104.61], // Regina
    zoom: 10,
  });

  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);

  const satellite = L.tileLayer(
    "https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    { subdomains: ["mt0","mt1","mt2","mt3"], maxZoom: 20, attribution: "Google" }
  );

  const baseLayers = { "OpenStreetMap": osm, "Satellite": satellite };
  const overlayLayers = {}; // we’ll fill as layers load
  L.control.layers(baseLayers, overlayLayers, { collapsed: true }).addTo(map);

  // Fit to bbox
  const [xmin, ymin, xmax, ymax] = CONFIG.bbox;
  map.fitBounds([[ymin, xmin], [ymax, xmax]]);

  // 2) WSC hydrometric latest values → marker(s)
  // (We’ll place a simple marker at a known coord for 05JF003)
  // If you want to look up station coords programmatically, we can add a discovery call later.
  const wascanaCoord = [50.445, -104.617]; // rough Wascana Creek near Regina
  const hydrometricLayer = L.layerGroup().addTo(map);
  overlayLayers["Hydrometric (05JF003)"] = hydrometricLayer;

  for (const stn of CONFIG.wscStations) {
    const rt = await tryOrNull(fetchHydrometricRealtime(stn));
    if (!rt) continue;

    // Build a small HTML popup of latest params
    const rows = rt.latest
      .map(r => `<tr><td>${r.PARAMETER}</td><td>${r.VALUE} ${r.UNIT}</td><td>${new Date(r.DATE).toLocaleString()}</td></tr>`)
      .join("");
    const html = `
      <div style="min-width:220px">
        <h4 style="margin:0 0 6px">WSC ${stn}</h4>
        <table style="width:100%; font-size:12px">
          <thead><tr><th>Param</th><th>Value</th><th>Time</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <small>Source: ECCC (real-time)</small>
      </div>`;

    L.marker(wascanaCoord, { title: `WSC ${stn}` })
      .bindPopup(html)
      .addTo(hydrometricLayer);
  }

  // 3) WSA layers (FeatureServer → GeoJSON → Leaflet)
  const styleLine = { weight: 2 };
  const stylePolygon = { weight: 1, fillOpacity: 0.15 };
  const pointStyle = feature => ({
    radius: 6,
    color: "#333",
    weight: 1,
    fillColor: "#2E86AB",
    fillOpacity: 0.8,
  });

  for (const url of CONFIG.wsaLayers) {
    if (!url) continue;
    const geojson = await tryOrNull(fetchArcGISLayerGeoJSON(url, CONFIG.bbox));
    if (!geojson || !geojson.features) continue;

    // Infer geometry type for basic styling
    const gType = (geojson.features[0]?.geometry?.type || "").toLowerCase();
    const layerName = url.split("/").slice(-3).join("/"); // quick label

    const layer = L.geoJSON(geojson, {
      pointToLayer: (feat, latlng) => L.circleMarker(latlng, pointStyle(feat)),
      style: feat => {
        const type = (feat.geometry?.type || "").toLowerCase();
        if (type.includes("line")) return styleLine;
        if (type.includes("polygon")) return stylePolygon;
        return {};
      },
      onEachFeature: (feat, lyr) => {
        const props = feat.properties || {};
        const rows = Object.entries(props)
          .slice(0, 20) // avoid huge popups; adjust if needed
          .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
          .join("");
        const html = `<div style="min-width:220px"><strong>${layerName}</strong><table style="width:100%;font-size:12px">${rows}</table></div>`;
        lyr.bindPopup(html);
      }
    }).addTo(map);

    overlayLayers[layerName] = layer;
  }

  // 4) Simple legend
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = `
      <div><strong>Regina Water (Open Data)</strong></div>
      <div>• Hydrometric values from ECCC real-time OGC</div>
      <div>• Stations / dams / flood polygons from WSA GeoHub</div>
    `;
    return div;
  };
  legend.addTo(map);

})();
