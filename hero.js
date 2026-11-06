import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 主人公(雷を操る剣士)のプロシージャルモデル。
// 関節ごとのグループ階層(リジッド・リグ)に、素材別に結合したメッシュを載せる。
// 後からGLBに差し替える場合も、この buildHero() の戻り値(root/joints/update)を保てばよい。
const PI = Math.PI;
const hex = (h) => new THREE.Color(h);
const rnd = (k) => { const s = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

// アニメ調の顔: 目・眉・鼻・口・頬の赤みを1枚のテクスチャに描き、頭部表面のパッチに貼る。
// 座標は頭部ローカルの物理座標(m)で指定し、X()/Y() でピクセルへ変換する。
function faceTexture(sp) {
  const W = 512, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), E = sp.eye, R0 = .103, PH = .62, Y0 = .055, Y1 = .21;
  const X = (x) => ((Math.asin(Math.max(-.99, Math.min(.99, x / R0))) + PH) / (2 * PH)) * W;
  const Y = (y) => (1 - (y - Y0) / (Y1 - Y0)) * H;
  const S = (d) => X(d) - X(0);
  g.lineCap = 'round'; g.lineJoin = 'round';

  for (const sx of [1, -1]) { // 頬
    const bx = X(sx * .058), by = Y(.1), gr = g.createRadialGradient(bx, by, 0, bx, by, S(.022));
    gr.addColorStop(0, 'rgba(255,110,130,.30)'); gr.addColorStop(1, 'rgba(255,110,130,0)');
    g.fillStyle = gr; g.fillRect(bx - 60, by - 60, 120, 120);
  }
  g.strokeStyle = 'rgba(190,110,100,.75)'; g.lineWidth = 3; // 鼻
  g.beginPath(); g.moveTo(X(-.004), Y(.108)); g.quadraticCurveTo(X(0), Y(.099), X(.006), Y(.104)); g.stroke();
  g.strokeStyle = '#a84450'; g.lineWidth = 3.5; // 口
  g.beginPath(); g.moveTo(X(-.012), Y(.073)); g.quadraticCurveTo(X(0), Y(.068 - (sp.eye.smile || 0)), X(.012), Y(.073)); g.stroke();
  for (const sx of [1, -1]) { // 眉
    g.strokeStyle = sp.hair[0]; g.lineWidth = E.brow;
    g.beginPath(); g.moveTo(X(sx * .022), Y(.169)); g.quadraticCurveTo(X(sx * .042), Y(.179), X(sx * .063), Y(.166)); g.stroke();
  }
  for (const sx of [1, -1]) { // 目
    const cx = X(sx * .04), cy = Y(.13), rx = S(E.w), ry = Math.abs(Y(.13 + E.h) - Y(.13)), tilt = -sx * E.tilt;
    g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, tilt, 0, 7); g.clip();
    g.fillStyle = '#f7f3fb'; g.fillRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, cy - ry, 0, cy + ry);
    gr.addColorStop(0, sp.iris[0]); gr.addColorStop(.55, sp.iris[1]); gr.addColorStop(1, sp.iris[2]);
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy + ry * .06, rx * .8, ry * 1.02, 0, 0, 7); g.fill();
    g.fillStyle = '#0d0820'; g.beginPath(); g.ellipse(cx, cy + ry * .08, rx * .3, ry * .5, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.95)';
    g.beginPath(); g.ellipse(cx - rx * .28, cy - ry * .32, rx * .2, ry * .22, 0, 0, 7); g.fill();
    g.beginPath(); g.arc(cx + rx * .32, cy + ry * .38, rx * .09, 0, 7); g.fill();
    const sh = g.createLinearGradient(0, cy - ry, 0, cy - ry * .2);
    sh.addColorStop(0, 'rgba(20,10,50,.55)'); sh.addColorStop(1, 'rgba(20,10,50,0)');
    g.fillStyle = sh; g.fillRect(cx - rx - 4, cy - ry - 2, rx * 2 + 8, ry * .9);
    g.restore();
    g.strokeStyle = sp.hair[0]; g.lineWidth = E.lw; // 上まつ毛
    g.beginPath(); g.ellipse(cx, cy, rx, ry, tilt, PI * 1.03, PI * 1.97); g.stroke();
    const a = sx > 0 ? PI * 1.97 : PI * 1.03; // 外側のはね
    const ox = cx + rx * Math.cos(a) * Math.cos(tilt) - ry * Math.sin(a) * Math.sin(tilt);
    const oy = cy + rx * Math.cos(a) * Math.sin(tilt) + ry * Math.sin(a) * Math.cos(tilt);
    g.lineWidth = E.lw * .8; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + sx * S(.007), oy - S(.004)); g.stroke();
    g.globalAlpha = .55; g.lineWidth = 2; // 下まつ毛
    g.beginPath(); g.ellipse(cx, cy, rx, ry, tilt, PI * .12, PI * .88); g.stroke(); g.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// 段階の少ない陰影(トゥーン)
function toonGradient() {
  const t = new THREE.DataTexture(new Uint8Array([70, 140, 205, 255]), 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}

function makeMaterials(sp) {
  const grad = toonGradient(), D = THREE.DoubleSide, K = .45; // K: トゥーンはライト強度をそのまま受けるため色を落として合わせる
  const toon = (c, o = {}) => new THREE.MeshToonMaterial({ color: hex(c).multiplyScalar(K), gradientMap: grad, ...o });
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const ftex = faceTexture(sp);
  const outline = new THREE.MeshBasicMaterial({ color: 0x15122a, side: THREE.BackSide }); // 反転ハル方式の輪郭線
  outline.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * 0.0035;');
  };
  return {
    skin: toon(0xffd9c6),
    hair: new THREE.MeshToonMaterial({ vertexColors: true, color: hex(0xffffff).multiplyScalar(K), gradientMap: grad, side: D }),
    cloth: toon(sp.pal.cloth, { side: D }),
    accent: toon(sp.pal.accent, { side: D }),
    leather: toon(0x4a382f),
    gold: std({ color: 0xe0bd6a, roughness: 0.3, metalness: 1, side: D }),
    silver: std({ color: 0xd3dae6, roughness: 0.25, metalness: 1, side: D }),
    glow: std({ color: 0x2a2a66, emissive: sp.pal.glow, emissiveIntensity: 1.5, roughness: 0.3 }),
    blade: std({ color: 0xe8eef8, roughness: 0.15, metalness: 1 }),
    face: new THREE.MeshToonMaterial({
      color: hex(0xffffff).multiplyScalar(.5), map: ftex, emissive: 0xffffff, emissiveMap: ftex, emissiveIntensity: .5,
      gradientMap: grad, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
    outline,
  };
}

// 頭頂のキャップ用: 高さに応じて「天使の輪」状の明るい帯を頂点カラーで入れる
function tinted(geo, c0, c1) {
  const pos = geo.attributes.position, n = pos.count, a = new Float32Array(n * 3), base = hex(c0), hl = hex(c1), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const b = Math.max(0, 1 - Math.abs(pos.getY(i) - .095) / .02);
    c.copy(base).lerp(hl, b * .6);
    a.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

// アニメ風の髪房: 中ほどが膨らみ毛先がとがる。幅広の断面、根元は暗く毛先は明るく、途中に光の帯。
function strand(pts, rMax, c0, c1, hl, flat = .6, N = 16, R = 8) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const fr = curve.computeFrenetFrames(N, false);
  const pos = [], col = [], uv = [], idx = [];
  const ca = hex(c0), cb = hex(c1), ch = hex(hl), c = new THREE.Color();
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = curve.getPointAt(t), n = fr.normals[i], b = fr.binormals[i];
    const r = rMax * Math.pow(Math.max(Math.sin(PI * (0.12 + 0.88 * t)), 0.02), 0.8);
    c.copy(ca).lerp(cb, THREE.MathUtils.smoothstep(t, .45, 1));
    c.lerp(ch, Math.max(0, 1 - Math.abs(t - .3) / .13) * .6);
    for (let j = 0; j <= R; j++) {
      const a = (j / R) * PI * 2, cs = Math.cos(a) * r * flat, sn = Math.sin(a) * r; // 幅広い方向 = binormal(頭の表面に沿う向き)
      pos.push(p.x + n.x * cs + b.x * sn, p.y + n.y * cs + b.y * sn, p.z + n.z * cs + b.z * sn);
      col.push(c.r, c.g, c.b); uv.push(j / R, t);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < R; j++) {
    const a = i * (R + 1) + j, b2 = a + R + 1;
    idx.push(a, b2, a + 1, b2, b2 + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// 頭部の輪郭(半径, 高さ)。髪の生え際を頭蓋に沿わせるために表面Zも引く
const HEAD = [[0, -.128], [.022, -.126], [.045, -.114], [.07, -.085], [.09, -.04], [.103, .02], [.105, .07], [.093, .108], [.07, .13], [.04, .142], [0, .146]];
function skullR(yp) {
  for (let i = 0; i < HEAD.length - 1; i++) {
    const a = HEAD[i], b = HEAD[i + 1];
    if (yp >= a[1] && yp <= b[1]) return a[0] + (b[0] - a[0]) * (yp - a[1]) / (b[1] - a[1]);
  }
  return 0.04;
}
function skullZ(x, y) { const r = skullR(y - 0.13); return Math.sqrt(Math.max(r * r - x * x, 0.0004)); }

const SPEC = {
  male:   { s: 1.04, sh: .205, cw: 1.12, ww: 1.12, hw: 1.0, ar: 1.1, hair: ['#14162c', '#3f78ff'], cap: '#15172e',
            iris: ['#1d2f8a', '#3f7bff', '#9fe8ff'], hl: '#8fb0ff', eye: { w: .02, h: .016, lw: 6, tilt: .12, brow: 7 }, pal: { cloth: 0x1b2347, accent: 0x2a58c8, glow: 0x7fd8ff, lip: 0xb8706a } },
  female: { s: .97, sh: .165, cw: .92, ww: .86, hw: 1.1, ar: .9, hair: ['#1d1a3e', '#cfd8ff'], cap: '#1a1838',
            iris: ['#34238a', '#8a5ae0', '#ffb8f0'], hl: '#e6ecff', eye: { w: .022, h: .02, lw: 8, tilt: .16, brow: 5, smile: .003 }, pal: { cloth: 0x2a1c52, accent: 0xb04ad0, glow: 0xb48cff, lip: 0xd0707a } },
};

export function buildHero(kind = 'male') {
  const sp = SPEC[kind] || SPEC.male, F = kind === 'female';
  const m = makeMaterials(sp);
  const root = new THREE.Group(); root.name = 'hero_' + kind; root.scale.setScalar(sp.s);
  const J = {}, parts = new Map();
  const joint = (name, parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); J[name] = g; return g;
  };
  const T = new THREE.Matrix4(), Qn = new THREE.Quaternion(), Eu = new THREE.Euler();
  const add = (jn, mn, geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => {
    T.compose(new THREE.Vector3(p[0], p[1], p[2]), Qn.setFromEuler(Eu.set(r[0], r[1], r[2])), new THREE.Vector3(s[0], s[1], s[2]));
    const key = jn + '|' + mn;
    if (!parts.has(key)) parts.set(key, []);
    const g = geo.clone().applyMatrix4(T);
    parts.get(key).push(g.index ? g.toNonIndexed() : g);
  };
  const lathe = (pts, seg = 28, a = 0, b = PI * 2) => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg, a, b);
  const cyl = (rt, rb, h, seg = 14, open = false, ts = 0, tl = PI * 2) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, ts, tl);
  const sph = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
  const tor = (r, t, rs = 6, ts = 20, arc = PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);
  const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  const sc = (pts, f) => pts.map((p) => [p[0] * f, p[1]]);
  const RX = [PI / 2, 0, 0];
  const [H0, H1] = sp.hair, e = F ? 1.08 : .92, ar = sp.ar, lk = F ? .95 : 1.05;

  // ---- 関節階層(+Z向き、左手が+X) ----
  const pelvis = joint('pelvis', root, 0, 0.90, 0);
  const spine = joint('spine', pelvis, 0, 0.08, 0);
  const chest = joint('chest', spine, 0, 0.17, 0);
  joint('neck', chest, 0, 0.22, 0);
  joint('head', J.neck, 0, 0.07, 0);
  joint('ponytail', J.head, 0, 0.20, -0.11);
  joint('cape', chest, 0, 0.21, -0.10);
  for (const [sd, sx] of [['L', 1], ['R', -1]]) {
    joint('upperArm' + sd, chest, sx * sp.sh, 0.17, 0);
    joint('forearm' + sd, J['upperArm' + sd], 0, -0.28, 0);
    joint('hand' + sd, J['forearm' + sd], 0, -0.26, 0);
    joint('thigh' + sd, pelvis, sx * (F ? .09 : .085), -0.03, 0);
    joint('shin' + sd, J['thigh' + sd], 0, -0.43, 0);
    joint('foot' + sd, J['shin' + sd], 0, -0.41, 0);
  }
  joint('weapon', J.handR, 0, -0.04, 0);
  joint('weaponInner', J.weapon, 0, 0.06, 0);

  // ---- 胴体 ----
  add('pelvis', 'cloth', lathe(sc([[0, -.1], [.11, -.1], [.15, -.05], [.145, .02], [.12, .07]], sp.hw)), [0, 0, 0], [0, 0, 0], [1, 1, .66]);
  if (F) { // 短いスカート
    for (let k = 0; k < 4; k++) add('pelvis', k % 2 === 0 ? 'accent' : 'cloth', cyl(.15 * sp.hw, .21 * sp.hw, .26, 10, true, k * PI / 2 - .62, 1.24), [0, -.13, 0], [0, 0, 0], [1, 1, .78]);
  } else { // 長い背面コートテール + 両脇の短い布
    add('pelvis', 'accent', cyl(.15, .21, .56, 10, true, PI - .6, 1.2), [0, -.28, 0], [0, 0, 0], [1, 1, .78]);
    for (const k of [1, 3]) add('pelvis', 'cloth', cyl(.15, .19, .3, 8, true, k * PI / 2 - .35, .7), [0, -.15, 0], [0, 0, 0], [1, 1, .78]);
  }
  add('pelvis', 'leather', box(.05, .07, .03), [.14 * sp.hw, -.02, .02]);
  add('spine', 'cloth', lathe(sc([[0, -.09], [.115, -.09], [.108, 0], [.112, .1], [.128, .17]], sp.ww)), [0, 0, 0], [0, 0, 0], [1, 1, .66]);
  add('spine', 'leather', tor(.118 * sp.ww, .014, 8, 28), [0, -.055, 0], RX, [1, .7, 1]);
  add('spine', 'gold', box(.05, .04, .016), [0, -.055, .09 * sp.ww]);
  add('spine', 'glow', new THREE.OctahedronGeometry(.011), [0, -.055, .1 * sp.ww]);
  add('chest', 'cloth', lathe(sc([[0, -.04], [.128, -.04], [.145, .05], [.158, .13], [.16, .19], [.12, .235], [.06, .245], [0, .25]], sp.cw)), [0, 0, 0], [0, 0, 0], [1, 1, .68]);
  add('chest', 'accent', box(.13 * sp.cw, .34, .012), [0, .0, .106], [-.03, 0, 0]);
  add('chest', 'gold', new THREE.SphereGeometry(.155, 24, 16, PI / 2 - .85, 1.7, PI * .2, PI * .42), [0, .095, .03], [0, 0, 0], [sp.cw, 1, .56]);
  add('chest', 'glow', new THREE.OctahedronGeometry(.018), [0, .135, .118], [0, 0, 0], [1, 1.4, .8]);
  add('neck', 'skin', cyl(.04 * (F ? .9 : 1.1), .045 * (F ? .9 : 1.1), .14, 14), [0, .03, 0]);
  add('neck', 'cloth', cyl(.054, .062, .07, 16, true));
  add('neck', 'gold', tor(.06, .006, 6, 22), [0, .034, 0], RX);

  // ---- マント ----
  const cg = new THREE.PlaneGeometry(.38, .95, 8, 14), cp = cg.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), y = cp.getY(i), t = (0.475 - y) / 0.95;
    cp.setX(i, x * (1 + t * .45));
    cp.setZ(i, -.03 - .14 * t * t + .014 * Math.sin(x * 28 + t * 3) * t);
    cp.setY(i, y - .475);
  }
  cg.computeVertexNormals();
  const cs = F ? [.7, .75, .7] : [1, 1, 1];
  add('cape', 'accent', cg, [0, 0, 0], [0, 0, 0], cs);
  add('cape', 'gold', box(.4, .025, .03), [0, -.01, -.03], [0, 0, 0], cs);

  // ---- 頭部・顔(目鼻口はテクスチャ。アニメ表現の標準的な手法) ----
  const hs = F ? .96 : 1.02, hlc = sp.hl;
  add('head', 'skin', lathe(HEAD, 32), [0, .13, 0], [0, 0, 0], [hs, 1, 1]);
  const fp = [];
  for (let i = 0; i <= 24; i++) { const yp = -.075 + .155 * i / 24; fp.push([skullR(yp) * 1.006, yp]); }
  add('head', 'face', lathe(fp, 24, -.62, 1.24), [0, .13, 0], [0, 0, 0], [hs, 1, 1]);
  add('head', 'skin', sph(.0065, 10, 8), [0, .105, .1], [0, 0, 0], [1, 1.2, 1.1]);
  for (const sx of [1, -1]) add('head', 'skin', sph(.022, 12, 8), [sx * .1 * hs, .125, -.005], [0, 0, 0], [.4, 1, .75]);

  // ---- 髪(太い房を重ねて体積を出す) ----
  add('head', 'hair', tinted(lathe([[.113, -.01], [.12, .03], [.12, .07], [.11, .108], [.087, .13], [.054, .142], [0, .155]], 32, .55, PI * 2 - 1.1), sp.cap, hlc), [0, .13, 0]);
  for (let i = -3; i <= 3; i++) { // 前髪
    const x = i * .03, a = Math.abs(i);
    const y1 = .262, y2 = .226 - .008 * (a % 2) + (F ? 0 : .01), y3 = .185 - (i % 2 === 0 ? 0 : .014) - .006 * a + (F ? 0 : .022);
    add('head', 'hair', strand([[x * .5, .272, .03], [x * .95, y1, skullZ(x * .95, y1) + .02], [x * 1.05, y2, skullZ(x * 1.05, y2) + .026], [x * 1.1 + Math.sign(x) * .004, y3, skullZ(x * 1.1, y3) + .02]], .03, H0, H1, hlc, .5));
  }
  for (const sx of [1, -1]) for (let k = 0; k < 2; k++) { // 横髪
    const z = k * .025 - .01, tip = F ? -.04 - .03 * k : .05 + .02 * k;
    add('head', 'hair', strand([[sx * .095, .215, .03 + z], [sx * .115, .15, .045 + z], [sx * .118, .07, .05 + z], [sx * .105, tip + .07, .062 + z], [sx * .09, tip, .078 + z]], .028, H0, H1, hlc, .5));
  }
  const nb = F ? 12 : 9;
  for (let k = 0; k < nb; k++) { // 後ろ髪
    const a = .9 + (PI * 2 - 1.8) * k / (nb - 1), s = Math.sin(a), c = Math.cos(a), L = rnd(k);
    const P = (r, y) => [r * s, y, r * c], tip = F ? -.05 - .04 * L : .02 - .03 * L;
    add('head', 'hair', strand([P(.075, .26), P(.125, .17), P(.138, .06), P(.125, tip + .06), P(.118, tip)], .036, H0, H1, hlc, .5));
  }
  if (F) for (let i = 0; i < 5; i++) { // ポニーテール(女性)
    const dx = (i - 2) * .02;
    add('ponytail', 'hair', strand([[dx * .3, 0, 0], [dx * 1.4, -.09, -.08], [dx * 2.4 + .014 * Math.sin(i * 1.7), -.22, -.12], [dx * 3, -.38, -.12 + .02 * Math.cos(i)], [dx * 3.4, -.56 - .05 * (i % 2), -.09]], .032, H0, H1, hlc, .5, 18));
  }
  else for (let i = 0; i < 8; i++) { // 跳ねた毛先(男性)
    const a = i * .78, s = Math.sin(a), c = Math.cos(a);
    add('head', 'hair', strand([[.02 * s, .262, .02 * c], [.06 * s, .292, .06 * c], [.105 * s, .3 + .014 * rnd(i), .105 * c], [.14 * s, .285 + .02 * rnd(i + 3), .14 * c]], .024, H0, H1, hlc, .55));
  }
  if (F) { add('ponytail', 'gold', tor(.02, .006, 6, 16), [0, -.015, 0], RX); add('ponytail', 'glow', sph(.011, 10, 8), [0, -.015, -.02]); }
  add('head', 'glow', new THREE.OctahedronGeometry(.016), [.098, .19, .05], [0, 0, 0], [1, 1.7, 1]);
  add('head', 'gold', tor(.016, .004, 6, 14), [.098, .19, .05], [0, PI / 2, 0]);

  // ---- 腕・脚 ----
  const ps = F ? .78 : 1, lt = F ? 'skin' : 'cloth', lb = F ? 'leather' : 'cloth';
  for (const [sd, sx] of [['L', 1], ['R', -1]]) {
    const ua = 'upperArm' + sd, fo = 'forearm' + sd, ha = 'hand' + sd, th = 'thigh' + sd, sh = 'shin' + sd, ft = 'foot' + sd;
    add(ua, lt, cyl(.047 * ar, .042 * ar, .28, 14), [0, -.14, 0]);
    add(ua, lt, sph(.05 * ar));
    add(ua, 'gold', tor(.045 * ar + .002, .005, 6, 18), [0, -.2, 0], RX);
    if (sd === 'L') {
      add(ua, 'gold', new THREE.SphereGeometry(.088 * ps, 22, 12, 0, PI * 2, 0, PI * .55), [sx * .01, .03, 0], [0, 0, sx * .35], [1.25, .85, 1.15]);
      add(ua, 'glow', tor(.088 * ps, .005, 6, 26), [sx * .02, .018, 0], [0, 0, sx * .35], [1.25, .85, 1.15]);
    } else {
      add(ua, 'silver', new THREE.SphereGeometry(.07 * ps, 20, 10, 0, PI * 2, 0, PI * .55), [sx * .008, .028, 0], [0, 0, sx * .3], [1.1, .8, 1]);
    }
    add(fo, 'cloth', sph(.042 * ar));
    add(fo, 'skin', cyl(.034 * ar, .028 * ar, .26, 12), [0, -.13, 0]);
    add(fo, 'silver', cyl(.042 * ar, .036 * ar, .15, 14, true), [0, -.12, 0]);
    add(fo, 'glow', tor(.043 * ar, .004, 6, 20), [0, -.05, 0], RX);
    add(fo, 'gold', tor(.037 * ar, .005, 6, 18), [0, -.195, 0], RX);
    add(fo, 'leather', cyl(.037 * ar, .04 * ar, .05, 12), [0, -.235, 0]);
    add(ha, 'skin', sph(.034 * ar), [0, -.04, 0], [0, 0, 0], [.85, 1.3, .6]);
    add(ha, 'skin', new THREE.CapsuleGeometry(.01, .03, 3, 6), [-sx * .026, -.03, .012], [0, 0, sx * .4]);
    add(th, lt, cyl(.078 * lk, .06 * lk, .43, 14), [0, -.215, 0]);
    add(th, lt, sph(.08 * lk));
    if (F) { add(th, 'leather', cyl(.066, .06, .2, 14), [0, -.33, 0]); add(th, 'gold', tor(.067, .005, 6, 18), [0, -.23, 0], RX); }
    add(sh, lb, sph(.06 * lk));
    add(sh, lb, cyl(.058 * lk, .04 * lk, .41, 14), [0, -.205, 0]);
    add(sh, 'leather', cyl(.058 * lk, .047, .2, 14), [0, -.3, 0]);
    add(sh, 'gold', tor(.059 * lk, .006, 6, 18), [0, -.2, 0], RX);
    add(sh, 'gold', sph(.04, 12, 8), [0, 0, .055], [0, 0, 0], [1, 1.3, .55]);
    add(ft, 'leather', new THREE.CapsuleGeometry(.04, .1, 4, 10), [0, -.002, .045], [PI / 2, 0, 0], [1.05, 1, .72]);
    add(ft, 'gold', sph(.03, 12, 8), [0, -.004, .125], [0, 0, 0], [1.05, .8, .9]);
  }

  // ---- 武器: 雷刃(右手)。共通 ----
  const shape = new THREE.Shape(); shape.moveTo(-.02, 0);
  [[-.027, .18], [-.024, .62], [0, .9], [.024, .62], [.027, .18], [.02, 0]].forEach((p) => shape.lineTo(p[0], p[1]));
  shape.closePath();
  const bg = new THREE.ExtrudeGeometry(shape, { depth: .006, bevelEnabled: true, bevelThickness: .004, bevelSize: .003, bevelSegments: 2 });
  bg.translate(0, 0, -.003);
  add('weaponInner', 'blade', bg, [0, .03, 0]);
  add('weaponInner', 'glow', box(.007, .58, .016), [0, .36, 0]);
  add('weaponInner', 'gold', box(.15, .022, .034), [0, .03, 0]);
  for (const sx of [1, -1]) add('weaponInner', 'gold', box(.07, .016, .028), [sx * .085, .045, 0], [0, 0, sx * .55]);
  add('weaponInner', 'glow', new THREE.OctahedronGeometry(.016), [0, .05, .02], [0, 0, 0], [1, 1.5, 1]);
  add('weaponInner', 'leather', cyl(.014, .014, .16, 10), [0, -.06, 0]);
  for (let i = 0; i < 4; i++) add('weaponInner', 'gold', tor(.0145, .0028, 5, 10), [0, -.12 + .03 * i, 0], RX);
  add('weaponInner', 'gold', sph(.022, 12, 8), [0, -.155, 0]);
  add('weaponInner', 'glow', new THREE.OctahedronGeometry(.01), [0, -.18, 0]);

  // ---- 素材ごとに結合 + 輪郭線(反転ハル) ----
  const outlines = [];
  for (const [key, list] of parts) {
    const [jn, mn] = key.split('|');
    const geo = mergeGeometries(list, false);
    if (!geo) throw new Error('geometry merge failed: ' + key);
    const mesh = new THREE.Mesh(geo, m[mn]);
    mesh.name = jn + '_' + mn; mesh.castShadow = true; mesh.receiveShadow = true;
    J[jn].add(mesh);
    if (mn !== 'glow' && mn !== 'face') {
      const o = new THREE.Mesh(geo, m.outline); o.name = 'outline_' + mesh.name;
      J[jn].add(o); outlines.push(o);
    }
  }

  // ---- 待機ポーズ ----
  J.upperArmL.rotation.z = .16; J.upperArmR.rotation.z = -.16;
  J.forearmL.rotation.x = -.3; J.forearmR.rotation.x = -.45;
  J.weapon.rotation.x = 1.9;
  const rest = {};
  for (const k in J) rest[k] = J[k].rotation.clone();

  return {
    root, joints: J, materials: m, rest, kind,
    setOutline(on) { outlines.forEach((o) => { o.visible = on; }); },
    update(dt, t) {
      const b = Math.sin(t * 1.7);
      J.chest.rotation.x = rest.chest.x + b * .012;
      J.spine.rotation.x = rest.spine.x - b * .006;
      J.head.rotation.y = Math.sin(t * .5) * .08;
      J.pelvis.position.y = .9 + b * .004;
      J.ponytail.rotation.x = .1 + Math.sin(t * 1.9) * .07;
      J.ponytail.rotation.z = Math.sin(t * 1.3) * .05;
      J.cape.rotation.x = .04 + Math.sin(t * 1.4) * .035;
    },
  };
}

export const BUILD = 'r7';
