// @ts-check

// The visitor asked their system for less motion (prefers-reduced-motion): camera flights become cuts, the
// tour's slow circling stops, and the tour does not start by itself. Read live (it can change while the page is open).
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
