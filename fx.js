/* ============ АНИМАЦИИ И ГРАФИКА ============
   Частицы (искры, салют), силуэт города, заставка, полёт буквы, финал, открытка.
   Всё уважает системную настройку «Уменьшение движения»: тогда анимации пропускаются. */
const FX = (function(){
'use strict';
const REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const GOLD = ['#FFE3A3','#F1C36A','#E3B65E','#FFF4D6','#FFB84D'];
const sleep = ms => new Promise(r=>setTimeout(r, ms));

/* ---------- частицы на одном canvas поверх всего ---------- */
let cv = null, g = null, dpr = 1, parts = [], running = false;
function ensure(){
  if (!cv){ cv = document.getElementById('fx'); g = cv.getContext('2d'); addEventListener('resize', size); size(); }
}
function size(){ dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = innerWidth*dpr; cv.height = innerHeight*dpr; }
function kick(){ if (!running){ running = true; requestAnimationFrame(tick); } }
let last = 0;
function tick(t){
  const dt = Math.min(40, last ? t-last : 16)/16.67; last = t;
  g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,cv.width,cv.height);
  g.setTransform(dpr,0,0,dpr,0,0); g.globalCompositeOperation = 'lighter';
  for (let i=parts.length-1;i>=0;i--){
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0){ parts.splice(i,1); continue; }
    const k = p.life/p.max;
    if (p.type === 'spark'){
      const px = p.x, py = p.y;
      p.vx *= Math.pow(p.drag, dt); p.vy = p.vy*Math.pow(p.drag, dt) + p.grav*dt;
      p.x += p.vx*dt; p.y += p.vy*dt;
      g.strokeStyle = p.color; g.globalAlpha = Math.min(1, k*1.6); g.lineWidth = p.size*(0.4+k*0.6); g.lineCap = 'round';
      g.beginPath(); g.moveTo(px - p.vx*1.5, py - p.vy*1.5); g.lineTo(p.x, p.y); g.stroke();
    } else if (p.type === 'ring'){
      const r = p.r0 + (p.r1-p.r0)*(1-k);
      g.strokeStyle = p.color; g.globalAlpha = k*0.8; g.lineWidth = 2 + 4*k;
      g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI*2); g.stroke();
    } else if (p.type === 'rays'){
      const e = 1-k, len = p.len*(0.3+e*0.9); p.rot += 0.01*dt;
      g.globalAlpha = Math.sin(Math.PI*e)*0.55; g.lineWidth = 3;
      const grd = g.createRadialGradient(p.x,p.y,0,p.x,p.y,len); grd.addColorStop(0,'rgba(255,236,190,1)'); grd.addColorStop(1,'rgba(255,200,110,0)');
      g.strokeStyle = grd;
      for (let j=0;j<p.n;j++){ const a = p.rot + j*Math.PI*2/p.n;
        g.beginPath(); g.moveTo(p.x+Math.cos(a)*8, p.y+Math.sin(a)*8); g.lineTo(p.x+Math.cos(a)*len, p.y+Math.sin(a)*len); g.stroke(); }
    } else if (p.type === 'glow'){
      const r = p.r*(0.6+0.4*(1-k)); g.globalAlpha = k*0.9;
      const grd = g.createRadialGradient(p.x,p.y,0,p.x,p.y,r); grd.addColorStop(0,'rgba(255,240,200,.9)'); grd.addColorStop(1,'rgba(255,190,90,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(p.x,p.y,r,0,Math.PI*2); g.fill();
    }
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  if (parts.length) requestAnimationFrame(tick); else { running = false; last = 0; g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,cv.width,cv.height); }
}
function burst(x, y, o={}){
  if (REDUCE) return; ensure();
  const n = o.n || 46, sp = o.speed || 7, colors = o.colors || GOLD;
  for (let i=0;i<n;i++){
    const a = (o.dir ?? 0) + (Math.random()-0.5)*(o.spread ?? Math.PI*2), v = sp*(0.35+Math.random()*0.8);
    const life = (o.life || 60)*(0.6+Math.random()*0.6);
    parts.push({ type:'spark', x, y, vx:Math.cos(a)*v, vy:Math.sin(a)*v, grav:o.grav ?? 0.12, drag:o.drag ?? 0.965,
      life, max:life, size: o.size || 3, color: colors[i % colors.length] });
  }
  if (o.ring !== false) parts.push({ type:'ring', x, y, r0:4, r1:o.ringR || 70, life:28, max:28, color:'rgba(255,225,160,1)' });
  kick();
}
function rays(x, y, len=160){ if (REDUCE) return; ensure(); parts.push({ type:'rays', x, y, len, n:14, rot:Math.random()*6, life:55, max:55 }); kick(); }
function glow(x, y, r=120){ if (REDUCE) return; ensure(); parts.push({ type:'glow', x, y, r, life:40, max:40 }); kick(); }
function firework(x, y){
  const palettes = [GOLD, ['#FFFFFF','#DDE7FF','#AFC6FF'], ['#FFD0C2','#FF8F7A','#FFE3A3'], ['#E9D7FF','#C9A8FF','#FFF4D6']];
  burst(x, y, { n: 70, speed: 6.5, life: 75, grav: 0.07, drag: 0.972, colors: palettes[Math.floor(Math.random()*palettes.length)], ringR: 90, size: 2.6 });
}
function clear(){ parts = []; }

/* ---------- силуэт города из контуров ключей ---------- */
const HEIGHT_M = { mgu:240, ukr:198, mid:172, kud:156, krv:138, len:136, kot:176 };
/* возвращает здания в координатах viewBox 1000×420 (земля на y=410) */
function skyline(keys, W=1000, ground=410){
  const n = keys.length, step = W/n;
  return keys.map((k,i)=>{
    const Htot = (HEIGHT_M[k.id] || 170)/240*330, crownH = Htot*0.52;
    const s = Math.min(step*0.42, crownH/(2*k.aspect)), cH = k.aspect*2*s;
    const cx = step*(i+0.5), crownBase = ground - (Htot - cH);
    const P = ([x,y]) => [cx + x*s, crownBase - y*cH];
    const right = k.half.map(P), left = k.half.slice().reverse().map(([x,y])=>P([-x,y]));
    const pts = [...right, [cx+s, ground], [cx-s, ground], ...left];
    const d = 'M' + pts.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join('L') + 'Z';
    const tip = P([0,1]);
    // окна: сетка прямоугольников в «стволе» башни
    const win = []; const top = crownBase + 6, wx0 = cx - s*0.8;
    for (let y=top; y<ground-10; y+=11) for (let x=wx0; x<cx+s*0.8-3; x+=Math.max(7, s*0.32)) win.push([x,y]);
    return { id:k.id, letter:k.letter, d, tip, cx, s, crownBase, ground, win };
  });
}
function skylineSVG(keys, cls, withWindows){
  const B = skyline(keys);
  return `<svg class="${cls}" viewBox="0 0 1000 420" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <defs><linearGradient id="bldLit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE3A3"/><stop offset="1" stop-color="#B98A35"/></linearGradient></defs>
    ${B.map((b,i)=>`<g class="b" style="--i:${i}" data-id="${b.id}"><path class="bld" pathLength="1" d="${b.d}"/>${withWindows?`<g class="win">${b.win.map(([x,y])=>`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="3" height="5"/>`).join('')}</g>`:''}</g>`).join('')}
    <rect class="ground" x="0" y="409" width="1000" height="11"/></svg>`;
}
function stars(el, n=46){
  let h = ''; for (let i=0;i<n;i++){ const s = Math.random()<0.15 ? 3 : Math.random()<0.5 ? 2 : 1.4;
    h += `<i style="left:${(Math.random()*100).toFixed(1)}%;top:${(Math.random()*70).toFixed(1)}%;width:${s}px;height:${s}px;animation-delay:${(Math.random()*3).toFixed(2)}s;animation-duration:${(2+Math.random()*3).toFixed(2)}s"></i>`; }
  el.innerHTML = h;
}

/* ---------- заставка ---------- */
function splash(keys){
  return new Promise(resolve=>{
    if (REDUCE){ resolve(); return; }
    const el = document.createElement('div'); el.className = 'splash'; el.id = 'splash';
    el.innerHTML = `<div class="stars"></div><div class="sglow"></div>${skylineSVG(keys,'skyline draw',false)}
      <div class="stitle"><div class="eyebrow">велоквест · 7 высоток</div>
      <h1 class="disp">${['Семь','высоток','Москвы'].map((w,i)=>`<span style="--w:${i}">${w}</span>`).join(' ').replace('</span> <span style="--w:2">','</span><br><span style="--w:2">')}</h1></div>`;
    document.body.appendChild(el); stars(el.querySelector('.stars'), 60);
    let done = false;
    const finish = ()=>{ if (done) return; done = true; el.classList.add('out'); setTimeout(()=>{ el.remove(); resolve(); }, 520); };
    el.addEventListener('pointerdown', finish);
    setTimeout(()=>{ const r = el.querySelector('.skyline').getBoundingClientRect(); glow(r.left + r.width/2, r.top + r.height*0.35, 160); }, 1250);
    setTimeout(finish, 3000);
  });
}

/* ---------- буква летит в слово ---------- */
function flyLetter(letter, x, y, tileEl){
  return new Promise(resolve=>{
    if (REDUCE || !tileEl || !tileEl.animate){ resolve(); return; }
    const r = tileEl.getBoundingClientRect(), tx = r.left + r.width/2, ty = r.top + r.height/2;
    const el = document.createElement('div'); el.className = 'flyl disp'; el.textContent = letter;
    el.style.left = x + 'px'; el.style.top = y + 'px'; document.body.appendChild(el);
    const dx = tx - x, dy = ty - y;
    const a = el.animate([
      { transform:'translate(-50%,-50%) scale(.2)', opacity:0 },
      { transform:'translate(-50%,-50%) scale(1.6)', opacity:1, offset:.22 },
      { transform:'translate(-50%,-50%) scale(1.35)', opacity:1, offset:.42 },
      { transform:`translate(calc(-50% + ${dx*0.55}px), calc(-50% + ${dy*0.45 - 60}px)) scale(1)`, opacity:1, offset:.72 },
      { transform:`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.55)`, opacity:1 }
    ], { duration: 1250, easing:'cubic-bezier(.45,0,.2,1)', fill:'forwards' });
    a.onfinish = ()=>{ burst(tx, ty, { n: 26, speed: 4.5, life: 40, ringR: 40 }); el.remove(); resolve(); };
  });
}

/* ---------- финал: город зажигается, буквы встают в слово, салют ---------- */
function finale(keys, opened, onPanel){
  const el = document.createElement('div'); el.className = 'finale'; el.id = 'finale';
  el.innerHTML = `<div class="stars"></div>
    <div class="fword">${keys.map((k,i)=>`<span class="ft disp" style="--i:${i}">${k.letter}</span>`).join('')}</div>
    ${skylineSVG(keys,'skyline fin',true)}
    <div class="fpanel" id="fpanel"></div>`;
  document.body.appendChild(el); stars(el.querySelector('.stars'), 80);
  const bs = el.querySelectorAll('.skyline .b'), ts = el.querySelectorAll('.ft');
  const svg = el.querySelector('.skyline'); let stop = false;
  const tipXY = (i)=>{ const b = skyline(keys)[i], r = svg.getBoundingClientRect(), k = Math.min(r.width/1000, r.height/420);
    const ox = r.left + (r.width - 1000*k)/2, oy = r.top + (r.height - 420*k);
    return [ox + b.tip[0]*k, oy + b.tip[1]*k]; };
  (async ()=>{
    if (REDUCE){ bs.forEach(b=>b.classList.add('lit')); ts.forEach(t=>t.classList.add('in')); onPanel(el.querySelector('#fpanel')); return; }
    await sleep(500);
    for (let i=0;i<keys.length && !stop;i++){
      bs[i].classList.add('lit'); ts[i].classList.add('in');
      const [x,y] = tipXY(i); burst(x, y, { n: 30, speed: 5, life: 45, ringR: 50 });
      if (window.Capacitor?.Plugins?.Haptics) try { window.Capacitor.Plugins.Haptics.impact({ style:'LIGHT' }); } catch(e){}
      await sleep(420);
    }
    el.querySelector('.fword').classList.add('glow');
    const t0 = performance.now();
    (async function fw(){ while (!stop && performance.now()-t0 < 5200){
      firework(innerWidth*(0.15+Math.random()*0.7), innerHeight*(0.12+Math.random()*0.3)); await sleep(380 + Math.random()*260); } })();
    await sleep(900);
    onPanel(el.querySelector('#fpanel'));
  })();
  return { el, close(){ stop = true; clear(); el.classList.add('out'); setTimeout(()=>el.remove(), 450); } };
}

/* ---------- открытка 1080×1920 ---------- */
function loadImg(src){ return new Promise(res=>{ if (!src) return res(null); const i = new Image(); i.onload = ()=>res(i); i.onerror = ()=>res(null); i.src = src; }); }
function rr(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); }
async function postcard(keys, opened, stats){
  try { await Promise.all([document.fonts.load('600 80px Oswald'), document.fonts.load('500 40px "IBM Plex Sans"')]); } catch(e){}
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const bg = x.createLinearGradient(0,0,0,H); bg.addColorStop(0,'#0B1222'); bg.addColorStop(0.55,'#1E2B48'); bg.addColorStop(1,'#3A3350');
  x.fillStyle = bg; x.fillRect(0,0,W,H);
  let seed = 7; const R = ()=>((seed = (seed*16807) % 2147483647) / 2147483647);
  for (let i=0;i<140;i++){ x.globalAlpha = 0.3 + R()*0.7; x.fillStyle = '#FFF4D6'; const s = R()<0.1?3:1.6; x.fillRect(R()*W, R()*H*0.6, s, s); }
  x.globalAlpha = 1;
  x.fillStyle = '#E3B65E'; x.font = '500 34px "IBM Plex Sans", sans-serif'; x.textAlign = 'center';
  x.fillText((stats.date || '').toUpperCase(), W/2, 120);
  x.fillStyle = '#FFFFFF'; x.font = '600 96px Oswald, "Arial Narrow", sans-serif';
  x.fillText('СЕМЬ ВЫСОТОК', W/2, 235); x.fillText('МОСКВЫ', W/2, 340);
  // фото с точек: 4 + 3
  const cw = 232, ch = 380, gap = 20;
  const pos = []; const row = (n, y)=>{ const tw = n*cw + (n-1)*gap; for (let i=0;i<n;i++) pos.push([ (W-tw)/2 + i*(cw+gap), y ]); };
  row(4, 420); row(3, 420 + ch + gap);
  const imgs = await Promise.all(keys.map(k=>loadImg(opened[k.id]?.thumb)));
  keys.forEach((k,i)=>{
    const [px,py] = pos[i]; x.save(); rr(x, px, py, cw, ch, 22); x.clip();
    x.fillStyle = '#16203A'; x.fillRect(px,py,cw,ch);
    const im = imgs[i];
    if (im){ const s = Math.max(cw/im.width, ch/im.height), iw = im.width*s, ih = im.height*s; x.drawImage(im, px+(cw-iw)/2, py+(ch-ih)/2, iw, ih); }
    else { const b = skyline([k], 1000)[0], sc = 0.66; x.translate(px + cw/2 - b.cx*sc, py + ch - 410*sc - 4); x.scale(sc,sc);
      x.fillStyle = 'rgba(227,182,94,.5)'; x.fill(new Path2D(b.d)); }
    x.restore();
    x.strokeStyle = 'rgba(227,182,94,.8)'; x.lineWidth = 3; rr(x, px, py, cw, ch, 22); x.stroke();
    x.fillStyle = '#E3B65E'; x.beginPath(); x.arc(px+42, py+42, 28, 0, Math.PI*2); x.fill();
    x.fillStyle = '#141B2B'; x.font = '600 36px Oswald, sans-serif'; x.textAlign = 'center'; x.fillText(k.letter, px+42, py+55);
  });
  // слово
  const ty = 420 + ch*2 + gap + 90, tw = 118, tg = 16, tx0 = (W - (7*tw + 6*tg))/2;
  keys.forEach((k,i)=>{ const tx = tx0 + i*(tw+tg); x.fillStyle = '#E3B65E'; rr(x, tx, ty, tw, 150, 16); x.fill();
    x.fillStyle = '#141B2B'; x.font = '600 100px Oswald, sans-serif'; x.textAlign = 'center'; x.fillText(k.letter, tx+tw/2, ty+112); });
  x.fillStyle = '#F2EBDD'; x.font = '500 40px "IBM Plex Sans", sans-serif';
  x.fillText(stats.line || '', W/2, ty + 230);
  // силуэт города
  const B = skyline(keys); x.save(); x.translate(0, H - 420*1.08 + 10); x.scale(1.08, 1.08); x.translate(-40, 0);
  x.fillStyle = 'rgba(227,182,94,.28)'; B.forEach(b=>x.fill(new Path2D(b.d))); x.restore();
  return c;
}

return { REDUCE, burst, rays, glow, firework, clear, splash, flyLetter, finale, postcard, skylineSVG, stars, sleep };
})();
