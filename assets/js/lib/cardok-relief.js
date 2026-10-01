/**
 * Cardok — « Le relief » (W5). Scroll-driven 2.5D depth parallax on one photograph.
 * Dependency-free WebGL (≈3 KB min, replaces the planned OGL ≈25 KB): one quad, one texture pair.
 *
 *   <figure class="relief">
 *     <img src="e02-perroy-carlift-16x9-1920.avif" alt="…" width="1920" height="1080">   ← poster / LCP, stays in the DOM
 *   </figure>
 *   import { mountRelief } from './cardok-relief.js';
 *   addEventListener('load', () => requestIdleCallback(() =>
 *     mountRelief(document.querySelector('.relief'), { depth: 'd01-profondeur-perroy-1280.webp', amplitude: 0.018 })));
 *
 * - Offset = depth (white = near) × scroll progress of the figure through the viewport; zero at mid-course.
 * - The WebGL context exists only while the figure is in view (IntersectionObserver) and only ONE relief holds one at a time;
 *   leaving the viewport releases it (the <img> poster underneath takes over), coming back re-creates it.
 * - Returns null (keeps the still image) under prefers-reduced-motion, Save-Data, hardwareConcurrency <= 4, or no WebGL.
 * - Never driven by the mouse. No decorative motion beyond the 1.5–2 % amplitude.
 */
const VS = `attribute vec2 p; varying vec2 v; void main(){ v = p * .5 + .5; v.y = 1. - v.y; gl_Position = vec4(p, 0., 1.); }`;
const FS = `precision mediump float;
varying vec2 v; uniform sampler2D img, dep; uniform vec2 scale, shift; uniform float amp, prog;
void main(){
  vec2 uv = (v - .5) * scale + .5 + shift;           // object-fit: cover
  float d = texture2D(dep, uv).r;                      // 1 = near
  vec2 o = vec2(0., (d - .35) * amp * (prog - .5) * 2.);
  gl_FragColor = texture2D(img, uv + o);
}`;

let live = null; // the single relief holding a WebGL context

export async function mountRelief(figure, { depth, image, amplitude = 0.018 } = {}) {
  const img = figure.querySelector('img');
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const conn = navigator.connection;
  if (mq.matches || (conn && conn.saveData) || (navigator.hardwareConcurrency || 8) <= 4) return null;
  const src = image || img.currentSrc || img.src;
  const [ti, td] = await Promise.all([loadImage(src), loadImage(depth)]).catch(() => [null, null]);
  if (!ti || !td) return null;
  if (!document.createElement('canvas').getContext('webgl')) return null;
  if (getComputedStyle(figure).position === 'static') figure.style.position = 'relative';

  let g = null, raf = 0; // g = { canvas, gl, U } while active
  const aspectI = ti.naturalWidth / ti.naturalHeight;
  const progress = () => { const r = figure.getBoundingClientRect(); const vh = innerHeight; return Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height))); };
  const draw = () => { raf = 0; if (!g) return; g.gl.uniform1f(g.U('prog'), progress()); g.gl.drawArrays(g.gl.TRIANGLE_STRIP, 0, 4); };
  const resize = () => {
    if (!g) return;
    const r = figure.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio || 1, 2);
    g.canvas.width = Math.round(r.width * dpr); g.canvas.height = Math.round(r.height * dpr);
    g.gl.viewport(0, 0, g.canvas.width, g.canvas.height);
    // object-fit: cover, no overscan: the frame at mid-course is the poster pixel for pixel (edges clamp, ≤1.2 % smear on the near ground only)
    const aspectC = r.width / r.height;
    const sx = aspectC > aspectI ? 1 : aspectC / aspectI, sy = aspectC > aspectI ? aspectI / aspectC : 1;
    g.gl.uniform2f(g.U('scale'), sx, sy); g.gl.uniform2f(g.U('shift'), 0, 0);
    draw();
  };
  const activate = () => {
    if (g) return;
    if (live && live !== api) live.deactivate(); // one context at a time
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0', transition: 'opacity .4s cubic-bezier(.2,.7,.2,1)', pointerEvents: 'none' });
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
    if (!gl) return;
    figure.appendChild(canvas);
    const prog = program(gl, VS, FS); gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n) => gl.getUniformLocation(prog, n);
    texture(gl, 0, ti); texture(gl, 1, td);
    gl.uniform1i(U('img'), 0); gl.uniform1i(U('dep'), 1); gl.uniform1f(U('amp'), amplitude);
    g = { canvas, gl, U }; live = api;
    resize(); requestAnimationFrame(() => (canvas.style.opacity = '1'));
  };
  const deactivate = () => {
    if (!g) return; cancelAnimationFrame(raf); raf = 0;
    const ext = g.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext();
    g.canvas.remove(); g = null; if (live === api) live = null;
  };
  const onScroll = () => { if (g && !raf) raf = requestAnimationFrame(draw); };
  const io = new IntersectionObserver(([e]) => (e.isIntersecting ? activate() : deactivate()));
  const ro = new ResizeObserver(resize);
  const onMotion = () => { if (mq.matches) api.destroy(); };
  const api = {
    get canvas() { return g && g.canvas; },
    deactivate,
    destroy() { deactivate(); io.disconnect(); ro.disconnect(); removeEventListener('scroll', onScroll); mq.removeEventListener('change', onMotion); },
  };
  io.observe(figure); ro.observe(figure); addEventListener('scroll', onScroll, { passive: true }); mq.addEventListener('change', onMotion);
  return api;
}

function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
function texture(gl, unit, im) {
  const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(p, s); }
  gl.linkProgram(p); return p;
}
