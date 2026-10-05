// @ts-check

// When there is no 3D: the browser has no WebGL (switched off, blocklisted driver, an old phone), or the
// GPU dropped the page's context while it ran. Instead of a loading screen that never ends, a card with a
// photo of the tower, a few words about it (the About dialog's own intro — index.html, verified facts only)
// and a button to try again.

/** Can this browser make a WebGL context? (`?nogl` pretends it can't, to see the fallback.) */
export function webglAvailable() {
  if (new URLSearchParams(location.search).has('nogl')) return false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return false;
    /** @type {any} */ (gl).getExtension('WEBGL_lose_context')?.loseContext(); // (give the context back: browsers allow only a few)
    return true;
  } catch {
    return false;
  }
}

const REASONS = {
  nogl: { title: 'Trình duyệt này chưa hiển thị được 3D', text: 'Sa bàn cần WebGL. Hãy bật tăng tốc phần cứng (hardware acceleration) trong cài đặt trình duyệt, cập nhật trình duyệt hoặc thử trên máy khác.' },
  lost: { title: 'Đồ họa 3D vừa bị tạm dừng', text: 'Trình duyệt đã thu hồi bộ nhớ đồ họa của trang (máy thiếu bộ nhớ hoặc trình điều khiển GPU khởi động lại). Tải lại trang để xem tiếp.' },
};

/**
 * Show the fallback card over (or instead of) the scene. Safe to call more than once.
 * @param {'nogl' | 'lost'} reason
 */
export function showFallback(reason) {
  if (document.getElementById('fallback')) return;
  const { title, text } = REASONS[reason];
  const intro = document.querySelector('#about .about-intro')?.textContent?.trim() ?? '';
  const base = /** @type {any} */ (import.meta).env?.BASE_URL ?? '/';
  const box = document.createElement('section');
  box.id = 'fallback';
  box.className = 'fallback';
  box.setAttribute('role', 'alert');
  box.dataset.reason = reason;
  box.innerHTML = `
    <div class="fallback-card card">
      <img class="fallback-photo" src="${base}og.png" width="1200" height="630" alt="Tháp Nghinh Phong bên bờ biển Tuy Hòa" />
      <h1 class="fallback-title"></h1>
      <p class="fallback-why"></p>
      <p class="fallback-intro"></p>
      <button type="button" class="chip fallback-retry">↻ Thử lại</button>
    </div>`;
  /** @type {HTMLElement} */ (box.querySelector('.fallback-title')).textContent = title;
  /** @type {HTMLElement} */ (box.querySelector('.fallback-why')).textContent = text;
  const introEl = /** @type {HTMLElement} */ (box.querySelector('.fallback-intro'));
  introEl.textContent = intro;
  introEl.hidden = !intro;
  box.querySelector('.fallback-retry')?.addEventListener('click', () => location.reload());
  const loading = document.getElementById('loading');
  if (loading) loading.hidden = true;
  (document.getElementById('app') ?? document.body).append(box);
  /** @type {HTMLElement} */ (box.querySelector('.fallback-retry')).focus({ preventScroll: true });
}
