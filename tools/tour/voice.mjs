// Records the narrated tour of Tháp Nghinh Phong as MP3 (public/tour/nghinh-phong-<id>.mp3), one
// file per stop, with a neural Vietnamese voice — so that every browser hears it, not only those
// with a Vietnamese voice of their own (Chrome on Windows and Mac has none).
//
//   pip install edge-tts
//   node tools/tour/voice.mjs [voice] [rate]     # default vi-VN-HoaiMyNeural, -5%
//                                                # (or vi-VN-NamMinhNeural for a man's voice)
//
// Then listen to them and commit public/tour/*.mp3. Any recording with these names will do (a person
// reading the words, another speech service): the tour plays whatever is there.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tourAudio, tourWords } from '../../src/landmarks/nghinh-phong-tour.js';

const [voice = 'vi-VN-HoaiMyNeural', rate = '-5%'] = process.argv.slice(2);
mkdirSync('public/tour', { recursive: true });
for (const { id, say } of tourWords()) {
  const out = `public/${tourAudio(id)}`;
  execFileSync('edge-tts', ['--voice', voice, `--rate=${rate}`, '--text', say, '--write-media', out], { stdio: 'inherit' });
  console.log(`${out}: ${say.slice(0, 60)}…`);
}
