export class ElevationChart {
  constructor(containerId, profileData, onSeekCallback) {
    this.container = document.getElementById(containerId);
    this.data = profileData;
    this.onSeek = onSeekCallback;
    this.svg = null;
    this.scrubberLine = null;
    this.scrubberCircle = null;
    this.isDragging = false;

    this.minEle = 1350;
    this.maxEle = 2850;
    this.totalDist = this.data[this.data.length - 1].dist_km;
    
    this.init();
  }

  init() {
    if (!this.container || !this.data || this.data.length === 0) return;
    this.render();
    this.attachEvents();
  }

  render() {
    const width = 1000;
    const height = 90;
    const padX = 10;
    const padY = 8;
    const plotW = width - padX * 2;
    const plotH = height - padY * 2;

    const scaleX = (dist) => padX + (dist / this.totalDist) * plotW;
    const scaleY = (ele) => padY + plotH - ((ele - this.minEle) / (this.maxEle - this.minEle)) * plotH;

    // Build segments by day
    const segmentsByDay = {};
    this.data.forEach((pt) => {
      if (!segmentsByDay[pt.day]) {
        segmentsByDay[pt.day] = { color: pt.color, points: [] };
      }
      segmentsByDay[pt.day].points.push(pt);
    });

    let pathsHtml = '';
    // Draw area fills for each day
    Object.keys(segmentsByDay).forEach((dayKey) => {
      const seg = segmentsByDay[dayKey];
      const pts = seg.points;
      if (pts.length < 2) return;

      const firstX = scaleX(pts[0].dist_km);
      const lastX = scaleX(pts[pts.length - 1].dist_km);
      const baseY = scaleY(this.minEle);

      let d = `M ${firstX} ${baseY}`;
      pts.forEach((p) => {
        d += ` L ${scaleX(p.dist_km)} ${scaleY(p.ele)}`;
      });
      d += ` L ${lastX} ${baseY} Z`;

      // Gradient definition for this day
      pathsHtml += `
        <defs>
          <linearGradient id="grad-day-${dayKey}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${seg.color}" stop-opacity="0.45" />
            <stop offset="100%" stop-color="${seg.color}" stop-opacity="0.05" />
          </linearGradient>
        </defs>
        <path d="${d}" fill="url(#grad-day-${dayKey})" />
      `;
    });

    // Top elevation stroke line
    let lineD = `M ${scaleX(this.data[0].dist_km)} ${scaleY(this.data[0].ele)}`;
    for (let i = 1; i < this.data.length; i++) {
      lineD += ` L ${scaleX(this.data[i].dist_km)} ${scaleY(this.data[i].ele)}`;
    }

    // Elevation gridlines
    const gridLines = [1500, 2000, 2500].map(ele => {
      const y = scaleY(ele);
      return `
        <line x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 3"/>
        <text x="${padX + 4}" y="${y - 3}" fill="rgba(255,255,255,0.3)" font-family="JetBrains Mono, monospace" font-size="9">${ele}m</text>
      `;
    }).join('');

    this.container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
        ${gridLines}
        ${pathsHtml}
        <path d="${lineD}" fill="none" stroke="rgba(255, 255, 255, 0.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <line id="scrubber-line" class="chart-scrubber-line" x1="${padX}" y1="${padY}" x2="${padX}" y2="${height - padY}" />
        <circle id="scrubber-circle" class="chart-scrubber-circle" cx="${padX}" cy="${scaleY(this.data[0].ele)}" r="5" />
      </svg>
    `;

    this.svg = this.container.querySelector('svg');
    this.scrubberLine = this.container.querySelector('#scrubber-line');
    this.scrubberCircle = this.container.querySelector('#scrubber-circle');
  }

  attachEvents() {
    const handleSeek = (e) => {
      const rect = this.container.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const pct = clickX / rect.width;
      const targetDist = pct * this.totalDist;

      // Find closest index
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < this.data.length; i++) {
        const diff = Math.abs(this.data[i].dist_km - targetDist);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = this.data[i].idx;
        }
      }

      if (this.onSeek) {
        this.onSeek(closestIdx);
      }
    };

    this.container.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      handleSeek(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        handleSeek(e);
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // Touch support
    this.container.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        this.isDragging = true;
        handleSeek(e.touches[0]);
      }
    });

    window.addEventListener('touchmove', (e) => {
      if (this.isDragging && e.touches.length > 0) {
        handleSeek(e.touches[0]);
      }
    });

    window.addEventListener('touchend', () => {
      this.isDragging = false;
    });
  }

  updateScrubber(distKm, ele, color = '#00e5ff') {
    if (!this.scrubberLine || !this.scrubberCircle) return;

    const width = 1000;
    const height = 90;
    const padX = 10;
    const padY = 8;
    const plotW = width - padX * 2;
    const plotH = height - padY * 2;

    const x = padX + (Math.min(distKm, this.totalDist) / this.totalDist) * plotW;
    const y = padY + plotH - ((Math.min(Math.max(ele, this.minEle), this.maxEle) - this.minEle) / (this.maxEle - this.minEle)) * plotH;

    this.scrubberLine.setAttribute('x1', x);
    this.scrubberLine.setAttribute('x2', x);
    this.scrubberCircle.setAttribute('cx', x);
    this.scrubberCircle.setAttribute('cy', y);
    this.scrubberCircle.style.stroke = color;
  }
}
