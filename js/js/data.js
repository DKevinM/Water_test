/* data.js
 * — Endpoints + fetch helpers
 * — Edit CONFIG only; main.js uses these
 */

// 1) CONFIG — tweak bbox and which layers to load
const CONFIG = {
  // Rough bbox covering Regina / Lower Qu’Appelle (xmin, ymin, xmax, ymax)
  bbox: [-105.20, 50.20, -104.20, 50.80],

  // Water Survey of Canada station(s) to show (Wascana Creek at Regina)
  wscStations: ["05JF003"],

  // ArcGIS FeatureServer layers from WSA GeoHub (paste full layer URLs)
  // How to find: WSA dataset page → Data → API → “View Data Source” (FeatureServer)
  // Example placeholders — replace with actual FeatureServer layer URLs you want:
  wsaLayers: [
    // Primary Water Quality Monitoring Stations (FeatureServer layer URL)
    // "https://<host>/arcgis/rest/services/.../FeatureServer/0",
    // Hydrometric Gauging Stations
    // "https://<host>/arcgis/rest/services/.../FeatureServer/0",
    // Dams
    // "https://<host>/arcgis/rest/services/.../FeatureServer/0",
    // Reservoirs
    // "https://<host>/arcgis/rest/services/.../FeatureServer/0",
    // Floodway polygons
    // "https://<host>/arcgis/rest/services/.../FeatureServer/0",
  ],
};

// 2) WATER SURVEY OF CANADA (ECCC OGC API) — real-time hydrometric items
async function fetchHydrometricRealtime(stationNumber) {
  const base = "https://api.weather.gc.ca/collections/hydrometric-realtime/items";
  const url = new URL(base);
  url.searchParams.set("STATION_NUMBER", stationNumber);
  url.searchParams.set("limit", "5000");
  url.searchParams.set("f", "json");

  const resp = await fetch(url.toString(), { cache: "no-store" });
  if (!resp.ok) throw new Error(`WSC fetch failed: ${resp.status}`);
  const json = await resp.json();

  // Flatten features → latest per-parameter
  const rows = (json.features || []).map(f => f.properties || {});
  // Keep the most recent value per parameter
  const byParam = new Map();
  for (const r of rows) {
    const key = r.PARAMETER;
    if (!byParam.has(key)) { byParam.set(key, r); continue; }
    const prev = byParam.get(key);
    if (new Date(r.DATE) > new Date(prev.DATE)) byParam.set(key, r);
  }
  return {
    station: stationNumber,
    latest: [...byParam.values()],
  };
}

// 3) ArcGIS FeatureServer → GeoJSON clipped by bbox (server-side)
async function fetchArcGISLayerGeoJSON(featureServerUrl, bbox) {
  const url = new URL(`${featureServerUrl.replace(/\/+$/, "")}/query`);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", "*");
  url.searchParams.set("geometry", bbox.join(",")); // xmin,ymin,xmax,ymax
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("f", "geojson");

  const resp = await fetch(url.toString(), { cache: "no-store" });
  if (!resp.ok) throw new Error(`ArcGIS fetch failed: ${resp.status}`);
  return resp.json(); // GeoJSON FeatureCollection
}

// 4) Tiny utility: guard async errors without crashing the app
async function tryOrNull(promise) {
  try { return await promise; } catch(e) { console.warn(e); return null; }
}

// Exports (global)
window.CONFIG = CONFIG;
window.fetchHydrometricRealtime = fetchHydrometricRealtime;
window.fetchArcGISLayerGeoJSON = fetchArcGISLayerGeoJSON;
window.tryOrNull = tryOrNull;
