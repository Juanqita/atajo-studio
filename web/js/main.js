/* Visor 3D (requiere three.js cargado antes) */
(function(){
  var lienzo=document.getElementById('lienzo-3d'), visor=document.getElementById('visor');
  if(!window.THREE||!lienzo){var f=document.getElementById('visor-falla'); if(f) f.hidden=false; return;}
  var T=window.THREE, renderer;
  try{ renderer=new T.WebGLRenderer({canvas:lienzo,antialias:true,alpha:true,preserveDrawingBuffer:true}); }
  catch(e){ document.getElementById('visor-falla').hidden=false; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.outputEncoding=T.sRGBEncoding;
  var escena=new T.Scene(), camara=new T.PerspectiveCamera(32,1,0.1,50);
  camara.position.set(0,0.15,8.2);
  escena.add(new T.HemisphereLight(0xffffff,0x6b7d84,0.85));
  var luz=new T.DirectionalLight(0xffffff,0.9); luz.position.set(3,4,5); escena.add(luz);
  var luz2=new T.DirectionalLight(0xffe2b8,0.35); luz2.position.set(-4,1,-3); escena.add(luz2);

  function tela(tipo){
    var c=document.createElement('canvas'); c.width=c.height=512; var g=c.getContext('2d'), i, x, y;
    function ruido(a,claro,oscuro){ for(i=0;i<9000;i++){ g.fillStyle=Math.random()<.5?claro:oscuro; g.globalAlpha=a*Math.random(); g.fillRect(Math.random()*512,Math.random()*512,Math.random()*6+1,1);} g.globalAlpha=1; }
    if(tipo==='lino'){ g.fillStyle='#D8C7A6'; g.fillRect(0,0,512,512); ruido(.35,'#F1E6CF','#A8936C'); for(i=0;i<60;i++){g.fillStyle='rgba(120,100,70,.07)';g.fillRect(0,Math.random()*512,512,1);} }
    else if(tipo==='oxford'){ g.fillStyle='#9DB9D6'; g.fillRect(0,0,512,512); for(y=0;y<512;y+=4){for(x=0;x<512;x+=4){ g.fillStyle=((x+y)/4)%2?'rgba(255,255,255,.28)':'rgba(40,70,110,.12)'; g.fillRect(x,y,2,2);} } }
    else if(tipo==='cuadros'){ g.fillStyle='#8E1F24'; g.fillRect(0,0,512,512); g.fillStyle='rgba(30,46,74,.85)'; for(i=0;i<512;i+=128){g.fillRect(i,0,56,512);g.fillRect(0,i,512,56);} g.fillStyle='rgba(240,230,210,.55)'; for(i=0;i<512;i+=128){g.fillRect(i+88,0,4,512);g.fillRect(0,i+88,512,4);} ruido(.2,'#fff','#000'); }
    else { g.fillStyle='#F4F4F0'; g.fillRect(0,0,512,512); g.fillStyle='#3B5C9A'; for(i=0;i<512;i+=32){g.fillRect(i,0,8,512);} ruido(.12,'#fff','#889'); }
    var t=new T.CanvasTexture(c); t.wrapS=t.wrapT=T.RepeatWrapping; t.encoding=T.sRGBEncoding; t.anisotropy=4; return t;
  }
  var mat=new T.MeshStandardMaterial({roughness:.85,metalness:0,side:T.DoubleSide});
  var matBoton=new T.MeshStandardMaterial({color:0xF3EEE4,roughness:.4});

  // Torso: cilindro elíptico con hombros redondeados y ruedo curvo
  var torso=new T.CylinderGeometry(1,1,3,64,40,true), p=torso.attributes.position, v=new T.Vector3();
  for(var k=0;k<p.count;k++){
    v.fromBufferAttribute(p,k); var y=v.y, sx=1.05, sz=0.58;
    if(y>1.05){ var t=(y-1.05)/0.45; var f=Math.sqrt(Math.max(0,1-t*t*0.88)); sx*=Math.max(f,0.3); sz*=Math.max(f,0.42); }
    if(y<-1.1){ sx*=1+(-1.1-y)*0.08; }
    v.x*=sx; v.z*=sz;
    if(y<-1.3){ v.y+= -0.12*(1-Math.abs(v.x)/1.2)*((-1.3-y)/0.2+0.3); }
    p.setXYZ(k,v.x,v.y,v.z);
  }
  torso.computeVertexNormals();
  var grupo=new T.Group(); var cuerpo=new T.Mesh(torso,mat); grupo.add(cuerpo);
  [torso].forEach(function(gm){ var uv=gm.attributes.uv; for(var j=0;j<uv.count;j++){ uv.setXY(j,uv.getX(j)*3.2,uv.getY(j)*1.6);} });

  function manga(lado){
    var gm=new T.CylinderGeometry(0.33,0.24,2.15,40,12,true);
    var uv=gm.attributes.uv; for(var j=0;j<uv.count;j++){ uv.setXY(j,uv.getX(j)*1.1,uv.getY(j)*1.1);} 
    var m=new T.Mesh(gm,mat); m.position.set(lado*1.28,0.18,0); m.rotation.z=lado*0.38; m.scale.z=0.9; grupo.add(m);
    var puno=new T.Mesh(new T.CylinderGeometry(0.255,0.25,0.26,40,1,true),mat); puno.position.set(lado*1.68,-0.83,0); puno.rotation.z=lado*0.38; grupo.add(puno);
  }
  manga(1); manga(-1);
  // Hombros: casquetes que unen manga y torso
  [1,-1].forEach(function(l){ var s=new T.Mesh(new T.SphereGeometry(0.31,32,16),mat); s.scale.set(1.05,0.62,0.82); s.position.set(l*1.0,1.1,0); grupo.add(s); });
  // Cuello camisero
  var cuello=new T.Mesh(new T.CylinderGeometry(0.36,0.42,0.28,48,1,true),mat); cuello.position.set(0,1.56,-0.03); grupo.add(cuello);
  [1,-1].forEach(function(l){
    var forma=new T.Shape(); forma.moveTo(0,0); forma.lineTo(l*0.42,-0.05); forma.lineTo(l*0.30,-0.34); forma.lineTo(0,-0.08);
    var punta=new T.Mesh(new T.ExtrudeGeometry(forma,{depth:0.03,bevelEnabled:false}),mat);
    punta.position.set(l*0.04,1.62,0.3); punta.rotation.x=-0.35; grupo.add(punta);
  });
  // Tapeta y botones
  var tapeta=new T.Mesh(new T.BoxGeometry(0.16,2.75,0.02),mat); tapeta.position.set(0,-0.08,0.6); grupo.add(tapeta);
  for(var b=0;b<6;b++){ var bt=new T.Mesh(new T.CylinderGeometry(0.035,0.035,0.02,16),matBoton); bt.rotation.x=Math.PI/2; bt.position.set(0,1.25-b*0.5,0.615); grupo.add(bt); }
  // Bolsillo
  var bol=new T.Mesh(new T.BoxGeometry(0.42,0.46,0.015),mat); bol.position.set(0.48,0.62,0.55); bol.rotation.y=0.32; grupo.add(bol);
  escena.add(grupo);

  var telas={}; function usar(n){ telas[n]=telas[n]||tela(n); mat.map=telas[n]; mat.needsUpdate=true; }
  usar('lino');
  var precios={lino:'$139.900',oxford:'$129.900',cuadros:'$124.900',rayas:'$119.900'};
  document.querySelectorAll('.tela').forEach(function(btn){ btn.addEventListener('click',function(){
    document.querySelectorAll('.tela').forEach(function(o){o.classList.remove('activa');o.setAttribute('aria-pressed','false');});
    btn.classList.add('activa'); btn.setAttribute('aria-pressed','true'); usar(btn.dataset.tela);
    document.getElementById('precio-3d').textContent=precios[btn.dataset.tela];
  });});

  var rotY=0.5, rotX=0.08, arrastre=null, ultimo=performance.now();
  var quieto=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  visor.addEventListener('pointerdown',function(e){arrastre={x:e.clientX,y:e.clientY,ry:rotY,rx:rotX}; visor.setPointerCapture(e.pointerId);});
  visor.addEventListener('pointermove',function(e){ if(!arrastre) return; rotY=arrastre.ry+(e.clientX-arrastre.x)*0.01; rotX=Math.max(-0.4,Math.min(0.4,arrastre.rx+(e.clientY-arrastre.y)*0.005)); });
  ['pointerup','pointercancel'].forEach(function(n){visor.addEventListener(n,function(){arrastre=null;});});
  function ajustar(){ var w=visor.clientWidth, h=visor.clientHeight; if(!w||!h) return; renderer.setSize(w,h,false); camara.aspect=w/h; camara.updateProjectionMatrix(); }
  window.addEventListener('resize',ajustar); ajustar();
  function cuadro(ahora){ var dt=Math.min(50,ahora-ultimo); ultimo=ahora; if(!arrastre&&!quieto) rotY+=dt*0.00045; grupo.rotation.set(rotX,rotY,0); renderer.render(escena,camara); requestAnimationFrame(cuadro); }
  requestAnimationFrame(cuadro);
})();

/* Formulario de demo y enlace a la política */
(function(){
  var f=document.getElementById('form-demo'), ok=document.getElementById('form-ok');
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var faltan=[];
    ['f-nombre','f-tienda','f-wa'].forEach(function(id){var el=document.getElementById(id); if(!el.value.trim()) faltan.push(el.closest('label').firstChild.textContent.trim());});
    if(!document.getElementById('f-acepto').checked) faltan.push('la autorización de datos');
    ok.hidden=false;
    if(faltan.length){ ok.textContent='Falta completar: '+faltan.join(', ')+'.'; return; }
    ok.textContent='Gracias, '+document.getElementById('f-nombre').value.trim()+'. Vista previa: en la página publicada esta solicitud llegará al correo de Atajo.';
    f.reset();
  });
  document.querySelectorAll('a[href="#politica"]').forEach(function(a){a.addEventListener('click',function(){document.getElementById('politica').open=true;});});
})();
