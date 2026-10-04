# License of the map data, audio and images

The source code is under the GNU Affero General Public License v3.0 or later (see `LICENSE`).
This file says what the other parts of the repository are under.

## Map data — `src/worlds/data/*.json`

These files are databases built from open data and are licensed under the
**Open Database License (ODbL) 1.0**: <https://opendatacommons.org/licenses/odbl/1-0/>

- Streets, buildings, rivers, lakes and rails: © OpenStreetMap contributors, ODbL, through
  [Overture Maps](https://overturemaps.org) (buildings also from other open sources via the Overture Maps
  Foundation). OpenStreetMap's own attribution notice: <https://www.openstreetmap.org/copyright>.
- Elevation: SRTM 1 arc-second (NASA/USGS, public domain) via AWS Terrain Tiles.
- The exact sources and the Overture release are in the `sources` field of each file.

If you share these files, or a database made from them, keep this attribution and share it under the
ODbL. The tools that build them (`tools/import/`) are part of the source code (AGPL-3.0-or-later).

## Audio and images — `public/`

`public/tour/*.mp3` (the narration, made with Vbee AIVoice) and `public/og.png` are **not** under the
licenses above: all rights are reserved. Do not reuse them without permission. The narration voice is
subject to Vbee's own terms.

## The author's link

The person on the tower's square who shows a QR code (`features/host.js`) points at the author's own portfolio
(`url` in `src/worlds/nghinhphong.js`). That site and what it shows are the author's, not part of this
repository; a fork should put its own link there or leave the feature out.

## Third parties

- The tower itself, Tháp Nghinh Phong, was designed by HUNI architectes. The 3D model in this project is an
  illustration of it; no right to the real building's design or name is given by any license here.
- Libraries (such as three.js) keep their own licenses.
