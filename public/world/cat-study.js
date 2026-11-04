// Optional GLB study: default world and multiplayer avatars stay on the legacy model.
const catStudyParams = new URLSearchParams(location.search);
function applyCozyCat(target) {
  return new Promise((resolve, reject) => {
    new THREE.GLTFLoader().load('/world/models/cozy-cat.glb', gltf => {
      // Preserve the chat bubble and its existing event/state references.
      [...target.children].filter(child => child !== target.bub).forEach(child => target.remove(child));
      target.add(gltf.scene);
      target.userData.cozy = gltf.scene;
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const idle = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations,'Idle'));
      const walk = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations,'Walk'));
      idle.play();
      target.userData.motion = {mixer,idle,walk,moving:false,time:0,eyes:gltf.scene.getObjectByName('Eyes')};
      // A soft contact shadow avoids an extra shadow-map render on mobile.
      const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
      const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,4,32,32,32);
      gradient.addColorStop(0,'rgba(65,42,25,.28)');gradient.addColorStop(1,'rgba(65,42,25,0)');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
      const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.35,1.1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false}));
      shadow.rotation.x=-Math.PI/2;shadow.position.y=.075;target.add(shadow);
      target.userData.contactShadow=shadow;
      resolve(gltf.scene);
    }, undefined, reject);
  });
}
function updateCozyCat(target,dt,moving) {
  const motion=target.userData.motion;if(!motion)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const active=!!moving;
  if(active!==motion.moving){
    const next=active?motion.walk:motion.idle,previous=active?motion.idle:motion.walk;
    next.reset().play();previous.crossFadeTo(next,.18,false);motion.moving=active;
  }
  motion.time+=dt;
  motion.mixer.update(reduced?0:dt);
  // Brief, infrequent blink; the face remains the original quiet dot-eye design.
  const phase=motion.time%4.7;
  if(motion.eyes)motion.eyes.scale.y=reduced?1:1-.92*Math.max(0,1-Math.abs(phase-4.5)/.09);
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
    try { await applyCozyCat(pl); status.textContent = 'GLB · 389 KB · Idle / Walk'; document.body.dataset.modelReady = 'cozy'; }
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
    if(pl.userData.cozy){pl.position.y=0;pl.scale.y=1;updateCozyCat(pl,dt,walking)}
    else {pl.position.y = walking ? Math.abs(Math.sin(now*.009))*.12 : 0;pl.scale.y = 1 + Math.sin(now*.0025)*.008}
    ren.render(sc,cam); requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
startCatStudy();
