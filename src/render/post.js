import * as THREE from 'three';

// Renders the scene into a (possibly low-res) target, then draws it to the screen with
// nearest-neighbour upscaling (pixel art) and an optional depth-based ink outline.
const fragmentShader = /* glsl */ `
  #include <packing>
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 texel;
  uniform float outline;
  uniform float near;
  uniform float far;
  uniform vec3 ink;
  varying vec2 vUv;

  // 1 / viewDepth is affine in screen space for planar surfaces, so its Laplacian
  // is ~0 on flat ground and spikes only at silhouettes.
  float invDepth(vec2 uv) {
    float z = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far);
    return 1.0 / max(z, 0.0001);
  }

  void main() {
    vec4 c = texture2D(tColor, vUv);
    if (outline > 0.5) {
      float w = invDepth(vUv);
      float lap = abs(4.0 * w
        - invDepth(vUv + vec2(texel.x, 0.0)) - invDepth(vUv - vec2(texel.x, 0.0))
        - invDepth(vUv + vec2(0.0, texel.y)) - invDepth(vUv - vec2(0.0, texel.y)));
      float edge = smoothstep(0.12, 0.35, lap / w);
      c.rgb = mix(c.rgb, ink, edge * 0.85);
    }
    gl_FragColor = c;
    // The scene was rendered linear into the target; tone map here like a direct render would.
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.pixel = 1;
    this.outline = false;
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.depth = new THREE.DepthTexture(1, 1);
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: this.depth });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.rt.texture },
        tDepth: { value: this.depth },
        texel: { value: new THREE.Vector2() },
        outline: { value: 0 },
        near: { value: 0.1 },
        far: { value: 2000 },
        ink: { value: new THREE.Color('#2a1d17') },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quadScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize(w, h, dpr) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.resize();
  }

  setPixel(level) {
    this.pixel = level;
    this.resize();
  }

  setOutline(on) {
    this.outline = on;
    this.material.uniforms.outline.value = on ? 1 : 0;
  }

  resize() {
    const f = this.pixel;
    const sw = f > 1 ? Math.max(1, Math.floor(this.w / f)) : Math.floor(this.w * this.dpr);
    const sh = f > 1 ? Math.max(1, Math.floor(this.h / f)) : Math.floor(this.h * this.dpr);
    this.rt.setSize(sw, sh);
    const filter = f > 1 ? THREE.NearestFilter : THREE.LinearFilter;
    this.rt.texture.minFilter = filter;
    this.rt.texture.magFilter = filter;
    this.rt.texture.needsUpdate = true;
    this.material.uniforms.texel.value.set(1 / sw, 1 / sh);
  }

  render(scene, camera) {
    const r = this.renderer;
    if (this.pixel === 1 && !this.outline) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    this.material.uniforms.near.value = camera.near;
    this.material.uniforms.far.value = camera.far;
    r.render(this.quadScene, this.quadCam);
  }
}
