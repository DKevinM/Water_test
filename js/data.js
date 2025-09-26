/* data.js
 * Config + fetch helpers for ECCC OGC + ArcGIS
 */

const CONFIG = {
  // xmin, ymin, xmax, ymax (WGS84)
  bbox: [-105.20, 50.20, -104.20, 50.80],
  // WSC stations to plot; start with Wascana Creek at Regina + another nearby
  wscStations: ["05JF003", "05JF008"],

  // Optional: add WSA FeatureServer layer URLs here later
  wsaLayers: [
    // e.g. "https://<host>/arcgis/rest/services/.../FeatureServer/0"
  ],
};

const OGC_BASE = "https://api.weather.gc.ca/collections";

/** Fetch station metadata (geometry + props) for a station number */
async function fetchHydrometricStationMeta(stationNumber) {
  // Try CQL filter first (OGC API Features standard)
  const tryCql = async () => {
    const url = new URL(`${OGC_BASE}/hydrometric-stations/items`);
    url.searchParams.set("filter", `STATION_NUMBER='${stationNumber}'`);
    url.searchParams.set("filter-lang", "cql-text");
    url.searchParams.set("f", "json");
    url.searchParams.set("limit", "1");
    const r = await fetch(url.toString(), { cache: "no-store" });
    if (!r.ok) throw new Error(`stations meta ${stationNumber}: ${r.status}`);
    return r.json();
  };

  // Fallback: no filter (grab 1 feature that matches locally if server ignores filter)
  const tryUnfiltered = async () => {
    const url = new URL(`${OGC_BASE}/hydrometric-stations/items`);
    url.searchParams.set("f", "json");
    url.searchParams.set("limit", "1000");
    const r = await fetch(url.toString(), { cache: "no-store" });
    if (!r.ok) throw new Error(`stations meta (fallback) ${stationNumber}: ${r.status}`);
    return r.json();
  };

  let json = await tryCql().catch(async e => {
    logDebug(`⚠️ stations CQL failed: ${e.message || e}`);
    return tryUnfiltered();
  });

  // find the station
  const feats = json.features || [];
  logDebug(`stations returned: ${feats.length}`);
  const f = feats.find(x => (x.properties?.STATION_NUMBER || "").toString() === stationNumber) || feats[0];

  if (!f || !f.geometry || !Array.isArray(f.geometry.coordinates)) {
    throw new Error(`No geometry for station ${stationNumber}`);
  }
  const [lon, lat] = f.geometry.coordinates;
  return { lat, lon, props: f.properties || {} };
}

/** Fetch latest realtime values per parameter for a station */
async function fetchHydrometricRealtimeLatest(stationNumber) {
  // CQL filter first
  const tryCql = async () => {
    const url = new URL(`${OGC_BASE}/hydrometric-realtime/items`);
    url.searchParams.set("filter", `STATION_NUMBER='${stationNumber}'`);
    url.searchParams.set("filter-lang", "cql-text");
    url.searchParams.set("f", "json");
    url.searchParams.set("limit", "5000");
    const r = await fetch(url.toString(), { cache: "no-store" });
    if (!r.ok) throw new Error(`realtime ${stationNumber}: ${r.status}`);
    return r.json();
  };

  // Fallback: unfiltered then local filter
  const tryUnfiltered = async () => {
    const url = new URL(`${OGC_BASE}/hydrometric-realtime/items`);
    url.searchParams.set("f", "json");
    url.searchParams.set("limit", "5000");
    const r = await fetch(url.toString(), { cache: "no-store" });
    if (!r.ok) throw new Error(`realtime (fallback) ${stationNumber}: ${r.status}`);
    return r.json();
  };

  let json = await tryCql().catch(async e => {
    logDebug(`⚠️ realtime CQL failed: ${e.message || e}`);
    return tryUnfiltered();
  });

  // rows, optionally filtered locally if server ignored filter
  let rows = (json.features || []).map(f => f.properties || {});
  if (rows.length && !rows[0].STATION_NUMBER) {
    // if station number isn’t present (unlikely), keep all
    logDebug(`realtime returned: ${rows.length} records`);
  } else {
    rows = rows.filter(r => (r.STATION_NUMBER || "").toString() === stationNumber);
    logDebug(`realtime returned: ${rows.length} records for ${stationNumber}`);
  }

  // keep most recent per parameter
  const byParam = new Map();
  for (const row of rows) {
    const key = row.PARAMETER;
    const prev = byParam.get(key);
    if (!prev || new Date(row.DATE) > new Date(prev.DATE)) byParam.set(key, row);
  }
  return Array.from(byParam.values());
}


/** ArcGIS FeatureServer → GeoJSON clipped by bbox */
async function fetchArcGISLayerGeoJSON(featureServerUrl, bbox) {
  const url = new URL(`${featureServerUrl.replace(/\/+$/, "")}/query`);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", "*");
  url.searchParams.set("geometry", bbox.join(","));
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("f", "geojson");

  const r = await fetch(url.toString(), { cache: "no-store" });
  if (!r.ok) throw new Error(`ArcGIS layer: ${r.status}`);
  return r.json();
}

function logDebug(msg) {
  const el = document.getElementById("debug");
  if (el) el.textContent += `${msg}\n`;
  console.log(msg);
}

async function tryOrNull(promise, label = "") {
  try {
    return await promise;
  } catch (e) {
    logDebug(`⚠️ ${label} ${e.message || e}`);
    return null;
  }
}

window.CONFIG = CONFIG;
window.fetchHydrometricStationMeta = fetchHydrometricStationMeta;
window.fetchHydrometricRealtimeLatest = fetchHydrometricRealtimeLatest;
window.fetchArcGISLayerGeoJSON = fetchArcGISLayerGeoJSON;
window.tryOrNull = tryOrNull;
window.logDebug = logDebug;
