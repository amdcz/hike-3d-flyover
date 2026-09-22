# 🏔️ Dolomites Alta Via 1 — 3D Interactive Flyover Engine

A cinematic, interactive 3D web application providing dynamic flyovers, live telemetry HUD instrumentation, and synchronized elevation profiles for multi-stage hikes in the Italian Dolomites (or anywhere in the world).

Built with **MapLibre GL JS**, **Vite**, raster digital elevation models (DEM), and Python trail data pipelines.

---

## ✨ Features

- **Cinematic 3D Terrain**: Photorealistic 3D flyovers rendered with MapLibre GL JS, AWS terrain elevation RGB rasters, and ESRI satellite imagery.
- **Universal Multi-Stage Trek Support**: Works with 1-day hikes, weekend loops, or multi-week expeditions.
- **In-Browser GPX Drag & Drop**: Drop any `.gpx` file into the web app to fly immediately without any setup.
- **Live Telemetry HUD**: Displays real-time altitude, slope trend, speed, distance completed, heading/bearing, and mountain landmark callouts.
- **Interactive Elevation Profile**: Scrubbable elevation chart synchronized with the 3D camera position. Click or drag anywhere along the profile to jump immediately to that trail location.
- **Google Earth Pro Package**: Includes a Python generator to build standalone `.kmz` / `.kml` tours with high-resolution paths and scenic viewpoints.
- **Privacy-First**: No private hike recordings, personal GPS breadcrumbs, heart rates, or calendar dates are stored in the repository.

---

## 📖 Basic Setup Guide

Follow these simple steps to get the 3D flyover running locally on your computer in under 2 minutes.

### Step 1: Check Prerequisites
Ensure you have the following installed on your machine:
- **Node.js** (v18 or newer) — [Download Node.js](https://nodejs.org/)
- **Python** (v3.8 or newer) — [Download Python](https://www.python.org/) (standard library only; no pip packages needed)
- **Git** — [Download Git](https://git-scm.com/)

Verify in your terminal:
```bash
node -v
python3 --version
git --version
```

### Step 2: Clone the Repository
```bash
git clone https://github.com/amdcz/hike-3d-flyover.git
cd hike-3d-flyover
```

### Step 3: Install Web Dependencies
```bash
npm install
```

### Step 4: Load Your Trail Data
Choose whichever method is easiest for you:

#### Option A: Instant Demo Mode (Recommended to test immediately)
Generate a sample 6-stage Dolomites flight route across Lago di Braies, Lagazuoi, and Passo Giau:
```bash
python3 generate_hike_data.py --demo
```

#### Option B: Use Your Own GPX Files
Drop one or more `.gpx` files from any trail into the project root folder (named anything, e.g., `day_1.gpx`, `tour_du_mont_blanc.gpx`, `yosemite.gpx`) and run:
```bash
python3 generate_hike_data.py
```
*(The script automatically detects track names, assigns stage colors, and calculates smooth camera bearings).*

#### Option C: In-Browser Drag & Drop (Zero command-line data processing)
You can skip data generation entirely! Start the app (Step 5) and simply drag & drop your `.gpx` files directly onto the browser window.

### Step 5: Start the Development Server
```bash
npm run dev
```

Open **`http://localhost:5173`** in your browser.

---

## 🎮 Interactive Controls & Keyboard Shortcuts

| Control / Shortcut | Action | Description |
| :--- | :--- | :--- |
| **`Space`** | **Play / Pause** | Toggle 3D trail flight |
| **`R`** | **Restart** | Return to trail beginning |
| **`C`** | **Camera Mode** | Switch between Drone Chase (`🚁`) and Free Orbit (`🧭`) |
| **`1` – `9`** | **Jump to Stage** | Instantly switch between Day 1, Day 2, etc. |
| **`F`** | **Fullscreen** | Toggle distraction-free full-screen mode |
| **Click / Drag on Chart** | **Trail Scrub** | Seek to any point on the elevation profile |
| **`🎯` Button** | **Reset View** | Auto-frame full route overview |
| **`📂` Button** | **Load Custom GPX** | Pick new GPX files from your computer on the fly |

---

## 🌍 Google Earth Pro KMZ Tour (Optional)

To generate standalone 3D flight tours for Google Earth Pro from your GPX files:

```bash
python3 create_dolomites_kmz.py
```

This creates `Alta_Via_1_Dolomites_Flyover.kmz` which can be opened directly in Google Earth Pro.

---

## 🚀 Build for Production & Self-Hosting

This project is a completely static, serverless web app. You can compile it for production and host it for free on **GitHub Pages**, **Vercel**, **Netlify**, or **Cloudflare Pages**:

```bash
npm run build
```

This generates optimized static files in the `dist/` directory.

To test the production bundle locally:
```bash
npm run preview
```

---

## 📁 Project Structure

```text
├── index.html                  # Main application HTML & HUD markup
├── public/
│   ├── .gitkeep                # Keeps public directory tracked in Git
│   └── hike_data.json          # Generated locally (ignored in Git for privacy)
├── src/
│   ├── main.js                 # App initialization, fallback screen & UI state
│   ├── gpxParser.js            # In-browser client-side GPX parser & bearing calculator
│   ├── map3d.js                # MapLibre 3D terrain controller & layers
│   ├── flyoverEngine.js        # Smooth camera flight animation & bearing interpolation
│   ├── elevationChart.js       # Synchronized interactive elevation profile
│   └── style.css               # Modern glassmorphism UI styles & responsive HUD
├── generate_hike_data.py       # Universal GPX to hike_data.json converter (with --demo mode)
├── create_dolomites_kmz.py     # Standalone Google Earth KMZ flyover generator
├── package.json                # Web app dependencies & Vite config
├── requirements.txt            # Python environment notes
└── .gitignore                  # Excludes GPX traces, KMZ/KML, and hike_data.json
```

---

## ❓ Troubleshooting

- **Page shows "No hike dataset detected"?**
  Run `python3 generate_hike_data.py --demo` or drag & drop any `.gpx` file directly onto the browser window.
- **Do I need API keys for the 3D map?**
  No! The map uses public ESRI World Imagery and AWS Terrain RGB digital elevation models with zero secret keys or accounts required.
- **Do I need to install Python libraries?**
  No. Both Python scripts (`generate_hike_data.py` and `create_dolomites_kmz.py`) use only the standard library (`math`, `json`, `os`, `xml.etree`).

---

## 📄 License

MIT License. Feel free to use and adapt this project for your own treks and 3D maps!
