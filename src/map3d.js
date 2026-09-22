import maplibregl from 'maplibre-gl';

export class Map3DController {
  constructor(containerId, hikeData) {
    this.containerId = containerId;
    this.data = hikeData;
    this.map = null;
    this.beaconMarker = null;
    this.milestoneMarkers = [];
  }

  async init() {
    return new Promise((resolve) => {
      // Starting camera view: panoramic overview of Lago di Braies and the northern Dolomites
      const startPt = this.data.animation_points[0];

      this.map = new maplibregl.Map({
        container: this.containerId,
        style: {
          version: 8,
          sources: {
            // ESRI High-Resolution World Imagery Satellite
            'satellite-source': {
              type: 'raster',
              tiles: [
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}.jpg'
              ],
              tileSize: 256,
              maxzoom: 19,
              attribution: 'ESRI World Imagery'
            },
            // AWS Open Elevation Terrarium 3D Terrain
            'terrain-source': {
              type: 'raster-dem',
              tiles: [
                'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
              ],
              encoding: 'terrarium',
              tileSize: 256,
              maxzoom: 15
            }
          },
          layers: [
            {
              id: 'satellite-layer',
              type: 'raster',
              source: 'satellite-source',
              paint: {
                'raster-fade-duration': 100
              }
            }
          ],
          sky: {
            'sky-color': '#080d1a',
            'sky-horizon-blend': 0.4,
            'horizon-color': '#21334c',
            'horizon-fog-blend': 0.7,
            'fog-color': '#111d2e',
            'fog-ground-blend': 0.5
          }
        },
        center: [startPt.lon, startPt.lat],
        zoom: 13.5,
        pitch: 65,
        bearing: 195,
        maxPitch: 85,
        hash: false
      });

      this.map.on('load', () => {
        // Enable true 3D Terrain mesh
        this.map.setTerrain({
          source: 'terrain-source',
          exaggeration: 1.18
        });

        this.addTrackLayers();
        this.addMilestones();
        this.createBeaconMarker();
        resolve(this.map);
      });
    });
  }

  addTrackLayers() {
    // 1. Base Complete Routes (faint glowing trails of all 6 stages)
    this.map.addSource('all-stages-source', {
      type: 'geojson',
      data: this.data.geojson
    });

    // Dark under-glow for high contrast against snow/rock
    this.map.addLayer({
      id: 'stages-casing',
      type: 'line',
      source: 'all-stages-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#000000',
        'line-width': 8,
        'line-opacity': 0.6
      }
    });

    // Vibrant stage colored line
    this.map.addLayer({
      id: 'stages-lines',
      type: 'line',
      source: 'all-stages-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 4.5,
        'line-opacity': 0.85
      }
    });

    // 2. Active Progress Line (illuminates brightly behind the hiker)
    this.map.addSource('active-trail-source', {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: []
        }
      }
    });

    // Active Trail Glow
    this.map.addLayer({
      id: 'active-trail-glow',
      type: 'line',
      source: 'active-trail-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#ffffff',
        'line-width': 10,
        'line-opacity': 0.45,
        'line-blur': 4
      }
    });

    // Active Trail Core
    this.map.addLayer({
      id: 'active-trail-core',
      type: 'line',
      source: 'active-trail-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#ffffff',
        'line-width': 5,
        'line-opacity': 1.0
      }
    });
  }

  createBeaconMarker() {
    const el = document.createElement('div');
    el.className = 'gps-beacon-container';
    el.id = 'gps-beacon';
    el.innerHTML = `
      <div class="beacon-pulse-ring" id="beacon-ring-1"></div>
      <div class="beacon-pulse-ring beacon-pulse-ring-delayed" id="beacon-ring-2"></div>
      <div class="beacon-core" id="beacon-core">
        <div class="beacon-arrow" id="beacon-arrow"></div>
      </div>
    `;

    const startPt = this.data.animation_points[0];
    this.beaconMarker = new maplibregl.Marker({
      element: el,
      anchor: 'center'
    })
      .setLngLat([startPt.lon, startPt.lat])
      .addTo(this.map);
  }

  addMilestones() {
    this.data.milestones.forEach((m) => {
      const el = document.createElement('div');
      el.className = 'milestone-pin';
      
      let icon = '🛖';
      if (m.type === 'start') icon = '🚀';
      else if (m.type === 'finish') icon = '🏁';
      else if (m.type === 'peak') icon = '⛰️';
      else if (m.type === 'lake') icon = '💎';

      el.innerHTML = `
        <span class="milestone-icon">${icon}</span>
        <span class="milestone-label">${m.name}</span>
      `;

      el.addEventListener('click', () => {
        this.map.flyTo({
          center: [m.lon, m.lat],
          zoom: 14.5,
          pitch: 65,
          bearing: 180,
          duration: 2500
        });
      });

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom'
      })
        .setLngLat([m.lon, m.lat])
        .addTo(this.map);

      this.milestoneMarkers.push(marker);
    });
  }

  updateActiveTrail(coords, stageColor = '#00e5ff') {
    const source = this.map.getSource('active-trail-source');
    if (source) {
      source.setData({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coords
        }
      });
    }

    if (this.map.getLayer('active-trail-core')) {
      this.map.setPaintProperty('active-trail-core', 'line-color', stageColor);
      this.map.setPaintProperty('active-trail-glow', 'line-color', stageColor);
    }

    // Update beacon ring color
    const ring1 = document.getElementById('beacon-ring-1');
    const ring2 = document.getElementById('beacon-ring-2');
    const core = document.getElementById('beacon-core');
    if (ring1 && ring2 && core) {
      ring1.style.borderColor = stageColor;
      ring1.style.boxShadow = `0 0 16px ${stageColor}`;
      ring2.style.borderColor = stageColor;
      ring2.style.boxShadow = `0 0 16px ${stageColor}`;
      core.style.borderColor = stageColor;
    }
  }

  updateBeacon(lon, lat, bearing) {
    if (this.beaconMarker) {
      this.beaconMarker.setLngLat([lon, lat]);
    }
    const arrow = document.getElementById('beacon-arrow');
    if (arrow) {
      arrow.style.transform = `rotate(${bearing}deg)`;
    }
  }

  flyToStageOverview(stageDay) {
    if (stageDay === 'all') {
      this.resetView();
      return;
    }
    const stage = this.data.stages.find(s => s.day === parseInt(stageDay));
    if (!stage) return;

    // Calculate bounds of stage
    const lons = stage.coordinates.map(c => c[0]);
    const lats = stage.coordinates.map(c => c[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    this.map.fitBounds([[minLon, minLat], [maxLon, maxLat]], {
      padding: { top: 120, bottom: 200, left: 320, right: 80 },
      pitch: 60,
      bearing: 190,
      duration: 2500,
      maxZoom: 14.5
    });
  }

  resetView() {
    this.fitAllStagesOverview(3000);
  }

  zoomOutToFullRouteOverview() {
    this.fitAllStagesOverview(5000);
  }
}
