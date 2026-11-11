/* ============ ЯДРО СВЕРКИ СИЛУЭТА ============
   Чистые функции без DOM: работают и в основном потоке, и в Web Worker (scan-worker.js).
   Все пороги в CFG. Меняешь здесь: меняется везде. */
(function(root){
'use strict';

const CFG = {
  FW: 720, FH: 1280,          // размер анализируемого кадра (портрет)
  STRIDE: 3,                  // даунскейл перед анализом
  SKY_BLUE_MARGIN: 8,         // небо: b > r + margin
  SKY_MIN_L: 70,              //        и яркость > min
  SKY_BRIGHT_L: 195,          // или очень светлый
  SKY_GRAY_SPREAD: 14,        //        и почти серый (облака)
  GRAD_T: 30,                 // порог ребра (Собель, нормирован на 4, то есть в единицах яркости)
  CHROMA_W: 0.6,              // вес цветового перепада (b − r) в карте рёбер
  EDGE_R: 3,                  // радиус поиска ребра, px уменьшенного кадра
  EDGE_COS: 0.7,              // ребро засчитывается, только если идёт вдоль контура (|cos| градиента и нормали)
  TOP_W0: 0.3,                // вес точки = TOP_W0 + высота точки в контуре (0…1)
  SKY_OUT: 5,                 // шаг наружу для проверки неба
  SKY_IN: 4,                  // шаг внутрь (уменьшается для тонких шпилей)
  BASE_EXCLUDE: 0.01,         // основание контура не проверяем
  SAMPLE_STEP: 1.5,           // шаг точек по контуру
  W_EDGE: 0.6, W_SKY: 0.4,    // веса score
  PASS: 0.75,                 // абсолютный порог зачёта (тюнинг в поле 0.65…0.85)
  MARGIN: 0.06,               // свой ключ должен обогнать лучший чужой ключ на столько
  CAMERA_FRAMES: 3,           // с камеры: столько кадров подряд должны пройти
  STEADY_DROP: 0.06,          // на кадрах 2…N score может просесть не больше чем на столько
  FAILS_FOR_PHOTO: 4,         // после стольких неудач доступен фото-зачёт
  SNAP_SHIFT: 12, SNAP_STEP: 3,                          // автоподгонка: сдвиг ±px уменьшенного кадра (грубый шаг)
  SNAP_SCALES: [0.88, 0.92, 0.96, 1, 1.04, 1.08, 1.12], // и масштабы
  ORGANIZER_HASH: 'a5ad31ef', // FNV-1a хэш кодового слова. Новый: SK.hash('СЛОВО') в консоли
  ZOOM_MIN: 1, ZOOM_MAX: 10
};
const SW = Math.round(CFG.FW/CFG.STRIDE), SH = Math.round(CFG.FH/CFG.STRIDE);

let OFFS = null, OFFS_R = -1;
function offsets(){
  if (OFFS_R !== CFG.EDGE_R){ const a=[], r=CFG.EDGE_R;
    for (let y=-r;y<=r;y++) for (let x=-r;x<=r;x++) if (x*x+y*y<=r*r) a.push([x,y,x*x+y*y]);
    OFFS = a.sort((p,q)=>p[2]-q[2]); OFFS_R = r; }
  return OFFS;
}

/* RGBA уменьшенного кадра → маска неба и карта рёбер (Собель по яркости и по цвету b−r) */
function analyzeRGBA(d, w, h){
  const N = w*h;
  const L = new Float32Array(N), C = new Float32Array(N), SKY = new Uint8Array(N), G = new Float32Array(N), GX = new Float32Array(N), GY = new Float32Array(N);
  for (let i=0,p=0;i<N;i++,p+=4){
    const r=d[p], g=d[p+1], b=d[p+2], l=0.299*r+0.587*g+0.114*b;
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    L[i]=l; C[i]=b-r;
    SKY[i] = ((b > r+CFG.SKY_BLUE_MARGIN && l > CFG.SKY_MIN_L) || (l > CFG.SKY_BRIGHT_L && (mx-mn) < CFG.SKY_GRAY_SPREAD)) ? 1 : 0;
  }
  for (let y=1;y<h-1;y++) for (let x=1;x<w-1;x++){
    const i=y*w+x;
    const gx = (L[i-w+1]+2*L[i+1]+L[i+w+1]) - (L[i-w-1]+2*L[i-1]+L[i+w-1]);
    const gy = (L[i+w-1]+2*L[i+w]+L[i+w+1]) - (L[i-w-1]+2*L[i-w]+L[i-w+1]);
    const cx = (C[i-w+1]+2*C[i+1]+C[i+w+1]) - (C[i-w-1]+2*C[i-1]+C[i+w-1]);
    const cy = (C[i+w-1]+2*C[i+w]+C[i+w+1]) - (C[i-w-1]+2*C[i-w]+C[i-w+1]);
    const mL = Math.sqrt(gx*gx+gy*gy), mC = CFG.CHROMA_W*Math.sqrt(cx*cx+cy*cy);
    if (mL >= mC){ G[i]=mL/4; GX[i]=gx/(mL||1); GY[i]=gy/(mL||1); }
    else { G[i]=mC/4; const m=Math.sqrt(cx*cx+cy*cy)||1; GX[i]=cx/m; GY[i]=cy/m; }
  }
  return { w, h, SKY, G, GX, GY };
}
/* компактная маска для отладочной картинки: 0 ничего, 1 небо, 2 ребро */
function debugMask(an){ const m = new Uint8Array(an.w*an.h);
  for (let i=0;i<m.length;i++) m[i] = an.G[i] > CFG.GRAD_T ? 2 : an.SKY[i] ? 1 : 0; return m; }

function pip(poly, x, y){ let c=false; for (let i=0,j=poly.length-1;i<poly.length;j=i++){ const a=poly[i], b=poly[j];
  if (((a[1]>y)!==(b[1]>y)) && (x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])) c=!c; } return c; }

/* key: { aspect, poly }, pl: { cx, by, s } в координатах кадра 720×1280 */
function matchContour(an, key, pl, withPts){
  const ST = CFG.STRIDE, H = key.aspect*2*pl.s, W = an.w, Hh = an.h;
  const poly = key.poly.map(([x,y])=>[(pl.cx + x*pl.s)/ST, (pl.by - y*H)/ST, y]);
  let A = 0; for (let i=0;i<poly.length;i++){ const a=poly[i], b=poly[(i+1)%poly.length]; A += a[0]*b[1]-b[0]*a[1]; }
  const sg = A > 0 ? 1 : -1;   // ориентация полигона → внешняя нормаль
  const cxS = pl.cx/ST, halfS = pl.s/ST, inb = (x,y)=> x>=0 && y>=0 && x<W && y<Hh;
  let n=0, ne=0, ns=0, sdx=0, sdy=0, nf=0, gro=0, gn=0, cnt=0; const pts = withPts ? [] : null, OF = offsets();
  for (let i=0;i<poly.length;i++){
    const a=poly[i], b=poly[(i+1)%poly.length];
    if (a[2]<=CFG.BASE_EXCLUDE && b[2]<=CFG.BASE_EXCLUDE) continue;
    const ex=b[0]-a[0], ey=b[1]-a[1], len=Math.hypot(ex,ey); if (len<1e-6) continue;
    const tx=ex/len, ty=ey/len, nx = sg>0 ? ty : -ty, ny = sg>0 ? -tx : tx;
    const steps = Math.max(1, Math.ceil(len/CFG.SAMPLE_STEP));
    for (let s=0;s<steps;s++){
      const f=s/steps, cy=a[2]+(b[2]-a[2])*f; if (cy<=CFG.BASE_EXCLUDE) continue;
      const x=a[0]+ex*f, y=a[1]+ey*f, w = CFG.TOP_W0 + cy; n += w; cnt++;
      const xi=Math.round(x), yi=Math.round(y); let found=null;
      for (const o of OF){ const X=xi+o[0], Y=yi+o[1]; if (X<1||Y<1||X>=W-1||Y>=Hh-1) continue; const j=Y*W+X;
        if (an.G[j] > CFG.GRAD_T && Math.abs(an.GX[j]*nx + an.GY[j]*ny) >= CFG.EDGE_COS){ found=o; break; } }
      if (found){ ne+=w; nf++; sdx+=found[0]; sdy+=found[1]; const side=x-cxS; if (Math.abs(side) > 0.3*halfS){ gro += found[0]*Math.sign(side); gn++; } }
      const ox=Math.round(x+nx*CFG.SKY_OUT), oy=Math.round(y+ny*CFG.SKY_OUT);
      let ok = inb(ox,oy) && an.SKY[oy*W+ox]===1;
      if (ok){ for (let dd=CFG.SKY_IN; dd>=1.5; dd/=2){ const px=x-nx*dd, py=y-ny*dd;
          if (pip(poly,px,py)){ const X=Math.round(px), Y=Math.round(py); ok = inb(X,Y) && an.SKY[Y*W+X]===0; break; } } }
      if (ok) ns+=w;
      if (pts) pts.push([x,y,!!found,ok]);
    }
  }
  const edgeFrac = n? ne/n : 0, skyFrac = n? ns/n : 0;
  return { score: CFG.W_EDGE*edgeFrac + CFG.W_SKY*skyFrac, edgeFrac, skyFrac, dx: nf? sdx/nf:0, dy: nf? sdy/nf:0, grow: gn? gro/gn:0, pts, n: cnt, pl };
}
function snapSearch(an, key, best, shift, step, scales){
  const base = best.pl; let out = best;
  for (const sc of scales) for (let dy=-shift; dy<=shift; dy+=step) for (let dx=-shift; dx<=shift; dx+=step){
    if (!dx && !dy && sc===1) continue;
    const r = matchContour(an, key, { cx: base.cx + dx*CFG.STRIDE, by: base.by + dy*CFG.STRIDE, s: base.s*sc });
    if (r.score > out.score) out = r;
  }
  return out;
}
/* автоподгонка: грубый поиск, затем точный вокруг лучшего */
function autosnap(an, key, pl){
  let best = matchContour(an, key, pl);
  best = snapSearch(an, key, best, CFG.SNAP_SHIFT, CFG.SNAP_STEP, CFG.SNAP_SCALES);
  return snapSearch(an, key, best, 2, 1, [0.98, 1, 1.02]);
}
/* решение: свой ключ набрал порог И обогнал все остальные ключи на MARGIN */
function judge(an, keys, keyId, pl){
  const key = keys.find(k=>k.id===keyId);
  const r0 = matchContour(an, key, pl);
  const r = autosnap(an, key, pl);
  let rival = 0, rivalId = null;
  if (r.score >= CFG.PASS) for (const k of keys){ if (k.id === keyId) continue;
    const rr = autosnap(an, k, pl); if (rr.score > rival){ rival = rr.score; rivalId = k.id; } }
  const passed = r.score >= CFG.PASS && r.score - rival >= CFG.MARGIN;
  const shown = passed || r.score >= CFG.PASS ? r : r0;   // что показывать: подогнанный или как положил игрок
  const detail = matchContour(an, key, shown.pl, true);
  return { r, r0, rival, rivalId, passed, detail };
}

/* единая точка входа: и для воркера, и для основного потока */
function run(msg){
  if (msg.cfg) Object.assign(CFG, msg.cfg);
  const an = analyzeRGBA(msg.rgba, msg.w, msg.h);
  const key = msg.keys.find(k=>k.id===msg.keyId);
  let out;
  if (msg.cmd === 'judge') out = judge(an, msg.keys, msg.keyId, msg.pl);
  else if (msg.cmd === 'snap'){ const r = autosnap(an, key, msg.pl); out = { r, detail: matchContour(an, key, r.pl, true) }; }
  else { const r = matchContour(an, key, msg.pl, true); out = { r, detail: r }; }
  out.mask = msg.wantMask ? debugMask(an) : null;
  return out;
}

root.ScanCore = { CFG, SW, SH, analyzeRGBA, matchContour, autosnap, judge, run, debugMask };
})(typeof self !== 'undefined' ? self : window);
