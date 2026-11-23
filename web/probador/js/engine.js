/* Motor de dibujo del probador (tomado de la demo de Novecento y ampliado para prendas fotografiadas).
   Puntos del cuerpo en pantalla: s11/s12 hombros, e codos, w muñecas, h caderas (numeración de MediaPipe Pose). */
import { drawPhotoMesh } from "./garment.js";
export function shade(hex, f){ // f>0 aclara, f<0 oscurece
  const n = parseInt(hex.slice(1),16); let r=n>>16,g=n>>8&255,b=n&255;
  const t = f<0?0:255, p=Math.abs(f);
  r=Math.round((t-r)*p+r); g=Math.round((t-g)*p+g); b=Math.round((t-b)*p+b);
  return `rgb(${r},${g},${b})`;
}
function makeTile(g){
  const c = document.createElement("canvas"); c.width=c.height=64; const x=c.getContext("2d");
  x.fillStyle=g.color; x.fillRect(0,0,64,64);
  const rnd = mulberry(g.id.length*977);
  if(g.pattern==="oxford"||g.pattern==="pique"){
    for(let i=0;i<64;i+=2){ x.fillStyle=shade(g.color, i%4?0.10:-0.08); x.globalAlpha=.5; x.fillRect(0,i,64,1); x.fillRect(i,0,1,64); }
  } else if(g.pattern==="linen"){
    for(let i=0;i<70;i++){ x.globalAlpha=.25+rnd()*.25; x.fillStyle=shade(g.color, rnd()>.5?-0.12:0.15);
      x.fillRect(0,rnd()*64,64,rnd()*1.6+.4); x.fillRect(rnd()*64,0,rnd()*1.4+.3,64); }
  } else if(g.pattern==="stripes"){
    x.fillStyle=g.accent; x.globalAlpha=.9; x.fillRect(6,0,4,64); x.fillRect(38,0,4,64);
    x.globalAlpha=.35; x.fillRect(22,0,2,64); x.fillRect(54,0,2,64);
  } else if(g.pattern==="plaid"){
    x.globalAlpha=.55; x.fillStyle=g.accent; x.fillRect(0,0,64,18); x.fillRect(0,0,18,64);
    x.globalAlpha=.4; x.fillStyle="#E8D9B5"; x.fillRect(0,38,64,3); x.fillRect(38,0,3,64);
    x.globalAlpha=.25; x.fillStyle="#000"; x.fillRect(0,26,64,6); x.fillRect(26,0,6,64);
  } else if(g.pattern==="denim"){
    x.globalAlpha=.35; x.strokeStyle=shade(g.color,.35); x.lineWidth=1.2;
    for(let i=-64;i<128;i+=4){ x.beginPath(); x.moveTo(i,0); x.lineTo(i+64,64); x.stroke(); }
    for(let i=0;i<40;i++){ x.globalAlpha=.15; x.fillStyle=rnd()>.5?"#fff":"#000"; x.fillRect(rnd()*64,rnd()*64,rnd()*6,1); }
  } else if(g.pattern==="herringbone"){
    x.globalAlpha=.35; x.strokeStyle=shade(g.color,.25); x.lineWidth=1.5;
    for(let col=0;col<64;col+=16) for(let y=-16;y<80;y+=4){ x.beginPath();
      if((col/16)%2){ x.moveTo(col,y); x.lineTo(col+16,y+8);} else { x.moveTo(col,y+8); x.lineTo(col+16,y);} x.stroke(); }
  }
  x.globalAlpha=1; return c;
}
function mulberry(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const tileCache = new Map();
const tileFor = g => { const k = g.preset || g.id; if (!tileCache.has(k)) tileCache.set(k, makeTile({ ...g, id: k })); return tileCache.get(k); };
/* ---------- Geometría ---------- */
export const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y}), sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y}), mul=(a,k)=>({x:a.x*k,y:a.y*k});
export const len=a=>Math.hypot(a.x,a.y), norm=a=>{const l=len(a)||1;return{x:a.x/l,y:a.y/l}}, lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export const perp=a=>({x:-a.y,y:a.x});

/* Dibuja una prenda sobre un cuerpo (puntos en pantalla). s11/s12 hombros, e codos, w muñecas, h caderas. */
export function drawGarment(x, B, g, alpha=1){
  const shMid = lerp(B.s12,B.s11,.5);
  let u = norm(sub(B.s11,B.s12));            // de hombro 12 a hombro 11 (en pantalla)
  let v = perp(u); if(v.y<0) v=mul(v,-1);    // hacia abajo del torso
  const sw = len(sub(B.s11,B.s12));
  let hipMid = B.visHips ? lerp(B.h24,B.h23,.5) : add(shMid, mul(v, sw*1.35));
  const torsoLen = Math.max(len(sub(hipMid,shMid)), sw*0.9);
  const at = (a,b)=> add(add(shMid, mul(u,a*sw)), mul(v,b*torsoLen)); // coordenadas del torso
  const hemB = g.kind==="blazer"?1.1 : g.kind==="jacket"?0.98 : 1.04;
  const hemW = g.kind==="blazer"?0.62:0.6;

  const S12=at(-0.6,-0.04), S11=at(0.6,-0.04);
  const N12=at(-0.2,-0.1), N11=at(0.2,-0.1), Nc=at(0,0.07);
  const A12=at(-0.56,0.32), A11=at(0.56,0.32);
  const H12=at(-hemW,hemB), H11=at(hemW,hemB), Hc=at(0,hemB+0.03);

  const fill = x.createPattern(tileFor(g),"repeat");
  const k = sw/150, ang=Math.atan2(u.y,u.x);
  if(fill.setTransform) fill.setTransform(new DOMMatrix().translateSelf(shMid.x,shMid.y).rotateSelf(ang*180/Math.PI).scaleSelf(k,k));
  const edge = shade(g.color,-0.45);

  x.save(); x.globalAlpha = alpha; x.lineJoin="round"; x.lineCap="round";

  // Mangas (primero, para que la costura quede bajo el torso)
  const arms = [[B.s12,B.e12,B.w12,-1],[B.s11,B.e11,B.w11,1]];
  const sleevePaths = arms.map(([s,e,w,side])=>{
    const start = add(at(side*0.52,0.06), mul(u,0));
    if(g.sleeve==="short"){
      const end = lerp(s,e,.55);
      return limb([start,end],[sw*0.42,sw*0.34]);
    }
    return limb([start,e,w],[sw*0.42,sw*0.31,sw*0.24]);
  });
  sleevePaths.forEach(p=>{ x.fillStyle=fill; x.fill(p); x.strokeStyle=edge; x.lineWidth=Math.max(1,sw*0.012); x.stroke(p); });
  sleevePaths.forEach(p=> shadeClip(x,p,u,shMid,sw*0.5,.28));

  // Torso
  const T = new Path2D();
  T.moveTo(N12.x,N12.y);
  T.quadraticCurveTo(at(-0.42,-0.1).x,at(-0.42,-0.1).y, S12.x,S12.y);
  T.quadraticCurveTo(at(-0.6,0.15).x,at(-0.6,0.15).y, A12.x,A12.y);
  T.quadraticCurveTo(at(-0.5,0.7).x,at(-0.5,0.7).y, H12.x,H12.y);
  T.quadraticCurveTo(Hc.x,Hc.y+sw*0.02, H11.x,H11.y);
  T.quadraticCurveTo(at(0.5,0.7).x,at(0.5,0.7).y, A11.x,A11.y);
  T.quadraticCurveTo(at(0.6,0.15).x,at(0.6,0.15).y, S11.x,S11.y);
  T.quadraticCurveTo(at(0.42,-0.1).x,at(0.42,-0.1).y, N11.x,N11.y);
  T.quadraticCurveTo(Nc.x,Nc.y, N12.x,N12.y);
  T.closePath();
  x.fillStyle=fill; x.fill(T);
  shadeClip(x,T,u,shMid,sw*0.62,.32);
  x.strokeStyle=edge; x.lineWidth=Math.max(1,sw*0.012); x.stroke(T);

  const line=(a,b,w,c,dash)=>{x.beginPath(); x.moveTo(a.x,a.y); x.lineTo(b.x,b.y); x.lineWidth=w; x.strokeStyle=c; x.setLineDash(dash||[]); x.stroke(); x.setLineDash([]);};
  const dot=(p,r,c)=>{x.beginPath(); x.arc(p.x,p.y,r,0,7); x.fillStyle=c; x.fill(); x.lineWidth=Math.max(.6,r*.25); x.strokeStyle="#0005"; x.stroke();};
  const poly=(pts,f,s)=>{x.beginPath(); pts.forEach((p,i)=>i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y)); x.closePath(); x.fillStyle=f; x.fill(); if(s){x.strokeStyle=s; x.lineWidth=Math.max(1,sw*.012); x.stroke();}};

  if(g.kind==="shirt"||g.kind==="polo"){
    const plEnd = g.kind==="polo"? 0.36 : hemB-0.02;
    line(at(0,0.08),at(0,plEnd), sw*0.07, shade(g.color,-0.08));
    line(at(-0.035,0.08),at(-0.035,plEnd), Math.max(.8,sw*0.008), edge);
    line(at(0.035,0.08),at(0.035,plEnd), Math.max(.8,sw*0.008), edge);
    const nB = g.kind==="polo"?2:6;
    for(let i=0;i<nB;i++) dot(at(0,0.14+i*(g.kind==="polo"?0.12:0.16)), sw*0.017, g.kind==="polo"?shade(g.color,.2):"#F4F1EA");
    // cuello
    const cl = g.kind==="polo"?0.13:0.17;
    poly([at(-0.21,-0.13), at(-0.02,0.1), at(-0.2,cl)], fill, edge);
    poly([at(0.21,-0.13), at(0.02,0.1), at(0.2,cl)], fill, edge);
    if(g.kind==="shirt") [-1,1].forEach(sd=> line(at(sd*0.38,0.62),at(sd*0.22,0.62), Math.max(.6,sw*.006), edge)); // bolsillo sutil
  }
  if(g.kind==="jacket"){
    line(at(0,0.05),at(0,hemB), Math.max(1,sw*0.014), edge);
    for(let i=0;i<5;i++) dot(at(0.03,0.12+i*0.19), sw*0.022, "#B98A3E");
    [-1,1].forEach(sd=>{
      const p=[at(sd*0.12,0.2),at(sd*0.42,0.2),at(sd*0.42,0.42),at(sd*0.12,0.42)];
      poly(p, fill, edge);
      x.beginPath(); p.forEach((q,i)=>i?x.lineTo(q.x,q.y):x.moveTo(q.x,q.y)); x.closePath();
      x.setLineDash([sw*0.02,sw*0.015]); x.strokeStyle="#E39A3B"; x.lineWidth=Math.max(.8,sw*0.008); x.stroke(); x.setLineDash([]);
      line(at(sd*0.06,hemB-0.12),at(sd*0.58,hemB-0.12), Math.max(.8,sw*0.008), "#E39A3B", [sw*0.02,sw*0.015]);
    });
    poly([at(-0.21,-0.14), at(-0.03,0.06), at(-0.26,0.16)], fill, edge);
    poly([at(0.21,-0.14), at(0.03,0.06), at(0.26,0.16)], fill, edge);
  }
  if(g.kind==="blazer"){
    // camisa interior en V
    poly([at(-0.19,-0.1), at(0.19,-0.1), at(0.02,0.62), at(-0.02,0.62)], g.inner||"#fff", "#0003");
    line(at(0,-0.02),at(0,0.6), Math.max(.6,sw*.006), "#0003");
    // solapas
    poly([at(-0.2,-0.11), at(-0.32,0.12), at(-0.24,0.2), at(-0.03,0.64), at(-0.12,0.2)], shade(g.color,-0.06), edge);
    poly([at(0.2,-0.11), at(0.32,0.12), at(0.24,0.2), at(0.03,0.64), at(0.12,0.2)], shade(g.color,-0.06), edge);
    dot(at(0.02,0.72),sw*0.022,"#1b1b1b"); dot(at(0.02,0.9),sw*0.022,"#1b1b1b");
    [-1,1].forEach(sd=> line(at(sd*0.48,0.86),at(sd*0.2,0.86), sw*0.03, shade(g.color,-0.12)));
    line(at(-0.44,0.36),at(-0.24,0.33), sw*0.02, shade(g.color,-0.12));
  }

  // Antebrazo encima del torso por si el brazo cruza al frente
  if(g.sleeve==="long") arms.forEach(([s,e,w])=>{ const p=limb([e,w],[sw*0.31,sw*0.24]); x.fillStyle=fill; x.fill(p); shadeClip(x,p,u,shMid,sw*0.5,.22); x.strokeStyle=edge; x.lineWidth=Math.max(1,sw*.012); x.stroke(p);
    const d=norm(sub(w,e)), cuffA=add(w,mul(d,-sw*0.09)); const c=limb([cuffA,w],[sw*0.25,sw*0.24]); x.fillStyle=shade(g.color,-0.1); x.fill(c); x.stroke(c); });

  x.restore();
}

function limb(pts, widths){
  const L=[],R=[];
  pts.forEach((p,i)=>{
    const a = pts[Math.max(0,i-1)], b = pts[Math.min(pts.length-1,i+1)];
    const n = perp(norm(sub(b,a)));
    L.push(add(p,mul(n,widths[i]/2))); R.push(add(p,mul(n,-widths[i]/2)));
  });
  const P = new Path2D(); P.moveTo(L[0].x,L[0].y);
  for(let i=1;i<L.length;i++) P.lineTo(L[i].x,L[i].y);
  for(let i=R.length-1;i>=0;i--) P.lineTo(R[i].x,R[i].y);
  P.closePath(); return P;
}
function shadeClip(x, path, u, c, half, depth){
  x.save(); x.clip(path);
  const a=add(c,mul(u,-half*1.4)), b=add(c,mul(u,half*1.4));
  const gr=x.createLinearGradient(a.x,a.y,b.x,b.y);
  gr.addColorStop(0,`rgba(0,0,0,${depth})`); gr.addColorStop(.3,"rgba(0,0,0,0)");
  gr.addColorStop(.5,"rgba(255,255,255,.07)"); gr.addColorStop(.7,"rgba(0,0,0,0)"); gr.addColorStop(1,`rgba(0,0,0,${depth})`);
  x.fillStyle=gr; x.fillRect(0,0,x.canvas.width,x.canvas.height); x.restore();
}

/* ---------- Silueta guía ---------- */
export function guideGeom(c){ const H=c.height, W=c.width, gsw=Math.min(0.2*H, 0.42*W);
  return { cx:W/2, sy:0.34*H, gsw, hy:0.34*H+1.35*gsw }; }
export function drawGuide(x, ok, progress){
  const g=guideGeom(x.canvas); x.save();
  x.strokeStyle= ok? "#FFB627" : "#F3EEE4cc"; x.lineWidth=Math.max(3,g.gsw*0.025); x.setLineDash([g.gsw*0.07,g.gsw*0.05]);
  x.fillStyle = ok? "#FFB62718":"#05101420";
  const r=g.gsw*0.27, hx=g.cx, hy=g.sy-g.gsw*0.62;
  const p=new Path2D();
  p.ellipse(hx,hy,r*0.82,r,0,0,7);
  const s=g.gsw/2;
  // torso cerrado
  p.moveTo(g.cx-s*0.32,g.sy-g.gsw*0.2);
  p.quadraticCurveTo(g.cx-s*1.2,g.sy-g.gsw*0.16, g.cx-s*1.22,g.sy+g.gsw*0.12);
  p.quadraticCurveTo(g.cx-s*1.0,g.sy+g.gsw*0.7, g.cx-s*0.95,g.hy);
  p.lineTo(g.cx+s*0.95,g.hy);
  p.quadraticCurveTo(g.cx+s*1.0,g.sy+g.gsw*0.7, g.cx+s*1.22,g.sy+g.gsw*0.12);
  p.quadraticCurveTo(g.cx+s*1.2,g.sy-g.gsw*0.16, g.cx+s*0.32,g.sy-g.gsw*0.2);
  p.closePath();
  x.fill(p); x.stroke(p);
  // brazos relajados (solo trazo)
  const arm=new Path2D();
  arm.moveTo(g.cx-s*1.3,g.sy+g.gsw*0.05); arm.quadraticCurveTo(g.cx-s*1.45,g.sy+g.gsw*0.7, g.cx-s*1.42,g.hy+g.gsw*0.1);
  arm.moveTo(g.cx+s*1.3,g.sy+g.gsw*0.05); arm.quadraticCurveTo(g.cx+s*1.45,g.sy+g.gsw*0.7, g.cx+s*1.42,g.hy+g.gsw*0.1);
  x.stroke(arm);
  // línea de hombros
  x.setLineDash([]); x.lineWidth=Math.max(2,g.gsw*0.012); x.globalAlpha=.6;
  x.beginPath(); x.moveTo(g.cx-s*1.5,g.sy); x.lineTo(g.cx+s*1.5,g.sy); x.stroke(); x.globalAlpha=1;

  if(progress>0){ x.setLineDash([]); x.lineWidth=Math.max(5,g.gsw*0.04); x.strokeStyle="#F08A12";
    x.beginPath(); x.arc(hx,hy,r*1.25,-Math.PI/2,-Math.PI/2+progress*Math.PI*2); x.stroke(); }
  x.restore();
}


/* ---------- Prenda fotografiada ----------
   La foto (sin fondo) trae los puntos marcados por la tienda en la captura guiada:
   sL/sR costuras de hombro, hL/hR esquinas del ruedo y, por manga, aL/aR axila, eL/eR codo y cL/cR puño.
   El dibujo con malla (torso deformable y mangas en dos tramos) está en garment.js. */
export function drawPhotoGarment(x, B, img, a, g = {}, look) {
  return drawPhotoMesh(x, B, img, a, g, look);
}

/* Cuerpo fijo para miniaturas y vista previa (coordenadas en un lienzo de 200x200, ya en espejo).
   pose "down": brazos abajo; "bent": codos afuera y antebrazos cruzando por delante del torso. */
export function thumbBody(size = 200, pose = "down") {
  const s = size / 200, P = (a, b) => ({ x: a * s, y: b * s });
  const b = { s12: P(62, 52), s11: P(138, 52), e12: P(46, 110), e11: P(154, 110), w12: P(44, 165), w11: P(156, 165), h24: P(72, 160), h23: P(128, 160), nose: P(100, 20), visHips: true };
  if (pose === "bent") Object.assign(b, { e12: P(34, 100), w12: P(84, 122), e11: P(170, 64), w11: P(176, 14) });
  return b;
}

/* Maniquí simple para la vista previa de la captura, con brazos que siguen el cuerpo B. */
export function drawMannequin(x, size = 200, B = thumbBody(size)) {
  const s = size / 200; x.save();
  x.fillStyle = "#D8CFBF"; x.strokeStyle = "#D8CFBF"; x.lineCap = "round"; x.lineJoin = "round";
  x.save(); x.scale(s, s);
  x.beginPath(); x.ellipse(100, 22, 15, 18, 0, 0, 7); x.fill();
  x.fillRect(92, 36, 16, 14);
  x.beginPath(); x.moveTo(58, 52); x.quadraticCurveTo(100, 40, 142, 52); x.lineTo(150, 110); x.lineTo(132, 200); x.lineTo(68, 200); x.lineTo(50, 110); x.closePath(); x.fill();
  x.restore();
  x.fillStyle = "#CFC5B3"; x.strokeStyle = "#CFC5B3";
  for (const [a, e, w] of [[B.s12, B.e12, B.w12], [B.s11, B.e11, B.w11]]) {
    x.lineWidth = 17 * s; x.beginPath(); x.moveTo(a.x, a.y + 4 * s); x.lineTo(e.x, e.y); x.stroke();
    x.lineWidth = 13 * s; x.beginPath(); x.moveTo(e.x, e.y); x.lineTo(w.x, w.y); x.stroke();
    x.beginPath(); x.arc(w.x, w.y, 8 * s, 0, 7); x.fill();
  }
  x.restore();
}

export function drawThumb(canvas, g, img) {
  const x = canvas.getContext("2d"); x.clearRect(0, 0, canvas.width, canvas.height);
  if (g.source === "photo" && img) {
    const r = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.92;
    x.drawImage(img, (canvas.width - img.width * r) / 2, (canvas.height - img.height * r) / 2, img.width * r, img.height * r);
  } else drawGarment(x, thumbBody(canvas.width), g, 1);
}
