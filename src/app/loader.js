// The loading screen: shown at start and while switching worlds — the world's name, the build
// step being done, a progress bar, and a hint that changes every few seconds.

// Hints for what the world being built has (`needs`: a feature id in its config; none: any world).
const HINTS = [
  { text: 'Kéo chuột để xoay quanh, lăn chuột để zoom, chuột phải để di chuyển ngang.' },
  { text: 'Ngày đêm tự trôi; bấm C để dừng/chạy đồng hồ, T để nhảy giờ.' },
  { text: 'Bảng điều khiển ở dưới màn hình: bấm "Mở bảng điều khiển" để đổi giờ, thời tiết, âm lượng.' },
  { text: 'Bấm V để bay tới tháp Nghinh Phong.', needs: 'landmarks' },
  { text: 'Bấm 9 để đi theo một du khách trên quảng trường tháp.', needs: 'tourists' },
  { text: 'Bấm 0 để theo một quả khinh khí cầu.', needs: 'balloons' },
  { text: 'Bấm 8 để đi theo một chiếc xe trên phố.', needs: 'citytraffic' },
  { text: 'Bấm 6 để đi theo một người đi dạo.', needs: 'strollers' },
  { text: 'Phố đông vào giờ cao điểm, vắng buổi trưa; chiều tối bãi biển và quảng trường lại đông.', needs: 'beach' },
  { text: 'Sau nửa đêm mọi người về nhà, ngoài biển thuyền câu mực sáng đèn.', needs: 'seacraft' },
  { text: 'Bấm 2 để theo tàu, 4 ngồi cùng hành khách, 5 lái tàu.', needs: 'train' },
  { text: 'Tàu dừng ở từng ga để khách lên xuống.', needs: 'train' },
  { text: 'Bấm F để tìm đôi cừu đang yêu nhau.', needs: 'sheep' },
  { text: 'Bấm K để bay lên đỉnh núi, nơi dân leo núi vẫy tay chào.', needs: 'hikers' },
];

/** The hints for a world: those for what it has. @param {{ features: (string | { id: string })[] }} cfg */
export function hintsFor(cfg) {
  const ids = new Set(cfg.features.map((f) => (typeof f === 'string' ? f : f.id)));
  return HINTS.filter((h) => !h.needs || ids.has(h.needs)).map((h) => h.text);
}

export function createLoader() {
  const el = document.getElementById('loading');
  const logo = el.querySelector('.load-logo');
  const sub = el.querySelector('.load-sub');
  const phase = document.getElementById('load-phase');
  const percent = document.getElementById('load-percent');
  const fill = el.querySelector('.load-fill');
  const bar = el.querySelector('[role="progressbar"]');
  const hint = document.getElementById('load-hint');
  let hintTimer = 0, hideTimer = 0;
  const progress = (pct) => {
    fill.style.width = `${pct}%`;
    percent.textContent = `${pct}%`;
    bar.setAttribute('aria-valuenow', String(pct));
  };
  return {
    /** @param {{ name: string, tagline?: string, icon?: string, track?: unknown, rail?: unknown, features: (string | { id: string })[] }} cfg */
    show(cfg) {
      clearTimeout(hideTimer);
      const train = cfg.features.some((f) => (typeof f === 'string' ? f : f.id) === 'train');
      logo.textContent = `${cfg.icon ?? (train ? '🚂' : '🏛')} ${cfg.name}`;
      sub.textContent = cfg.tagline ?? 'SA BÀN LOW-POLY';
      const hints = hintsFor(cfg);
      progress(0);
      el.hidden = false;
      el.classList.remove('done');
      el.setAttribute('aria-busy', 'true');
      let h = 0;
      hint.textContent = hints[0];
      clearInterval(hintTimer);
      hintTimer = setInterval(() => (hint.textContent = hints[++h % hints.length]), 2600);
    },
    phase: (text) => (phase.textContent = text),
    progress,
    error(err) {
      clearInterval(hintTimer);
      phase.textContent = `Lỗi: ${err.message}`;
      console.error(err);
    },
    hide() {
      clearInterval(hintTimer);
      el.classList.add('done');
      el.setAttribute('aria-busy', 'false');
      hideTimer = setTimeout(() => (el.hidden = true), 700);
    },
  };
}
