// Keeping the frame rate up, and measuring it.

// Drop the pixel ratio a step when frames run slow for a couple of seconds, and give it back once
// they are comfortably fast again (not too eagerly, or it would flip back and forth). Call the
// returned function every frame with the real frame time; onChange() runs after a change.
export function createResolutionAdapter(renderer, maxDpr, onChange) {
  const adapt = { t: 0, n: 0, sum: 0, calm: 0 };
  return function adaptResolution(raw) {
    if (raw > 0.25) return; // a stall (tab switch, loading), not the steady frame rate
    adapt.t += raw;
    adapt.n++;
    adapt.sum += raw;
    if (adapt.t < 2) return;
    const avg = adapt.sum / adapt.n;
    const dpr = renderer.getPixelRatio();
    let next = dpr;
    if (avg > 1 / 40) {
      adapt.calm = 0;
      if (dpr > 1) next = Math.max(1, dpr - 0.25);
    } else if (avg < 1 / 55) {
      if (dpr < maxDpr && ++adapt.calm >= 5) next = Math.min(maxDpr, dpr + 0.25); // ~10 s of smooth frames
    } else adapt.calm = 0;
    if (next !== dpr) {
      adapt.calm = 0;
      renderer.setPixelRatio(next);
      onChange();
    }
    Object.assign(adapt, { t: 0, n: 0, sum: 0 });
  };
}

// Dev only: open with ?stats to see draw calls (incl. the shadow pass), triangles and frame times —
// check these before and after any rendering change (see CLAUDE.md). Returns null when off;
// otherwise call begin() at the start of a frame and end(frameStart) once it is drawn.
export function createStats(renderer) {
  if (!(import.meta.env.DEV && new URLSearchParams(location.search).has('stats'))) return null;
  const stats = { el: document.createElement('pre'), n: 0, cpu: 0, t0: performance.now() };
  stats.el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;margin:0;padding:6px 8px;font:12px/1.4 monospace;color:#fff;background:#0009;border-radius:6px;pointer-events:none';
  document.body.appendChild(stats.el);
  renderer.info.autoReset = false;
  return {
    begin() {
      renderer.info.reset();
    },
    end(frameStart) {
      stats.n++;
      stats.cpu += performance.now() - frameStart;
      const now = performance.now();
      if (now - stats.t0 > 500) {
        const { calls, triangles } = renderer.info.render;
        const ms = (now - stats.t0) / stats.n;
        stats.el.textContent = `${(1000 / ms).toFixed(0)} fps · ${ms.toFixed(1)} ms/frame · CPU ${(stats.cpu / stats.n).toFixed(1)} ms\n${calls} draw calls · ${(triangles / 1000).toFixed(0)}k tris · ${renderer.info.programs.length} shaders`;
        Object.assign(stats, { n: 0, cpu: 0, t0: now });
      }
    },
  };
}
