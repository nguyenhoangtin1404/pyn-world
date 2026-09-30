#!/usr/bin/env python3
"""Overture Maps → the same JSON as an Overpass answer (`out geom`), for build.mjs --osm.

Overture (https://overturemaps.org) publishes OpenStreetMap's roads, railways, waterways and
buildings (plus buildings from other open sources) as GeoParquet on AWS S3 — reachable where the
OpenStreetMap servers are not. Only the parts overlapping the box are read (HTTP range requests).

    pip install pyarrow shapely
    python3 tools/import/overture.py tools/import/tuyhoa.vectors.json > .cache/overture/tuyhoa.json

Tags written (OSM names, so osm.mjs reads either source the same way):
  highway=<class> (+ name), railway=rail, waterway=<class>, building=<class or yes> (+ height,
  building:levels, name); rivers, lakes and ponds as areas: multipolygon relations tagged
  natural=water, water=<class> (+ name), their islands as inner members; named places as nodes
  (name, overture:category only: Overture's categories are too loose to make places from — a
  café tagged as a historic site — so build.mjs only checks the recipe's places against them). Licences: see https://docs.overturemaps.org/attribution (ODbL for the
  OpenStreetMap-derived themes).
"""
import json, math, sys
import pyarrow.dataset as ds, pyarrow.fs as fs
from shapely import wkb

RELEASE = '2026-09-23.1'
EARTH, RAD = 6371008.8, math.pi / 180

def box(recipe):
    lat0, lon0 = recipe['center']
    d_lat = recipe['halfExtent'] / (EARTH * RAD)
    d_lon = recipe['halfExtent'] / (EARTH * RAD * math.cos(lat0 * RAD))
    return lat0 - d_lat, lon0 - d_lon, lat0 + d_lat, lon0 + d_lon

def read(s3, theme, typ, b, columns):
    s, w, n, e = b
    d = ds.dataset(f'overturemaps-us-west-2/release/{RELEASE}/theme={theme}/type={typ}/', filesystem=s3, format='parquet')
    f = (ds.field('bbox', 'xmin') < e) & (ds.field('bbox', 'xmax') > w) & (ds.field('bbox', 'ymin') < n) & (ds.field('bbox', 'ymax') > s)
    return d.to_table(filter=f, columns=columns).to_pylist()

def geom(coords):
    return [{'lat': round(y, 7), 'lon': round(x, 7)} for x, y in coords]

def name(row):
    return (row.get('names') or {}).get('primary')

def main():
    recipe = json.load(open(sys.argv[1]))
    b = box(recipe)
    s3 = fs.S3FileSystem(anonymous=True, region='us-west-2')
    elements, nid = [], 0

    def way(tags, coords):
        nonlocal nid
        nid += 1
        elements.append({'type': 'way', 'id': nid, 'tags': {k: v for k, v in tags.items() if v is not None}, 'geometry': geom(coords)})

    for row in read(s3, 'transportation', 'segment', b, ['id', 'subtype', 'class', 'names', 'geometry']):
        g = wkb.loads(row['geometry'])
        lines = list(g.geoms) if g.geom_type == 'MultiLineString' else [g]
        for line in lines:
            if row['subtype'] == 'road':
                way({'highway': row['class'] or 'road', 'name': name(row)}, line.coords)
            elif row['subtype'] == 'rail' and row['class'] not in ('subway', 'tram', 'funicular', 'monorail') and 'cao tốc' not in (name(row) or '').lower():
                # (The North–South high-speed line is only planned: not on the ground yet.)
                way({'railway': 'rail', 'name': name(row)}, line.coords)
            elif row['subtype'] == 'water':
                way({'waterway': row['class'] or 'stream', 'name': name(row)}, line.coords)

    for row in read(s3, 'buildings', 'building', b, ['id', 'class', 'names', 'height', 'num_floors', 'geometry']):
        g = wkb.loads(row['geometry'])
        polys = list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]
        for p in polys:
            way({
                'building': row['class'] or 'yes',
                'name': name(row),
                'height': None if row['height'] is None else f"{row['height']:.1f}",
                'building:levels': None if row['num_floors'] is None else str(row['num_floors']),
            }, p.exterior.coords)

    for row in read(s3, 'base', 'water', b, ['subtype', 'class', 'names', 'geometry']):
        if row['subtype'] in ('ocean', 'human_made'):  # the sea comes from the elevation; pools are too small
            continue
        g = wkb.loads(row['geometry'])
        if g.geom_type not in ('Polygon', 'MultiPolygon'):
            continue
        for p in (list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]):
            nid += 1
            members = [{'type': 'way', 'role': 'outer', 'geometry': geom(p.exterior.coords)}]
            members += [{'type': 'way', 'role': 'inner', 'geometry': geom(r.coords)} for r in p.interiors]
            tags = {'type': 'multipolygon', 'natural': 'water', 'water': row['class'] or row['subtype'], 'name': name(row)}
            elements.append({'type': 'relation', 'id': nid, 'tags': {k: v for k, v in tags.items() if v is not None}, 'members': members})

    for row in read(s3, 'places', 'place', b, ['names', 'basic_category', 'geometry']):
        if not name(row):
            continue
        p = wkb.loads(row['geometry'])
        nid += 1
        tags = {'name': name(row), 'overture:category': row['basic_category']}
        elements.append({'type': 'node', 'id': nid, 'lat': round(p.y, 7), 'lon': round(p.x, 7), 'tags': {k: v for k, v in tags.items() if v is not None}})

    json.dump({'generator': f'Overture Maps {RELEASE} (tools/import/overture.py)', 'elements': elements}, sys.stdout, separators=(',', ':'))
    print(f'{len(elements)} phần tử', file=sys.stderr)

if __name__ == '__main__':
    main()
