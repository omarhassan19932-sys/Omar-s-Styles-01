(function(){
const cv=document.getElementById('cv');
const cx=cv.getContext('2d');
const DPR=Math.min(window.devicePixelRatio||1,2);
let W=0,H=0,COLS=50,ROWS=0,cellW=0,cellH=0,maxR=0,canvasH=750,canvasW=1200,arLocked=false,arRatio=1200/750;
const MIN_R=0.35;
let dots=[],waves=[],mouse={x:-9e3,y:-9e3,over:false};
let t=0,raf=null;
let currentMode='noise',srcMode='gen',animStyle='noise',shape='diamond',dotRotation=0;
let fgColor='#0F0F0F',bgColor='#ECEAE4';
let spd=50,reach=6;
let imgContrast=1.3,imgBright=0,imgThresh=0,imgInvert=false,imgScale=1.0,hybridBlend=0.5;
let imgLoaded=false,srcImg=null,customShape=null,isVideo=false,mediaUrl=null;
let noise=mkNoise();
const videoEl=document.createElement('video');
videoEl.loop=true;videoEl.muted=true;videoEl.playsInline=true;
let vOC=null,vOC2=null,vLastSample=0;

const PRESETS={
  paper:{fg:'#0F0F0F',bg:'#ECEAE4'},
  ink:{fg:'#EEEEEE',bg:'#0C0C0C'},
  neon:{fg:'#00FFB3',bg:'#06060F'},
  rust:{fg:'#E84020',bg:'#F5F0E8'}
};

function mkNoise(){
  const p=Array.from({length:256},(_,i)=>i);
  for(let i=255;i>0;i--){const j=Math.floor(Math.random()*(i+1));[p[i],p[j]]=[p[j],p[i]];}
  const pm=[...p,...p];
  const fd=n=>n*n*n*(n*(n*6-15)+10),lp=(a,b,n)=>a+n*(b-a),g=(h,x,y)=>{h&=3;return(h&1?-x:x)+(h&2?-y:y);};
  return(x,y)=>{
    const fx=Math.floor(x),fy=Math.floor(y),X=fx&255,Y=fy&255,xf=x-fx,yf=y-fy,u=fd(xf),v=fd(yf);
    const aa=pm[pm[X]+Y],ba=pm[pm[X+1]+Y],ab=pm[pm[X]+Y+1],bb=pm[pm[X+1]+Y+1];
    return lp(lp(g(aa,xf,yf),g(ba,xf-1,yf),u),lp(g(ab,xf,yf-1),g(bb,xf-1,yf-1),u),v);
  };
}

function isLight(hex){
  try{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return(.299*r+.587*g+.114*b)/255>0.5;}catch{return true;}
}

// ── Custom SVG ────────────────────────────────────────────────
function loadCustomSVG(txt){
  try{
    const doc=new DOMParser().parseFromString(txt,'image/svg+xml');
    if(doc.querySelector('parsererror'))return null;
    const sv=doc.documentElement;
    let vb={x:0,y:0,w:100,h:100};
    const vbA=sv.getAttribute('viewBox');
    if(vbA){const pts=vbA.trim().split(/[\s,]+/).map(Number);if(pts.length>=4)vb={x:pts[0],y:pts[1],w:pts[2],h:pts[3]};}
    else{vb.w=parseFloat(sv.getAttribute('width'))||100;vb.h=parseFloat(sv.getAttribute('height'))||100;}
    const combined=new Path2D();let cnt=0;
    doc.querySelectorAll('path').forEach(el=>{const d=el.getAttribute('d');if(d){try{combined.addPath(new Path2D(d));cnt++;}catch(e){}}});
    doc.querySelectorAll('circle').forEach(el=>{const p=new Path2D();p.arc(+el.getAttribute('cx')||0,+el.getAttribute('cy')||0,+el.getAttribute('r')||0,0,Math.PI*2);combined.addPath(p);cnt++;});
    doc.querySelectorAll('rect').forEach(el=>{const p=new Path2D();p.rect(+el.getAttribute('x')||0,+el.getAttribute('y')||0,+el.getAttribute('width')||0,+el.getAttribute('height')||0);combined.addPath(p);cnt++;});
    doc.querySelectorAll('polygon,polyline').forEach(el=>{const pts=(el.getAttribute('points')||'').trim().split(/[\s,]+/).map(Number);const p=new Path2D();for(let i=0;i<pts.length-1;i+=2){if(i===0)p.moveTo(pts[i],pts[i+1]);else p.lineTo(pts[i],pts[i+1]);}if(el.tagName.toLowerCase()==='polygon')p.closePath();combined.addPath(p);cnt++;});
    doc.querySelectorAll('ellipse').forEach(el=>{const p=new Path2D();p.ellipse(+el.getAttribute('cx')||0,+el.getAttribute('cy')||0,+el.getAttribute('rx')||0,+el.getAttribute('ry')||0,0,0,Math.PI*2);combined.addPath(p);cnt++;});
    if(!cnt)return null;
    return{path2D:combined,cx:vb.x+vb.w/2,cy:vb.y+vb.h/2,normScale:1/Math.max(vb.w,vb.h),svgText:txt,vb};
  }catch{return null;}
}

// ── Media ─────────────────────────────────────────────────────
function sampleVideoFrame(now){
  if(!videoEl||videoEl.readyState<2)return;
  if(now-vLastSample<33)return;
  vLastSample=now;
  if(!vOC||vOC.width!==COLS||vOC.height!==ROWS){vOC=document.createElement('canvas');vOC.width=COLS;vOC.height=ROWS;vOC2=vOC.getContext('2d');}
  const vW=videoEl.videoWidth,vH=videoEl.videoHeight;if(!vW||!vH)return;
  vOC2.drawImage(videoEl,0,0,vW,vH,0,0,COLS,ROWS);
  const px=vOC2.getImageData(0,0,COLS,ROWS).data;
  dots.forEach((d,i)=>{const p=i*4;d.imgB=(.299*px[p]+.587*px[p+1]+.114*px[p+2])/255;});
  imgLoaded=true;
}

function resample(){
  if(!srcImg)return;
  const oc=document.createElement('canvas');oc.width=COLS;oc.height=ROWS;
  const c2=oc.getContext('2d');
  c2.drawImage(srcImg,0,0,srcImg.naturalWidth,srcImg.naturalHeight,0,0,COLS,ROWS);
  const px=c2.getImageData(0,0,COLS,ROWS).data;
  dots.forEach((dot,i)=>{const p=i*4;dot.imgB=(.299*px[p]+.587*px[p+1]+.114*px[p+2])/255;});
  imgLoaded=true;
}

function showMediaStatus(name,vid){
  document.getElementById('media-drop').style.display='none';
  const ms=document.getElementById('media-status');ms.style.display='flex';
  document.getElementById('media-name').textContent=name.slice(0,22)+(name.length>22?'…':'');
  document.getElementById('vid-ctrl').style.display=vid?'block':'none';
  document.getElementById('btn-reveal').style.display='';
}

function clearMedia(){
  if(mediaUrl){URL.revokeObjectURL(mediaUrl);mediaUrl=null;}
  videoEl.pause();videoEl.src='';
  isVideo=false;imgLoaded=false;srcImg=null;
  dots.forEach(d=>delete d.imgB);
  document.getElementById('media-drop').style.display='';
  document.getElementById('media-status').style.display='none';
  document.getElementById('vid-ctrl').style.display='none';
  document.getElementById('img-thumb').style.display='none';
  document.getElementById('btn-reveal').style.display='none';
  if(currentMode==='image'||currentMode==='hybrid')setMode('noise');
  else syncUI();
}

function processMediaFile(f){
  if(!f)return;
  if(f.type.startsWith('image/')){
    const url=URL.createObjectURL(f);const img=new Image();
    img.onload=()=>{
      if(mediaUrl)URL.revokeObjectURL(mediaUrl);
      mediaUrl=null;srcImg=img;isVideo=false;
      if(canvasW<=0)canvasW=650;
      canvasH=Math.round(canvasW*(img.naturalHeight/img.naturalWidth));
      arRatio=canvasW/canvasH;
      document.getElementById('s-cw').value=canvasW;
      document.getElementById('s-ch').value=canvasH;
      cancelAnimationFrame(raf);resize();loop();
      resample();
      dots.forEach(d=>{d.curR=MIN_R+Math.random()*maxR*.4;});
      if(currentMode==='noise'||currentMode==='static')setMode('image');
      showMediaStatus(f.name,false);
      const th=document.getElementById('img-thumb');
      const tc=document.createElement('canvas');tc.width=180;tc.height=28;
      const t2=tc.getContext('2d');t2.drawImage(img,0,0,180,28);
      const d=t2.getImageData(0,0,180,28);
      for(let i=0;i<d.data.length;i+=4){const g=.299*d.data[i]+.587*d.data[i+1]+.114*d.data[i+2];d.data[i]=d.data[i+1]=d.data[i+2]=g;}
      t2.putImageData(d,0,0);th.src=tc.toDataURL();th.style.display='block';
      URL.revokeObjectURL(url);
    };img.src=url;
  }else if(f.type.startsWith('video/')){
    if(mediaUrl)URL.revokeObjectURL(mediaUrl);
    mediaUrl=URL.createObjectURL(f);
    srcImg=null;
    videoEl.src=mediaUrl;
    videoEl.onloadeddata=()=>{
      isVideo=true;imgLoaded=false;
      const vW2=videoEl.videoWidth||1920,vH2=videoEl.videoHeight||1080;
      if(canvasW<=0)canvasW=650;
      canvasH=Math.round(canvasW*(vH2/vW2));
      arRatio=canvasW/canvasH;
      document.getElementById('s-cw').value=canvasW;
      document.getElementById('s-ch').value=canvasH;
      cancelAnimationFrame(raf);resize();loop();
      dots.forEach(d=>{d.curR=MIN_R+Math.random()*maxR*.4;});
      if(currentMode==='noise'||currentMode==='static')setMode('image');
      showMediaStatus(f.name,true);
      videoEl.play().catch(()=>{});
      document.getElementById('btn-pp').textContent='⏸ pause';
    };
  }
}

// ── Dots ──────────────────────────────────────────────────────
function initDots(){
  ROWS=Math.max(1,Math.round(COLS*H/W));
  cellW=W/COLS;cellH=H/ROWS;maxR=Math.min(cellW,cellH)*.47;
  dots=[];
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)
    dots.push({x:c*cellW+cellW/2,y:r*cellH+cellH/2,nx:c*.28,ny:r*.28,ph:Math.random()*Math.PI*2,curR:MIN_R+Math.random()*maxR*.25});
  if(srcImg)resample();
}

function updateDisplaySize(){
  const stage=document.getElementById('stage');
  const maxW=stage.clientWidth||W;
  const scale=Math.min(1,maxW/W);
  cv.style.width=Math.round(W*scale)+'px';
  cv.style.height=Math.round(H*scale)+'px';
}

function resize(){
  const stage=document.getElementById('stage');
  W=canvasW>0?canvasW:(stage.clientWidth||1080);H=canvasH;
  cv.width=Math.round(W*DPR);cv.height=Math.round(H*DPR);
  cx.setTransform(DPR,0,0,DPR,0,0);
  updateDisplaySize();
  initDots();
}

// ── Radius ────────────────────────────────────────────────────
function noiseR(dot){
  if(animStyle==='noise'){
    const l=noise(dot.nx*.18+t*.04,dot.ny*.16),m=noise(dot.nx*.65+5,dot.ny*.52+t*.2),h=noise(dot.nx*1.9+10,dot.ny*1.6+t*.5)*.3;
    return MIN_R+Math.max(0,Math.min(1,((l*.55+m*.35+h)+1)/2+.05))*(maxR-MIN_R);
  }
  return(MIN_R+((noise(dot.nx*.42+100,dot.ny*.32+50)+1)/2)*(maxR-MIN_R))*(1+Math.sin(t*.32+dot.ph)*.06);
}

function calcImgR(dot){
  if(!imgLoaded||dot.imgB===undefined)return noiseR(dot);
  let b=dot.imgB;b=(b-.5)*imgContrast+.5+imgBright;b=Math.max(0,Math.min(1,b));
  if(imgThresh>0)b=b>imgThresh?1:0;
  const dv=imgInvert?b:1-b;
  return Math.max(MIN_R,Math.min(maxR*imgScale,MIN_R+dv*(maxR-MIN_R)*imgScale));
}

function getTargetR(dot){
  if(srcMode==='gen')return noiseR(dot);
  if(srcMode==='img')return calcImgR(dot)+noise(dot.nx*2+100,dot.ny*1.5+t*.12)*maxR*.04;
  return calcImgR(dot)*hybridBlend+noiseR(dot)*(1-hybridBlend);
}

// ── Update ────────────────────────────────────────────────────
function update(){
  t+=spd*.00032;const now=performance.now();
  if(isVideo&&(srcMode==='img'||srcMode==='hybrid'))sampleVideoFrame(now);
  dots.forEach(dot=>{
    let tr=getTargetR(dot);
    if(mouse.over&&reach>0){
      const dx=dot.x-mouse.x,dy=dot.y-mouse.y,sig=Math.min(W,H)*.1*(reach/12);
      const inf=Math.exp(-(dx*dx+dy*dy)/(2*sig*sig));
      if(inf>.005)tr=tr+(maxR-tr)*inf*Math.min(1,reach/8);
    }
    let wa=0;
    waves.forEach(w=>{
      const age=(now-w.t)/1e3,diff=Math.sqrt((dot.x-w.x)**2+(dot.y-w.y)**2)-age*220;
      if(diff>-25&&diff<55)wa+=Math.sin(-diff/25*Math.PI)*w.s*Math.exp(-age*1.8)*maxR;
    });
    dot.curR=Math.max(0,Math.min(maxR*1.08,dot.curR+(Math.max(0,Math.min(maxR*1.08,tr+wa))-dot.curR)*(.055+reach/240)));
  });
  waves=waves.filter(w=>(performance.now()-w.t)<3200);
}

// ── Draw ──────────────────────────────────────────────────────
function addPath(x,y,r,sh){
  if(r<0.2)return;
  switch(sh){
    case 'circle':cx.moveTo(x+r,y);cx.arc(x,y,r,0,Math.PI*2);break;
    case 'square':cx.rect(x-r,y-r,r*2,r*2);break;
    case 'diamond':cx.moveTo(x,y-r);cx.lineTo(x+r,y);cx.lineTo(x,y+r);cx.lineTo(x-r,y);cx.closePath();break;
    case 'triangle':{const h=r*.866;cx.moveTo(x,y-r);cx.lineTo(x+h,y+r*.5);cx.lineTo(x-h,y+r*.5);cx.closePath();break;}
    case 'bar':{const bw=Math.max(.35,r*.3);cx.rect(x-bw,y-r,bw*2,r*2);break;}
  }
}

let recOffscreen=null,recCtx2=null;

function draw(){
  if(!W||!H)return;
  cx.fillStyle=bgColor;cx.fillRect(0,0,W,H);
  const rot=dotRotation;
  if(shape==='ring'){
    dots.forEach(d=>{if(d.curR<0.4)return;cx.beginPath();cx.arc(d.x,d.y,d.curR,0,Math.PI*2);cx.strokeStyle=fgColor;cx.lineWidth=Math.max(.35,d.curR*.18);cx.stroke();});
  }else if(shape==='custom'&&customShape){
    cx.fillStyle=fgColor;
    dots.forEach(d=>{
      const r=d.curR;if(r<0.2)return;
      const s=r*customShape.normScale*2;
      cx.save();cx.translate(d.x,d.y);cx.rotate(rot);cx.scale(s,s);cx.translate(-customShape.cx,-customShape.cy);
      cx.fill(customShape.path2D);cx.restore();
    });
  }else if(rot===0){
    cx.fillStyle=fgColor;cx.beginPath();
    dots.forEach(d=>addPath(d.x,d.y,d.curR,shape));
    cx.fill();
  }else{
    cx.fillStyle=fgColor;
    dots.forEach(d=>{
      if(d.curR<0.2)return;
      cx.save();cx.translate(d.x,d.y);cx.rotate(rot);cx.beginPath();
      addPath(0,0,d.curR,shape);cx.fill();cx.restore();
    });
  }
  cx.globalAlpha=.1;cx.fillStyle=isLight(bgColor)?'#000':'#fff';
  cx.font='9px var(--font-mono,monospace)';
  cx.fillText(currentMode+(isVideo?' · video':'')+' · '+shape+' · '+COLS+'×'+ROWS,10,H-8);
  cx.globalAlpha=1;
  if(recCtx2)recCtx2.drawImage(cv,0,0,recOffscreen.width,recOffscreen.height);
}

function loop(){update();draw();raf=requestAnimationFrame(loop);}

// ── SVG export ────────────────────────────────────────────────
function r2(n){return Math.round(n*100)/100;}
function svgShape(x,y,r){
  const f=fgColor;
  switch(shape){
    case 'circle':return`<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="${f}"/>`;
    case 'square':return`<rect x="${r2(x-r)}" y="${r2(y-r)}" width="${r2(r*2)}" height="${r2(r*2)}" fill="${f}"/>`;
    case 'diamond':return`<polygon points="${r2(x)},${r2(y-r)} ${r2(x+r)},${r2(y)} ${r2(x)},${r2(y+r)} ${r2(x-r)},${r2(y)}" fill="${f}"/>`;
    case 'triangle':{const h=r*.866;return`<polygon points="${r2(x)},${r2(y-r)} ${r2(x+h)},${r2(y+r*.5)} ${r2(x-h)},${r2(y+r*.5)}" fill="${f}"/>`;}
    case 'bar':{const bw=Math.max(.35,r*.3);return`<rect x="${r2(x-bw)}" y="${r2(y-r)}" width="${r2(bw*2)}" height="${r2(r*2)}" fill="${f}"/>`;}
    case 'ring':{const sw=Math.max(.35,r*.18);return`<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="none" stroke="${f}" stroke-width="${r2(sw)}"/>`;}
    case 'custom':{if(!customShape)return'';const s=r*customShape.normScale*2,tx=x-customShape.cx*s,ty=y-customShape.cy*s;return`<use href="#cs" transform="translate(${r2(tx)},${r2(ty)}) scale(${r2(s)})" fill="${f}"/>`;}
    default:return'';
  }
}
function svgDot(x,y,r){
  const s=svgShape(x,y,r);if(!s)return'';
  const deg=r2(dotRotation*180/Math.PI);
  return+deg===0?s:`<g transform="rotate(${deg} ${r2(x)} ${r2(y)})">${s}</g>`;
}

function generateSVG(){
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`];
  if(shape==='custom'&&customShape){
    const vb=customShape.vb;
    parts.push('<defs>');
    parts.push(`<symbol id="cs" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" overflow="visible">`);
    const sdoc=new DOMParser().parseFromString(customShape.svgText,'image/svg+xml');
    sdoc.querySelectorAll('path,circle,rect,polygon,polyline,ellipse').forEach(el=>{
      ['fill','stroke','fill-opacity','stroke-opacity'].forEach(a=>el.removeAttribute(a));
      el.setAttribute('fill','inherit');parts.push(el.outerHTML);
    });
    parts.push('</symbol></defs>');
    parts.push(`<rect width="${W}" height="${H}" fill="${bgColor}"/>`);
    const degC=r2(dotRotation*180/Math.PI);
    dots.forEach(d=>{if(d.curR<0.2)return;const s=d.curR*customShape.normScale*2;const rotW=+degC!==0?`rotate(${degC} ${r2(d.x)} ${r2(d.y)}) `:'';parts.push(`<use href="#cs" transform="${rotW}translate(${r2(d.x-customShape.cx*s)},${r2(d.y-customShape.cy*s)}) scale(${r2(s)})" fill="${fgColor}"/>`);});
  }else{
    parts.push(`<rect width="${W}" height="${H}" fill="${bgColor}"/>`);
    dots.forEach(d=>{if(d.curR>=0.2)parts.push(svgDot(d.x,d.y,d.curR));});
  }
  parts.push('</svg>');
  return parts.join('\n');
}

function flashFb(msg,dur=1600){const fb=document.getElementById('exp-fb');fb.textContent=msg;setTimeout(()=>{fb.textContent='';},dur);}

// ── Settings ──────────────────────────────────────────────────
function saveSettings(){
  localStorage.setItem('halftone-v1',JSON.stringify({
    mode:currentMode,cw:canvasW,ch:canvasH,cols:COLS,spd,
    fg:fgColor,bg:bgColor,shape,
    con:imgContrast,bri:imgBright,thr:imgThresh,inv:imgInvert,scl:imgScale,blend:hybridBlend
  }));
  flashFb('settings saved');
}
function loadSettings(){
  try{
    const s=JSON.parse(localStorage.getItem('halftone-v1'));
    if(!s)return;
    canvasW=s.cw||1200;canvasH=s.ch||750;
    document.getElementById('s-cw').value=canvasW||'';
    document.getElementById('s-ch').value=canvasH;
    COLS=s.cols||50;
    document.getElementById('s-cols').value=COLS;document.getElementById('v-cols').textContent=COLS;
    spd=s.spd||50;
    document.getElementById('s-spd').value=spd;document.getElementById('v-spd').textContent=spd;
    if(s.fg&&s.bg)applyColors(s.fg,s.bg);
    if(s.shape){shape=s.shape;document.querySelectorAll('[data-shape]').forEach(x=>x.classList.toggle('on',x.dataset.shape===shape));}
    imgContrast=s.con??1.3;imgBright=s.bri??0;imgThresh=s.thr??0;imgInvert=!!s.inv;imgScale=s.scl??1;hybridBlend=s.blend??0.5;
    const setSlider=(id,vid,rawVal,fmt)=>{const el=document.getElementById(id);if(el){el.value=rawVal;document.getElementById(vid).textContent=fmt(+rawVal);}};
    setSlider('s-con','v-con',imgContrast*100,v=>(v/100).toFixed(1));
    setSlider('s-bri','v-bri',imgBright*100,v=>(v>0?'+':'')+v);
    setSlider('s-thr','v-thr',imgThresh*100,v=>v===0?'off':(v/100).toFixed(2));
    setSlider('s-scl','v-scl',imgScale*100,v=>(v/100).toFixed(1)+'×');
    setSlider('s-blend','v-blend',hybridBlend*100,v=>v+'%');
    document.getElementById('btn-inv')?.classList.toggle('on',imgInvert);
    if(s.mode)setMode(s.mode);
  }catch(e){}
}

// ── Colors ────────────────────────────────────────────────────
function applyColors(fg,bg){
  fgColor=fg;bgColor=bg;
  document.getElementById('fg-col').value=fg;document.getElementById('fg-hex').value=fg;
  document.getElementById('bg-col').value=bg;document.getElementById('bg-hex').value=bg;
}
applyColors('#0F0F0F','#ECEAE4');

function wireColor(colId,hexId,isFg){
  document.getElementById(colId).addEventListener('input',function(){
    if(isFg)fgColor=this.value;else bgColor=this.value;
    document.getElementById(hexId).value=this.value;
  });
  document.getElementById(hexId).addEventListener('input',function(){
    const v=this.value.trim();
    if(/^#[0-9A-Fa-f]{6}$/.test(v)){if(isFg)fgColor=v;else bgColor=v;document.getElementById(colId).value=v;}
  });
}
wireColor('fg-col','fg-hex',true);
wireColor('bg-col','bg-hex',false);
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{const p=PRESETS[b.dataset.preset];if(p)applyColors(p.fg,p.bg);}));

// ── Shapes ────────────────────────────────────────────────────
document.querySelectorAll('[data-shape]').forEach(b=>b.addEventListener('click',()=>{
  shape=b.dataset.shape;document.querySelectorAll('[data-shape]').forEach(x=>x.classList.toggle('on',x.dataset.shape===shape));
}));
const csZone=document.getElementById('cs-zone'),csFile=document.getElementById('cs-file');
csZone.addEventListener('click',()=>{if(customShape)clearCS();else csFile.click();});
csFile.addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const cs=loadCustomSVG(ev.target.result);
    if(cs){customShape=cs;shape='custom';csZone.textContent=f.name.slice(0,20)+(f.name.length>20?'…':'')+' · × clear';csZone.classList.add('on');document.getElementById('cs-btn').style.display='';document.querySelectorAll('[data-shape]').forEach(x=>x.classList.toggle('on',x.dataset.shape==='custom'));}
    else flashFb('no shapes found in SVG');
  };reader.readAsText(f);csFile.value='';
});
function clearCS(){customShape=null;if(shape==='custom'){shape='circle';document.querySelectorAll('[data-shape]').forEach(x=>x.classList.toggle('on',x.dataset.shape==='circle'));}csZone.textContent='+ upload SVG shape';csZone.classList.remove('on');document.getElementById('cs-btn').style.display='none';}

// ── Mode ──────────────────────────────────────────────────────
function setMode(m){
  currentMode=m;
  if(m==='noise'||m==='static'){srcMode='gen';animStyle=m;}
  else if(m==='image')srcMode='img';
  else if(m==='hybrid')srcMode='hybrid';
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));
  syncUI();
}
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));

// ── Media drop ────────────────────────────────────────────────
const mediaDrop=document.getElementById('media-drop'),mediaFile=document.getElementById('media-file');
document.getElementById('media-browse').onclick=e=>{e.stopPropagation();mediaFile.click();};
mediaDrop.addEventListener('click',()=>mediaFile.click());
mediaFile.addEventListener('change',e=>{if(e.target.files[0])processMediaFile(e.target.files[0]);mediaFile.value='';});
['dragover','dragenter'].forEach(ev=>mediaDrop.addEventListener(ev,e=>{e.preventDefault();mediaDrop.classList.add('drag');}));
['dragleave','dragend'].forEach(ev=>mediaDrop.addEventListener(ev,()=>mediaDrop.classList.remove('drag')));
mediaDrop.addEventListener('drop',e=>{e.preventDefault();mediaDrop.classList.remove('drag');processMediaFile(e.dataTransfer.files[0]);});
cv.addEventListener('dragover',e=>e.preventDefault());
cv.addEventListener('drop',e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)processMediaFile(f);});
document.addEventListener('paste',e=>{for(const item of(e.clipboardData?.items||[])){if(item.type.startsWith('image/')||item.type.startsWith('video/')){processMediaFile(item.getAsFile());break;}}});
document.getElementById('media-clear').onclick=clearMedia;
document.getElementById('btn-pp').addEventListener('click',function(){
  if(videoEl.paused){videoEl.play();this.textContent='⏸ pause';}
  else{videoEl.pause();this.textContent='▶ play';}
});

// ── Canvas events ─────────────────────────────────────────────
cv.addEventListener('mousemove',e=>{const r=cv.getBoundingClientRect();mouse.x=(e.clientX-r.left)*(W/r.width);mouse.y=(e.clientY-r.top)*(H/r.height);mouse.over=true;});
cv.addEventListener('mouseleave',()=>{mouse.over=false;});
cv.addEventListener('click',e=>{const r=cv.getBoundingClientRect();waves.push({x:(e.clientX-r.left)*(W/r.width),y:(e.clientY-r.top)*(H/r.height),t:performance.now(),s:.5+Math.random()*.4});});
cv.addEventListener('touchmove',e=>{e.preventDefault();const r=cv.getBoundingClientRect(),tc=e.touches[0];mouse.x=(tc.clientX-r.left)*(W/r.width);mouse.y=(tc.clientY-r.top)*(H/r.height);mouse.over=true;},{passive:false});
cv.addEventListener('touchend',e=>{mouse.over=false;if(e.changedTouches.length){const r=cv.getBoundingClientRect(),tc=e.changedTouches[0];waves.push({x:(tc.clientX-r.left)*(W/r.width),y:(tc.clientY-r.top)*(H/r.height),t:performance.now(),s:.5+Math.random()*.4});}});

// ── Controls ──────────────────────────────────────────────────
document.getElementById('btn-shuffle').onclick=()=>{noise=mkNoise();initDots();};
document.getElementById('btn-save').addEventListener('click',saveSettings);
document.getElementById('btn-reveal').onclick=()=>{dots.forEach(d=>{d.curR=MIN_R+Math.random()*maxR*.3;});};
document.getElementById('btn-inv').addEventListener('click',function(){imgInvert=!imgInvert;this.classList.toggle('on',imgInvert);});
document.getElementById('btn-copy').addEventListener('click',()=>{
  const svg=generateSVG();
  navigator.clipboard.writeText(svg).then(()=>flashFb('copied! paste in Illustrator')).catch(()=>{const ta=document.createElement('textarea');ta.value=svg;ta.style.cssText='position:fixed;top:-9999px';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);flashFb('copied!');});
});
document.getElementById('btn-svg').addEventListener('click',()=>{
  const blob=new Blob([generateSVG()],{type:'image/svg+xml'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='omar-styles-01.svg';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);flashFb('saved!');
});

function sl(id,vId,fmt,cb){
  const el=document.getElementById(id),out=document.getElementById(vId);
  el.addEventListener('input',()=>{const v=+el.value;out.textContent=fmt(v);cb(v);});
}
sl('s-cols','v-cols',v=>v,v=>{COLS=v;vOC=null;initDots();});
sl('s-spd','v-spd',v=>v,v=>{spd=v;});
sl('s-rot','v-rot',v=>v+'°',v=>{dotRotation=v*Math.PI/180;});
sl('s-con','v-con',v=>(v/100).toFixed(1),v=>{imgContrast=v/100;});
sl('s-bri','v-bri',v=>(v>0?'+':'')+v,v=>{imgBright=v/100;});
sl('s-thr','v-thr',v=>v===0?'off':(v/100).toFixed(2),v=>{imgThresh=v/100;});
sl('s-scl','v-scl',v=>(v/100).toFixed(1)+'×',v=>{imgScale=v/100;});
sl('s-blend','v-blend',v=>v+'%',v=>{hybridBlend=v/100;});
document.getElementById('s-cw').addEventListener('change',function(){
  const v=Math.max(100,Math.min(3840,+this.value||650));
  this.value=v;canvasW=v;
  if(arLocked){canvasH=Math.round(canvasW/arRatio);document.getElementById('s-ch').value=canvasH;}
  cancelAnimationFrame(raf);resize();loop();
});
document.getElementById('s-ch').addEventListener('change',function(){
  const v=Math.max(100,Math.min(3840,+this.value||500));
  this.value=v;canvasH=v;
  if(arLocked){canvasW=Math.round(canvasH*arRatio);document.getElementById('s-cw').value=canvasW;}
  cancelAnimationFrame(raf);resize();loop();
});
document.getElementById('btn-ar').addEventListener('click',function(){
  arLocked=!arLocked;
  if(arLocked){arRatio=canvasW/canvasH;this.textContent='linked';this.classList.add('on');}
  else{this.textContent='link';this.classList.remove('on');}
});

function syncUI(){
  const isMedia=srcMode==='img'||srcMode==='hybrid';
  document.getElementById('img-ctrls').style.display=isMedia?'block':'none';
  document.getElementById('blend-row').style.display=srcMode==='hybrid'?'block':'none';
}

// ── Recording ─────────────────────────────────────────────────
let mediaRec=null,recChunks=[],recInt=null,recSecs=0;
const btnRec=document.getElementById('btn-rec'),recTimer=document.getElementById('rec-timer');
btnRec.addEventListener('click',function(){
  if(mediaRec&&mediaRec.state==='recording'){mediaRec.stop();return;}
  recChunks=[];
  const recAR=W/H,recLong=3840;
  const recW=recAR>=1?recLong:Math.round(recLong*recAR);
  const recH=recAR>=1?Math.round(recLong/recAR):recLong;
  recOffscreen=document.createElement('canvas');
  recOffscreen.width=recW;recOffscreen.height=recH;
  recCtx2=recOffscreen.getContext('2d');
  const stream=recOffscreen.captureStream(30);
  const mimeType=['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))||'';
  const ext=mimeType.startsWith('video/mp4')?'mp4':'webm';
  mediaRec=new MediaRecorder(stream,mimeType?{mimeType}:{});
  mediaRec.ondataavailable=e=>{if(e.data.size>0)recChunks.push(e.data);};
  mediaRec.onstop=()=>{
    clearInterval(recInt);recTimer.style.display='none';
    btnRec.textContent='● rec';btnRec.classList.remove('on');
    recCtx2=null;recOffscreen=null;
    const blob=new Blob(recChunks,{type:mimeType||'video/webm'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='omar-styles-01-'+Date.now()+'.'+ext;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    flashFb('saved '+recW+'×'+recH+' '+ext.toUpperCase());
  };
  mediaRec.start(100);
  recSecs=0;recTimer.textContent='0s';recTimer.style.display='';
  btnRec.textContent='■ stop';btnRec.classList.add('on');
  recInt=setInterval(()=>{recSecs++;recTimer.textContent=recSecs+'s';},1000);
});

// ── Init ──────────────────────────────────────────────────────
let resTO;
window.addEventListener('resize',()=>{clearTimeout(resTO);resTO=setTimeout(()=>{if(canvasW<=0){cancelAnimationFrame(raf);resize();loop();}else{updateDisplaySize();}},80);});
loadSettings();syncUI();resize();loop();
})();
