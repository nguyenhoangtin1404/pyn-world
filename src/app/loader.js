// The loading screen: shown at start and while switching worlds — the world's name, the build
// step being done, a progress bar, and a hint that changes every few seconds.

const HINTS = [
  'Kéo chuột để xoay quanh thung lũng, lăn chuột để zoom.',
  'Bấm 1–7 để đổi góc máy quay — 6 đi theo một người, 7 đi theo một con chim.',
  'Ngày đêm tự trôi; bấm C để dừng/chạy đồng hồ, T để nhảy giờ.',
  'Tàu dừng ở từng ga để khách lên xuống.',
  'Bấm F để tìm đôi cừu đang yêu nhau.',
  'Bấm K để bay lên đỉnh núi, nơi dân leo núi vẫy tay chào.',
  'Bấm N để sang thế giới khác.',
];

export function createLoader() {
  const el = document.getElementById('loading');
  const logo = el.querySelector('.load-logo');
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
    show(title) {
      clearTimeout(hideTimer);
      logo.textContent = `🚂 ${title}`;
      progress(0);
      el.hidden = false;
      el.classList.remove('done');
      el.setAttribute('aria-busy', 'true');
      let h = 0;
      hint.textContent = HINTS[0];
      clearInterval(hintTimer);
      hintTimer = setInterval(() => (hint.textContent = HINTS[++h % HINTS.length]), 2600);
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
