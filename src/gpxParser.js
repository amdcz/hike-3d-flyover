/**
 * In-Browser GPX Parser & 3D Flyover Data Generator
 * Allows users to upload their own GPX files directly in the browser.
 */

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000.0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180.0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180.0;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180.0) *
      Math.cos((lat2 * Math.PI) / 180.0) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 2.0 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180.0) * Math.cos((lat2 * Math.PI) / 180.0);
  const x =
    Math.cos((lat1 * Math.PI) / 180.0) * Math.sin((lat2 * Math.PI) / 180.0) -
    Math.sin((lat1 * Math.PI) / 180.0) *
      Math.cos((lat2 * Math.PI) / 180.0) *
      Math.cos(((lon2 - lon1) * Math.PI) / 180.0);
  return ((Math.atan2(y, x) * 180.0) / Math.PI + 360.0) % 360.0;
}

const PALETTE = [
  '#00e5ff',
  '#00e676',
  '#ffd600',
  '#ff6d00',
  '#ff1744',
  '#d500f9',
  '#2979ff',
  '#76ff03',
  '#f50057'
];

export async function parseGPXFiles(files) {
  const fileArray = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (fileArray.length === 0) return null;

  const parser = new DOMParser();
  const stages = [];
  const allAnimationPoints = [];
  const elevationProfile = [];
  const milestones = [];

  let cumulativeDistance = 0.0;
  let totalAscentAll = 0;
  let totalDescentAll = 0;
  let trekTitle = '';

  for (let idx = 0; idx < fileArray.length; idx++) {
    const file = fileArray[idx];
    const text = await file.text();
    const doc = parser.parseFromString(text, 'application/xml');

    // Extract track name
    const nameNode = doc.querySelector('trk > name') || doc.querySelector('name');
    let trackName = nameNode ? nameNode.textContent.trim() : '';
    if (!trackName) {
      trackName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      trackName = trackName.charAt(0).toUpperCase() + trackName.slice(1);
    }
    if (!trekTitle) trekTitle = trackName;

    // Extract trackpoints
    const trkpts = doc.querySelectorAll('trkpt');
    if (trkpts.length === 0) continue;

    const points = [];
    let totalDist = 0.0;
    let totalAscent = 0.0;
    let totalDescent = 0.0;
    let prev = null;

    for (let pIdx = 0; pIdx < trkpts.length; pIdx++) {
      const el = trkpts[pIdx];
      const lat = parseFloat(el.getAttribute('lat'));
      const lon = parseFloat(el.getAttribute('lon'));
      const eleNode = el.querySelector('ele');
      const ele = eleNode ? parseFloat(eleNode.textContent) : 0.0;
      const timeNode = el.querySelector('time');
      let timeStr = timeNode ? timeNode.textContent : '';

      // Privacy: format time to HH:MM only
      let formattedTime = '';
      if (timeStr) {
        if (timeStr.includes('T')) {
          formattedTime = timeStr.split('T')[1].slice(0, 5);
        } else {
          formattedTime = timeStr.slice(0, 5);
        }
      }

      if (prev) {
        const d = haversine(prev.lat, prev.lon, lat, lon);
        totalDist += d;
        const de = ele - prev.ele;
        if (de > 0) totalAscent += de;
        else totalDescent += Math.abs(de);
      }

      const pt = {
        lat,
        lon,
        ele,
        time: formattedTime,
        stage_dist: totalDist
      };
      points.push(pt);
      prev = pt;
    }

    if (points.length === 0) continue;

    const day = idx + 1;
    const color = PALETTE[idx % PALETTE.length];
    const stageDistKm = totalDist / 1000.0;
    const stageAscent = Math.round(totalAscent);
    const stageDescent = Math.round(totalDescent);
    const minEle = Math.round(Math.min(...points.map((p) => p.ele)));
    const maxEle = Math.round(Math.max(...points.map((p) => p.ele)));

    // Sample points every ~80m
    const sampled = [points[0]];
    for (let pIdx = 1; pIdx < points.length; pIdx++) {
      const p = points[pIdx];
      const d = haversine(sampled[sampled.length - 1].lat, sampled[sampled.length - 1].lon, p.lat, p.lon);
      if (d >= 80.0 || pIdx === points.length - 1) {
        sampled.push(p);
      }
    }

    // Macro lookahead bearings (~450m ahead)
    const rawBearings = [];
    for (let i = 0; i < sampled.length; i++) {
      let accum = 0.0;
      let targetIdx = Math.min(i + 1, sampled.length - 1);
      for (let j = i + 1; j < sampled.length; j++) {
        accum += haversine(sampled[j - 1].lat, sampled[j - 1].lon, sampled[j].lat, sampled[j].lon);
        if (accum >= 450.0 || j === sampled.length - 1) {
          targetIdx = j;
          break;
        }
      }
      let b;
      if (targetIdx === i) {
        targetIdx = Math.max(0, i - 1);
        b = calculateBearing(sampled[targetIdx].lat, sampled[targetIdx].lon, sampled[i].lat, sampled[i].lon);
      } else {
        b = calculateBearing(sampled[i].lat, sampled[i].lon, sampled[targetIdx].lat, sampled[targetIdx].lon);
      }
      rawBearings.push(b);
    }

    // Circular smoothing filter
    const smoothedBearings = [];
    for (let i = 0; i < rawBearings.length; i++) {
      let sinSum = 0.0;
      let cosSum = 0.0;
      for (let j = Math.max(0, i - 3); j <= Math.min(rawBearings.length - 1, i + 3); j++) {
        const rad = (rawBearings[j] * Math.PI) / 180.0;
        const weight = 1.0 / (1.0 + Math.abs(i - j) * 0.4);
        sinSum += Math.sin(rad) * weight;
        cosSum += Math.cos(rad) * weight;
      }
      smoothedBearings.push(((Math.atan2(sinSum, cosSum) * 180.0) / Math.PI + 360.0) % 360.0);
    }

    // Build animation points
    for (let i = 0; i < sampled.length; i++) {
      const p = sampled[i];
      const globalDist = cumulativeDistance + p.stage_dist / 1000.0;
      const animPt = {
        lon: Number(p.lon.toFixed(6)),
        lat: Number(p.lat.toFixed(6)),
        ele: Number(p.ele.toFixed(1)),
        bearing: Number(smoothedBearings[i].toFixed(1)),
        time: p.time,
        day: day,
        stage_idx: idx,
        dist_km: Number(globalDist.toFixed(2)),
        stage_dist_km: Number((p.stage_dist / 1000.0).toFixed(2))
      };
      allAnimationPoints.push(animPt);

      elevationProfile.push({
        dist_km: Number(globalDist.toFixed(2)),
        ele: Number(p.ele.toFixed(1)),
        day: day,
        color: color,
        idx: allAnimationPoints.length - 1
      });
    }

    // Milestones: Start, End, and Stage Summit
    milestones.push({
      name: idx === 0 ? 'Trek Start' : `Day ${day} Start`,
      stage: day,
      type: idx === 0 ? 'start' : 'stage_start',
      lon: Number(points[0].lon.toFixed(6)),
      lat: Number(points[0].lat.toFixed(6)),
      ele: Math.round(points[0].ele),
      desc: `Beginning of Stage ${day}`
    });

    const peakPoint = points.reduce((prev, curr) => (curr.ele > prev.ele ? curr : prev), points[0]);
    milestones.push({
      name: `Day ${day} Summit (${Math.round(peakPoint.ele)}m)`,
      stage: day,
      type: 'peak',
      lon: Number(peakPoint.lon.toFixed(6)),
      lat: Number(peakPoint.lat.toFixed(6)),
      ele: Math.round(peakPoint.ele),
      desc: `Highest elevation along Day ${day}`
    });

    milestones.push({
      name: idx === fileArray.length - 1 ? 'Trek Finish' : `End Day ${day}`,
      stage: day,
      type: idx === fileArray.length - 1 ? 'finish' : 'stage_end',
      lon: Number(points[points.length - 1].lon.toFixed(6)),
      lat: Number(points[points.length - 1].lat.toFixed(6)),
      ele: Math.round(points[points.length - 1].ele),
      desc: `Finish of Day ${day} (${stageDistKm.toFixed(1)} km, +${stageAscent}m)`
    });

    stages.push({
      id: `day_${day}`,
      day: day,
      name: trackName,
      short_name: `Day ${day}`,
      start_name: `Stage ${day} Start`,
      end_name: `Stage ${day} End`,
      color: color,
      desc: `Imported stage (${stageDistKm.toFixed(1)} km, +${stageAscent}m / -${stageDescent}m)`,
      distance_km: Number(stageDistKm.toFixed(1)),
      ascent_m: stageAscent,
      descent_m: stageDescent,
      min_ele: minEle,
      max_ele: maxEle,
      start_time: points[0].time,
      end_time: points[points.length - 1].time,
      point_count: points.length,
      coordinates: points.map((p) => [Number(p.lon.toFixed(6)), Number(p.lat.toFixed(6)), Number(p.ele.toFixed(1))])
    });

    cumulativeDistance += stageDistKm;
    totalAscentAll += stageAscent;
    totalDescentAll += stageDescent;
  }

  if (stages.length === 0) return null;

  const geojson = {
    type: 'FeatureCollection',
    features: stages.map((s) => ({
      type: 'Feature',
      properties: {
        day: s.day,
        name: s.name,
        color: s.color,
        distance_km: s.distance_km,
        ascent_m: s.ascent_m
      },
      geometry: {
        type: 'LineString',
        coordinates: s.coordinates
      }
    }))
  };

  return {
    trek_name: trekTitle || '3D GPS Trail Flyover',
    summary: {
      total_stages: stages.length,
      total_distance_km: Number(cumulativeDistance.toFixed(1)),
      total_ascent_m: totalAscentAll,
      total_descent_m: totalDescentAll,
      max_altitude_m: Math.max(...stages.map((s) => s.max_ele)),
      min_altitude_m: Math.min(...stages.map((s) => s.min_ele))
    },
    stages,
    geojson,
    animation_points: allAnimationPoints,
    elevation_profile: elevationProfile,
    milestones
  };
}
