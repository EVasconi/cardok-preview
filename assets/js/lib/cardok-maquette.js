/**
 * Cardok — « La maquette blanche » (W2).
 * Procedural, low-poly architect's model of the six Cardok solution families.
 * Principle diagrams only: platforms, posts, pits, canopy, disc, rails, generic car volumes.
 * No internal mechanism is modelled (no cylinders, chains or scissors are invented).
 *
 * Usage (live mode):
 *   import { mountMaquette } from './cardok-maquette.js';
 *   const m = await mountMaquette(canvas, { product: 'carlift', progress: 0 });
 *   m.setProgress(0.5);            // 0..1, e.g. from scroll
 *   m.setProduct('carsafe');       // 900 ms « ligne de plateau » reconfiguration
 *   m.destroy();
 *
 * Deterministic render (M04 sequences): createMaquette(product) + renderFrame(t).
 * three.js r182 is vendored in ./vendor (MIT).
 */
import * as THREE from '../vendor/three.module.min.js';

export const PRODUCTS = ['carlift', 'carsafe', 'carpark', 'turntable', 'slider', 'special'];

/* ---------- Cardok easing (DIRECTION-V2 tokens) ---------- */
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; const d = dx(t); if (Math.abs(e) < 1e-6 || !d) break; t -= e / d; }
    return sy(Math.min(1, Math.max(0, t)));
  };
}
export const EASE = {
  lift: bezier(0.65, 0, 0.35, 1),
  turn: bezier(0.45, 0.05, 0.25, 1),
  slide: bezier(0.7, 0, 0.2, 1),
  out: bezier(0.2, 0.7, 0.2, 1),
};
const seg = (t, a, b, ease = EASE.lift) => ease(Math.min(1, Math.max(0, (t - a) / (b - a))));

/* ---------- materials ---------- */
const RED = 0xea0001;
function makeMaterials() {
  const m = (color, rough = 0.92) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  return {
    white: m(0xf6f6f4),
    ground: m(0xf3f3f1),
    cut: m(0xdedede, 1),          // section poché (cut faces)
    pit: m(0xe9e9e7),
    deck: m(0xfbfbfa),
    car: m(0xfdfdfd, 0.8),
    glass: m(0xd0d2d5, 0.5),
    tyre: m(0xb9b9b9, 0.95),
    joint: m(0x9a9a9a, 1),
    plant: m(0xeef0ea, 1),
    red: new THREE.MeshStandardMaterial({ color: RED, roughness: 0.7, metalness: 0 }),
    shadow: null,
  };
}

/* ---------- geometry helpers ---------- */
function box(w, h, d, mat, x = 0, y = 0, z = 0, cast = true, receive = true) {
  const g = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.set(x, y, z); mesh.castShadow = cast; mesh.receiveShadow = receive;
  return mesh;
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

let _shadowTex = null;
function contactShadowTexture() {
  if (_shadowTex) return _shadowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  _shadowTex = new THREE.CanvasTexture(c);
  return _shadowTex;
}
function contactShadow(w, d, opacity = 0.5) {
  const mat = new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, opacity, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 1;
  return mesh;
}

/**
 * Generic car in volumes (no brand, no real model): length along +X (nose at +X).
 * 4.7 m x 1.85 m x 1.42 m.
 */
export function makeCar(M, { length = 4.7, width = 1.85, height = 1.42, shadow = true } = {}) {
  const car = new THREE.Group();
  const L = length / 2, s = length / 4.7, hs = height / 1.42;
  const wr = 0.34 * s, wy = wr, wxF = 1.47 * s, wxR = -1.42 * s;
  // lower body, side profile with wheel arches
  const body = new THREE.Shape();
  body.moveTo(-L + 0.04, 0.3 * hs);
  body.lineTo(wxR - wr - 0.08, 0.3 * hs);
  body.absarc(wxR, wy, wr + 0.07, Math.PI, 0, true);
  body.lineTo(wxF - wr - 0.07, 0.3 * hs);
  body.absarc(wxF, wy, wr + 0.07, Math.PI, 0, true);
  body.lineTo(L - 0.08, 0.3 * hs);
  body.quadraticCurveTo(L + 0.02, 0.36 * hs, L, 0.52 * hs);
  body.quadraticCurveTo(L - 0.02, 0.66 * hs, L - 0.25, 0.7 * hs);
  body.lineTo(0.85 * s, 0.86 * hs);
  body.lineTo(-1.85 * s, 0.9 * hs);
  body.quadraticCurveTo(-L + 0.02, 0.9 * hs, -L, 0.72 * hs);
  body.quadraticCurveTo(-L - 0.02, 0.4 * hs, -L + 0.04, 0.3 * hs);
  const bw = width - 0.12;
  const bodyG = new THREE.ExtrudeGeometry(body, { depth: bw, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.07, bevelSegments: 3, curveSegments: 12 });
  bodyG.translate(0, 0, -bw / 2);
  const bodyM = new THREE.Mesh(bodyG, M.car); bodyM.castShadow = bodyM.receiveShadow = true; car.add(bodyM);
  // cabin / greenhouse (fastback, tumblehome: narrower than the body)
  const cab = new THREE.Shape();
  cab.moveTo(-1.95 * s, 0.88 * hs);
  cab.lineTo(0.82 * s, 0.86 * hs);
  cab.quadraticCurveTo(0.25 * s, 1.28 * hs, -0.1 * s, height - 0.04);
  cab.lineTo(-0.8 * s, height - 0.04);
  cab.quadraticCurveTo(-1.4 * s, 1.3 * hs, -1.95 * s, 0.88 * hs);
  const cw = width - 0.44;
  const cabG = new THREE.ExtrudeGeometry(cab, { depth: cw, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.09, bevelSegments: 3, curveSegments: 12 });
  cabG.translate(0, 0, -cw / 2);
  const cabM = new THREE.Mesh(cabG, M.glass); cabM.castShadow = cabM.receiveShadow = true; car.add(cabM);
  // white roof panel flush on the flat part of the greenhouse (reads as windscreen / roof / rear window, also from above)
  const roofT = height - 0.04 + 0.07;
  const roof = box(0.78 * s, 0.024, cw + 0.1, M.car, -0.45 * s, roofT - 0.009, 0, true, true);
  car.add(roof);
  // wheels
  const wg = new THREE.CylinderGeometry(wr, wr, 0.24, 24); wg.rotateX(Math.PI / 2);
  for (const x of [wxF, wxR]) for (const z of [-(width / 2 - 0.16), width / 2 - 0.16]) {
    const w = new THREE.Mesh(wg, M.tyre); w.position.set(x, wy, z); w.castShadow = true; car.add(w);
  }
  if (shadow) { const sh = contactShadow(length * 1.12, width * 1.35, 0.55); sh.position.y = 0.012; car.add(sh); }
  return car;
}

/* ---------- ground block with a pit (architect's section model) ----------
 * Block top at y = 0. Pit (shaft) opening = pw (x) by pd (z), centred at x = 0,
 * touching the FRONT face (z = +Z/2): the front face is the cut, so the shaft is read in section.
 */
function groundWithPit(M, { X = 15, Z = 9, T = 3.1, pw = 6.0, pd = 2.9, depth = 2.75, joint = 0.03, cx = 0 } = {}) {
  const g = new THREE.Group();
  const zf = Z / 2, zb = zf - pd; // pit spans z in [zb, zf]
  const hw = pw / 2 + joint;
  // slab = one extruded outline with the shaft opening (no seams on the top face)
  const outer = new THREE.Shape();
  const x0 = cx - X / 2, x1 = cx + X / 2;
  outer.moveTo(x0, -Z / 2); outer.lineTo(x1, -Z / 2); outer.lineTo(x1, zf); outer.lineTo(hw, zf);
  outer.lineTo(hw, zf - pd - joint); outer.lineTo(-hw, zf - pd - joint); outer.lineTo(-hw, zf); outer.lineTo(x0, zf); outer.lineTo(x0, -Z / 2);
  const slabG = new THREE.ExtrudeGeometry(outer, { depth: T, bevelEnabled: false });
  slabG.rotateX(Math.PI / 2); // shape XY -> XZ plane, extruded downward from y = 0
  const slab = new THREE.Mesh(slabG, M.ground); slab.castShadow = slab.receiveShadow = true; g.add(slab);
  // pit floor
  g.add(box(2 * hw, T - depth, pd + joint, M.ground, 0, -depth - (T - depth) / 2, zf - (pd + joint) / 2));
  // cut faces overlay (front section plane, slightly grey) — thin plates flush with the front face
  const cutL = box(-hw - x0, T, 0.005, M.cut, (x0 - hw) / 2, -T / 2, zf + 0.003, false, false);
  const cutR = box(x1 - hw, T, 0.005, M.cut, (x1 + hw) / 2, -T / 2, zf + 0.003, false, false);
  const cutB = box(2 * hw, T - depth, 0.005, M.cut, 0, -depth - (T - depth) / 2, zf + 0.003, false, false);
  g.add(cutL, cutR, cutB);
  return { group: g, zCenter: zf - pd / 2, depth };
}
function plainGround(M, { X = 15, Z = 11, T = 0.6 } = {}) {
  const g = new THREE.Group();
  g.add(box(X, T, Z, M.ground, 0, -T / 2, 0));
  g.add(box(X, T, 0.005, M.cut, 0, -T / 2, Z / 2 + 0.003, false, false));
  return g;
}
function redEdge(M, w, d, y, z) { // thin red band on the front edge of a moving platform (the site's « plateforme rouge »)
  return box(w, 0.045, 0.012, M.red, 0, y, z, false, false);
}

/* ---------- products ---------- */
const BUILDERS = {
  /* CarLift: canopy on 4 posts over the platform; closed = roof flush with the paving. */
  carlift(M, opt) {
    const outer = new THREE.Group();
    const root = new THREE.Group(); root.rotation.y = -Math.PI / 2; outer.add(root); // shaft cut on the left face, car drives towards the viewer
    const pw = 6.0, pd = 2.9, H = 2.45; // post height platform->roof
    const G = groundWithPit(M, { X: 13.6, Z: 7.4, cx: -2.8, pw, pd, depth: H + 0.32 });
    root.add(G.group);
    const lift = new THREE.Group(); lift.position.z = G.zCenter; root.add(lift);
    const deck = box(pw - 0.04, 0.14, pd - 0.04, M.deck, 0, -0.07, 0); lift.add(deck);
    if (opt.accent) lift.add(redEdge(M, pw - 0.04, 0, -0.07, pd / 2 - 0.013));
    const roof = box(pw - 0.04, 0.16, pd - 0.04, M.white, 0, H - 0.08, 0); lift.add(roof);
    for (const x of [-(pw / 2 - 0.18), pw / 2 - 0.18]) for (const z of [-(pd / 2 - 0.14), pd / 2 - 0.14])
      lift.add(box(0.13, H - 0.16, 0.13, M.white, x, (H - 0.16) / 2, z));
    const car = makeCar(M); root.add(car);
    const carStartX = -6.7;
    return {
      update(t) {
        const up = seg(t, 0.06, 0.34) - seg(t, 0.62, 0.94);
        lift.position.y = -H + up * H;
        const drive = seg(t, 0.36, 0.6, EASE.out);
        const onDeck = t >= 0.6;
        car.position.set(carStartX + (0 - carStartX) * drive, onDeck ? lift.position.y : 0, G.zCenter);
      },
      root: outer,
      camera: { pos: [-12, 8.5, 11], target: [0, 0, 0], fov: 30 },
    };
  },

  /* CarSafe: planted top slab flush with the garden; lifts on 4 posts, lower platform + car come up to ground level. */
  carsafe(M, opt) {
    const root = new THREE.Group();
    const pw = 5.8, pd = 2.9, H = 2.2;
    const G = groundWithPit(M, { X: 11.5, Z: 7.4, pw, pd, depth: H + 0.3 });
    root.add(G.group);
    const lift = new THREE.Group(); lift.position.z = G.zCenter; root.add(lift);
    const lower = box(pw - 0.04, 0.14, pd - 0.04, M.deck, 0, -0.07, 0); lift.add(lower);
    if (opt.accent) lift.add(redEdge(M, pw - 0.04, 0, -0.07, pd / 2 - 0.013));
    const top = box(pw - 0.04, 0.22, pd - 0.04, M.white, 0, H - 0.11, 0); lift.add(top);
    // planted inset on the top slab (garden roof): low seeded tufts, all white
    const r = rng(7), NT = 900;
    const tufts = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), M.plant, NT);
    const o = new THREE.Object3D();
    for (let i = 0; i < NT; i++) {
      const s = 0.035 + r() * 0.05;
      o.scale.set(s * 1.2, s * (0.6 + r() * 0.8), s * 1.2);
      o.position.set((r() - 0.5) * (pw - 0.45), H + 0.005, (r() - 0.5) * (pd - 0.4));
      o.rotation.set(0, r() * 6.28, 0); o.updateMatrix(); tufts.setMatrixAt(i, o.matrix);
    }
    tufts.castShadow = true; tufts.receiveShadow = true;
    lift.add(tufts);
    for (const x of [-(pw / 2 - 0.16), pw / 2 - 0.16]) for (const z of [-(pd / 2 - 0.14), pd / 2 - 0.14])
      lift.add(box(0.13, H - 0.22, 0.13, M.white, x, (H - 0.22) / 2, z));
    const car = makeCar(M); car.position.set(0, 0, 0); lift.add(car);
    return {
      root,
      update(t) {
        const up = seg(t, 0.1, 0.72);
        lift.position.y = -H + up * H;
      },
      camera: { pos: [9.5, 7.2, 14.5], target: [0, -0.3, 0.8], fov: 30 },
    };
  },

  /* CarPark: indoor 2-post lift; platform rises with the first car, second car parks underneath. */
  carpark(M, opt) {
    const root = new THREE.Group();
    const fl = new THREE.Group(); fl.add(plainGround(M, { X: 7.5, Z: 11.6 })); fl.position.z = 0.3; root.add(fl);
    // room: back wall only (model cut), 3.9 m
    const wallH = 3.9;
    root.add(box(7.5, wallH, 0.25, M.white, 0, wallH / 2, -5.375));
    root.add(box(7.5, 0.004, 0.25, M.cut, 0, wallH + 0.002, -5.375, false, false));
    const pw = 2.75, pl = 5.4, H = 2.05, zBack = -4.6;
    const postH = 3.6;
    for (const x of [-(pw / 2 + 0.2), pw / 2 + 0.2]) root.add(box(0.3, postH, 0.34, M.white, x, postH / 2, zBack + 0.1));
    const plat = new THREE.Group(); root.add(plat);
    plat.add(box(pw, 0.12, pl, M.deck, 0, 0.06, zBack + 0.35 + pl / 2));
    for (const x of [-(pw / 2 - 0.05), pw / 2 - 0.05]) plat.add(box(0.1, 0.1, pl, M.white, x, 0.17, zBack + 0.35 + pl / 2));
    for (const x of [-(pw / 2 + 0.1), pw / 2 + 0.1]) plat.add(box(0.22, 0.5, 0.7, M.white, x, 0.25, zBack + 0.45)); // carriages on the posts
    if (opt.accent) plat.add(redEdge(M, pw, 0, 0.06, zBack + 0.35 + pl + 0.006));
    const carA = makeCar(M); carA.rotation.y = Math.PI / 2; carA.position.set(0, 0.12, zBack + 0.35 + pl / 2 + 0.05); plat.add(carA);
    const carB = makeCar(M); carB.rotation.y = Math.PI / 2; root.add(carB);
    const zB = zBack + 0.35 + pl / 2 + 0.1;
    return {
      root,
      update(t) {
        plat.position.y = seg(t, 0.08, 0.52) * H;
        const d = seg(t, 0.58, 0.94, EASE.out);
        carB.position.set(0, 0, 3.55 + (zB - 3.55) * d); // second car waits in front, then parks underneath
      },
      camera: { pos: [10.5, 7.4, 13.5], target: [-0.6, 1.1, -0.8], fov: 32 },
    };
  },

  /* Turntable: disc flush with the paving, same finish, separated by a fine circular joint; 180°. */
  turntable(M, opt) {
    const root = new THREE.Group();
    root.add(plainGround(M, { X: 8.6, Z: 8.6 }));
    const R = 2.9;
    const ring = new THREE.Mesh(new THREE.RingGeometry(R, R + 0.035, 128), M.joint);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.003; ring.receiveShadow = true; root.add(ring);
    const disc = new THREE.Group(); root.add(disc);
    const top = new THREE.Mesh(new THREE.CircleGeometry(R, 128), M.ground);
    top.rotation.x = -Math.PI / 2; top.position.y = 0.002; top.receiveShadow = true; disc.add(top);
    if (opt.accent) { // a short red arc on the disc edge reads the rotation
      const arc = new THREE.Mesh(new THREE.RingGeometry(R - 0.09, R - 0.04, 48, 1, -0.25, 0.5), M.red);
      arc.rotation.x = -Math.PI / 2; arc.position.y = 0.004; disc.add(arc);
    }
    const car = makeCar(M); disc.add(car);
    return {
      root,
      update(t) { disc.rotation.y = Math.PI * 0.12 + seg(t, 0.08, 0.92, EASE.turn) * Math.PI; },
      camera: { pos: [8.5, 8.6, 12.0], target: [0, 0.2, 0], fov: 30 },
    };
  },

  /* Slider: steel platforms resting on floor rails, sliding sideways (as photo #71). */
  slider(M, opt) {
    const root = new THREE.Group();
    const fl = new THREE.Group(); fl.add(plainGround(M, { X: 11.5, Z: 8.4 })); fl.position.z = -1.05; root.add(fl);
    const wallH = 3.2;
    root.add(box(11.5, wallH, 0.25, M.white, 0, wallH / 2, -5.375));
    root.add(box(11.5, 0.004, 0.25, M.cut, 0, wallH + 0.002, -5.375, false, false));
    for (const x of [-5.0, 5.0]) root.add(box(0.45, wallH, 0.45, M.white, x, wallH / 2, -4.6));
    const bay = 2.85, pl = 5.3, zc = -1.2;
    for (const z of [zc - pl / 2 + 0.6, zc + pl / 2 - 0.6])
      root.add(box(bay * 3 + 0.4, 0.03, 0.09, M.joint, 0, 0.015, z, false, true)); // rails
    const plats = [];
    for (let i = 0; i < 2; i++) {
      const p = new THREE.Group();
      p.add(box(bay - 0.12, 0.1, pl, M.deck, 0, 0.08, zc));
      for (const x of [-(bay / 2 - 0.1), bay / 2 - 0.1]) p.add(box(0.06, 0.06, pl, M.white, x, 0.16, zc));
      if (opt.accent) p.add(redEdge(M, bay - 0.12, 0, 0.08, zc + pl / 2 + 0.006));
      const c = makeCar(M); c.rotation.y = Math.PI / 2; c.position.set(0, 0.13, zc); p.add(c);
      root.add(p); plats.push(p);
    }
    return {
      root,
      update(t) {
        const s = seg(t, 0.1, 0.9, EASE.slide);
        plats[0].position.x = -bay + s * bay; // bays: [-bay, 0, +bay]; empty bay moves from right to left
        plats[1].position.x = 0 + s * bay;
      },
      camera: { pos: [9.5, 7.8, 13.5], target: [0, 0.6, -1.0], fov: 32 },
    };
  },

  /* Projets spéciaux: a lift platform carrying a turntable disc — rises one level, then turns 180°. */
  special(M, opt) {
    const root = new THREE.Group();
    const pw = 6.0, pd = 6.0, depth = 2.95;
    // square shaft, centred, reaching the front cut
    const G = groundWithPit(M, { X: 11, Z: 9, pw, pd, depth: depth + 0.25 });
    root.add(G.group);
    const lift = new THREE.Group(); lift.position.z = G.zCenter; root.add(lift);
    lift.add(box(pw - 0.04, 0.16, pd - 0.04, M.deck, 0, -0.08, 0));
    if (opt.accent) lift.add(redEdge(M, pw - 0.04, 0, -0.08, pd / 2 - 0.013));
    const R = 2.75;
    const ring = new THREE.Mesh(new THREE.RingGeometry(R, R + 0.035, 128), M.joint);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004; lift.add(ring);
    const disc = new THREE.Group(); lift.add(disc);
    const top = new THREE.Mesh(new THREE.CircleGeometry(R, 128), M.deck);
    top.rotation.x = -Math.PI / 2; top.position.y = 0.003; top.receiveShadow = true; disc.add(top);
    const car = makeCar(M); disc.add(car);
    return {
      root,
      update(t) {
        lift.position.y = -depth + seg(t, 0.06, 0.5) * depth;
        disc.rotation.y = seg(t, 0.56, 0.94, EASE.turn) * Math.PI;
      },
      camera: { pos: [10.5, 9.0, 15.5], target: [0, -0.8, 1.2], fov: 30 },
    };
  },
};

/* ---------- scene ---------- */
export function createMaquette(product = 'carlift', { accent = true, background = 0xffffff } = {}) {
  if (!BUILDERS[product]) throw new Error('Unknown product ' + product);
  const scene = new THREE.Scene();
  scene.background = background === null ? null : new THREE.Color(background);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xcfcfcf, 1.55); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.position.set(-7, 14, 9); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 6; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.045;
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45); fill.position.set(9, 5, 12); scene.add(fill);
  const M = makeMaterials();
  const built = BUILDERS[product](M, { accent });
  scene.add(built.root);
  const cam = new THREE.PerspectiveCamera(built.camera.fov, 4 / 3, 0.5, 200);
  const m = { scene, camera: cam, product, root: built.root, materials: M, dir: new THREE.Vector3(...built.camera.pos).sub(new THREE.Vector3(...built.camera.target)).normalize(), target: new THREE.Vector3(), update: built.update, margin: built.camera.margin || 0.84 };
  // framing points = model vertices at several animation states (so nothing leaves the frame)
  const pts = [], v = new THREE.Vector3(), bb = new THREE.Box3();
  for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    built.update(t); built.root.updateMatrixWorld(true);
    built.root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.material.transparent) return;
      const pos = o.geometry.attributes.position; const step = Math.max(1, Math.floor(pos.count / 400));
      for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); pts.push(v.clone()); bb.expandByPoint(v); }
    });
  }
  m.pts = pts; m.bbox = bb;
  built.update(0);
  fitCamera(m, 4 / 3);
  return m;
}

/** Frame the model's animation-union bounding box in the viewport (aspect), keeping the product's viewing direction. */
export function fitCamera(m, aspect) {
  const cam = m.camera; cam.aspect = aspect; cam.updateProjectionMatrix();
  m.bbox.getCenter(m.target);
  const q = new THREE.Vector3();
  const measure = (d) => {
    cam.position.copy(m.target).addScaledVector(m.dir, d); cam.lookAt(m.target); cam.updateMatrixWorld(true);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of m.pts) { q.copy(p).project(cam); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    return { x0, x1, y0, y1 };
  };
  const search = () => {
    let lo = 1, hi = 300;
    for (let i = 0; i < 36; i++) {
      const d = (lo + hi) / 2, r = measure(d);
      if (Math.max(r.x1 - r.x0, r.y1 - r.y0) / 2 > m.margin) lo = d; else hi = d;
    }
    return hi;
  };
  for (let pass = 0; pass < 3; pass++) { // recentre the projected silhouette, then refit
    const d = search(), r = measure(d);
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    const h = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * d, w = h * aspect;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    m.target.addScaledVector(right, cx * w).addScaledVector(up, cy * h);
  }
  const dist = search();
  cam.position.copy(m.target).addScaledVector(m.dir, dist); cam.lookAt(m.target); cam.updateMatrixWorld(true);
  m.baseCam = cam.position.clone();
}

export function createRenderer(canvas, { width = 1600, height = 1200, pixelRatio = 1, alpha = false, preserve = false } = {}) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha, preserveDrawingBuffer: preserve, powerPreference: 'high-performance' });
  r.setPixelRatio(pixelRatio); r.setSize(width, height, false);
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.0;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.localClippingEnabled = true;
  return r;
}

/** Top-down orthographic car sprite (W4). Returns a data URL (PNG, transparent). Car nose points UP. */
export function renderCarTopDown(canvas, { width = 640, height = 1320 } = {}) {
  const r = createRenderer(canvas, { width, height, alpha: true, preserve: true });
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd0d0d0, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(-3, 10, 2); scene.add(sun);
  const M = makeMaterials();
  const car = makeCar(M, { shadow: true }); car.rotation.y = Math.PI / 2; scene.add(car);
  const k = 4.7 / 2 + 0.25; const a = width / height;
  const cam = new THREE.OrthographicCamera(-k * a, k * a, k, -k, 0.1, 50);
  cam.position.set(0, 20, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
  r.render(scene, cam);
  return canvas.toDataURL('image/png');
}

/* ---------- live mode ---------- */
export async function mountMaquette(canvas, { product = 'carlift', progress = 0, orbit = true, accent = true } = {}) {
  const rect = () => canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const renderer = createRenderer(canvas, { width: rect().width || 800, height: rect().height || 600, pixelRatio: dpr });
  renderer.setClearColor(0xffffff, 1); // the transition clears manually (autoClear off)
  let cur = createMaquette(product, { accent });
  let next = null, trans = null, p = progress, yaw = 0, raf = 0, dirty = true;
  const pivot = new THREE.Group();
  const clipOld = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);   // keeps y > h
  const clipNew = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);  // keeps y < h
  const applyYaw = (m) => {
    const off = m.baseCam.clone().sub(m.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    m.camera.position.copy(m.target).add(off); m.camera.lookAt(m.target);
  };
  const resize = () => {
    const { width, height } = rect(); if (!width || !height) return;
    renderer.setSize(width, height, false);
    for (const m of [cur, next]) if (m) fitCamera(m, width / height);
    dirty = true;
  };
  const setClip = (m, plane) => { for (const k in m.materials) { const mat = m.materials[k]; if (mat) { mat.clippingPlanes = plane ? [plane] : null; mat.needsUpdate = true; } } };

  const frame = (now) => {
    raf = 0;
    if (trans) {
      const k = EASE.lift(Math.min(1, (now - trans.t0) / 900));
      const h = -3.6 + k * 10; // the « ligne de plateau » climbs through the model
      clipOld.constant = -h; clipNew.constant = h;
      renderer.autoClear = false; renderer.clear();
      // camera eases from the old framing to the new one while the line climbs
      // orbit (slerp of the viewing direction + lerp of distance and target), never a straight line through the model
      const tgt = trans.fromT.clone().lerp(trans.toT, k);
      const q = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), trans.q, k);
      next.camera.position.copy(trans.fromDir).applyQuaternion(q).multiplyScalar(trans.d0 + (trans.d1 - trans.d0) * k).add(tgt);
      next.camera.lookAt(tgt);
      renderer.render(cur.scene, next.camera); // both halves share the travelling camera
      renderer.clearDepth();
      renderer.render(next.scene, next.camera);
      renderer.autoClear = true;
      if (k >= 1) { disposeMaquette(cur); cur = next; next = null; trans = null; setClip(cur, null); applyYaw(cur); dirty = true; }
      else { raf = requestAnimationFrame(frame); return; }
    }
    if (dirty) { cur.update(p); applyYaw(cur); renderer.render(cur.scene, cur.camera); dirty = false; }
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  // orbit ±25° on drag (pointer only, no wheel hijack)
  let drag = null;
  const onDown = (e) => { if (!orbit) return; drag = { x: e.clientX, yaw }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; };
  const onMove = (e) => { if (!drag) return; const lim = THREE.MathUtils.degToRad(25); yaw = THREE.MathUtils.clamp(drag.yaw - (e.clientX - drag.x) * 0.005, -lim, lim); dirty = true; kick(); };
  const onUp = () => { drag = null; canvas.style.cursor = orbit ? 'grab' : ''; };
  if (orbit) { canvas.style.cursor = 'grab'; canvas.style.touchAction = 'pan-y'; }
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
  const ro = new ResizeObserver(() => { resize(); kick(); }); ro.observe(canvas);
  resize(); kick();

  return {
    get product() { return cur.product; },
    setProgress(v) { p = Math.min(1, Math.max(0, v)); dirty = true; kick(); },
    setProduct(name, { progress: np = 1 } = {}) {
      if (name === cur.product || trans) return;
      next = createMaquette(name, { accent }); next.update(np); p = np;
      const { width, height } = rect(); fitCamera(next, width / height); applyYaw(next);
      // new model is seen through the current camera during the wipe, then the camera eases to the new framing
      setClip(cur, clipOld); setClip(next, clipNew);
      const f = cur.camera.position.clone().sub(cur.target), t = next.camera.position.clone().sub(next.target);
      trans = { t0: performance.now(), fromT: cur.target.clone(), toT: next.target.clone(), fromDir: f.clone().normalize(), d0: f.length(), d1: t.length(),
        q: new THREE.Quaternion().setFromUnitVectors(f.clone().normalize(), t.clone().normalize()) };
      kick();
    },
    destroy() {
      cancelAnimationFrame(raf); ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
      disposeMaquette(cur); if (next) disposeMaquette(next); renderer.dispose();
    },
  };
}

export function disposeMaquette(m) {
  m.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  for (const k in m.materials) if (m.materials[k]) m.materials[k].dispose();
}
