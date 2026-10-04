// Records the narrated tour of Tháp Nghinh Phong with Vbee AIVoice (vbee.vn), one MP3 per stop, into
// public/tour/nghinh-phong-<id>.mp3 — the files the tour plays (see voice.mjs for the free voice).
//
//   VBEE_APP_ID=… VBEE_TOKEN=… node tools/tour/voice-vbee.mjs
//
// From the Vbee console (API → app): the app id and its token. Never commit them.
// Optional: VBEE_VOICE (voice code, from the console's voice list; default: Tường Vy nâng cao, below), VBEE_SPEED (1.0),
// VBEE_API (default https://vbee.vn/api/v1/tts). Each request is queued at Vbee: the script asks for
// it, then polls until the audio link is ready and downloads it. If Vbee answers something
// unexpected the script stops and prints the answer as it came.
import { mkdirSync, writeFileSync } from 'node:fs';
import { tourAudio, tourWords } from '../../src/landmarks/nghinh-phong-tour.js';

const { VBEE_APP_ID: appId, VBEE_TOKEN: token } = process.env;
const voice = process.env.VBEE_VOICE ?? 'sg_female_tuongvy_call_24k-stl';
const speed = process.env.VBEE_SPEED ?? '1.0';
const api = process.env.VBEE_API ?? 'https://vbee.vn/api/v1/tts';
if (!appId || !token) {
  console.error('Thiếu VBEE_APP_ID hoặc VBEE_TOKEN (lấy trong trang quản lý API của Vbee).');
  process.exit(1);
}
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(res, what) {
  const body = await res.text();
  let data;
  try { data = JSON.parse(body); } catch { data = null; }
  if (!res.ok || !data) throw new Error(`${what}: HTTP ${res.status}\n${body}`);
  return data;
}

async function record(text) {
  const asked = await json(await fetch(api, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      app_id: appId,
      input_text: text,
      voice_code: voice,
      audio_type: 'mp3',
      bitrate: 128,
      speed_rate: speed,
      response_type: 'indirect',
      callback_url: 'https://example.com/vbee-callback', // (not used: the script polls)
    }),
  }), 'Gửi yêu cầu');
  const id = asked.result?.request_id;
  if (!id) throw new Error(`Vbee không trả request_id:\n${JSON.stringify(asked, null, 2)}`);
  for (let tries = 0; tries < 60; tries++) {
    await sleep(2000);
    const got = await json(await fetch(`${api}/${id}`, { headers }), 'Hỏi kết quả');
    const r = got.result ?? {};
    if (r.audio_link) {
      const audio = await fetch(r.audio_link);
      if (!audio.ok) throw new Error(`Tải file: HTTP ${audio.status}`);
      return Buffer.from(await audio.arrayBuffer());
    }
    if (/fail|error/i.test(String(r.status))) throw new Error(`Vbee báo lỗi:\n${JSON.stringify(got, null, 2)}`);
  }
  throw new Error(`Quá 2 phút chưa xong (request ${id}).`);
}

mkdirSync('public/tour', { recursive: true });
for (const { id, say } of tourWords()) {
  const out = `public/${tourAudio(id)}`;
  writeFileSync(out, await record(say));
  console.log(`${out}: ${say.slice(0, 60)}…`);
}
