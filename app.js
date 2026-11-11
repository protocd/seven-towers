/* ============ «Семь высоток Москвы» (ключи от неба) ============
   Интерфейс, камера, редактор контуров, экспорт пакета ключей.
   Алгоритм сверки: scan-core.js (+ scan-worker.js), анимации: fx.js, тексты и точки: data.js. */
'use strict';
const CFG = ScanCore.CFG, SW = ScanCore.SW, SH = ScanCore.SH;
const APP_VERSION = '1.4.0';
const VISIT_LABEL = { free:'свободно', ticket:'по билету', booking:'по записи', closed:'закрыто' };
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const Plug = name => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null;

/* FNV-1a 32 бита: короткий хэш для кодового слова */
function hash(str){ let h = 0x811c9dc5; const t = String(str).trim().toUpperCase().replace(/Ё/g,'Е');
  for (const ch of t){ h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8,'0'); }
const store = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(e){ return false; } }
};

/* ============ СЛОИ КОНТУРОВ ============
   заводской (data.js)  <  проект (www/keys.json, едет внутри приложения)  <  правка на этом телефоне (редактор) */
const FACTORY = Object.fromEntries(KEYS.map(k=>[k.id, { half: k.half, aspect: k.aspect }]));
let PROJECT = {};
let PHONE = store.get('sevenKeys.contours', {}) || {};
function buildPoly(k){ k.poly = k.half.concat(k.half.slice(1).reverse().map(([x,y])=>[-x,y])); }
function validEntry(e){
  return !!e && Array.isArray(e.half) && e.half.length >= 3 && e.half.every(p=>Array.isArray(p) && p.length===2 && p.every(v=>typeof v==='number' && isFinite(v)))
    && typeof e.aspect === 'number' && e.aspect > 0.15 && e.aspect < 6;
}
const sceneCache = {};
function applyLayers(){
  KEYS.forEach(k=>{
    const ph = validEntry(PHONE[k.id]) ? PHONE[k.id] : null, pr = validEntry(PROJECT[k.id]) ? PROJECT[k.id] : null;
    const src = ph || pr || FACTORY[k.id];
    k.half = src.half; k.aspect = src.aspect; k.layer = ph ? 'phone' : pr ? 'project' : 'factory';
    k.photo = (ph && ph.photo) || (pr && pr.photo) || null;
    buildPoly(k);
  });
  for (const id in sceneCache) delete sceneCache[id];
}
async function loadProjectKeys(){
  try { const r = await fetch('keys.json', { cache:'no-store' });
    if (r.ok){ const j = await r.json(); if (j && j.keys && typeof j.keys === 'object') PROJECT = j.keys; } } catch(e){}
  applyLayers();
}
const LAYER_NAME = { factory:'заводской контур', project:'контур из проекта (keys.json)', phone:'правка на этом телефоне' };
KEYS.forEach((k,i)=>{ k.idx = i; });
applyLayers();
const KEY = Object.fromEntries(KEYS.map(k=>[k.id,k]));

/* ============ СОСТОЯНИЕ ============ */
const S = { tab:'route', keyId:'mgu', stand:'mgu', source:'camera', zoom:2, place:null, fails:0, debug:false,
  opened: store.get('sevenKeys.v1', {}) || {}, meta: store.get('sevenKeys.meta', {}) || {}, busy:false, dirty:true };
function save(){ store.set('sevenKeys.v1', S.opened); store.set('sevenKeys.meta', S.meta); }
function startTimer(){ if (!S.meta.startedAt){ S.meta.startedAt = Date.now(); save(); } }
const openedCount = ()=> KEYS.filter(k=>S.opened[k.id]).length;

/* ============ ТРЕНИРОВОЧНЫЕ СЦЕНЫ (нарисованный вид с точки) ============ */
const WW = 1440, WH = 2560;
const SCENE_PLACE = { mgu:{dx:40,s:92}, ukr:{dx:-50,s:84}, mid:{dx:30,s:100}, kud:{dx:-30,s:92}, krv:{dx:55,s:98}, len:{dx:-40,s:104}, kot:{dx:25,s:96} };
function rng(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return((t^t>>>14)>>>0)/4294967296; }; }
function worldPlace(id){ const p=SCENE_PLACE[id]; return { cx: WW/2 + p.dx, by: 1240, s: p.s }; }
function sceneCanvas(id){
  if (sceneCache[id]) return sceneCache[id];
  const k = KEY[id], c = document.createElement('canvas'); c.width = WW; c.height = WH;
  const g = c.getContext('2d'), R = rng(id.charCodeAt(0)*97 + id.charCodeAt(2));
  const sg = g.createLinearGradient(0,0,0,2050); sg.addColorStop(0,'#4C83C4'); sg.addColorStop(1,'#A9C9E9');
  g.fillStyle = sg; g.fillRect(0,0,WW,WH);
  for (let i=0;i<9;i++){ g.fillStyle='rgba(238,243,250,0.5)'; g.beginPath(); g.ellipse(R()*WW, 200+R()*1500, 120+R()*220, 30+R()*50, 0, 0, Math.PI*2); g.fill(); }
  g.fillStyle = '#8F8A84';
  for (let x=0;x<WW;){ const w=60+R()*140, h=80+R()*200; g.fillRect(x, 2080-h, w, h+200); x+=w+R()*30; }
  const P = worldPlace(id), H = k.aspect*2*P.s;
  const pts = k.poly.map(([x,y])=>[P.cx + x*P.s*(1+(R()-0.5)*0.03), P.by - y*H]);
  const path = new Path2D();
  pts.forEach(([x,y],i)=> i? path.lineTo(x,y) : path.moveTo(x,y)); path.closePath();
  path.rect(P.cx-P.s, P.by-2, 2*P.s, 2300-P.by);
  path.rect(P.cx-2.2*P.s, P.by+0.35*H, 4.4*P.s, 2300);
  path.rect(P.cx-3.6*P.s, P.by+0.9*H, 7.2*P.s, 2300);
  const bg = g.createLinearGradient(P.cx-3.6*P.s,0,P.cx+3.6*P.s,0);
  bg.addColorStop(0,'#D6C4A4'); bg.addColorStop(0.5,'#C2AE8C'); bg.addColorStop(1,'#A38F70');
  g.fillStyle = bg; g.fill(path);
  g.save(); g.clip(path);
  g.fillStyle = 'rgba(55,45,35,0.12)';
  for (let y=P.by-0.5*H; y<2300; y+=16) for (let x=P.cx-3.6*P.s+4; x<P.cx+3.6*P.s; x+=13) g.fillRect(x, y, 6, 8);
  g.fillStyle = '#B99A58'; g.fillRect(P.cx-P.s, 0, 2*P.s, P.by - (k.spire||0.6)*H);
  g.restore();
  g.fillStyle = '#A5262A'; g.beginPath();
  const sx = P.cx, sy = P.by - H + 2, sr = P.s*0.05;
  for (let i=0;i<10;i++){ const a=-Math.PI/2+i*Math.PI/5, r=i%2?sr*0.45:sr; g.lineTo(sx+r*Math.cos(a), sy+r*Math.sin(a)); }
  g.fill();
  for (let i=0;i<120;i++){ g.fillStyle = i%3? '#2D472C' : '#355434'; g.beginPath(); g.arc(R()*WW, 2150+R()*160, 40+R()*50, 0, Math.PI*2); g.fill(); }
  g.fillStyle = '#3A3934'; g.fillRect(0, 2330, WW, WH);
  const im = g.getImageData(0,0,WW,WH), d = im.data;
  for (let i=0;i<d.length;i+=4){ const n=(R()-0.5)*8; d[i]+=n; d[i+1]+=n; d[i+2]+=n; }
  g.putImageData(im,0,0);
  return (sceneCache[id] = c);
}
function truePlace(id, zoom){ const P = worldPlace(id), f = CFG.FW/WW*zoom;
  return { cx: CFG.FW/2 + (P.cx-WW/2)*f, by: CFG.FH/2 + (P.by-WH/2)*f, s: P.s*f }; }

/* ============ ИСТОЧНИК КАДРА ============ */
const $ = id => document.getElementById(id);
const frame = $('frame');
const fctx = frame.getContext('2d', { willReadFrequently:true });
const video = document.createElement('video'); video.playsInline = true; video.muted = true; video.setAttribute('playsinline','');
let stream = null, track = null, hwCaps = null, hwZoom = 1, photoImg = null;
function srcRect(sw, sh, zoom){
  const ar = CFG.FW/CFG.FH; let cw, ch;
  if (sw/sh > ar){ ch = sh; cw = sh*ar; } else { cw = sw; ch = sw/ar; }
  cw /= zoom; ch /= zoom; return { x:(sw-cw)/2, y:(sh-ch)/2, w:cw, h:ch };
}
function drawSource(){
  let src=null, sw=0, sh=0;
  if (S.source==='demo'){ src = sceneCanvas(S.stand); sw = src.width; sh = src.height; }
  else if (S.source==='photo' && photoImg){ src = photoImg; sw = photoImg.naturalWidth || photoImg.width; sh = photoImg.naturalHeight || photoImg.height; }
  else if (S.source==='camera' && video.readyState >= 2){ src = video; sw = video.videoWidth; sh = video.videoHeight; }
  if (!src){ fctx.fillStyle='#0C111C'; fctx.fillRect(0,0,CFG.FW,CFG.FH); return false; }
  const z = S.source==='camera' ? Math.max(1, S.zoom/hwZoom) : S.zoom;   // часть зума уже сделала оптика
  const r = srcRect(sw, sh, z);
  fctx.imageSmoothingQuality = 'high';
  fctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, CFG.FW, CFG.FH);
  return true;
}

/* ============ СВЕРКА: в фоновом потоке, если можно ============ */
const small = document.createElement('canvas'); small.width = SW; small.height = SH;
const sctx = small.getContext('2d', { willReadFrequently:true });
const Scanner = (function(){
  let w = null, ready = false, seq = 0; const pending = new Map();
  try {
    w = new Worker('scan-worker.js');
    w.onmessage = e => { const m = e.data, p = pending.get(m.id); if (!p) return; pending.delete(m.id);
      if (m.pong){ ready = true; return; } m.ok ? p.res(m.out) : p.rej(new Error(m.error)); };
    w.onerror = () => { ready = false; w = null; for (const p of pending.values()) p.fallback && p.fallback(); pending.clear(); };
    const id = ++seq; pending.set(id, {}); w.postMessage({ cmd:'ping', id });
  } catch(e){ w = null; }
  function run(msg){
    if (w && ready) return new Promise((res, rej)=>{
      const id = ++seq; msg.id = id;
      pending.set(id, { res, rej, fallback: ()=>res(ScanCore.run(msg)) });
      w.postMessage(msg);
    });
    return new Promise(res=>setTimeout(()=>res(ScanCore.run(msg)), 20));   // пауза, чтобы успела нарисоваться анимация
  }
  return { run, get mode(){ return w && ready ? 'фоновый поток' : 'основной поток'; } };
})();
function scanMsg(cmd, pl){
  drawSource();
  sctx.drawImage(frame, 0, 0, SW, SH);
  const d = sctx.getImageData(0,0,SW,SH).data;
  const { SNAP_SCALES, ...rest } = CFG;
  return { cmd, rgba: d, w: SW, h: SH, keyId: S.keyId, pl: { ...(pl || S.place) }, wantMask: S.debug,
    keys: KEYS.map(k=>({ id:k.id, aspect:k.aspect, poly:k.poly })), cfg: { ...rest, SNAP_SCALES: SNAP_SCALES.slice() } };
}

/* ============ UI ============ */
const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let toastT; function toast(msg){ const t=$('toast'); t.textContent=msg; t.hidden=false; t.classList.remove('in'); void t.offsetWidth; t.classList.add('in'); clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true, 2800); }
const sleep = ms => new Promise(r=>setTimeout(r, ms));

function silSVG(k, open){
  // Ключ: ручка-скруглённый квадрат (27% длины) с дыркой, шейка, стержень 7,5% длины,
  // контур здания стоит на конце стержня. Снизу ничего не свисает. Тонкий шпиль убираем только на картинке.
  let h = k.half; const i = h.findIndex(p=>p[0] >= 0.08);
  if (i > 0) h = [[0, h[i][1]]].concat(h.slice(i));
  const top = Math.max(...h.map(p=>p[1]));
  const yc = 52, sh = 11, ty = yc - sh/2, bw = 46, bh = Math.min(40, k.aspect*2*(bw/2)*top), cx = 155 - bw/2;
  const poly = h.concat(h.slice(1).reverse().map(([x,y])=>[-x,y]));
  const pts = poly.map(([x,y])=>`${(cx+x*bw/2).toFixed(1)},${(ty+2-(y/top)*bh).toFixed(1)}`).join(' ');
  const bx = 5, by = yc - 18, bs = 36, r = 9, hx = bx + bs/2;
  const shapes = `<path d="M${bx+r} ${by}h${bs-2*r}a${r} ${r} 0 0 1 ${r} ${r}v${bs-2*r}a${r} ${r} 0 0 1 -${r} ${r}h-${bs-2*r}a${r} ${r} 0 0 1 -${r} -${r}v-${bs-2*r}a${r} ${r} 0 0 1 ${r} -${r}zM${hx+8.4} ${yc}a8.4 8.4 0 1 0 -16.8 0a8.4 8.4 0 1 0 16.8 0z" fill-rule="evenodd"/>
    <rect x="${bx+bs-4}" y="${ty}" width="${155-(bx+bs-4)}" height="${sh}" rx="1.5"/>
    <rect x="${bx+bs+2}" y="${ty-2.5}" width="6" height="${sh+5}" rx="1.5"/>
    <polygon points="${pts}"/>`;
  return open
    ? `<svg viewBox="0 0 160 80" aria-hidden="true"><g class="sil-open">${shapes}</g></svg>`
    : `<svg viewBox="0 0 160 80" aria-hidden="true"><g class="sil-edge">${shapes}</g><g class="sil-fill">${shapes}</g></svg>`;
}
function renderWord(popId){
  $('word').innerHTML = KEYS.map(k=>{ const o=S.opened[k.id];
    return `<div class="tile ${o? (o.mode==='scan'?'on':'photo'):''} ${popId===k.id?'pop':''}" title="${o?esc(k.name):'закрыто'}">${o?k.letter:''}</div>`; }).join('');
}
function statusChip(k){ const o=S.opened[k.id];
  if (!o) return '<span class="chip">ждёт</span>';
  if (o.mode==='scan') return `<span class="chip ok">открыт · ${(o.score||0).toFixed(2)}</span>`;
  return `<span class="chip ph">${o.mode==='photo'?'фото-зачёт':'код организатора'}</span>`; }
function renderRoute(){
  const nextIdx = KEYS.findIndex(k=>!S.opened[k.id]), done = nextIdx === -1;
  $('routeTop').innerHTML = done
    ? `<button class="btn gold" id="toFinale">Слово собрано! Открыть финал</button>`
    : `<div class="progress" role="img" aria-label="Пройдено ${openedCount()} из 7"><i style="width:${openedCount()/7*100}%"></i></div>`;
  if (done) $('toFinale').onclick = showFinal;
  $('route').innerHTML = KEYS.map((k,i)=>`<li class="stop ${S.opened[k.id]?'done':''} ${i===nextIdx?'next':''}">
    <div class="num mono">${i+1}</div>
    <div><h3>${esc(k.name)}</h3><p>${esc(k.stop)}</p>
    ${k.photo ? `<button class="view" data-view="${k.id}" aria-label="Вид с точки"><img alt="" src="${k.photo}"><span>вид с точки</span></button>` : ''}
    <div class="row">${statusChip(k)}<span class="dist">дальше: ${k.next}</span>
    ${S.opened[k.id] ? `<button class="linkbtn" data-facts="${k.id}">Факты и как попасть</button>` : `<button class="linkbtn" data-here="${k.id}">Я на месте</button>`}</div></div></li>`).join('');
  if (window.renderMiniMap) renderMiniMap();
}
function renderKeys(){
  const cells = KEYS.map((k,i)=>{ const o=S.opened[k.id];
    return `<button class="key ${S.keyId===k.id?'sel':''} ${o?'open':''}" data-key="${k.id}" aria-label="${o?esc(k.name):'Закрытый ключ '+(i+1)}">${silSVG(k, !!o)}${o&&o.thumb?`<img class="thumb" alt="" src="${o.thumb}">`:''}
      <span class="kl"><span>${o?esc(k.name):'Ключ '+(i+1)}</span><b>${o?k.letter:'?'}</b></span></button>`; });
  cells.push(`<div class="key final"><span class="disp" style="font-size:28px">${openedCount()} / 7</span><span>ключей собрано</span></div>`);
  $('keys').innerHTML = cells.join('');
}
function polyPts(k, p){ const H = k.aspect*2*p.s; return k.poly.map(([x,y])=>[p.cx+x*p.s, p.by-y*H]); }
function renderOverlay(){
  const k = KEY[S.keyId], p = S.place, H = k.aspect*2*p.s;
  $('ovKey').setAttribute('points', polyPts(k,p).map(q=>q[0].toFixed(1)+','+q[1].toFixed(1)).join(' '));
  $('ovBody').setAttribute('d', `M${p.cx-p.s},${p.by} v${H*0.45} M${p.cx+p.s},${p.by} v${H*0.45}`);
  const o = S.opened[k.id];
  $('badge').textContent = o ? `${k.name} · ${k.letter}` : `Ключ ${k.idx+1}`;
  $('zoomread').textContent = S.zoom.toFixed(1) + '×' + (S.source==='camera' && hwZoom > 1.01 ? ' опт.' : '');
}
function setTab(t){
  S.tab = t;
  document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected', String(b.dataset.tab===t)));
  $('scr-route').hidden = t!=='route'; $('scr-keys').hidden = t!=='keys'; $('scr-cam').hidden = t!=='cam';
  if (t==='route') renderRoute(); if (t==='keys') renderKeys(); if (t==='cam'){ S.dirty=true; renderOverlay(); }
  if (t==='cam' && S.source==='camera') startCamera(); else stopCamera();
  window.scrollTo(0,0);
}
function renderAll(){ renderWord(); renderRoute(); renderKeys(); renderOverlay(); }

function resetResult(){
  $('result').className='result'; $('result').hidden = true; $('resTitle').textContent='';
  $('meterFill').style.width='0%'; $('resNums').textContent=''; $('resHint').textContent='';
  $('dbg').hidden = true; S.fails = 0; $('photoPass').disabled = true;
}
function hintFor(r){
  if (r.edgeFrac < 0.25) return S.place.s < 70 ? 'Прибавь зум: верхушка в кадре слишком мелкая.' : 'Рядом с контуром почти нет рёбер. Наведи ключ на верхушку здания.';
  const mv=[]; if (Math.abs(r.dx)>=1) mv.push(r.dx>0?'правее':'левее'); if (Math.abs(r.dy)>=1) mv.push(r.dy>0?'ниже':'выше');
  const out=[]; if (mv.length) out.push('Сдвинь ключ ' + mv.join(' и ') + '.');
  if (r.grow>=1) out.push('Сделай ключ крупнее.'); else if (r.grow<=-1) out.push('Сделай ключ мельче.');
  return out.length ? out.join(' ') : 'Контур лежит на рёбрах, но форма не сходится с небом. Возможно, это ключ от другой высотки.';
}
function showResult(r, passed, rival, rel, steady){
  $('result').hidden = false; $('result').className = 'result ' + (passed?'ok':'bad');
  $('resTitle').textContent = passed ? `Ключ сработал! Буква «${KEY[S.keyId].letter}»` : 'Пока не совпало';
  $('meterFill').style.width = Math.min(100, r.score*100).toFixed(0) + '%';
  $('resNums').innerHTML = `<span>score ${r.score.toFixed(2)}</span><span>рёбра ${r.edgeFrac.toFixed(2)}</span><span>небо ${r.skyFrac.toFixed(2)}</span><span>порог ${CFG.PASS.toFixed(2)}</span>${rival? `<span>лучший чужой ${rival.toFixed(2)}</span>`:''}`;
  $('resHint').textContent = passed ? ''
    : steady ? 'Совпало, но картинка дрогнула. Держи телефон ровнее, упрись локтями, и сверь ещё раз.'
    : rel ? (S.place.s < 135 ? 'Контур лёг неплохо, но при таком зуме его не отличить от другого ключа. Прибавь зум, чтобы детали короны были крупнее.'
            : 'Контур лёг неплохо, но другой ключ из коллекции подходит к этому зданию не хуже. Возможно, ты у другой высотки или выбрал не тот ключ.')
    : hintFor(r) + (S.fails>=CFG.FAILS_FOR_PHOTO ? ' Можно взять фото-зачёт в разделе «Если не получается».' : '');
}
let lastMask = null, lastDetail = null;
function drawDebug(){
  const c = $('dbg'); if (!S.debug || !lastMask){ c.hidden = true; return; }
  const g = c.getContext('2d'), im = g.createImageData(SW, SH), d = im.data;
  for (let i=0;i<lastMask.length;i++){ const p=i*4, m = lastMask[i];
    if (m===2){ d[p]=255; d[p+1]=214; d[p+2]=0; d[p+3]=200; } else if (m===1){ d[p]=70; d[p+1]=150; d[p+2]=255; d[p+3]=90; } }
  g.putImageData(im,0,0);
  if (lastDetail && lastDetail.pts) for (const [x,y,e,s] of lastDetail.pts){ g.fillStyle = e&&s ? '#22D66B' : (e||s) ? '#FF9A1F' : '#FF2E2E'; g.fillRect(Math.round(x)-1, Math.round(y)-1, 2, 2); }
  c.hidden = false;
}

/* ---- тактильный отклик ---- */
function buzz(kind){
  try { const H = Plug('Haptics'); if (H){ kind==='warn' ? H.notification({ type:'WARNING' }) : kind==='light' ? H.impact({ style:'LIGHT' }) : H.notification({ type:'SUCCESS' }); return; } } catch(e){}
  try { navigator.vibrate && navigator.vibrate(kind==='warn' ? [40,60,40] : [60,40,120]); } catch(e){}
}
/* кадр на память: окно 9:16 вокруг короны (если знаем, где она), иначе весь кадр */
function frameThumb(k, pl){ try {
  const c = document.createElement('canvas'); c.width = 270; c.height = 480;
  let sx = 0, sy = 0, sw = CFG.FW, sh = CFG.FH;
  if (k && pl){ const cH = k.aspect*2*pl.s; sh = Math.min(CFG.FH, Math.max(cH*2.4, 2*pl.s*1.6*16/9, 320)); sw = sh*9/16;
    if (sw > CFG.FW){ sw = CFG.FW; sh = sw*16/9; }
    sx = Math.max(0, Math.min(CFG.FW-sw, pl.cx - sw/2)); sy = Math.max(0, Math.min(CFG.FH-sh, pl.by - cH - sh*0.18)); }
  c.getContext('2d').drawImage(frame, sx, sy, sw, sh, 0, 0, 270, 480); return c.toDataURL('image/jpeg', 0.74); } catch(e){ return null; } }
function frameToClient(fx, fy){ const r = $('stage').getBoundingClientRect(); return { x: r.left + fx*r.width/CFG.FW, y: r.top + fy*r.height/CFG.FH }; }
function setScanning(on){ $('stage').classList.toggle('scanning', on); $('ovKey').classList.toggle('scan', on);
  $('checkBtn').disabled = on; $('checkBtn').textContent = on ? 'Сверяю…' : 'Сверить'; }
function animatePlace(from, to, ms){
  return new Promise(res=>{
    if (FX.REDUCE){ S.place = { ...to }; renderOverlay(); res(); return; }
    const t0 = performance.now(), e = t=>1-Math.pow(1-t,3);
    (function step(now){ const t = Math.min(1, (now-t0)/ms), k = e(t);
      S.place = { cx: from.cx+(to.cx-from.cx)*k, by: from.by+(to.by-from.by)*k, s: from.s+(to.s-from.s)*k }; renderOverlay();
      t < 1 ? requestAnimationFrame(step) : res(); })(t0);
  });
}
function restartClass(el, cls){ el.classList.remove(cls); void el.getBoundingClientRect(); el.classList.add(cls); }

async function doCheck(){
  if (S.busy) return;
  if (S.source==='photo' && !photoImg){ toast('Сначала выбери фото.'); return; }
  if (!drawSource()){ toast('Нет кадра: камера ещё не запустилась.'); return; }
  S.busy = true; startTimer(); setScanning(true); $('result').hidden = true;
  try {
    const minShow = sleep(FX.REDUCE ? 0 : 700);
    const res = await Scanner.run(scanMsg('judge'));
    let passed = res.passed, steady = false;
    if (passed && S.source==='camera'){     // кадры 2…N: проверяем, что совпадение не случайное
      for (let i=1;i<CFG.CAMERA_FRAMES;i++){
        await sleep(140);
        const m = await Scanner.run(scanMsg('match', res.r.pl));
        if (m.r.score < CFG.PASS && m.r.score < res.r.score - CFG.STEADY_DROP){ passed = false; steady = true; break; }
      }
    }
    await minShow;
    lastMask = res.mask; lastDetail = res.detail;
    setScanning(false);
    if (passed) await unlock(res);
    else fail(res, steady);
  } catch(e){ toast('Сверка не удалась: ' + e.message); }
  finally { S.busy = false; setScanning(false); }
}
function fail(res, steady){
  S.fails++; if (S.fails >= CFG.FAILS_FOR_PHOTO) $('photoPass').disabled = false;
  const rel = res.r.score >= CFG.PASS;
  showResult(rel ? res.r : res.r0, false, res.rival, rel, steady); drawDebug();
  restartClass($('ovG'), 'shake'); setTimeout(()=>$('ovG').classList.remove('shake'), 700);
  buzz('warn');
}
async function unlock(res){
  const k = KEY[S.keyId], to = res.r.pl;
  showResult(res.r, true, res.rival);
  const thumb = frameThumb(k, to);
  await animatePlace({ ...S.place }, to, 320);
  drawDebug();
  const tr = $('ovTrace'), pts = polyPts(k, to);
  tr.setAttribute('d', 'M' + pts.map(q=>q[0].toFixed(1)+' '+q[1].toFixed(1)).join('L') + 'Z');
  restartClass($('ovG'), 'unlock');
  buzz('success');
  await sleep(FX.REDUCE ? 0 : 700);
  const tip = frameToClient(to.cx, to.by - k.aspect*2*to.s);
  FX.rays(tip.x, tip.y, 170); FX.glow(tip.x, tip.y, 140); FX.burst(tip.x, tip.y, { n: 64, speed: 8, life: 62 });
  restartClass($('flash'), 'go'); setTimeout(()=>$('flash').classList.remove('go'), 450);
  await sleep(FX.REDUCE ? 0 : 280);
  await recordAndFly(k, 'scan', res.r.score, thumb, tip);
  $('ovG').classList.remove('unlock');
}
async function recordAndFly(k, mode, score, thumb, from){
  const was = S.opened[k.id];
  if (!was || (was.mode!=='scan' && mode==='scan')) S.opened[k.id] = { mode, score: score||0, thumb: thumb || (was && was.thumb) || null, at: Date.now() };
  if (KEYS.every(x=>S.opened[x.id]) && !S.meta.finishedAt) S.meta.finishedAt = Date.now();
  save();
  const bar = document.querySelector('.bar');
  if (bar.getBoundingClientRect().top < -10){ window.scrollTo({ top:0, behavior: FX.REDUCE ? 'auto' : 'smooth' }); await sleep(FX.REDUCE ? 0 : 380); }
  let p = from;
  if (!p){ const r = $('stage').getBoundingClientRect(); p = { x: r.left + r.width/2, y: r.top + r.height*0.35 }; }
  await FX.flyLetter(k.letter, p.x, p.y, $('word').children[k.idx]);
  renderWord(k.id); renderKeys(); renderRoute(); renderOverlay();
  buzz('light');
  await sleep(FX.REDUCE ? 0 : 350);
  showStory(k.id);
}
async function doSnap(){
  if (S.busy) return;
  if (S.source==='photo' && !photoImg) return toast('Сначала выбери фото.');
  if (!drawSource()) return;
  S.busy = true; $('snapBtn').disabled = true;
  try { const res = await Scanner.run(scanMsg('snap'));
    lastMask = res.mask; lastDetail = res.detail;
    await animatePlace({ ...S.place }, res.r.pl, 260); drawDebug();
    toast(`Подтянуто: совпадение ${res.r.score.toFixed(2)}`);
  } finally { S.busy = false; $('snapBtn').disabled = false; }
}

/* ============ ЛИСТЫ: история, правила, финал, фото ============ */
function openSheet(html){ $('sheetCard').innerHTML = html; $('sheet').hidden = false; $('sheetCard').scrollTop = 0; }
function closeSheet(){ $('sheet').hidden = true; try { speechSynthesis.cancel(); } catch(e){} }
function showStory(id){
  const k = KEY[id], i = k.idx, nextK = KEYS[i+1], allDone = KEYS.every(x=>S.opened[x.id]);
  const o = S.opened[id]; let fi = 0;
  openSheet(`<div class="row" style="justify-content:space-between"><span class="eyebrow">Точка ${i+1} из 7</span>${statusChip(k)}</div>
    <div class="row" style="gap:16px;flex-wrap:nowrap"><div class="bigl disp">${k.letter}</div><h2 class="disp">${esc(k.name)}</h2></div>
    ${o && o.thumb ? `<img class="shot" alt="Твой кадр" src="${o.thumb}">` : ''}
    <p>${esc(k.story)}</p>
    <div class="facts" id="facts">
      <div class="fhead"><span class="eyebrow" id="fnum"></span>
        <div class="fnav"><button id="fprev" aria-label="Предыдущий факт">‹</button><button id="fnext" aria-label="Следующий факт">›</button></div></div>
      <p class="ftext" id="ftext" aria-live="polite"></p>
      <div class="dots" id="fdots">${k.facts.map(()=>'<i></i>').join('')}</div>
    </div>
    <div class="visit"><h3 class="disp">Как попасть внутрь</h3>
      ${k.visit.map(([kind,t])=>`<div class="vrow"><span class="vk ${kind}">${VISIT_LABEL[kind]}</span><span>${esc(t)}</span></div>`).join('')}
      <p class="small tip">Цены и режим работы меняются, проверьте перед поездкой.</p>
    </div>
    ${o.mode!=='scan'?'<p class="small tip">Ключ открыт с пометкой: его можно пересканировать позже.</p>':''}
    <div class="row"><button class="btn2" id="speakBtn">Слушать</button></div>
    ${nextK && !allDone ? `<p class="small"><b>Дальше, ${k.next.replace('≈','около ')}:</b> ${esc(nextK.stop)}</p>` : ''}
    <button class="btn" id="storyNext"></button>`);
  const showFact = n => { fi = (n + k.facts.length) % k.facts.length;
    const t = $('ftext'); restartClass(t, 'swap');
    t.textContent = k.facts[fi]; $('fnum').textContent = `Факт ${fi+1} из ${k.facts.length}`;
    [...$('fdots').children].forEach((d,j)=>d.classList.toggle('on', j===fi)); };
  showFact(0);
  $('fprev').onclick = ()=> showFact(fi-1);
  $('fnext').onclick = ()=> showFact(fi+1);
  let sx = null; const fb = $('facts');
  fb.addEventListener('pointerdown', e=>{ sx = e.clientX; });
  fb.addEventListener('pointerup', e=>{ if (sx===null) return; const d = e.clientX - sx; sx = null; if (Math.abs(d) > 40) showFact(fi + (d < 0 ? 1 : -1)); });
  $('speakBtn').onclick = ()=>{ try { const u = new SpeechSynthesisUtterance(k.name + '. ' + k.story + ' Интересный факт. ' + k.facts[fi]); u.lang='ru-RU'; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch(e){ toast('Озвучка недоступна.'); } };
  const fromRoute = !!S.fromRoute; S.fromRoute = false;
  const btn = $('storyNext');
  btn.textContent = fromRoute ? 'Закрыть' : allDone ? 'Прочитать слово дня' : 'Поехали дальше';
  btn.onclick = ()=>{
    closeSheet();
    if (fromRoute) return;
    if (allDone) return showFinal();
    if (nextK){ S.stand = nextK.id; $('stand').value = nextK.id; S.dirty = true; resetResult(); setTab('route'); toast('Следующая точка подсвечена в маршруте.'); }
  };
}
function durationText(ms){ const m = Math.max(1, Math.round(ms/60000)), h = Math.floor(m/60); return h ? `${h} ч ${m%60} мин` : `${m} мин`; }
function statsLine(){
  const scan = KEYS.filter(k=>S.opened[k.id]?.mode==='scan').length, parts = ['около 24 км'];
  if (S.meta.startedAt && S.meta.finishedAt) parts.push(durationText(S.meta.finishedAt - S.meta.startedAt));
  parts.push(`${scan} из 7 сканом`);
  return parts.join(' · ');
}
const dateText = ()=> new Date(S.meta.finishedAt || Date.now()).toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' });
let finaleCtl = null;
function showFinal(){
  if (finaleCtl) finaleCtl.close();
  stopCamera(); closeSheet();
  finaleCtl = FX.finale(KEYS, S.opened, panel=>{
    panel.innerHTML = `<span class="eyebrow">Слово дня собрано · ${dateText()}</span>
      <p>Семь высоток и одна история, которую Москва рассказывает своими силуэтами.</p>
      <p class="stat mono">${statsLine()}</p>
      <button class="btn gold" id="finCard">Открытка с моими кадрами</button>
      <div class="two2"><button class="btn2" id="finClose">Закрыть</button><button class="btn2" id="finAgain">Пройти заново</button></div>`;
    panel.classList.add('in');
    $('finClose').onclick = ()=>{ finaleCtl.close(); finaleCtl = null; setTab('route'); };
    $('finAgain').onclick = ()=>{ const b = $('finAgain'); if (!b.dataset.sure){ b.dataset.sure = '1'; b.textContent = 'Точно? Нажми ещё раз'; return; }
      S.opened = {}; S.meta = {}; save(); finaleCtl.close(); finaleCtl = null; resetResult(); renderAll(); setTab('route'); };
    $('finCard').onclick = makePostcard;
  });
}
async function makePostcard(){
  const btn = $('finCard'); if (btn){ btn.disabled = true; btn.textContent = 'Рисую открытку…'; }
  try {
    const c = await FX.postcard(KEYS, S.opened, { date: dateText(), line: statsLine() });
    const url = c.toDataURL('image/jpeg', 0.9);
    if (finaleCtl){ finaleCtl.close(); finaleCtl = null; }
    openSheet(`<span class="eyebrow">Открытка</span><img class="postcard" alt="Открытка с кадрами квеста" src="${url}">
      <p class="small">«Поделиться» сохранит её в Фото или отправит друзьям. Ещё можно удержать палец на картинке.</p>
      <button class="btn gold" id="pcShare">Поделиться</button><button class="btn2" id="pcClose">Закрыть</button>`);
    $('pcShare').onclick = ()=> shareFile('otkrytka-7-klyuchey.jpg', 'image/jpeg', url.split(',')[1], true).catch(e=>toast('Не получилось: ' + e.message));
    $('pcClose').onclick = ()=>{ closeSheet(); setTab('route'); };
  } finally { if (btn && document.body.contains(btn)){ btn.disabled = false; btn.textContent = 'Открытка с моими кадрами'; } }
}
function showIntro(){
  openSheet(`<span class="eyebrow">Велоквест · около 24 км</span>
    <h2 class="disp">Семь высоток Москвы</h2>
    <p>Москва спрятала семь ключей от неба. Каждый ключ: силуэт короны одной из высоток. Он сработает только там, где рисунок совпадёт с настоящим зданием. Собери семь букв и прочти слово дня.</p>
    <ol class="steps">
      <li>Во вкладке «Маршрут» доберись до точки и нажми «Я на месте».</li>
      <li>Выбери в «Ключах» силуэт, похожий на здание перед тобой.</li>
      <li>Наведи камеру, прибавь зум, совмести контур с верхушкой и нажми «Сверить».</li>
    </ol>
    <p class="small">Интернет и геолокация не нужны: всё считается на телефоне. Кнопка «?» вверху показывает подсказки.</p>
    <button class="btn" id="introGo">Начать</button>`);
  $('introGo').onclick = ()=>{ closeSheet(); store.set('sevenKeys.intro', 1); };
}
function showView(id){ const k = KEY[id];
  openSheet(`<span class="eyebrow">Вид с точки</span><h2 class="disp">${esc(k.name)}</h2><img class="postcard" alt="" src="${k.photo}"><button class="btn2" id="vClose">Закрыть</button>`);
  $('vClose').onclick = closeSheet; }

/* ============ ФАЙЛЫ: поделиться / сохранить ============ */
async function shareFile(name, mime, data, isBase64){
  const Fs = Plug('Filesystem'), Sh = Plug('Share');
  if (NATIVE && Fs && Sh){
    const opts = { path: name, data, directory:'DOCUMENTS', recursive:true }; if (!isBase64) opts.encoding = 'utf8';
    const w = await Fs.writeFile(opts);
    try { await Sh.share({ title: name, files: [w.uri] }); } catch(e){ /* меню закрыли */ }
    toast('Копия лежит в «Файлы» → «На iPhone» → «7 ключей».');
    return 'native';
  }
  const blob = isBase64 ? new Blob([Uint8Array.from(atob(data), ch=>ch.charCodeAt(0))], { type: mime }) : new Blob([data], { type: mime });
  const file = new File([blob], name, { type: mime });
  try { if (navigator.canShare && navigator.canShare({ files:[file] })){ await navigator.share({ files:[file], title:name }); return 'share'; } }
  catch(e){ if (e && e.name === 'AbortError') return 'cancel'; }
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 5000);
  toast('Файл сохранён: ' + name); return 'download';
}

/* ============ КАМЕРА ============ */
let wakeLock = null;
async function keepAwake(on){
  try { if (on && 'wakeLock' in navigator && !wakeLock){ wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', ()=>{ wakeLock = null; }); }
        else if (!on && wakeLock){ await wakeLock.release(); wakeLock = null; } } catch(e){}
}
function stopCamera(){ if (stream){ stream.getTracks().forEach(t=>t.stop()); stream = null; track = null; video.srcObject = null; } hwZoom = 1; keepAwake(false); }
let camStarting = false, zoomT = null;
async function startCamera(){
  if (stream || camStarting) return;
  camStarting = true; const note = $('srcNote'); note.hidden = true;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('браузер не даёт доступ к камере');
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:{ ideal:'environment' }, width:{ideal:1920}, height:{ideal:1080} }, audio:false });
    if (S.tab !== 'cam' || S.source !== 'camera'){ stopCamera(); return; }
    video.srcObject = stream; await video.play();
    track = stream.getVideoTracks()[0];
    const caps = track && track.getCapabilities ? track.getCapabilities() : {};
    hwCaps = caps && caps.zoom && caps.zoom.max > 1 ? { min: caps.zoom.min || 1, max: caps.zoom.max } : null;
    applyHwZoom(); keepAwake(true);
  } catch(e){
    stream = null; note.hidden = false;
    note.textContent = (e && e.name === 'NotAllowedError')
      ? 'Нет доступа к камере. Разреши его в Настройках iPhone: раздел «7 ключей», пункт «Камера». Пока можно пройти точку через «Фото».'
      : 'Камера не запустилась (' + (e.name || e.message) + '). Попробуй ещё раз или используй «Фото».';
  } finally { camStarting = false; }
}
/* оптический зум, если камера его отдаёт: картинка чётче, чем при обрезке кадра */
function applyHwZoom(){
  if (!track || !hwCaps){ hwZoom = 1; return; }
  const want = Math.max(hwCaps.min, Math.min(hwCaps.max, S.zoom));
  track.applyConstraints({ advanced: [{ zoom: want }] })
    .then(()=>{ const st = track && track.getSettings ? track.getSettings() : {}; hwZoom = st.zoom || want; renderOverlay(); })
    .catch(()=>{ hwCaps = null; hwZoom = 1; });
}
function placeForSource(){
  if (S.source === 'demo'){ const tp = truePlace(S.stand, S.zoom); S.place = { cx: tp.cx + 36, by: tp.by - 30, s: tp.s*0.93 }; }
  else S.place = { cx: CFG.FW/2, by: CFG.FH*0.58, s: 150 };
}
function setSourceUI(src){
  document.querySelectorAll('.seg button').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.src===src)));
  $('standWrap').hidden = src!=='demo';
}
async function setSource(src){
  if (src==='photo') $('photoInput').click();
  if (src==='demo' && S.source!=='demo'){ S.zoom = 4; $('zoom').value = 4; }
  S.source = src; S.dirty = true; resetResult(); lastMask = null; lastDetail = null;
  setSourceUI(src);
  const note = $('srcNote'); note.hidden = true;
  placeForSource(); renderOverlay();
  if (src==='camera') startCamera(); else stopCamera();
  if (src==='photo' && !photoImg){ note.hidden = false; note.textContent = 'Выбери снимок высотки из галереи или сделай новый.'; }
}
document.addEventListener('visibilitychange', ()=>{
  if (document.hidden) stopCamera(); else if (S.tab==='cam' && S.source==='camera' && $('editor').hidden && !$('finale')) startCamera();
});
$('photoInput').addEventListener('change', e=>{
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const img = new Image(); img.onload = ()=>{ photoImg = img; S.dirty = true; $('srcNote').hidden = true; S.zoom = 1; $('zoom').value = 1; renderOverlay(); };
  img.src = URL.createObjectURL(f); e.target.value = '';
});

/* ---- жесты на кадре ---- */
const stage = $('stage'), pointers = new Map(); let pinch = null;
const toFrame = () => CFG.FW / stage.clientWidth;
function clampS(s){ return Math.max(20, Math.min(600, s)); }
stage.addEventListener('pointerdown', e=>{ if (S.busy) return; stage.setPointerCapture(e.pointerId); pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (pointers.size===2){ const [a,b]=[...pointers.values()]; pinch = { d: Math.hypot(a.x-b.x, a.y-b.y), s: S.place.s }; } });
stage.addEventListener('pointermove', e=>{
  if (!pointers.has(e.pointerId) || S.busy) return;
  const prev = pointers.get(e.pointerId), cur = {x:e.clientX, y:e.clientY}; pointers.set(e.pointerId, cur);
  const f = toFrame();
  if (pointers.size===1){ S.place.cx += (cur.x-prev.x)*f; S.place.by += (cur.y-prev.y)*f; }
  else if (pointers.size===2 && pinch){ const [a,b]=[...pointers.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y);
    S.place.s = clampS(pinch.s * d / pinch.d); S.place.cx += (cur.x-prev.x)*f/2; S.place.by += (cur.y-prev.y)*f/2; }
  renderOverlay();
});
const endP = e=>{ pointers.delete(e.pointerId); if (pointers.size<2) pinch=null; };
stage.addEventListener('pointerup', endP); stage.addEventListener('pointercancel', endP);
stage.addEventListener('wheel', e=>{ e.preventDefault(); S.place.s = clampS(S.place.s*Math.exp(-e.deltaY*0.0015)); renderOverlay(); }, { passive:false });
$('bigger').onclick = ()=>{ S.place.s = clampS(S.place.s*1.08); renderOverlay(); };
$('smaller').onclick = ()=>{ S.place.s = clampS(S.place.s/1.08); renderOverlay(); };
$('zoom').addEventListener('input', e=>{
  const z = parseFloat(e.target.value), k = z / S.zoom;
  // ключ «приклеен» к миру: при зуме масштабируется вокруг центра кадра
  S.place.cx = CFG.FW/2 + (S.place.cx - CFG.FW/2)*k; S.place.by = CFG.FH/2 + (S.place.by - CFG.FH/2)*k; S.place.s = clampS(S.place.s*k);
  S.zoom = z; S.dirty = true; lastMask = null; $('dbg').hidden = true; renderOverlay();
  clearTimeout(zoomT); zoomT = setTimeout(applyHwZoom, 120);
});

/* ---- подсказки по кнопке «?» ---- */
function setTips(on){
  document.body.classList.toggle('tips', on);
  $('tipBtn').setAttribute('aria-pressed', String(on));
  store.set('sevenKeys.tips', on ? 1 : 0);
}
$('tipBtn').onclick = ()=> setTips(!document.body.classList.contains('tips'));
setTips(store.get('sevenKeys.tips', 0) === 1);

/* ---- кнопки ---- */
document.querySelectorAll('.tabs button').forEach(b=> b.onclick = ()=> setTab(b.dataset.tab));
document.querySelectorAll('.seg button').forEach(b=> b.onclick = ()=> setSource(b.dataset.src));
$('checkBtn').onclick = doCheck;
$('snapBtn').onclick = doSnap;
$('dbgToggle').onchange = async e=>{ S.debug = e.target.checked;
  if (S.debug && !lastMask && drawSource()){ const r = await Scanner.run(scanMsg('match')); lastMask = r.mask; lastDetail = r.detail; }
  drawDebug(); };
$('stand').innerHTML = KEYS.map((k,i)=>`<option value="${k.id}">${i+1}. ${esc(k.name)}</option>`).join('');
$('stand').onchange = e=>{ S.stand = e.target.value; S.dirty = true; resetResult(); lastMask = null; placeForSource(); renderOverlay(); };
$('route').addEventListener('click', e=>{
  const v = e.target.closest('[data-view]'); if (v){ showView(v.dataset.view); return; }
  const f = e.target.closest('[data-facts]'); if (f){ S.fromRoute = true; showStory(f.dataset.facts); return; }
  const b = e.target.closest('[data-here]'); if (!b) return;
  startTimer(); S.stand = b.dataset.here; $('stand').value = S.stand; S.dirty = true; resetResult(); lastMask = null;
  setTab('keys'); toast('Выбери ключ, который подходит к зданию перед тобой.'); });
$('keys').addEventListener('click', e=>{ const b = e.target.closest('[data-key]'); if (!b) return;
  S.keyId = b.dataset.key; resetResult(); lastMask = null; placeForSource();
  setTab('cam'); });
$('photoPass').onclick = ()=>{ drawSource(); recordAndFly(KEY[S.keyId], 'photo', 0, frameThumb(KEY[S.keyId], S.place)); };
$('codeBtn').onclick = ()=>{ const v = $('code').value.trim();
  if (v && hash(v) === CFG.ORGANIZER_HASH){ $('code').value=''; $('code').blur(); drawSource(); recordAndFly(KEY[S.keyId], 'code', 0, frameThumb(KEY[S.keyId], S.place)); }
  else { toast('Кодовое слово не подошло.'); buzz('warn'); } };
$('howBtn').onclick = showIntro;
$('resetBtn').onclick = ()=>{ S.opened = {}; S.meta = {}; save(); resetResult(); renderAll(); toast('Прогресс сброшен.'); };
$('sheet').addEventListener('click', e=>{ if (e.target.id==='sheet') closeSheet(); });

/* ---- цикл отрисовки ---- */
let lastMsg = null;
function loop(){
  if (S.tab==='cam' && (S.dirty || S.source==='camera')){
    const ok = drawSource(); S.dirty = false;
    const msg = ok ? '' : S.source==='camera' ? (stream ? 'Камера запускается…' : 'Камера выключена') : S.source==='photo' ? 'Нажми «Фото», чтобы выбрать снимок' : '';
    if (msg !== lastMsg){ $('stageMsg').textContent = msg; $('stageMsg').hidden = !msg; lastMsg = msg; }
  }
  requestAnimationFrame(loop);
}

/* ============ РЕДАКТОР КОНТУРОВ ============
   Фото с точки → тапы по правому краю силуэта сверху вниз → half + aspect + эталонное фото.
   Лупа над пальцем помогает попасть точно в угол уступа. */
const ED = { img:null, pts:[], drag:null };
const edC = $('edCanvas'), edG = edC.getContext('2d'), loupe = $('edLoupe'), lg = loupe.getContext('2d');
$('edKey').innerHTML = KEYS.map((k,i)=>`<option value="${k.id}">${i+1}. ${esc(k.name)}</option>`).join('');
function openEditor(){ $('edKey').value = S.keyId; $('editor').hidden = false; stopCamera(); edDraw(); }
function closeEditor(){ $('editor').hidden = true; if (S.tab==='cam' && S.source==='camera') startCamera(); }
function edResult(){
  const p = ED.pts; if (p.length < 3) return null;
  const tip = p[0], base = p[p.length-1], W = base[0]-tip[0], H = base[1]-tip[1];
  if (W <= 2 || H <= 2) return null;
  const half = p.map(([x,y],i)=>{
    if (i===0) return [0,1]; if (i===p.length-1) return [1,0];
    return [ +Math.min(1, Math.max(0,(x-tip[0])/W)).toFixed(3), +Math.min(1, Math.max(0,(base[1]-y)/H)).toFixed(3) ];
  });
  return { half, aspect: +(H/(2*W)).toFixed(3), tip, base, W, H };
}
function edFit(){
  const wrap = $('edWrap'), iw = edC.width, ih = edC.height;
  const k = Math.min(wrap.clientWidth/iw, wrap.clientHeight/ih) || 1;
  edC.style.width = Math.floor(iw*k) + 'px'; edC.style.height = Math.floor(ih*k) + 'px';
}
function edDraw(){
  const r = edResult(), k = KEY[$('edKey').value];
  if (!ED.img){ edC.width = 720; edC.height = 960; edG.fillStyle = '#0C111C'; edG.fillRect(0,0,720,960);
    edG.fillStyle = '#9BA7BD'; edG.font = '30px sans-serif'; edG.textAlign = 'center'; edG.fillText('Нажми «Фото»', 360, 470); }
  else { if (edC.width !== ED.img.width || edC.height !== ED.img.height){ edC.width = ED.img.width; edC.height = ED.img.height; } edG.drawImage(ED.img, 0, 0); }
  const u = Math.max(2, edC.width/360);
  if (r){ const poly = r.half.concat(r.half.slice(1).reverse().map(([x,y])=>[-x,y]));
    edG.beginPath(); poly.forEach(([x,y],i)=>{ const X = r.tip[0]+x*r.W, Y = r.base[1]-y*r.H; i ? edG.lineTo(X,Y) : edG.moveTo(X,Y); }); edG.closePath();
    edG.fillStyle = 'rgba(241,212,142,.25)'; edG.fill(); edG.strokeStyle = '#F1D48E'; edG.lineWidth = u; edG.stroke(); }
  else if (ED.pts.length > 1){ edG.beginPath(); ED.pts.forEach(([x,y],i)=> i ? edG.lineTo(x,y) : edG.moveTo(x,y)); edG.strokeStyle = '#F1D48E'; edG.lineWidth = u; edG.stroke(); }
  ED.pts.forEach(([x,y],i)=>{ edG.fillStyle = i===0 ? '#E0443A' : '#22D66B'; edG.beginPath(); edG.arc(x,y,u*2.2,0,Math.PI*2); edG.fill(); });
  edFit();
  $('edStatus').textContent = `Сейчас у ключа: ${LAYER_NAME[k.layer]}. Точек: ${ED.pts.length}.`;
  $('edFactory').disabled = k.layer !== 'phone';
  $('edTest').disabled = !ED.img || !r;
}
function edPoint(e){ const rc = edC.getBoundingClientRect(); return [ (e.clientX-rc.left)*edC.width/rc.width, (e.clientY-rc.top)*edC.height/rc.height ]; }
function edLoupe(e, pt){
  const wrap = $('edWrap').getBoundingClientRect(), size = 150, zoom = 3.2;
  const scale = edC.width / edC.getBoundingClientRect().width, src = size/zoom*scale;
  lg.clearRect(0,0,size,size); lg.save(); lg.beginPath(); lg.arc(size/2,size/2,size/2,0,Math.PI*2); lg.clip();
  lg.fillStyle = '#000'; lg.fillRect(0,0,size,size);
  lg.drawImage(edC, pt[0]-src/2, pt[1]-src/2, src, src, 0, 0, size, size);
  lg.strokeStyle = '#FF3B30'; lg.lineWidth = 1.5; lg.beginPath(); lg.moveTo(size/2,size/2-14); lg.lineTo(size/2,size/2+14); lg.moveTo(size/2-14,size/2); lg.lineTo(size/2+14,size/2); lg.stroke();
  lg.restore();
  let lx = e.clientX - wrap.left - size/2, ly = e.clientY - wrap.top - size - 60;
  if (ly < 4) ly = e.clientY - wrap.top + 60;
  lx = Math.max(4, Math.min(wrap.width - size - 4, lx));
  loupe.style.transform = `translate(${lx}px, ${ly}px)`; loupe.hidden = false;
}
edC.addEventListener('pointerdown', e=>{ if (!ED.img) return; e.preventDefault(); edC.setPointerCapture(e.pointerId); ED.drag = edPoint(e); edLoupe(e, ED.drag); });
edC.addEventListener('pointermove', e=>{ if (!ED.drag) return; ED.drag = edPoint(e); edLoupe(e, ED.drag); });
edC.addEventListener('pointerup', ()=>{ if (!ED.drag) return; ED.pts.push(ED.drag); ED.drag = null; loupe.hidden = true; edDraw(); });
edC.addEventListener('pointercancel', ()=>{ ED.drag = null; loupe.hidden = true; });
function loadEditorImage(file){
  const img = new Image(); img.onload = ()=>{
    const m = 2000, k = Math.min(1, m/Math.max(img.naturalWidth, img.naturalHeight));   // большие фото ужимаем: память телефона не резиновая
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth*k); c.height = Math.round(img.naturalHeight*k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    ED.img = c; ED.pts = []; edDraw(); URL.revokeObjectURL(img.src);
  }; img.src = URL.createObjectURL(file);
}
/* эталонное фото: кадр вокруг обведённой короны, до 640 px */
function refPhoto(r){
  const img = ED.img, mX = r.W*1.1, top = Math.max(0, r.tip[1] - r.H*0.25), bot = Math.min(img.height, r.base[1] + r.H*0.9);
  const x0 = Math.max(0, r.tip[0] - r.W - mX), x1 = Math.min(img.width, r.tip[0] + r.W + mX);
  const w = x1-x0, h = bot-top, k = Math.min(1, 640/Math.max(w,h));
  const c = document.createElement('canvas'); c.width = Math.round(w*k); c.height = Math.round(h*k);
  c.getContext('2d').drawImage(img, x0, top, w, h, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}
function edSave(){
  const r = edResult(); if (!r){ toast('Нужно минимум 3 точки: верхушка, уступы, нижний правый угол.'); return false; }
  const id = $('edKey').value; PHONE[id] = { aspect: r.aspect, half: r.half, photo: refPhoto(r), at: Date.now() };
  if (!store.set('sevenKeys.contours', PHONE)){ PHONE[id].photo = null; store.set('sevenKeys.contours', PHONE); toast('Память почти полная: контур сохранён без фото.'); }
  else toast('Ключ сохранён на телефоне. Когда обведёшь все, нажми «Экспорт для проекта».');
  applyLayers(); renderAll(); edDraw(); return true;
}
$('editorBtn').onclick = openEditor;
$('edClose').onclick = closeEditor;
$('edLoad').onclick = ()=> $('edFile').click();
$('edFile').addEventListener('change', e=>{ const f = e.target.files && e.target.files[0]; if (f) loadEditorImage(f); e.target.value = ''; });
$('edKey').onchange = ()=>{ edDraw(); };
$('edUndo').onclick = ()=>{ ED.pts.pop(); edDraw(); };
$('edClear').onclick = ()=>{ ED.pts = []; edDraw(); };
$('edApply').onclick = edSave;
$('edFactory').onclick = ()=>{ const id = $('edKey').value; delete PHONE[id]; store.set('sevenKeys.contours', PHONE);
  applyLayers(); renderAll(); edDraw(); toast('Правка удалена, у ключа снова ' + LAYER_NAME[KEY[id].layer] + '.'); };
/* проверить обведённый ключ прямо на этом фото */
$('edTest').onclick = ()=>{
  const r = edResult(); if (!r || !ED.img || !edSave()) return;
  const id = $('edKey').value;
  photoImg = ED.img; S.keyId = id; S.source = 'photo'; S.zoom = 1; $('zoom').value = 1; setSourceUI('photo');
  const sr = srcRect(ED.img.width, ED.img.height, 1), f = CFG.FW/sr.w;
  S.place = { cx: (r.tip[0]-sr.x)*f + 14, by: (r.base[1]-sr.y)*f - 10, s: r.W*f*0.95 };   // чуть сбиваем, пусть поработает подгонка
  closeEditor(); resetResult(); lastMask = null; S.dirty = true; setTab('cam');
  toast('Нажми «Сверить», чтобы проверить ключ на этом фото.');
};
/* пакет для проекта: все ключи со своими контурами плюс эталонные фото */
function buildPackage(){
  const keys = {};
  KEYS.forEach(k=>{ const src = (validEntry(PHONE[k.id]) && PHONE[k.id]) || (validEntry(PROJECT[k.id]) && PROJECT[k.id]);
    if (src) keys[k.id] = { name: k.name, aspect: src.aspect, half: src.half, photo: src.photo || null }; });
  return { format:'sevenkeys-keys', version:1, app: APP_VERSION, exported: new Date().toISOString(), keys };
}
$('edExport').onclick = async ()=>{
  const p = buildPackage(), n = Object.keys(p.keys).length;
  if (!n) return toast('Сначала обведи и сохрани хотя бы один ключ.');
  try { await shareFile('keys.json', 'application/json', JSON.stringify(p), false); } catch(e){ toast('Не получилось сохранить файл: ' + e.message); }
};
$('edImport').onclick = ()=> $('edImportFile').click();
$('edImportFile').addEventListener('change', async e=>{
  const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const j = JSON.parse(await f.text()); let n = 0;
    for (const id in (j.keys||{})) if (KEY[id] && validEntry(j.keys[id])){ PHONE[id] = { aspect: j.keys[id].aspect, half: j.keys[id].half, photo: j.keys[id].photo || null, at: Date.now() }; n++; }
    if (!n) throw new Error('в файле нет подходящих контуров');
    store.set('sevenKeys.contours', PHONE); applyLayers(); renderAll(); edDraw(); toast(`Загружено контуров: ${n}.`);
  } catch(err){ toast('Файл не подошёл: ' + err.message); }
});
addEventListener('resize', ()=>{ if (!$('editor').hidden) edFit(); });

/* ============ СТАРТ ============ */
(async function init(){
  placeForSource();
  if (window.initMap) initMap();
  $('meterMark').style.left = (CFG.PASS*100)+'%';
  resetResult(); renderAll(); setTab('route'); requestAnimationFrame(loop);
  $('cfgTable').innerHTML = [
    ['Порог зачёта','PASS', CFG.PASS.toFixed(2)], ['Отрыв от чужих ключей','MARGIN', CFG.MARGIN.toFixed(2)],
    ['Порог ребра','GRAD_T', CFG.GRAD_T], ['Радиус поиска ребра','EDGE_R', CFG.EDGE_R+' px'], ['Ребро вдоль контура','EDGE_COS', CFG.EDGE_COS],
    ['Небо: шаг наружу / внутрь','SKY_OUT / SKY_IN', CFG.SKY_OUT+' / '+CFG.SKY_IN+' px'], ['Веса рёбра / небо','W_EDGE / W_SKY', CFG.W_EDGE+' / '+CFG.W_SKY],
    ['Кадров подряд (камера)','CAMERA_FRAMES', CFG.CAMERA_FRAMES], ['Неудач до фото-зачёта','FAILS_FOR_PHOTO', CFG.FAILS_FOR_PHOTO]
  ].map(r=>`<tr><td>${r[0]}</td><td class="mono">${r[1]}</td><td class="mono">${r[2]}</td></tr>`).join('');
  const splash = FX.splash(KEYS);
  await loadProjectKeys(); renderAll();
  setTimeout(()=>{ $('buildInfo').textContent = `версия ${APP_VERSION} · ${NATIVE ? 'iOS-приложение' : 'веб'} · сверка: ${Scanner.mode}`; }, 1500);
  await splash;
  if (!store.get('sevenKeys.intro', 0)) showIntro();
  if ('serviceWorker' in navigator && !NATIVE && (location.protocol === 'https:' || location.hostname === 'localhost'))
    navigator.serviceWorker.register('sw.js').catch(()=>{});
})();

/* для автотестов и настройки порогов из консоли */
window.SK = { CFG, KEYS, KEY, S, PHONE, truePlace, drawSource, hash, setSource, setTab, Scanner, scanMsg, buildPackage, applyLayers, showFinal, ED, edDraw, recordAndFly };
