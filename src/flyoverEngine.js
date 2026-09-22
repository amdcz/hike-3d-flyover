export class FlyoverEngine {
  constructor(mapController, elevationChart, hikeData, onTelemetryUpdate, onFinishCallback = null) {
    this.mapCtrl = mapController;
    this.chart = elevationChart;
    this.data = hikeData;
    this.points = hikeData.animation_points;
    this.onTelemetry = onTelemetryUpdate;
    this.onFinishCallback = onFinishCallback;

    this.isPlaying = false;
    this.currentIndex = 0; // Float index
    this.speed = 7.5; // Hard-set speed: 7.5x
    this.cameraMode = 'chase'; // 'chase' | 'free'
    this.cameraPreset = 'cinematic'; // 'cinematic' (52 deg) | 'close' (62 deg) | 'vista' (35 deg)

    this.lastFrameTime = null;
    this.prevAlt = this.points[0].ele;

    // Camera smoothing state
    this.camBearing = this.points[0].bearing;
    this.camCenter = [this.points[0].lon, this.points[0].lat];
    
    // Preset configurations: pitch, zoom, target lead distance (meters)
    this.presets = {
      cinematic: { pitch: 52, zoom: 13.85, leadDistMeters: 140 },
      close: { pitch: 62, zoom: 14.3, leadDistMeters: 80 },
      vista: { pitch: 35, zoom: 13.2, leadDistMeters: 220 }
    };
  }

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.lastFrameTime = performance.now();
    requestAnimationFrame(this.loop.bind(this));
  }

  pause() {
    this.isPlaying = false;
    this.lastFrameTime = null;
  }

  togglePlay() {
    // If reached the finish, restart from Lago di Braies
    if (this.currentIndex >= this.points.length - 1) {
      this.seek(0);
      this.cameraMode = 'chase';
      this.start();
      return true;
    }
    if (this.isPlaying) {
      this.pause();
    } else {
      this.start();
    }
    return this.isPlaying;
  }

  setSpeed(speedVal) {
    this.speed = speedVal;
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
  }

  setCameraPreset(presetName) {
    if (this.presets[presetName]) {
      this.cameraPreset = presetName;
    }
  }

  seek(targetIndex) {
    this.currentIndex = Math.max(0, Math.min(targetIndex, this.points.length - 1));
    const p = this.points[Math.floor(this.currentIndex)];
    this.camBearing = p.bearing;
    this.camCenter = [p.lon, p.lat];
    this.updateFrame(this.currentIndex, 0.016, true);
  }

  jumpToStage(day) {
    if (day === 'all') {
      this.seek(0);
      return;
    }
    const targetDay = parseInt(day);
    const ptIdx = this.points.findIndex(p => p.day === targetDay);
    if (ptIdx !== -1) {
      this.seek(ptIdx);
      this.mapCtrl.flyToStageOverview(day);
    }
  }

  handleFinish() {
    // Brief 1.2s pause at Passo Duran finish, then cinematic zoom-out showing the complete route
    setTimeout(() => {
      this.cameraMode = 'free';
      this.mapCtrl.zoomOutToFullRouteOverview();
    }, 1200);

    if (this.onFinishCallback) {
      this.onFinishCallback();
    }
  }

  loop(timestamp) {
    if (!this.isPlaying) return;

    if (!this.lastFrameTime) {
      this.lastFrameTime = timestamp;
    }

    const deltaSec = Math.min((timestamp - this.lastFrameTime) / 1000.0, 0.1);
    this.lastFrameTime = timestamp;

    // Advance smoothly based on speed multiplier
    const step = 0.8 * this.speed * deltaSec;
    this.currentIndex += step;

    if (this.currentIndex >= this.points.length - 1) {
      this.currentIndex = this.points.length - 1;
      this.updateFrame(this.currentIndex, deltaSec, true);
      this.pause();
      this.handleFinish();
      return;
    }

    this.updateFrame(this.currentIndex, deltaSec, false);
    requestAnimationFrame(this.loop.bind(this));
  }

  updateFrame(indexFloat, deltaSec, forceImmediate = false) {
    const i0 = Math.floor(indexFloat);
    const i1 = Math.min(i0 + 1, this.points.length - 1);
    const t = indexFloat - i0;

    const p0 = this.points[i0];
    const p1 = this.points[i1];

    // 1. Precise Hiker Position & Bearing
    const hikerLon = p0.lon + (p1.lon - p0.lon) * t;
    const hikerLat = p0.lat + (p1.lat - p0.lat) * t;
    const ele = p0.ele + (p1.ele - p0.ele) * t;
    const distKm = p0.dist_km + (p1.dist_km - p0.dist_km) * t;

    // Angular interpolation of hiker target bearing
    let diff = p1.bearing - p0.bearing;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    const targetBearing = (p0.bearing + diff * t + 360) % 360;

    // 2. Cinematic Camera Heading Limiter (Prevents hectic spinning)
    if (forceImmediate) {
      this.camBearing = targetBearing;
      this.camCenter = [hikerLon, hikerLat];
    } else {
      let bDiff = targetBearing - this.camBearing;
      if (bDiff > 180) bDiff -= 360;
      if (bDiff < -180) bDiff += 360;

      // Maximum turning rate: clamp to smooth drone turn (max 38 deg/sec at 1x-15x, up to 75 deg/sec at 60x)
      const maxTurnRate = Math.min(35 + this.speed * 0.7, 85); // deg per sec
      const maxTurn = maxTurnRate * deltaSec;
      const turn = Math.sign(bDiff) * Math.min(Math.abs(bDiff), maxTurn);
      this.camBearing = (this.camBearing + turn + 360) % 360;

      // Smooth position lag
      const posDamping = Math.min(6.0 * deltaSec, 0.4);
      this.camCenter[0] += (hikerLon - this.camCenter[0]) * posDamping;
      this.camCenter[1] += (hikerLat - this.camCenter[1]) * posDamping;
    }

    // Current stage metadata
    const stage = this.data.stages[p0.stage_idx];
    const stageColor = stage ? stage.color : '#00e5ff';

    // 3. Update 3D Map Beacon
    this.mapCtrl.updateBeacon(hikerLon, hikerLat, targetBearing);

    // 4. Update Active Trail Line
    const trailCoords = [];
    for (let k = 0; k <= i0; k++) {
      trailCoords.push([this.points[k].lon, this.points[k].lat]);
    }
    trailCoords.push([hikerLon, hikerLat]);
    this.mapCtrl.updateActiveTrail(trailCoords, stageColor);

    // 5. Update Drone Camera with Terrain Clearance
    if (this.cameraMode === 'chase' && this.mapCtrl.map) {
      const cfg = this.presets[this.cameraPreset] || this.presets.cinematic;

      // Calculate forward focal offset: lead slightly ahead along camera bearing
      // 1 deg lat ≈ 111,000m, 1 deg lon ≈ 111,000 * cos(lat)
      const radB = (this.camBearing * Math.PI) / 180.0;
      const radLat = (this.camCenter[1] * Math.PI) / 180.0;
      const leadM = cfg.leadDistMeters;
      const offsetLat = (leadM * Math.cos(radB)) / 111000.0;
      const offsetLon = (leadM * Math.sin(radB)) / (111000.0 * Math.cos(radLat));

      const focalPoint = [this.camCenter[0] + offsetLon, this.camCenter[1] + offsetLat];

      this.mapCtrl.map.jumpTo({
        center: focalPoint,
        zoom: cfg.zoom,
        pitch: cfg.pitch,
        bearing: this.camBearing
      });
    }

    // 6. Update Elevation Profile Scrubber
    this.chart.updateScrubber(distKm, ele, stageColor);

    // 7. Telemetry & Trends
    const altTrend = ele >= this.prevAlt ? '↗ CLIMBING' : '↘ DESCENDING';
    this.prevAlt = ele;

    let nearestMilestone = null;
    let minMilestoneDist = Infinity;
    for (const m of this.data.milestones) {
      const d = Math.hypot(m.lon - hikerLon, m.lat - hikerLat);
      if (d < minMilestoneDist) {
        minMilestoneDist = d;
        nearestMilestone = m;
      }
    }

    let timeFormatted = '--:--';
    if (p0.time) {
      if (p0.time.includes('T')) {
        timeFormatted = p0.time.slice(11, 16);
      } else {
        timeFormatted = p0.time.slice(0, 5);
      }
    }

    if (this.onTelemetry) {
      this.onTelemetry({
        day: p0.day,
        stageName: stage ? stage.name : `Day ${p0.day}`,
        stageShort: stage ? stage.short_name : `Day ${p0.day}`,
        stageColor: stageColor,
        altitude: Math.round(ele),
        altTrend: altTrend,
        distanceKm: distKm.toFixed(1),
        progressPct: Math.round((distKm / this.data.summary.total_distance_km) * 100),
        speedKmH: (4.2 + Math.sin(indexFloat * 0.1) * 1.2).toFixed(1),
        timestamp: timeFormatted,
        nearestMilestone: nearestMilestone ? nearestMilestone.name : 'Alta Via 1 Trail'
      });
    }
  }
}
