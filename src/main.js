import { Map3DController } from './map3d.js';
import { ElevationChart } from './elevationChart.js';
import { FlyoverEngine } from './flyoverEngine.js';
import { parseGPXFiles } from './gpxParser.js';

let currentMapCtrl = null;
let currentEngine = null;
let currentChart = null;

async function initApp() {
  console.log('🏔️ Initializing 3D Flyover App...');

  // Setup GPX file upload listeners
  setupUploadListeners();

  // Try to load default hike_data.json
  try {
    const resp = await fetch('/hike_data.json');
    if (!resp.ok) throw new Error('Data file not found');
    const hikeData = await resp.json();
    initAppWithData(hikeData);
  } catch (err) {
    console.warn('⚠️ Could not load /hike_data.json:', err);
    showSetupOverlay();
  }
}

function initAppWithData(hikeData) {
  // Remove setup overlay if visible
  const existingOverlay = document.querySelector('.setup-overlay');
  if (existingOverlay) existingOverlay.remove();

  // 1. Populate top bar branding and metrics
  const brandSub = document.querySelector('.brand-sub');
  const brandTitle = document.querySelector('.brand-title');
  if (brandSub) brandSub.textContent = (hikeData.trek_name || '3D GPS TRAIL FLYOVER').toUpperCase();
  
  if (brandTitle) {
    if (hikeData.stages && hikeData.stages.length > 0) {
      const first = hikeData.stages[0];
      const last = hikeData.stages[hikeData.stages.length - 1];
      brandTitle.textContent = `${first.start_name} → ${last.end_name}`;
    } else {
      brandTitle.textContent = hikeData.trek_name || 'Interactive 3D Flyover';
    }
  }

  document.getElementById('total-dist-label').textContent = `${hikeData.summary.total_distance_km} km`;
  document.getElementById('total-ascent-label').textContent = `+${hikeData.summary.total_ascent_m.toLocaleString()} m`;

  // 2. Render dynamic stage pills
  renderStageNav(hikeData, (stageNum) => {
    if (currentEngine) {
      currentEngine.jumpToStage(stageNum === null ? 'all' : String(stageNum));
    }
  });

  // 3. Clean up any previous engine
  if (currentEngine) {
    currentEngine.pause();
    currentEngine = null;
  }

  // 4. Initialize 3D Map Controller
  currentMapCtrl = new Map3DController('map', hikeData);
  currentMapCtrl.init().then(() => {
    // 5. Initialize Elevation Chart
    const chartContainer = document.getElementById('elevation-chart-container');
    chartContainer.innerHTML = '';
    currentChart = new ElevationChart('elevation-chart-container', hikeData.elevation_profile, (seekIndex) => {
      if (currentEngine) {
        currentEngine.seek(seekIndex);
      }
    });

    // 6. Initialize Flyover Engine with Telemetry HUD updates
    const hudStatus = document.getElementById('hud-status');
    const hudStageTag = document.getElementById('hud-stage-tag');
    const hudStageName = document.getElementById('hud-stage-name');
    const hudAltitude = document.getElementById('hud-altitude');
    const hudAltTrend = document.getElementById('hud-alt-trend');
    const hudDistance = document.getElementById('hud-distance');
    const hudProgressPct = document.getElementById('hud-progress-pct');
    const hudSpeed = document.getElementById('hud-speed');
    const hudTimestamp = document.getElementById('hud-timestamp');
    const hudProgressBar = document.getElementById('hud-progress-bar');
    const hudLandmarkName = document.getElementById('hud-landmark-name');

    const onTelemetry = (data) => {
      hudStageTag.textContent = `DAY ${data.day}`;
      hudStageTag.style.color = data.stageColor;
      hudStageTag.style.borderColor = data.stageColor;

      hudStageName.textContent = data.stageName;
      hudAltitude.textContent = data.altitude.toLocaleString();
      hudAltTrend.textContent = data.altTrend;
      hudAltTrend.style.color = data.altTrend.includes('CLIMB') ? 'var(--stage-2)' : 'var(--stage-1)';

      hudDistance.innerHTML = `${data.distanceKm} <span class="unit">km</span>`;
      hudProgressPct.innerHTML = `${data.progressPct} <span class="unit">%</span>`;
      hudSpeed.innerHTML = `${data.speedKmH} <span class="unit">km/h</span>`;
      hudTimestamp.textContent = data.timestamp;
      hudProgressBar.style.width = `${data.progressPct}%`;
      hudProgressBar.style.background = data.stageColor;
      hudLandmarkName.textContent = data.nearestMilestone;

      // Update active pill highlight
      document.querySelectorAll('.stage-pill').forEach((pill) => {
        const pStage = pill.getAttribute('data-stage');
        if (pStage === String(data.day)) {
          pill.classList.add('active');
        } else if (pStage !== 'all') {
          pill.classList.remove('active');
        }
      });
    };

    const onFinish = () => {
      playIcon.textContent = '↺';
      playText.textContent = 'REPLAY TREK';
      hudStatus.textContent = 'TREK COMPLETE';
      hudStatus.style.color = 'var(--stage-2)';

      const camBadgeLabel = document.getElementById('cam-label');
      const camBadgeIcon = document.getElementById('cam-icon');
      if (camBadgeIcon && camBadgeLabel) {
        camBadgeIcon.textContent = '🏔️';
        camBadgeLabel.textContent = 'FULL ROUTE OVERVIEW';
      }

      document.querySelectorAll('.stage-pill').forEach((pill) => {
        if (pill.getAttribute('data-stage') === 'all') {
          pill.classList.add('active');
        } else {
          pill.classList.remove('active');
        }
      });

      const btnChase = document.getElementById('btn-chase-mode');
      const btnFree = document.getElementById('btn-free-mode');
      if (btnChase && btnFree) {
        btnFree.classList.add('active');
        btnChase.classList.remove('active');
      }
    };

    currentEngine = new FlyoverEngine(currentMapCtrl, currentChart, hikeData, onTelemetry, onFinish);
    currentEngine.seek(0);

    setupPlaybackControls();
  });
}

function renderStageNav(hikeData, onStageSelect) {
  const nav = document.getElementById('stage-nav');
  if (!nav) return;
  nav.innerHTML = '';

  if (hikeData.stages.length > 1) {
    const allBtn = document.createElement('button');
    allBtn.className = 'stage-pill active';
    allBtn.setAttribute('data-stage', 'all');
    allBtn.id = 'pill-all';
    allBtn.innerHTML = `<span class="pill-dot"></span> All ${hikeData.stages.length} Days`;
    nav.appendChild(allBtn);
  }

  hikeData.stages.forEach((stage, idx) => {
    const btn = document.createElement('button');
    btn.className = `stage-pill ${hikeData.stages.length === 1 && idx === 0 ? 'active' : ''}`;
    btn.setAttribute('data-stage', stage.day);
    btn.id = `pill-${stage.day}`;
    btn.innerHTML = `<span class="pill-dot" style="background:${stage.color}"></span> ${stage.short_name || `Day ${stage.day}`}`;
    nav.appendChild(btn);
  });

  const pills = nav.querySelectorAll('.stage-pill');
  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      pills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      const stageVal = pill.getAttribute('data-stage');
      onStageSelect(stageVal === 'all' ? null : parseInt(stageVal, 10));
    });
  });
}

function setupPlaybackControls() {
  const btnPlay = document.getElementById('btn-play');
  const playIcon = document.getElementById('play-icon');
  const playText = document.getElementById('play-text');
  const hudStatus = document.getElementById('hud-status');

  const updatePlayBtnState = (isPlaying) => {
    if (isPlaying) {
      playIcon.textContent = '⏸';
      playText.textContent = 'PAUSE';
      hudStatus.textContent = 'FLYOVER ACTIVE';
      hudStatus.style.color = 'var(--stage-2)';
    } else {
      playIcon.textContent = '▶';
      playText.textContent = 'PLAY FLYOVER';
      hudStatus.textContent = 'PAUSED';
      hudStatus.style.color = 'var(--stage-3)';
    }
  };

  btnPlay.onclick = () => {
    if (currentEngine) {
      const isPlaying = currentEngine.togglePlay();
      updatePlayBtnState(isPlaying);
    }
  };

  document.getElementById('btn-restart').onclick = () => {
    if (currentEngine) currentEngine.seek(0);
  };

  document.querySelectorAll('.speed-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.speed-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const s = parseFloat(btn.getAttribute('data-speed'));
      if (currentEngine) currentEngine.setSpeed(s);
    };
  });

  // Camera Mode Switcher
  const btnChase = document.getElementById('btn-chase-mode');
  const btnFree = document.getElementById('btn-free-mode');
  const camBadgeLabel = document.getElementById('cam-label');
  const camBadgeIcon = document.getElementById('cam-icon');

  const setCameraMode = (mode) => {
    if (!currentEngine) return;
    if (mode === 'chase') {
      btnChase.classList.add('active');
      btnFree.classList.remove('active');
      camBadgeIcon.textContent = '🚁';
      camBadgeLabel.textContent = 'DRONE CHASE CAMERA';
      currentEngine.setCameraMode('chase');
    } else {
      btnFree.classList.add('active');
      btnChase.classList.remove('active');
      camBadgeIcon.textContent = '🧭';
      camBadgeLabel.textContent = 'FREE ORBIT MODE';
      currentEngine.setCameraMode('free');
    }
  };

  btnChase.onclick = () => setCameraMode('chase');
  btnFree.onclick = () => setCameraMode('free');

  // Camera Angle Presets
  document.querySelectorAll('.angle-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.angle-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const preset = btn.getAttribute('data-preset');
      if (currentEngine) {
        currentEngine.setCameraPreset(preset);
        if (currentEngine.cameraMode !== 'chase') {
          setCameraMode('chase');
        }
      }
    };
  });

  document.getElementById('btn-reset-view').onclick = () => {
    if (currentMapCtrl) currentMapCtrl.resetView();
    setCameraMode('free');
  };

  const btnFullscreen = document.getElementById('btn-fullscreen');
  btnFullscreen.onclick = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Keyboard Shortcuts
  window.onkeydown = (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (currentEngine) {
        const isPlaying = currentEngine.togglePlay();
        updatePlayBtnState(isPlaying);
      }
    } else if (e.code === 'KeyR') {
      if (currentEngine) currentEngine.seek(0);
    } else if (e.code === 'KeyC') {
      if (currentEngine) {
        const nextMode = currentEngine.cameraMode === 'chase' ? 'free' : 'chase';
        setCameraMode(nextMode);
      }
    } else if (e.code === 'KeyF') {
      btnFullscreen.click();
    } else if (e.key >= '1' && e.key <= '9') {
      const pill = document.getElementById(`pill-${e.key}`);
      if (pill) pill.click();
    }
  };
}

function setupUploadListeners() {
  const fileInput = document.getElementById('gpx-file-input');
  const uploadBtn = document.getElementById('btn-upload-gpx');

  if (uploadBtn && fileInput) {
    uploadBtn.onclick = () => fileInput.click();
  }

  if (fileInput) {
    fileInput.onchange = async (e) => {
      if (e.target.files && e.target.files.length > 0) {
        await handleFiles(e.target.files);
      }
    };
  }

  // Drag and drop anywhere on window
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const gpxFiles = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith('.gpx'));
      if (gpxFiles.length > 0) {
        await handleFiles(gpxFiles);
      }
    }
  });
}

async function handleFiles(fileList) {
  try {
    const statusMsg = document.createElement('div');
    statusMsg.className = 'gpx-loading-toast';
    statusMsg.textContent = `⏳ Parsing ${fileList.length} GPX file(s)...`;
    document.body.appendChild(statusMsg);

    const hikeData = await parseGPXFiles(fileList);
    statusMsg.remove();

    if (!hikeData || !hikeData.stages || hikeData.stages.length === 0) {
      alert('Could not extract GPS points from the selected file(s). Please verify they are valid .gpx files.');
      return;
    }

    console.log('✓ Successfully parsed GPX hike:', hikeData);
    initAppWithData(hikeData);
  } catch (err) {
    console.error('Error parsing GPX files:', err);
    alert(`Failed to load GPX files: ${err.message}`);
  }
}

function showSetupOverlay() {
  const existing = document.querySelector('.setup-overlay');
  if (existing) return;

  const overlay = document.createElement('div');
  overlay.className = 'setup-overlay';
  overlay.innerHTML = `
    <div class="setup-modal glass-panel">
      <div class="setup-header">
        <span class="setup-icon">🏔️</span>
        <h2>3D GPS Hike Flyover Engine</h2>
      </div>
      <p class="setup-desc">No hike dataset detected in <code>public/hike_data.json</code>.</p>
      
      <div class="setup-grid">
        <div class="setup-card">
          <div class="card-badge">DIRECT UPLOAD</div>
          <h3>Upload Your GPX File(s)</h3>
          <p>Drop your <code>.gpx</code> files directly on this page or browse:</p>
          <button class="setup-upload-btn" id="btn-modal-browse">📂 Choose GPX Files</button>
        </div>

        <div class="setup-card">
          <div class="card-badge">DEMO MODE</div>
          <h3>Generate Sample 3D Flyover</h3>
          <p>Instant demonstration with 6 stages across the Dolomites:</p>
          <div class="code-block"><code>python3 generate_hike_data.py --demo</code></div>
        </div>
      </div>
      
      <div class="setup-footer">
        <span class="pulse-dot"></span>
        <span>Drag & drop any GPX file anywhere on the screen to fly immediately!</span>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const modalBrowse = document.getElementById('btn-modal-browse');
  const fileInput = document.getElementById('gpx-file-input');
  if (modalBrowse && fileInput) {
    modalBrowse.onclick = () => fileInput.click();
  }
}

window.addEventListener('DOMContentLoaded', initApp);
