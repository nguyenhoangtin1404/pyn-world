// A WorldConfig is the recipe for one world: everything that differs between worlds (layout,
// names, seed). The builders in src/world/ read it instead of module constants, so a new world is
// a new config file — see pyn.js for the fields.

const glslFloat = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

// Adds what is derived from the plain data: the river as a JS function and as the same function in
// GLSL (the water shader draws the current along it).
export function defineWorld(cfg) {
  const { x0, waves } = cfg.river;
  const riverX = (z) => waves.reduce((x, [a, f, p]) => x + a * Math.sin(z * f + p), x0);
  const terms = waves.map(([a, f, p]) => ` + (${glslFloat(a)}) * sin(z * ${glslFloat(f)} + (${glslFloat(p)}))`).join('');
  return {
    ...cfg,
    riverX,
    riverGLSL: `float riverX(float z) { return ${glslFloat(x0)}${terms}; }`,
  };
}
