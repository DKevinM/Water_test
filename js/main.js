/* main.js
 * Leaflet init + render hydrometric + optional WSA layers
 */
if (typeof L === "undefined") {
  alert("Leaflet failed to load. Ensure leaflet.js is included BEFORE main.js (and no SRI blocking).");
  throw new Error("Leaflet not loaded");
}

(async function () {
  const {
    CONFIG,
    fetchHydrometricStationMeta,
    fetchHydrometricRealtimeLatest,
    fetchArcGISLayerGeoJSON,
    tryOrNull,
    logDebug,
  } = window;

  // Add a tiny debug panel (top-left)
  const dbg = document.createElement("pre");
  dbg.id = "debug";
  dbg.style.cssText = `
    position:absolute; top:10px; left:10px; z-index:9999;
    background:#ffffffcc; padding:6px 8px; margin:0; border-radius:6px;
    font:12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; max-width:40vw;
    max-height:30vh; overflow:auto;
  `;
  document.body.appendChild(dbg);
  logDebug("✅ main.js started");

  // 1) Base map
  const map = L.map("map", {
    center: [50.45, -104.61], // Regina
    zoom: 11,
  });

  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);

  // (Optional) comment out satellite for now; some corporate networks block google subdomains
  /*
  const satellite = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    subdomains: ["mt0","mt1","mt2","mt3"], maxZoom: 20, attribution: "Google"
  });
  */

  const baseLayers = { "OpenStreetMap": osm /*, "Satellite": satellite*/ };
  const overlayLayers = {};
  L.control.layers(baseLayers, overlayLayers, { collapsed: true }).addTo(map);

  // Fit to bbox and draw it so we can SEE something
  const [xmin, ymin, xmax, ymax] = CONFIG.bbox;
  map.fitBounds([[ymin, xmin], [ymax, xmax]]);
  const bboxRect = L.rectangle([[ymin, xmin], [ymax, xmax]], { color: "#d33", weight: 1, fillOpacity: 0.03 }).addTo(map);

  // Add a test marker in downtown Regina so we always see something
  const testMarker = L.marker([50.445, -104.618], { title: "Regina (test marker)" })
    .bindPopup("If you can see this, Leaflet is rendering OK.")
    .addTo(map);

  // 2) Hydrometric stations: plot from real coordinates and latest values
  const hydroLayer = L.layerGroup().addTo(map);
  overlayLayers["Hydrometric (latest)"] = hydroLayer;

  for (const stn of CONFIG.wscStations) {
    logDebug(`⏳ Loading station ${stn} meta…`);
    const meta = await tryOrNull(fetchHydrometricStationMeta(stn), `station meta ${stn}:`);
    if (!meta) continue;

    logDebug(`⏳ Loading station ${stn} realtime…`);
    const latest = await tryOrNull(fetchHydrometricRealtimeLatest(stn), `realtime ${stn}:`);

    // Build popup
    let table = "<em>No recent values</em>";
    if (latest && latest.length) {
      const rows = latest
        .map(r => `<tr><td>${r.PARAMETER}</td><td>${r.VALUE ?? ""} ${r.UNIT ?? ""}</td><td>${new Date(r.DATE).toLocaleString()}</td></tr>`)
        .join("");
      table = `<table style="width:100%; font-size:12px">
        <thead><tr><th>Param</th><th>Value</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    const html = `
      <div style="min-width:240px">
        <h4 style="margin:0 0 6px">WSC ${stn}</h4>
        ${table}
        <small>Source: ECCC OGC (hydrometric-stations / hydrometric-realtime)</small>
      </div>`;

    L.marker([meta.lat, meta.lon], { title: `WSC ${stn}` })
      .bindPopup(html)
      .addTo(hydroLayer);
  }

  // 3) Optional WSA layers (if/when you add URLs to CONFIG.wsaLayers)
  for (const url of CONFIG.wsaLayers) {
    if (!url) continue;
    logDebug(`⏳ Loading WSA layer: ${url}`);
    const geojson = await tryOrNull(fetchArcGISLayerGeoJSON(url, CONFIG.bbox), `WSA layer ${url}:`);
    if (!geojson || !geojson.features || !geojson.features.length) {
      logDebug(`(no features) ${url}`);
      continue;
    }
    const layerName = url.split("/").slice(-3).join("/");
    const layer = L.geoJSON(geojson, {
      pointToLayer: (_, latlng) => L.circleMarker(latlng, {
        radius: 6, color: "#333", weight: 1, fillColor: "#2E86AB", fillOpacity: 0.85
      }),
      style: f => {
        const t = (f.geometry?.type || "").toLowerCase();
        if (t.includes("line")) return { weight: 2 };
        if (t.includes("polygon")) return { weight: 1, fillOpacity: 0.15 };
        return {};
      },
      onEachFeature: (feat, lyr) => {
        const rows = Object.entries(feat.properties || {})
          .slice(0, 20)
          .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
          .join("");
        lyr.bindPopup(`<div style="min-width:240px"><strong>${layerName}</strong><table style="width:100%;font-size:12px">${rows}</table></div>`);
      }
    }).addTo(map);
    overlayLayers[layerName] = layer;
  }

  logDebug("✅ Finished loading");
})();
