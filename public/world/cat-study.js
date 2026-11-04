// Optional GLB study: default world and multiplayer avatars stay on the legacy model.
const catStudyParams = new URLSearchParams(location.search);
function applyCozyCat(target) {
  return new Promise((resolve, reject) => {
    new THREE.GLTFLoader().load('/world/models/cozy-cat.glb', gltf => {
      // Preserve the chat bubble and its existing event/state references.
      [...target.children].filter(child => child !== target.bub).forEach(child => target.remove(child));
      target.add(gltf.scene);
      target.userData.cozy = gltf.scene;
      resolve(gltf.scene);
    }, undefined, reject);
  });
}
async function startCatStudy() {
  if (!catStudyParams.has('preview')) return;
  document.body.classList.add('cat-preview');
  init3d();
  snow.visible = false;
  sc.fog = null;
  sc.background.set('#f5ede1');
  sc.remove(pl);
  pl = person({fur:0xE0903A,eye:'dot',ear:0,pat:0,blush:true,tail:0},0xD9533B,0);
  sc.add(pl);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2,64),new THREE.MeshLambertMaterial({color:0xe3d5c2}));
  floor.rotation.x = -Math.PI/2; floor.position.y = -.02; sc.add(floor);
  const status = document.createElement('div'); status.id = 'study-status'; status.setAttribute('role','status'); document.body.appendChild(status);
  if (catStudyParams.get('preview') === 'cozy') {
    status.textContent = 'GLB 불러오는 중…';
    try { await applyCozyCat(pl); status.textContent = 'GLB · 508 KB'; document.body.dataset.modelReady = 'cozy'; }
    catch (error) { status.textContent = 'GLB 로드 실패 · 기존 모델 표시'; document.body.dataset.modelReady = 'error'; console.error(error); }
  } else { status.textContent = '기존 코드 모델'; document.body.dataset.modelReady = 'legacy'; }
  let angle = .3, rotate = !matchMedia('(prefers-reduced-motion: reduce)').matches, walking = false;
  addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent) return;
    if (event.data.type === 'cat-view') { angle = event.data.angle; rotate = false; }
    if (event.data.type === 'cat-rotate') rotate = event.data.value;
    if (event.data.type === 'cat-walk') walking = event.data.value;
  });
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now-last)/1000,.05); last=now;
    if (rotate) angle += dt*.35;
    cam.position.set(Math.sin(angle)*4.7,2.6,Math.cos(angle)*4.7); cam.lookAt(0,1.2,0);
    pl.position.y = walking ? Math.abs(Math.sin(now*.009))*.12 : 0;
    pl.scale.y = 1 + Math.sin(now*.0025)*.008;
    ren.render(sc,cam); requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
startCatStudy();
