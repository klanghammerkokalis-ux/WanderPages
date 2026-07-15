// netlify/functions/route-intel.js
//
// Computes real route intelligence for a trip: which US states the driving
// route actually crosses (via geocoding + directions + point-in-polygon
// against real state boundaries), distance/duration, and a few waypoint
// city names to use as landmark stops when the parent didn't type any in.
//
// Provider: OpenRouteService (openrouteservice.org) — free tier, no credit
// card required. Sign up for a key and set it as the ORS_API_KEY
// environment variable in Netlify (Site settings -> Environment variables).
//
// Request:  POST { from: string, to: string, stops?: string[] }
// Response: { ok:true, distanceMiles, durationHours, states:[...], waypointCities:[...] }
//        or { ok:false, error: string }   (client should fall back to text parsing)

const statesGeo = require('./data/us-states.json');

function pointInRing(pt, ring) {
  let inside = false;
  const [x, y] = pt;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(pt, geometry) {
  const testPoly = (rings) => {
    if (!pointInRing(pt, rings[0])) return false; // outside outer ring
    for (let k = 1; k < rings.length; k++) {
      if (pointInRing(pt, rings[k])) return false; // inside a hole
    }
    return true;
  };
  if (geometry.type === 'Polygon') return testPoly(geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some(testPoly);
  return false;
}

function findState(pt) {
  for (const feat of statesGeo.features) {
    if (pointInPolygon(pt, feat.geometry)) return feat.properties.name;
  }
  return null;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'POST only' }) };
  }

  const ORS_KEY = process.env.ORS_API_KEY;
  if (!ORS_KEY) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: 'ORS_API_KEY not configured' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Invalid JSON body' }) };
  }

  const from = (payload.from || '').trim();
  const to = (payload.to || '').trim();
  const stopList = Array.isArray(payload.stops) ? payload.stops.filter(Boolean) : [];
  if (!from || !to) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'from and to are required' }) };
  }

  try {
    const geocode = async (text) => {
      const url = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_KEY}&text=${encodeURIComponent(text)}&size=1&boundary.country=US`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Geocoding failed for "${text}" (${res.status})`);
      const data = await res.json();
      const feat = data.features && data.features[0];
      if (!feat) throw new Error(`No location match for "${text}"`);
      return { coord: feat.geometry.coordinates, label: feat.properties.label };
    };

    const points = await Promise.all([from, ...stopList, to].map(geocode));
    const coordinates = points.map((p) => p.coord);

    const dirRes = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates })
    });
    if (!dirRes.ok) {
      const errText = await dirRes.text();
      throw new Error(`Routing failed (${dirRes.status}): ${errText.slice(0, 200)}`);
    }
    const dirData = await dirRes.json();
    const routeFeature = dirData.features && dirData.features[0];
    if (!routeFeature) throw new Error('No route found between these locations');

    const summary = routeFeature.properties.summary;
    const routeCoords = routeFeature.geometry.coordinates; // [ [lon,lat], ... ]

    // Downsample so point-in-polygon stays fast on long routes
    const maxSamples = 150;
    const step = Math.max(1, Math.floor(routeCoords.length / maxSamples));
    const samples = [];
    for (let i = 0; i < routeCoords.length; i += step) samples.push(routeCoords[i]);
    const last = routeCoords[routeCoords.length - 1];
    if (samples[samples.length - 1] !== last) samples.push(last);

    const statesCrossed = [];
    for (const pt of samples) {
      const name = findState(pt);
      if (name && !statesCrossed.includes(name)) statesCrossed.push(name);
    }

    // If the parent didn't type explicit stops, suggest a few real waypoint
    // towns along the route for the landmark-stop pages.
    let waypointCities = [];
    if (stopList.length === 0 && routeCoords.length > 10) {
      const wpCount = 3;
      const idxs = [];
      for (let i = 1; i <= wpCount; i++) idxs.push(Math.floor((routeCoords.length - 1) * (i / (wpCount + 1))));
      const reverseGeocode = async ([lon, lat]) => {
        const url = `https://api.openrouteservice.org/geocode/reverse?api_key=${ORS_KEY}&point.lon=${lon}&point.lat=${lat}&size=1&layers=locality`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const feat = data.features && data.features[0];
        return feat ? feat.properties.locality || feat.properties.county || null : null;
      };
      const results = await Promise.all(idxs.map((i) => reverseGeocode(routeCoords[i])));
      waypointCities = [...new Set(results.filter(Boolean))];
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        distanceMiles: Math.round(summary.distance / 1609.34),
        durationHours: Math.round((summary.duration / 3600) * 10) / 10,
        states: statesCrossed,
        waypointCities,
        resolvedFrom: points[0].label,
        resolvedTo: points[points.length - 1].label
      })
    };
  } catch (err) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
