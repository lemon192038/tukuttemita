import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 主人公(雷を操る剣士)のプロシージャルモデル。
// 関節ごとのグループ階層(リジッド・リグ)に、素材別に結合したメッシュを載せる。
// 後からGLBに差し替える場合も、この buildHero() の戻り値(root/joints/update)を保てばよい。
const PI = Math.PI;
const hex = (h) => new THREE.Color(h);
const rnd = (k) => { const s = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

function irisTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 8, 0, 120);
  grad.addColorStop(0, '#34238a'); grad.addColorStop(0.55, '#6a5ae0'); grad.addColorStop(1, '#9ff0ff');
  g.fillStyle = grad; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  g.strokeStyle = '#150e38'; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 59, 0, 7); g.stroke();
  g.fillStyle = '#100826'; g.beginPath(); g.ellipse(64, 66, 17, 23, 0, 0, 7); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(46, 40, 11, 13, -0.4, 0, 7); g.fill();
  g.beginPath(); g.arc(82, 90, 5, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function makeMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const D = THREE.DoubleSide, tex = irisTexture();
  return {
    skin: new THREE.MeshPhysicalMaterial({ color: 0xf2cdb8, roughness: 0.55, sheen: 0.5, sheenColor: hex(0xffb8a0), sheenRoughness: 0.5 }),
    hair: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.25, side: D }),
    cloth: std({ color: 0x1d2a55, roughness: 0.88, side: D }),
    accent: std({ color: 0x7a45c2, roughness: 0.75, side: D }),
    leather: std({ color: 0x3d2d26, roughness: 0.6 }),
    gold: std({ color: 0xe0bd6a, roughness: 0.28, metalness: 1, side: D }),
    silver: std({ color: 0xd3dae6, roughness: 0.22, metalness: 1, side: D }),
    glow: std({ color: 0x2a2a66, emissive: 0x8fa8ff, emissiveIntensity: 1.5, roughness: 0.3 }),
    eyeW: std({ color: 0xf6f4fa, roughness: 0.25 }),
    iris: std({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.25 }),
    dark: std({ color: 0x2c2442, roughness: 0.6 }),
    lip: std({ color: 0xc2665f, roughness: 0.45 }),
    blade: std({ color: 0xe8eef8, roughness: 0.12, metalness: 1 }),
  };
}

function tinted(geo, c0) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 3), c = hex(c0);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

// 先細りする髪束(扁平な断面、根元→毛先で色が変わる)
function strand(pts, r0, r1, c0, c1, flat = 0.55, N = 14, R = 7) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const fr = curve.computeFrenetFrames(N, false);
  const pos = [], col = [], uv = [], idx = [];
  const ca = hex(c0), cb = hex(c1), c = new THREE.Color();
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = curve.getPointAt(t), n = fr.normals[i], b = fr.binormals[i];
    const r = THREE.MathUtils.lerp(r0, r1, Math.pow(t, 0.7));
    c.copy(ca).lerp(cb, t);
    for (let j = 0; j <= R; j++) {
      const a = (j / R) * PI * 2, cs = Math.cos(a) * r, sn = Math.sin(a) * r * flat;
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
const HEAD = [[0, -.128], [.03, -.122], [.06, -.105], [.085, -.07], [.099, -.02], [.105, .03], [.104, .07], [.093, .108], [.07, .13], [.04, .142], [0, .146]];
function skullZ(x, y) {
  const yp = y - 0.13; let r = 0.04;
  for (let i = 0; i < HEAD.length - 1; i++) {
    const a = HEAD[i], b = HEAD[i + 1];
    if (yp >= a[1] && yp <= b[1]) { r = a[0] + (b[0] - a[0]) * (yp - a[1]) / (b[1] - a[1]); break; }
  }
  return Math.sqrt(Math.max(r * r - x * x, 0.0004));
}

export function buildHero() {
  const m = makeMaterials();
  const root = new THREE.Group(); root.name = 'hero';
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
  const RX = [PI / 2, 0, 0];

  // ---- 関節階層(キャラクターは+Z向き、左手が+X) ----
  const pelvis = joint('pelvis', root, 0, 0.90, 0);
  const spine = joint('spine', pelvis, 0, 0.08, 0);
  const chest = joint('chest', spine, 0, 0.17, 0);
  joint('neck', chest, 0, 0.22, 0);
  joint('head', J.neck, 0, 0.07, 0);
  joint('ponytail', J.head, 0, 0.20, -0.11);
  joint('cape', chest, 0, 0.21, -0.10);
  for (const [sd, sx] of [['L', 1], ['R', -1]]) {
    joint('upperArm' + sd, chest, sx * 0.18, 0.17, 0);
    joint('forearm' + sd, J['upperArm' + sd], 0, -0.28, 0);
    joint('hand' + sd, J['forearm' + sd], 0, -0.26, 0);
    joint('thigh' + sd, pelvis, sx * 0.085, -0.03, 0);
    joint('shin' + sd, J['thigh' + sd], 0, -0.43, 0);
    joint('foot' + sd, J['shin' + sd], 0, -0.41, 0);
  }
  joint('weapon', J.handR, 0, -0.04, 0);
  joint('weaponInner', J.weapon, 0, 0.06, 0); // 握りの中心がソケット原点に来るようオフセット

  // ---- 胴体 ----
  add('pelvis', 'cloth', lathe([[0, -.1], [.11, -.1], [.15, -.05], [.145, .02], [.12, .07]]), [0, 0, 0], [0, 0, 0], [1, 1, .66]);
  for (let k = 0; k < 4; k++) add('pelvis', k % 2 === 0 ? 'accent' : 'cloth', cyl(.15, .215, .34, 10, true, k * PI / 2 - .62, 1.24), [0, -.17, 0], [0, 0, 0], [1, 1, .78]);
  add('pelvis', 'leather', box(.05, .07, .03), [.14, -.02, .02]);
  add('spine', 'cloth', lathe([[0, -.09], [.115, -.09], [.108, 0], [.112, .1], [.128, .17]]), [0, 0, 0], [0, 0, 0], [1, 1, .66]);
  add('spine', 'leather', tor(.118, .014, 8, 28), [0, -.055, 0], RX, [1, .7, 1]);
  add('spine', 'gold', box(.05, .04, .016), [0, -.055, .09]);
  add('spine', 'glow', new THREE.OctahedronGeometry(.011), [0, -.055, .1]);
  add('chest', 'cloth', lathe([[0, -.04], [.128, -.04], [.145, .05], [.158, .13], [.16, .19], [.12, .235], [.06, .245], [0, .25]]), [0, 0, 0], [0, 0, 0], [1, 1, .68]);
  add('chest', 'accent', box(.13, .34, .012), [0, .0, .106], [-.03, 0, 0]);
  add('chest', 'gold', new THREE.SphereGeometry(.155, 24, 16, PI / 2 - .85, 1.7, PI * .2, PI * .42), [0, .095, .03], [0, 0, 0], [1, 1, .56]);
  add('chest', 'glow', new THREE.OctahedronGeometry(.018), [0, .135, .118], [0, 0, 0], [1, 1.4, .8]);
  add('neck', 'skin', cyl(.04, .045, .14, 14), [0, .03, 0]);
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
  add('cape', 'accent', cg);
  add('cape', 'gold', box(.4, .025, .03), [0, -.01, -.03]);

  // ---- 頭部・顔 ----
  add('head', 'skin', lathe(HEAD, 32), [0, .13, 0]);
  for (const sx of [1, -1]) {
    const ex = sx * .038;
    add('head', 'skin', sph(.022, 12, 8), [sx * .1, .125, -.005], [0, 0, 0], [.4, 1, .75]);
    add('head', 'eyeW', sph(.024, 16, 12), [ex, .135, .088], [0, 0, 0], [1, 1.15, .55]);
    add('head', 'iris', new THREE.CircleGeometry(.0155, 24), [ex, .133, .1015], [0, 0, 0], [1, 1.25, 1]);
    add('head', 'dark', tor(.0255, .0023, 6, 18, PI * 1.05), [ex, .136, .0985], [0, 0, -.025 * PI], [1, 1.2, 1]);
    add('head', 'dark', new THREE.CapsuleGeometry(.0028, .03, 3, 6), [sx * .042, .172, .093], [0, 0, PI / 2 - sx * .18]);
  }
  add('head', 'skin', sph(.0075, 10, 8), [0, .108, .101], [0, 0, 0], [1, 1.2, 1.1]);
  add('head', 'lip', tor(.016, .0017, 6, 12, 1.3), [0, .075, .084], [0, 0, -PI / 2 - .65]);

  // ---- 髪 ----
  add('head', 'hair', tinted(lathe([[.108, -.01], [.114, .03], [.114, .07], [.104, .108], [.082, .13], [.05, .142], [0, .153]], 32, .55, PI * 2 - 1.1), '#c4c6f0'), [0, .13, 0]);
  for (let i = -4; i <= 4; i++) { // 前髪
    const x = i * .021, a = Math.abs(i);
    const y1 = .262, y2 = .222 - .008 * (a % 3), y3 = .19 - (i % 2 === 0 ? 0 : .012) - .004 * a;
    add('head', 'hair', strand([[x * .5, .27, .03], [x * .95, y1, skullZ(x * .95, y1) + .016], [x * 1.05, y2, skullZ(x * 1.05, y2) + .02], [x * 1.09, y3, skullZ(x * 1.09, y3) + .016]], .014, .002, '#a9a8e4', '#e3f3ff'));
  }
  for (const sx of [1, -1]) for (let k = 0; k < 2; k++) { // 横髪
    const z = k * .02 - .005;
    add('head', 'hair', strand([[sx * .095, .215, .03 + z], [sx * .112, .15, .045 + z], [sx * .113, .07, .05 + z], [sx * .1, .0, .06 + z], [sx * .09 - sx * .005 * k, -.03 - .02 * k, .075 + z]], .016, .002, '#a9a8e4', '#d0f0ff'));
  }
  for (let k = 0; k < 14; k++) { // 後ろ髪(襟足まで)
    const a = .9 + (PI * 2 - 1.8) * k / 13, s = Math.sin(a), c = Math.cos(a), L = rnd(k);
    const P = (r, y) => [r * s, y, r * c];
    add('head', 'hair', strand([P(.075, .26), P(.12, .17), P(.13, .06), P(.118, 0), P(.11, -.05 - .04 * L)], .019, .003, '#a9a8e4', '#d9f1ff'));
  }
  for (let i = 0; i < 7; i++) { // ポニーテール
    const dx = (i - 3) * .012;
    add('ponytail', 'hair', strand([[dx * .3, 0, 0], [dx * 1.2, -.08, -.07], [dx * 2 + .01 * Math.sin(i), -.2, -.1], [dx * 2.6, -.34, -.1], [dx * 3, -.46 - .04 * (i % 2), -.08]], .014, .002, '#b3b0ea', '#a4ecff', .55, 16));
  }
  add('ponytail', 'gold', tor(.02, .006, 6, 16), [0, -.015, 0], RX);
  add('ponytail', 'glow', sph(.011, 10, 8), [0, -.015, -.02]);
  add('head', 'glow', new THREE.OctahedronGeometry(.016), [.098, .19, .05], [0, 0, 0], [1, 1.7, 1]);
  add('head', 'gold', tor(.016, .004, 6, 14), [.098, .19, .05], [0, PI / 2, 0]);

  // ---- 腕・脚 ----
  for (const [sd, sx] of [['L', 1], ['R', -1]]) {
    const ua = 'upperArm' + sd, fo = 'forearm' + sd, ha = 'hand' + sd, th = 'thigh' + sd, sh = 'shin' + sd, ft = 'foot' + sd;
    add(ua, 'cloth', cyl(.047, .042, .28, 14), [0, -.14, 0]);
    add(ua, 'cloth', sph(.05));
    add(ua, 'gold', tor(.045, .005, 6, 18), [0, -.2, 0], RX);
    if (sd === 'L') { // 左: 大型の金の肩当て(非対称デザイン)
      add(ua, 'gold', new THREE.SphereGeometry(.088, 22, 12, 0, PI * 2, 0, PI * .55), [sx * .01, .03, 0], [0, 0, sx * .35], [1.25, .85, 1.15]);
      add(ua, 'glow', tor(.088, .005, 6, 26), [sx * .02, .018, 0], [0, 0, sx * .35], [1.25, .85, 1.15]);
    } else {          // 右: 小型の銀の肩当て
      add(ua, 'silver', new THREE.SphereGeometry(.07, 20, 10, 0, PI * 2, 0, PI * .55), [sx * .008, .028, 0], [0, 0, sx * .3], [1.1, .8, 1]);
    }
    add(fo, 'cloth', sph(.042));
    add(fo, 'skin', cyl(.034, .028, .26, 12), [0, -.13, 0]);
    add(fo, 'silver', cyl(.042, .036, .15, 14, true), [0, -.12, 0]);
    add(fo, 'glow', tor(.043, .004, 6, 20), [0, -.05, 0], RX);
    add(fo, 'gold', tor(.037, .005, 6, 18), [0, -.195, 0], RX);
    add(fo, 'leather', cyl(.037, .04, .05, 12), [0, -.235, 0]);
    add(ha, 'skin', sph(.034), [0, -.04, 0], [0, 0, 0], [.85, 1.3, .6]);
    add(ha, 'skin', new THREE.CapsuleGeometry(.01, .03, 3, 6), [-sx * .026, -.03, .012], [0, 0, sx * .4]);
    add(th, 'cloth', cyl(.078, .06, .43, 14), [0, -.215, 0]);
    add(th, 'cloth', sph(.08));
    add(sh, 'cloth', sph(.06));
    add(sh, 'cloth', cyl(.058, .04, .41, 14), [0, -.205, 0]);
    add(sh, 'leather', cyl(.058, .047, .2, 14), [0, -.3, 0]);
    add(sh, 'gold', tor(.059, .006, 6, 18), [0, -.2, 0], RX);
    add(sh, 'gold', sph(.04, 12, 8), [0, 0, .055], [0, 0, 0], [1, 1.3, .55]);
    add(ft, 'leather', new THREE.CapsuleGeometry(.04, .1, 4, 10), [0, -.002, .045], [PI / 2, 0, 0], [1.05, 1, .72]);
    add(ft, 'gold', sph(.03, 12, 8), [0, -.004, .125], [0, 0, 0], [1.05, .8, .9]);
  }

  // ---- 武器: 雷刃(右手) ----
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

  // ---- 素材ごとに結合して1メッシュ化(描画コール削減) ----
  for (const [key, list] of parts) {
    const [jn, mn] = key.split('|');
    const geo = mergeGeometries(list, false);
    if (!geo) throw new Error('geometry merge failed: ' + key);
    const mesh = new THREE.Mesh(geo, m[mn]);
    mesh.name = jn + '_' + mn; mesh.castShadow = true; mesh.receiveShadow = true;
    J[jn].add(mesh);
  }

  // ---- 待機ポーズ ----
  J.upperArmL.rotation.z = .16; J.upperArmR.rotation.z = -.16;
  J.forearmL.rotation.x = -.3; J.forearmR.rotation.x = -.45;
  J.weapon.rotation.x = 1.9;
  const rest = {};
  for (const k in J) rest[k] = J[k].rotation.clone();

  return {
    root, joints: J, materials: m, rest,
    // 簡易アイドル(呼吸・髪とマントの揺れ)。本格的なモーションは第3段階。
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
export const BUILD = 'r5';
