import * as THREE from 'three';

// 空に近い明るいグラデーション + ソフトボックスの環境マップ。
// 金属が「何も映すものがなくて黒く沈む」のを防ぐための反射源。
export function makeEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x5f93e0) },
        mid: { value: new THREE.Color(0xe4eef8) },
        bot: { value: new THREE.Color(0x76694f) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; ' +
        'void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, bot, pow(-h, 0.5)); gl_FragColor = vec4(c, 1.0); }',
    }),
  ));
  const panel = (x, y, z, s, r, g, b) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(s, s),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(r, g, b), side: THREE.DoubleSide, toneMapped: false }),
    );
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  panel(25, 35, 18, 16, 8, 7.4, 6.2);     // 太陽側(HDR値)
  panel(-30, 12, 20, 14, 2.2, 2.6, 3.2);  // 青白い補助光
  panel(-10, 18, -35, 12, 3.0, 3.4, 4.0); // 逆光(輪郭用)

  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  env.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return tex;
}
export const BUILD = 'r6';
