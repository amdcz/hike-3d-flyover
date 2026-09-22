#!/usr/bin/env python3
"""
Generate optimized hike_data.json for the 3D Flyover Web App with:
- Ultra-smooth macro lookahead bearings (eliminates erratic switchback spinning)
- Clean per-stage boundaries
- Full GeoJSON stage lines
- Synchronized elevation profiles
"""

import glob
import json
import math
import os
import sys
import xml.etree.ElementTree as ET

STAGE_CONFIG = [
    {
        "file": "day_1.gpx",
        "day": 1,
        "name": "Day 1: Lago di Braies → Rifugio Pederü",
        "short_name": "Braies → Pederü",
        "start_name": "Lago di Braies",
        "end_name": "Rifugio Pederü",
        "color": "#00e5ff",
        "desc": "Turquoise waters of Pragser Wildsee, climbing over Forcella Sora Forno beneath Croda del Becco, then down Val Salata to Pederü."
    },
    {
        "file": "day_2.gpx",
        "day": 2,
        "name": "Day 2: Rifugio Pederü → Rifugio Lagazuoi",
        "short_name": "Pederü → Lagazuoi",
        "start_name": "Rifugio Pederü",
        "end_name": "Rifugio Lagazuoi",
        "color": "#00e676",
        "desc": "Traversing the vast lunar plateau of Fanes-Sennes, passing idyllic alpine lakes, and scaling the breathtaking crest to Rifugio Lagazuoi (2,761m)."
    },
    {
        "file": "day_3.gpx",
        "day": 3,
        "name": "Day 3: Rifugio Lagazuoi → Passo Giau",
        "short_name": "Lagazuoi → Passo Giau",
        "start_name": "Rifugio Lagazuoi",
        "end_name": "Passo Giau",
        "color": "#ffd600",
        "desc": "Descending from Lagazuoi past Passo Falzarego, climbing through Cinque Torri and Rifugio Averau, finishing at dramatic Passo Giau."
    },
    {
        "file": "day_4.gpx",
        "day": 4,
        "name": "Day 4: Passo Giau → Palafavera",
        "short_name": "Passo Giau → Palafavera",
        "start_name": "Passo Giau",
        "end_name": "Palafavera",
        "color": "#ff6d00",
        "desc": "Passing through Forcella Giau beneath towering limestone monoliths, crossing pastures under Monte Pelmo to Palafavera."
    },
    {
        "file": "day_5.gpx",
        "day": 5,
        "name": "Day 5: Palafavera → Rifugio Vazzoler",
        "short_name": "Palafavera → Vazzoler",
        "start_name": "Palafavera",
        "end_name": "Rifugio Vazzoler",
        "color": "#ff1744",
        "desc": "Ascending to shimmering Lago Coldai, followed by the grand traverse underneath the towering 1,000m northwest wall of Monte Civetta."
    },
    {
        "file": "day_6.gpx",
        "day": 6,
        "name": "Day 6: Rifugio Vazzoler → Passo Duran",
        "short_name": "Vazzoler → Passo Duran",
        "start_name": "Rifugio Vazzoler",
        "end_name": "Passo Duran",
        "color": "#d500f9",
        "desc": "Traversing underneath the Moiazza spires, passing Rifugio Carestiato, and descending to conclude the trek at Passo Duran."
    }
]

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2.0 * R * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

def calculate_bearing(lat1, lon1, lat2, lon2):
    y = math.sin(math.radians(lon2 - lon1)) * math.cos(math.radians(lat2))
    x = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - \
        math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(math.radians(lon2 - lon1))
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0

def parse_gpx(filepath):
    ns = {'gpx': 'http://www.topografix.com/GPX/1/1'}
    tree = ET.parse(filepath)
    root = tree.getroot()
    pts = root.findall('.//gpx:trkpt', ns)
    
    points = []
    total_dist = 0.0
    total_ascent = 0.0
    total_descent = 0.0
    prev = None
    
    for p in pts:
        lat = float(p.attrib['lat'])
        lon = float(p.attrib['lon'])
        ele_elem = p.find('gpx:ele', ns)
        ele = float(ele_elem.text) if ele_elem is not None else 0.0
        time_elem = p.find('gpx:time', ns)
        time_str = time_elem.text if time_elem is not None else ''
        
        # Privacy: Strip calendar date/year, keep only HH:MM for HUD clock display
        formatted_time = ''
        if time_str:
            if 'T' in time_str:
                formatted_time = time_str.split('T')[1][:5]
            else:
                formatted_time = time_str[:5]
        
        if prev is not None:
            d = haversine(prev['lat'], prev['lon'], lat, lon)
            total_dist += d
            de = ele - prev['ele']
            if de > 0:
                total_ascent += de
            else:
                total_descent += abs(de)
        
        pt = {
            'lat': lat,
            'lon': lon,
            'ele': ele,
            'time': formatted_time,
            'stage_dist': total_dist
        }
        points.append(pt)
        prev = pt
        
    return {
        'points': points,
        'distance_km': total_dist / 1000.0,
        'ascent_m': round(total_ascent),
        'descent_m': round(total_descent),
        'min_ele': round(min(p['ele'] for p in points)) if points else 0,
        'max_ele': round(max(p['ele'] for p in points)) if points else 0,
        'start_time': points[0]['time'] if points else '',
        'end_time': points[-1]['time'] if points else ''
    }

def generate_demo_stage_points(keypoints):
    """Interpolate smooth trail points (~75m apart) between key geographic landmarks."""
    points = []
    total_dist = 0.0
    total_ascent = 0.0
    total_descent = 0.0
    
    # Start at 08:30
    minute_counter = 510  # 8 * 60 + 30
    
    for seg_idx in range(len(keypoints) - 1):
        p1 = keypoints[seg_idx]
        p2 = keypoints[seg_idx + 1]
        seg_dist = haversine(p1['lat'], p1['lon'], p2['lat'], p2['lon'])
        steps = max(2, int(seg_dist / 75.0))
        
        for s in range(steps):
            t = s / float(steps)
            lat = p1['lat'] + (p2['lat'] - p1['lat']) * t
            lon = p1['lon'] + (p2['lon'] - p1['lon']) * t
            ele = p1['ele'] + (p2['ele'] - p1['ele']) * t
            
            # Subtle terrain wave for realism
            ele += math.sin(t * math.pi) * 15.0
            
            h = (minute_counter // 60) % 24
            m = minute_counter % 60
            time_str = f"{h:02d}:{m:02d}"
            
            if points:
                d = haversine(points[-1]['lat'], points[-1]['lon'], lat, lon)
                total_dist += d
                de = ele - points[-1]['ele']
                if de > 0:
                    total_ascent += de
                else:
                    total_descent += abs(de)
            
            points.append({
                'lat': lat,
                'lon': lon,
                'ele': ele,
                'time': time_str,
                'stage_dist': total_dist
            })
            minute_counter += 1

    last_p = keypoints[-1]
    h = (minute_counter // 60) % 24
    m = minute_counter % 60
    points.append({
        'lat': last_p['lat'],
        'lon': last_p['lon'],
        'ele': last_p['ele'],
        'time': f"{h:02d}:{m:02d}",
        'stage_dist': total_dist
    })

    return {
        'points': points,
        'distance_km': total_dist / 1000.0,
        'ascent_m': round(total_ascent),
        'descent_m': round(total_descent),
        'min_ele': round(min(p['ele'] for p in points)),
        'max_ele': round(max(p['ele'] for p in points)),
        'start_time': points[0]['time'],
        'end_time': points[-1]['time']
    }

DEMO_STAGES_WAYPOINTS = [
    # Day 1: Lago di Braies -> Rifugio Pederü
    [
        {"lat": 46.6983, "lon": 12.0854, "ele": 1496.0},
        {"lat": 46.6850, "lon": 12.0880, "ele": 1780.0},
        {"lat": 46.6711, "lon": 12.0722, "ele": 2388.0},
        {"lat": 46.6667, "lon": 12.0740, "ele": 2327.0},
        {"lat": 46.6540, "lon": 12.0510, "ele": 2116.0},
        {"lat": 46.6389, "lon": 12.0417, "ele": 1548.0}
    ],
    # Day 2: Rifugio Pederü -> Rifugio Lagazuoi
    [
        {"lat": 46.6389, "lon": 12.0417, "ele": 1548.0},
        {"lat": 46.6200, "lon": 12.0150, "ele": 1820.0},
        {"lat": 46.6083, "lon": 11.9972, "ele": 2060.0},
        {"lat": 46.5986, "lon": 12.0111, "ele": 2172.0},
        {"lat": 46.5650, "lon": 12.0220, "ele": 2180.0},
        {"lat": 46.5444, "lon": 12.0306, "ele": 2486.0},
        {"lat": 46.5278, "lon": 12.0083, "ele": 2752.0}
    ],
    # Day 3: Rifugio Lagazuoi -> Passo Giau
    [
        {"lat": 46.5278, "lon": 12.0083, "ele": 2752.0},
        {"lat": 46.5189, "lon": 12.0094, "ele": 2105.0},
        {"lat": 46.5150, "lon": 12.0350, "ele": 2080.0},
        {"lat": 46.5083, "lon": 12.0550, "ele": 2255.0},
        {"lat": 46.4994, "lon": 12.0417, "ele": 2413.0},
        {"lat": 46.4828, "lon": 12.0536, "ele": 2236.0}
    ],
    # Day 4: Passo Giau -> Palafavera
    [
        {"lat": 46.4828, "lon": 12.0536, "ele": 2236.0},
        {"lat": 46.4694, "lon": 12.0639, "ele": 2360.0},
        {"lat": 46.4528, "lon": 12.0833, "ele": 2277.0},
        {"lat": 46.4397, "lon": 12.1158, "ele": 1917.0},
        {"lat": 46.4222, "lon": 12.1028, "ele": 1766.0},
        {"lat": 46.4139, "lon": 12.1000, "ele": 1507.0}
    ],
    # Day 5: Palafavera -> Rifugio Vazzoler
    [
        {"lat": 46.4139, "lon": 12.1000, "ele": 1507.0},
        {"lat": 46.4083, "lon": 12.0833, "ele": 1816.0},
        {"lat": 46.4022, "lon": 12.0678, "ele": 2132.0},
        {"lat": 46.3986, "lon": 12.0639, "ele": 2143.0},
        {"lat": 46.3833, "lon": 12.0444, "ele": 2107.0},
        {"lat": 46.3764, "lon": 12.0361, "ele": 2250.0},
        {"lat": 46.3611, "lon": 12.0333, "ele": 1714.0}
    ],
    # Day 6: Rifugio Vazzoler -> Passo Duran
    [
        {"lat": 46.3611, "lon": 12.0333, "ele": 1714.0},
        {"lat": 46.3540, "lon": 12.0480, "ele": 1680.0},
        {"lat": 46.3472, "lon": 12.0611, "ele": 1823.0},
        {"lat": 46.3361, "lon": 12.0722, "ele": 1933.0},
        {"lat": 46.3264, "lon": 12.0833, "ele": 1834.0},
        {"lat": 46.3247, "lon": 12.0958, "ele": 1605.0}
    ]
]

def detect_stages():
    """Auto-detect GPX files in directory. If day_1.gpx to day_6.gpx exist, use the curated STAGE_CONFIG; otherwise dynamically discover any *.gpx."""
    # Check if standard day_1.gpx exists
    standard_files = [cfg for cfg in STAGE_CONFIG if os.path.exists(cfg['file'])]
    if standard_files:
        return standard_files, "Alta Via 1 • Dolomiti"
    
    # Auto-discover any .gpx files in root directory
    found_gpx = sorted(glob.glob("*.gpx"))
    if not found_gpx:
        return [], "3D Trail Flyover"
    
    palette = ['#00e5ff', '#00e676', '#ffd600', '#ff6d00', '#ff1744', '#d500f9', '#2979ff', '#76ff03', '#f50057', '#00e5ff']
    custom_configs = []
    overall_trek_name = None
    
    for i, gpx_file in enumerate(found_gpx):
        day = i + 1
        color = palette[i % len(palette)]
        track_name = f"Stage {day}"
        
        try:
            tree = ET.parse(gpx_file)
            root = tree.getroot()
            ns = {'gpx': 'http://www.topografix.com/GPX/1/1'}
            name_elem = root.find('.//gpx:trk/gpx:name', ns) or root.find('.//gpx:name', ns)
            if name_elem is not None and name_elem.text and name_elem.text.strip():
                track_name = name_elem.text.strip()
                if not overall_trek_name:
                    overall_trek_name = track_name
            else:
                base = os.path.splitext(os.path.basename(gpx_file))[0].replace('_', ' ').replace('-', ' ').title()
                track_name = f"Stage {day}: {base}"
        except Exception:
            pass
        
        custom_configs.append({
            "file": gpx_file,
            "day": day,
            "name": track_name,
            "short_name": f"Day {day}",
            "start_name": f"Stage {day} Start",
            "end_name": f"Stage {day} Finish",
            "color": color,
            "desc": f"GPS track imported from {gpx_file}"
        })
        
    return custom_configs, overall_trek_name or "Custom 3D Trail Flyover"

def main():
    is_demo = ('--demo' in sys.argv or '-d' in sys.argv)
    available_configs, detected_trek_name = detect_stages()
    
    if not available_configs and not is_demo:
        print("\n🏔️  3D Hike Data Generator")
        print("─" * 56)
        print("⚠️  No GPX files found in repository root.")
        print("\nTo generate data from your own hike:")
        print("  1. Place your GPX file(s) in this folder (e.g. any *.gpx files).")
        print("  2. Re-run: python3 generate_hike_data.py")
        print("\nTo generate a synthetic 3D flyover demonstration (no GPX needed):")
        print("  Run: python3 generate_hike_data.py --demo")
        print("─" * 56)
        return

    stages = []
    cumulative_distance = 0.0
    total_ascent_all = 0
    total_descent_all = 0
    
    all_animation_points = []
    elevation_profile = []
    milestones = []

    if is_demo:
        configs_to_process = STAGE_CONFIG
        trek_title = "Alta Via 1 • Dolomiti"
        mode_label = "Demo Synthetic Trek"
    else:
        configs_to_process = available_configs
        trek_title = detected_trek_name
        mode_label = f"{len(available_configs)} GPX Stage(s)"

    print(f"🏔️  Processing [{mode_label}]: {trek_title}...")

    for idx, cfg in enumerate(configs_to_process):
        if is_demo:
            data = generate_demo_stage_points(DEMO_STAGES_WAYPOINTS[idx])
        else:
            data = parse_gpx(cfg['file'])

        points = data['points']
        stage_dist_km = data['distance_km']
        coords = [[round(p['lon'], 6), round(p['lat'], 6), round(p['ele'], 1)] for p in points]
        
        # Sample points every ~80m
        sampled = [points[0]]
        for p in points[1:]:
            d = haversine(sampled[-1]['lat'], sampled[-1]['lon'], p['lat'], p['lon'])
            if d >= 80.0 or p == points[-1]:
                sampled.append(p)
                
        # Calculate macro lookahead bearings (look ahead ~400-500 meters along the trail)
        raw_bearings = []
        for i in range(len(sampled)):
            accum = 0.0
            target_idx = min(i + 1, len(sampled) - 1)
            for j in range(i + 1, len(sampled)):
                d = haversine(sampled[j-1]['lat'], sampled[j-1]['lon'], sampled[j]['lat'], sampled[j]['lon'])
                accum += d
                if accum >= 450.0 or j == len(sampled) - 1:
                    target_idx = j
                    break
            if target_idx == i:
                target_idx = max(0, i - 1)
                b = calculate_bearing(sampled[target_idx]['lat'], sampled[target_idx]['lon'],
                                      sampled[i]['lat'], sampled[i]['lon'])
            else:
                b = calculate_bearing(sampled[i]['lat'], sampled[i]['lon'],
                                      sampled[target_idx]['lat'], sampled[target_idx]['lon'])
            raw_bearings.append(b)

        # Apply circular smoothing filter across the stage
        smoothed_bearings = []
        for i in range(len(raw_bearings)):
            sin_sum = 0.0
            cos_sum = 0.0
            for j in range(max(0, i - 3), min(len(raw_bearings), i + 4)):
                rad = math.radians(raw_bearings[j])
                weight = 1.0 / (1.0 + abs(i - j) * 0.4)
                sin_sum += math.sin(rad) * weight
                cos_sum += math.cos(rad) * weight
            smoothed_bearings.append((math.degrees(math.atan2(sin_sum, cos_sum)) + 360.0) % 360.0)

        # Build animation points for this stage
        for i, p in enumerate(sampled):
            global_dist = cumulative_distance + (p['stage_dist'] / 1000.0)
            anim_pt = {
                'lon': round(p['lon'], 6),
                'lat': round(p['lat'], 6),
                'ele': round(p['ele'], 1),
                'bearing': round(smoothed_bearings[i], 1),
                'time': p['time'],
                'day': cfg['day'],
                'stage_idx': idx,
                'dist_km': round(global_dist, 2),
                'stage_dist_km': round(p['stage_dist'] / 1000.0, 2)
            }
            all_animation_points.append(anim_pt)
            
            elevation_profile.append({
                'dist_km': round(global_dist, 2),
                'ele': round(p['ele'], 1),
                'day': cfg['day'],
                'color': cfg['color'],
                'idx': len(all_animation_points) - 1
            })

        # Milestones
        milestones.append({
            'name': cfg['start_name'],
            'stage': cfg['day'],
            'type': 'start' if idx == 0 else 'stage_start',
            'lon': round(points[0]['lon'], 6),
            'lat': round(points[0]['lat'], 6),
            'ele': round(points[0]['ele']),
            'desc': f"Start of Day {cfg['day']}" if idx > 0 else "Official start of Alta Via 1"
        })
        milestones.append({
            'name': cfg['end_name'],
            'stage': cfg['day'],
            'type': 'finish' if idx == len(STAGE_CONFIG) - 1 else 'stage_end',
            'lon': round(points[-1]['lon'], 6),
            'lat': round(points[-1]['lat'], 6),
            'ele': round(points[-1]['ele']),
            'desc': f"End of Day {cfg['day']} ({stage_dist_km:.1f} km, +{data['ascent_m']}m)"
        })

        stages.append({
            'id': f"day_{cfg['day']}",
            'day': cfg['day'],
            'name': cfg['name'],
            'short_name': cfg['short_name'],
            'start_name': cfg['start_name'],
            'end_name': cfg['end_name'],
            'color': cfg['color'],
            'desc': cfg['desc'],
            'distance_km': round(stage_dist_km, 1),
            'ascent_m': data['ascent_m'],
            'descent_m': data['descent_m'],
            'min_ele': data['min_ele'],
            'max_ele': data['max_ele'],
            'start_time': data['start_time'],
            'end_time': data['end_time'],
            'point_count': len(points),
            'coordinates': coords
        })

        cumulative_distance += stage_dist_km
        total_ascent_all += data['ascent_m']
        total_descent_all += data['descent_m']

    geojson = {
        'type': 'FeatureCollection',
        'features': [
            {
                'type': 'Feature',
                'properties': {
                    'day': s['day'],
                    'name': s['name'],
                    'color': s['color'],
                    'distance_km': s['distance_km'],
                    'ascent_m': s['ascent_m']
                },
                'geometry': {
                    'type': 'LineString',
                    'coordinates': s['coordinates']
                }
            } for s in stages
        ]
    }

    # Check if the hike coordinates are in the Dolomites (lat ~46.0 - 47.0, lon ~11.5 - 12.5)
    avg_lat = sum(p['lat'] for p in all_animation_points) / max(1, len(all_animation_points))
    avg_lon = sum(p['lon'] for p in all_animation_points) / max(1, len(all_animation_points))
    is_in_dolomites = (46.0 <= avg_lat <= 47.0 and 11.5 <= avg_lon <= 12.5)

    if is_in_dolomites:
        extra_landmarks = [
            {"name": "Croda del Becco (2,810m)", "lat": 46.6711, "lon": 12.0722, "ele": 2810, "type": "peak"},
            {"name": "Monte Pelmo (3,168m)", "lat": 46.4294, "lon": 12.1336, "ele": 3168, "type": "peak"},
            {"name": "Monte Civetta (3,220m)", "lat": 46.3797, "lon": 12.0525, "ele": 3220, "type": "peak"},
            {"name": "Tofana di Rozes (3,225m)", "lat": 46.5369, "lon": 12.0503, "ele": 3225, "type": "peak"},
            {"name": "Cinque Torri", "lat": 46.5108, "lon": 12.0547, "ele": 2361, "type": "landmark"},
            {"name": "Lago di Coldai", "lat": 46.4022, "lon": 12.0678, "ele": 2143, "type": "lake"}
        ]
        milestones.extend(extra_landmarks)
    else:
        for s in stages:
            stage_pts = [p for p in all_animation_points if p.get('day') == s['day']]
            if stage_pts:
                peak_pt = max(stage_pts, key=lambda p: p['ele'])
                milestones.append({
                    "name": f"Stage {s['day']} Summit ({int(peak_pt['ele'])}m)",
                    "stage": s['day'],
                    "lat": peak_pt['lat'],
                    "lon": peak_pt['lon'],
                    "ele": int(peak_pt['ele']),
                    "type": "peak",
                    "desc": f"Highest point along Stage {s['day']}"
                })

    output = {
        'trek_name': trek_title,
        'summary': {
            'total_stages': len(stages),
            'total_distance_km': round(cumulative_distance, 1),
            'total_ascent_m': total_ascent_all,
            'total_descent_m': total_descent_all,
            'max_altitude_m': max(s['max_ele'] for s in stages),
            'min_altitude_m': min(s['min_ele'] for s in stages)
        },
        'stages': stages,
        'geojson': geojson,
        'animation_points': all_animation_points,
        'elevation_profile': elevation_profile,
        'milestones': milestones
    }

    with open("public/hike_data.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)
    print(f"✓ Re-generated public/hike_data.json with macro-smoothed bearings ({len(all_animation_points)} waypoints)")

if __name__ == "__main__":
    main()
