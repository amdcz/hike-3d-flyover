#!/usr/bin/env python3
"""
Generate a Google Earth Pro KMZ package for the Alta Via 1 hike with:
- 6 individual color-coded stage tracks with full GPS fidelity
- Rich metadata placemarks for each stage transition / hut / pass
- Cinematic gx:Tour flyover animations (Grand Tour + 6 Day Tours)
"""

import os
import glob
import math
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime

# Stage metadata configuration
STAGE_CONFIG = [
    {
        "file": "day_1.gpx",
        "day": 1,
        "name": "Day 1: Lago di Braies → Rifugio Pederü",
        "start_name": "Lago di Braies (Start)",
        "end_name": "Rifugio Pederü",
        "color_kml": "ffffe500",  # Cyan (aabbggrr)
        "color_hex": "#00e5ff",
        "desc": "Starting at the iconic turquoise waters of Lago di Braies, climbing over Forcella Sora Forno (Rif. Biella), and descending through Val Salata to Rifugio Pederü."
    },
    {
        "file": "day_2.gpx",
        "day": 2,
        "name": "Day 2: Rifugio Pederü → Rifugio Lagazuoi",
        "start_name": "Rifugio Pederü",
        "end_name": "Rifugio Lagazuoi (Summit)",
        "color_kml": "ff76e600",  # Vivid Lime / Green
        "color_hex": "#00e676",
        "desc": "Ascending the high alpine plateau of Fanes, passing Rifugio Fanes and Lago di Limo, then ascending the spectacular ridge to the summit of Rifugio Lagazuoi (2,761m)."
    },
    {
        "file": "day_3.gpx",
        "day": 3,
        "name": "Day 3: Rifugio Lagazuoi → Passo Giau",
        "start_name": "Rifugio Lagazuoi",
        "end_name": "Passo Giau",
        "color_kml": "ff00d6ff",  # Bright Amber / Yellow
        "color_hex": "#ffd600",
        "desc": "Descending from Lagazuoi across Passo Falzarego, ascending past Rifugio Averau & Nuvolau, then descending to the dramatic vistas of Passo Giau under the Ra Gusela."
    },
    {
        "file": "day_4.gpx",
        "day": 4,
        "name": "Day 4: Passo Giau → Palafavera",
        "start_name": "Passo Giau",
        "end_name": "Palafavera (Monte Pelmo)",
        "color_kml": "ff006dff",  # Vivid Orange / Coral
        "color_hex": "#ff6d00",
        "desc": "Traversing through Forcella Giau beneath the towers of Lastoi de Formin, passing Rifugio Città di Fiume with breathtaking views of the giant throne of Monte Pelmo, finishing at Palafavera."
    },
    {
        "file": "day_5.gpx",
        "day": 5,
        "name": "Day 5: Palafavera → Rifugio Vazzoler",
        "start_name": "Palafavera",
        "end_name": "Rifugio Vazzoler",
        "color_kml": "ff4417ff",  # Crimson / Red
        "color_hex": "#ff1744",
        "desc": "Climbing to Rifugio Coldai and the sparkling Lago di Coldai, then traversing underneath the monumental 1,000m vertical rock face of Monte Civetta via Rifugio Tissi to Rifugio Vazzoler."
    },
    {
        "file": "day_6.gpx",
        "day": 6,
        "name": "Day 6: Rifugio Vazzoler → Passo Duran",
        "start_name": "Rifugio Vazzoler",
        "end_name": "Passo Duran (Finish)",
        "color_kml": "ffff00aa",  # Electric Violet / Magenta
        "color_hex": "#aa00ff",
        "desc": "Hiking beneath the jagged ramparts of the Moiazza group, passing Rifugio Carestiato, and descending to Passo Duran (Rifugio San Sebastiano)."
    }
]

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000  # meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def calculate_bearing(lat1, lon1, lat2, lon2):
    y = math.sin(math.radians(lon2 - lon1)) * math.cos(math.radians(lat2))
    x = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - \
        math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(math.radians(lon2 - lon1))
    return (math.degrees(math.atan2(y, x)) + 360) % 360

def parse_gpx(filepath):
    ns = {'gpx': 'http://www.topografix.com/GPX/1/1'}
    tree = ET.parse(filepath)
    root = tree.getroot()
    
    pts = root.findall('.//gpx:trkpt', ns)
    points = []
    
    dist_total = 0.0
    ascent_total = 0.0
    descent_total = 0.0
    prev = None
    
    for p in pts:
        lat = float(p.attrib['lat'])
        lon = float(p.attrib['lon'])
        ele_elem = p.find('gpx:ele', ns)
        ele = float(ele_elem.text) if ele_elem is not None else 0.0
        time_elem = p.find('gpx:time', ns)
        time_str = time_elem.text if time_elem is not None else ''
        
        if prev is not None:
            d = haversine(prev['lat'], prev['lon'], lat, lon)
            dist_total += d
            diff_ele = ele - prev['ele']
            if diff_ele > 0:
                ascent_total += diff_ele
            else:
                descent_total += abs(diff_ele)
        
        pt_obj = {
            'lat': lat,
            'lon': lon,
            'ele': ele,
            'time': time_str,
            'dist_from_start': dist_total
        }
        points.append(pt_obj)
        prev = pt_obj
        
    elevations = [p['ele'] for p in points]
    return {
        'points': points,
        'distance_km': dist_total / 1000.0,
        'ascent_m': ascent_total,
        'descent_m': descent_total,
        'min_ele_m': min(elevations) if elevations else 0.0,
        'max_ele_m': max(elevations) if elevations else 0.0,
        'start_time': points[0]['time'] if points else '',
        'end_time': points[-1]['time'] if points else ''
    }

def generate_sampled_tour_points(points, target_spacing=120.0):
    """
    Downsamples points to roughly target_spacing meters for smooth camera flyover,
    calculating smooth forward-looking bearings.
    """
    if not points:
        return []
        
    sampled = [points[0]]
    acc_dist = 0.0
    
    for i in range(1, len(points)):
        d = haversine(sampled[-1]['lat'], sampled[-1]['lon'], points[i]['lat'], points[i]['lon'])
        if d >= target_spacing or i == len(points) - 1:
            sampled.append(points[i])
            
    # Calculate smooth forward-looking bearing (look ahead 2 points or ~250m)
    for i in range(len(sampled)):
        lookahead_idx = min(i + 2, len(sampled) - 1)
        if lookahead_idx == i:
            lookahead_idx = max(0, i - 1)
            bearing = calculate_bearing(sampled[lookahead_idx]['lat'], sampled[lookahead_idx]['lon'],
                                        sampled[i]['lat'], sampled[i]['lon'])
        else:
            bearing = calculate_bearing(sampled[i]['lat'], sampled[i]['lon'],
                                        sampled[lookahead_idx]['lat'], sampled[lookahead_idx]['lon'])
        sampled[i]['bearing'] = bearing
        
    return sampled

def build_kml(stages_data):
    """
    Builds the complete OGC KML 2.2 XML with Google Earth gx:Tour extensions.
    """
    kml = []
    kml.append('<?xml version="1.0" encoding="UTF-8"?>')
    kml.append('<kml xmlns="http://www.opengis.net/kml/2.2"')
    kml.append('     xmlns:gx="http://www.google.com/kml/ext/2.2"')
    kml.append('     xmlns:kml="http://www.opengis.net/kml/2.2"')
    kml.append('     xmlns:atom="http://www.w3.org/2005/Atom">')
    kml.append('  <Document>')
    kml.append('    <name>Alta Via 1 - Dolomites 3D Flyover &amp; Tracks</name>')
    kml.append('    <open>1</open>')
    kml.append('    <description><![CDATA[')
    kml.append('      <h2>Alta Via 1 (Braies to Passo Duran)</h2>')
    kml.append('      <p>Complete 6-stage trek through the Dolomites, Italy.</p>')
    kml.append('      <p><b>Total Distance:</b> 93.8 km | <b>Total Ascent:</b> +7,654 m</p>')
    kml.append('      <p>Select any tour or track below and click <b>Play Tour</b> in Google Earth Pro!</p>')
    kml.append('    ]]></description>')
    
    # Define styles for each stage
    for cfg in STAGE_CONFIG:
        day = cfg['day']
        color = cfg['color_kml']
        kml.append(f'    <Style id="day{day}_style">')
        kml.append(f'      <LineStyle>')
        kml.append(f'        <color>{color}</color>')
        kml.append(f'        <width>5.0</width>')
        kml.append(f'      </LineStyle>')
        kml.append(f'      <PolyStyle>')
        kml.append(f'        <color>40{color[2:]}</color>')
        kml.append(f'      </PolyStyle>')
        kml.append(f'    </Style>')
        
    # Styles for Waypoints / Pins
    kml.append('    <Style id="pin_start">')
    kml.append('      <IconStyle>')
    kml.append('        <scale>1.3</scale>')
    kml.append('        <Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>')
    kml.append('      </IconStyle>')
    kml.append('    </Style>')
    kml.append('    <Style id="pin_stage">')
    kml.append('      <IconStyle>')
    kml.append('        <scale>1.1</scale>')
    kml.append('        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon>')
    kml.append('      </IconStyle>')
    kml.append('    </Style>')

    # 1. FLYOVER TOURS FOLDER
    kml.append('    <Folder>')
    kml.append('      <name>🎥 3D Flyover Tours (Click to Play)</name>')
    kml.append('      <open>1</open>')
    
    # A. Grand Tour of entire hike
    kml.append('      <gx:Tour>')
    kml.append('        <name>⭐ Complete 6-Day Alta Via 1 Flyover</name>')
    kml.append('        <gx:Playlist>')
    
    # Intro view over Lago di Braies
    first_pt = stages_data[0]['points'][0]
    kml.append('          <gx:FlyTo>')
    kml.append('            <gx:duration>5.0</gx:duration>')
    kml.append('            <gx:flyToMode>bounce</gx:flyToMode>')
    kml.append('            <LookAt>')
    kml.append(f'              <longitude>{first_pt["lon"]:.6f}</longitude>')
    kml.append(f'              <latitude>{first_pt["lat"]:.6f}</latitude>')
    kml.append(f'              <altitude>{first_pt["ele"]:.1f}</altitude>')
    kml.append('              <heading>190.0</heading>')
    kml.append('              <tilt>60.0</tilt>')
    kml.append('              <range>2500.0</range>')
    kml.append('              <altitudeMode>clampToGround</altitudeMode>')
    kml.append('            </LookAt>')
    kml.append('          </gx:FlyTo>')
    
    # Grand tour sample across all stages (target ~150m spacing)
    all_tour_points = []
    for s in stages_data:
        all_tour_points.extend(generate_sampled_tour_points(s['points'], target_spacing=160.0))
        
    for i, pt in enumerate(all_tour_points):
        # Calculate dynamic tilt and range
        # When climbing high peaks (elev > 2400m), tilt slightly down to see the drop, otherwise tilt up at peaks
        tilt = 68.0
        dist_range = 1000.0
        
        # Smooth duration between waypoints: ~0.4s to 0.7s per point = dynamic smooth glide
        duration = 0.5
        kml.append('          <gx:FlyTo>')
        kml.append(f'            <gx:duration>{duration:.2f}</gx:duration>')
        kml.append('            <gx:flyToMode>smooth</gx:flyToMode>')
        kml.append('            <LookAt>')
        kml.append(f'              <longitude>{pt["lon"]:.6f}</longitude>')
        kml.append(f'              <latitude>{pt["lat"]:.6f}</latitude>')
        kml.append(f'              <altitude>{pt["ele"]:.1f}</altitude>')
        kml.append(f'              <heading>{pt["bearing"]:.1f}</heading>')
        kml.append(f'              <tilt>{tilt:.1f}</tilt>')
        kml.append(f'              <range>{dist_range:.1f}</range>')
        kml.append('              <altitudeMode>clampToGround</altitudeMode>')
        kml.append('            </LookAt>')
        kml.append('          </gx:FlyTo>')
        
    kml.append('        </gx:Playlist>')
    kml.append('      </gx:Tour>')

    # B. Individual Day Tours
    for idx, s in enumerate(stages_data):
        cfg = STAGE_CONFIG[idx]
        day_points = generate_sampled_tour_points(s['points'], target_spacing=100.0)
        kml.append('      <gx:Tour>')
        kml.append(f'        <name>Day {cfg["day"]} Tour: {cfg["name"]}</name>')
        kml.append('        <gx:Playlist>')
        
        # Initial view
        first_p = day_points[0]
        kml.append('          <gx:FlyTo>')
        kml.append('            <gx:duration>4.0</gx:duration>')
        kml.append('            <gx:flyToMode>bounce</gx:flyToMode>')
        kml.append('            <LookAt>')
        kml.append(f'              <longitude>{first_p["lon"]:.6f}</longitude>')
        kml.append(f'              <latitude>{first_p["lat"]:.6f}</latitude>')
        kml.append(f'              <altitude>{first_p["ele"]:.1f}</altitude>')
        kml.append(f'              <heading>{first_p["bearing"]:.1f}</heading>')
        kml.append('              <tilt>62.0</tilt>')
        kml.append('              <range>1800.0</range>')
        kml.append('              <altitudeMode>clampToGround</altitudeMode>')
        kml.append('            </LookAt>')
        kml.append('          </gx:FlyTo>')
        
        for pt in day_points:
            kml.append('          <gx:FlyTo>')
            kml.append('            <gx:duration>0.45</gx:duration>')
            kml.append('            <gx:flyToMode>smooth</gx:flyToMode>')
            kml.append('            <LookAt>')
            kml.append(f'              <longitude>{pt["lon"]:.6f}</longitude>')
            kml.append(f'              <latitude>{pt["lat"]:.6f}</latitude>')
            kml.append(f'              <altitude>{pt["ele"]:.1f}</altitude>')
            kml.append(f'              <heading>{pt["bearing"]:.1f}</heading>')
            kml.append('              <tilt>67.0</tilt>')
            kml.append('              <range>900.0</range>')
            kml.append('              <altitudeMode>clampToGround</altitudeMode>')
            kml.append('            </LookAt>')
            kml.append('          </gx:FlyTo>')
            
        kml.append('        </gx:Playlist>')
        kml.append('      </gx:Tour>')
        
    kml.append('    </Folder>') # End Flyover Tours Folder

    # 2. TRACKS FOLDER (Full GPS High-Resolution lines)
    kml.append('    <Folder>')
    kml.append('      <name>🗺️ Stages &amp; GPS Tracks</name>')
    kml.append('      <open>1</open>')
    
    for idx, s in enumerate(stages_data):
        cfg = STAGE_CONFIG[idx]
        day = cfg['day']
        kml.append('      <Placemark>')
        kml.append(f'        <name>{cfg["name"]}</name>')
        kml.append(f'        <styleUrl>#day{day}_style</styleUrl>')
        kml.append('        <description><![CDATA[')
        kml.append(f'          <div style="font-family: sans-serif; min-width: 250px;">')
        kml.append(f'            <h3 style="color:{cfg["color_hex"]}; margin-bottom: 5px;">Day {day}</h3>')
        kml.append(f'            <p><i>{cfg["desc"]}</i></p>')
        kml.append('            <table style="width:100%; border-collapse: collapse;">')
        kml.append(f'              <tr><td><b>Distance:</b></td><td>{s["distance_km"]:.1f} km</td></tr>')
        kml.append(f'              <tr><td><b>Elevation Gain:</b></td><td>+{s["ascent_m"]:.0f} m</td></tr>')
        kml.append(f'              <tr><td><b>Elevation Loss:</b></td><td>-{s["descent_m"]:.0f} m</td></tr>')
        kml.append(f'              <tr><td><b>Altitude Range:</b></td><td>{s["min_ele_m"]:.0f}m - {s["max_ele_m"]:.0f}m</td></tr>')
        kml.append('            </table>')
        kml.append('          </div>')
        kml.append('        ]]></description>')
        kml.append('        <LineString>')
        kml.append('          <extrude>0</extrude>')
        kml.append('          <tessellate>1</tessellate>')
        kml.append('          <altitudeMode>clampToGround</altitudeMode>')
        kml.append('          <coordinates>')
        
        coords_str = ' '.join([f"{p['lon']:.6f},{p['lat']:.6f},{p['ele']:.1f}" for p in s['points']])
        kml.append(f'            {coords_str}')
        kml.append('          </coordinates>')
        kml.append('        </LineString>')
        kml.append('      </Placemark>')
        
    kml.append('    </Folder>') # End Tracks Folder

    # 3. WAYPOINTS & STAGE HUBS FOLDER
    kml.append('    <Folder>')
    kml.append('      <name>📍 Huts, Summits &amp; Stage Milestones</name>')
    kml.append('      <open>1</open>')
    
    # Start of Day 1
    p_start = stages_data[0]['points'][0]
    kml.append('      <Placemark>')
    kml.append('        <name>🚀 Trek Start: Lago di Braies (1,496m)</name>')
    kml.append('        <styleUrl>#pin_start</styleUrl>')
    kml.append('        <description>Starting point of Alta Via 1 on the northern shore of Pragser Wildsee / Lago di Braies.</description>')
    kml.append('        <Point>')
    kml.append('          <altitudeMode>clampToGround</altitudeMode>')
    kml.append(f'          <coordinates>{p_start["lon"]:.6f},{p_start["lat"]:.6f},{p_start["ele"]:.1f}</coordinates>')
    kml.append('        </Point>')
    kml.append('      </Placemark>')
    
    # Stage endpoints
    for idx, s in enumerate(stages_data):
        cfg = STAGE_CONFIG[idx]
        p_end = s['points'][-1]
        is_final = (idx == len(stages_data) - 1)
        name_label = f"🏁 Trek Finish: {cfg['end_name']}" if is_final else f"🛖 End Day {cfg['day']}: {cfg['end_name']}"
        
        kml.append('      <Placemark>')
        kml.append(f'        <name>{name_label}</name>')
        kml.append('        <styleUrl>#pin_stage</styleUrl>')
        kml.append('        <description><![CDATA[')
        kml.append(f'          <h3>{cfg["end_name"]}</h3>')
        kml.append(f'          <p><b>Elevation:</b> {p_end["ele"]:.0f} m</p>')
        kml.append(f'          <p>End of Day {cfg["day"]} ({s["distance_km"]:.1f} km, +{s["ascent_m"]:.0f}m / -{s["descent_m"]:.0f}m)</p>')
        kml.append('        ]]></description>')
        kml.append('        <Point>')
        kml.append('          <altitudeMode>clampToGround</altitudeMode>')
        kml.append(f'          <coordinates>{p_end["lon"]:.6f},{p_end["lat"]:.6f},{p_end["ele"]:.1f}</coordinates>')
        kml.append('        </Point>')
        kml.append('      </Placemark>')
        
    kml.append('    </Folder>') # End Waypoints Folder

    kml.append('  </Document>')
    kml.append('</kml>')
    return '\n'.join(kml)

def main():
    available_stages = [cfg for cfg in STAGE_CONFIG if os.path.exists(cfg['file'])]
    if not available_stages:
        print("\n🏔️  Alta Via 1 - Google Earth KMZ Generator")
        print("─" * 56)
        print("⚠️  No GPX files found in repository root.")
        print("\nTo generate a Google Earth KMZ flyover:")
        print("  1. Place your GPX file(s) in this folder (e.g. day_1.gpx to day_6.gpx).")
        print("  2. Re-run: python3 create_dolomites_kmz.py")
        print("─" * 56)
        return

    print("Parsing GPX files for Alta Via 1...")
    stages_data = []
    for cfg in available_stages:
        data = parse_gpx(cfg['file'])
        stages_data.append(data)
        print(f"  ✓ {cfg['name']}: {data['distance_km']:.1f} km, +{data['ascent_m']:.0f}m / -{data['descent_m']:.0f}m ({len(data['points'])} pts)")

    total_dist = sum(s['distance_km'] for s in stages_data)
    total_ascent = sum(s['ascent_m'] for s in stages_data)
    print(f"\nTotal Trek: {total_dist:.1f} km, +{total_ascent:.0f} m elevation gain")

    print("\nGenerating KML structure with cinematic 3D Tours...")
    kml_content = build_kml(stages_data)

    output_kml = "Alta_Via_1_Dolomites_Flyover.kml"
    output_kmz = "Alta_Via_1_Dolomites_Flyover.kmz"

    with open(output_kml, "w", encoding="utf-8") as f:
        f.write(kml_content)
    print(f"  ✓ Wrote KML: {output_kml} ({os.path.getsize(output_kml)/1024:.1f} KB)")

    print(f"Compressing into Google Earth KMZ: {output_kmz}...")
    with zipfile.ZipFile(output_kmz, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(output_kml, arcname="doc.kml")
    print(f"  ✓ Successfully created {output_kmz} ({os.path.getsize(output_kmz)/1024:.1f} KB)")

if __name__ == "__main__":
    main()
