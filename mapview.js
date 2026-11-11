/* ============ КАРТА МАРШРУТА ============
   Рисуется сама (SVG), без интернета и без тайлов.
   Интрига: здания на карте не показаны. Видна только тропа и вопросы на её точках.
   Здание появляется на карте, когда ключ от него открыт. */
(function(){
  const X0 = 37.52, Y0 = 55.785, KX = 62700, KY = 111200;
  const mx = lon => (lon - X0) * KX, my = lat => (Y0 - lat) * KY;
  const IDS = ['mgu','ukr','mid','kud','krv','len','kot'];
  const D = MAPDATA;
  const pts = a => a.map(p => mx(p[1]).toFixed(0) + ',' + my(p[0]).toFixed(0)).join(' ');
  const rivers = D.river.map(([y, a]) => ({ y, p: pts(a) }));
  const track = D.track;
  const hav = (a, b) => { const r = Math.PI/180, p = (b[0]-a[0])*r, l = (b[1]-a[1])*r;
    return 12742000 * Math.asin(Math.sqrt(Math.sin(p/2)**2 + Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(l/2)**2)); };
  // индексы точек обзора вдоль тропы
  const split = []; { let from = 0;
    IDS.forEach((id, i) => { let bi = from, bd = 1e9;
      for (let j = from; j < track.length; j++){ const d = hav(track[j], D.vp[id]); if (d < bd){ bd = d; bi = j; } }
      split.push(bi); from = bi; }); }
  const legPts = i => pts(track.slice(split[i], split[i+1] + 1));
  const legs = Array.from({length: 6}, (_, i) => legPts(i));
  const allPts = pts(track);
  const esc2 = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  const BOX = { x: 250, y: 150, w: 9100, h: 9300 };       // рамка всего маршрута
  const mini = { vb: null }, full = { vb: null, user: null, watch: null };
  const $m = id => document.getElementById(id);

  function fitView(wpx, hpx, box){ const k = Math.max(box.w / wpx, box.h / hpx), w = wpx * k, h = hpx * k;
    return { x: box.x + box.w/2 - w/2, y: box.y + box.h/2 - h/2, w, h }; }

  function state(){ const opened = i => !!S.opened[IDS[i]];
    let next = IDS.findIndex((id, i) => !opened(i)); return { opened, next, done: next === -1 }; }

  function build(vb, wpx, interactive){
    const u = vb.w / wpx, st = state(), o = [];
    o.push(`<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" class="m-bg"/>`);
    rivers.forEach(r => o.push(`<polyline class="m-river" style="stroke-width:${r.y ? 70 : 150}px" points="${r.p}"/>`));
    o.push(`<polyline class="m-trail" style="stroke-width:${3*u}px;stroke-dasharray:${9*u} ${8*u}" points="${allPts}"/>`);
    for (let i = 0; i < 6; i++){
      const doneLeg = i < st.next - 1 || (st.done), cur = !st.done && i === st.next - 1;
      if (doneLeg) o.push(`<polyline class="m-done" style="stroke-width:${5*u}px" points="${legs[i]}"/>`);
      else if (cur) o.push(`<polyline class="m-cur" style="stroke-width:${5*u}px;stroke-dasharray:${12*u} ${8*u}" points="${legs[i]}"/>`);
    }
    IDS.forEach((id, i) => {
      const vp = D.vp[id], b = D.bld[id], vx = mx(vp[1]), vy = my(vp[0]);
      if (st.opened(i)){
        const bx = mx(b[1]), by = my(b[0]), k = KEYS[i];
        o.push(`<line class="m-sight" x1="${vx}" y1="${vy}" x2="${bx}" y2="${by}" style="stroke-width:${2*u}px;stroke-dasharray:${3*u} ${5*u}"/>`);
        o.push(`<circle class="m-vp" cx="${vx}" cy="${vy}" r="${4*u}"/>`);
        o.push(`<circle class="m-bld" cx="${bx}" cy="${by}" r="${12*u}"/><text class="m-letter" x="${bx}" y="${by + 5*u}" style="font-size:${15*u}px">${k.letter}</text>`);
        if (interactive || wpx > 500) o.push(`<text class="m-name" x="${bx}" y="${by + 26*u}" style="font-size:${11.5*u}px;stroke-width:${3.5*u}px">${esc2(k.name)}</text>`);
      } else if (i === st.next){
        o.push(`<circle class="m-zone" cx="${vx}" cy="${vy}" r="${Math.max(170, 22*u)}" style="stroke-width:${2.5*u}px;stroke-dasharray:${7*u} ${6*u}"/>`);
        o.push(`<circle class="m-next" cx="${vx}" cy="${vy}" r="${11*u}"/><text class="m-q" x="${vx}" y="${vy + 5*u}" style="font-size:${14*u}px">${i + 1}</text>`);
        if (interactive || wpx > 500) o.push(`<text class="m-name" x="${vx}" y="${vy - 20*u}" style="font-size:${11.5*u}px;stroke-width:${3.5*u}px">${i ? 'ты идёшь сюда' : 'старт'}</text>`);
      } else {
        o.push(`<circle class="m-lock" cx="${vx}" cy="${vy}" r="${7.5*u}" style="stroke-width:${2*u}px"/><text class="m-q2" x="${vx}" y="${vy + 3.6*u}" style="font-size:${10*u}px">?</text>`);
      }
    });
    const me = full.user; if (me){ const ux = mx(me[1]), uy = my(me[0]);
      o.push(`<circle class="m-acc" cx="${ux}" cy="${uy}" r="${Math.max(me[2]||30, 15)}"/><circle class="m-me" cx="${ux}" cy="${uy}" r="${6*u}" style="stroke-width:${2.5*u}px"/>`); }
    return o.join('');
  }
  function draw(svg, vb, wpx, interactive){
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    svg.innerHTML = build(vb, wpx, interactive);
  }

  /* мини-окно */
  window.renderMiniMap = function(){
    const el = $m('miniMap'); if (!el) return; const svg = $m('miniSvg');
    const w = el.clientWidth || 380, h = el.clientHeight || 230;
    mini.vb = fitView(w, h, BOX); draw(svg, mini.vb, w, false);
    const st = state(); $m('miniCap').textContent = st.done ? 'Все высотки найдены. Открыть карту' : 'Тропа и точки. Открыть карту';
  };

  /* полный экран */
  function scaleBar(){ const el = $m('mapFull'), svg = $m('mapSvg'); if (!el || !full.vb) return;
    const wpx = svg.clientWidth || 380, u = full.vb.w / wpx;
    const steps = [100, 200, 500, 1000, 2000], m = steps.reduce((a, s) => (s/u <= 110 ? s : a), 100);
    $m('mapScale').style.width = (m / u) + 'px'; $m('mapScaleT').textContent = m >= 1000 ? (m/1000) + ' км' : m + ' м'; }
  function drawFull(){ const svg = $m('mapSvg'); draw(svg, full.vb, svg.clientWidth || 380, true); scaleBar(); }
  function setView(vb){ // ограничения: не уезжать далеко и не приближать слишком сильно
    const svg = $m('mapSvg'), wpx = svg.clientWidth || 380, hpx = svg.clientHeight || 600;
    const minW = 300, maxW = 12000;
    let w = Math.min(maxW, Math.max(minW, vb.w)), h = w * hpx / wpx;
    const cx = Math.min(MAXX, Math.max(-500, vb.x + vb.w/2)), cy = Math.min(MAXY, Math.max(-500, vb.y + vb.h/2));
    full.vb = { x: cx - w/2, y: cy - h/2, w, h }; drawFull(); }
  const MAXX = 9600, MAXY = 10000;
  function zoomAt(f, px, py){ const svg = $m('mapSvg'), r = svg.getBoundingClientRect(), v = full.vb;
    const fx = (px - r.left) / r.width, fy = (py - r.top) / r.height, nx = v.x + fx*v.w, ny = v.y + fy*v.h, w = v.w * f;
    setView({ x: nx - fx*w, y: ny - fy*(w * v.h / v.w), w, h: w * v.h / v.w }); }

  function openMap(){
    const el = $m('mapFull'); el.hidden = false; document.body.classList.add('mapopen');
    const svg = $m('mapSvg'); const w = svg.clientWidth || 380, h = svg.clientHeight || 600;
    full.vb = fitView(w, h, BOX); drawFull();
  }
  function closeMap(){ $m('mapFull').hidden = true; document.body.classList.remove('mapopen'); stopWatch(); }
  function stopWatch(){ try { if (full.watch != null) navigator.geolocation.clearWatch(full.watch); } catch(e){} full.watch = null; }
  function locate(){
    const b = $m('mapLocate');
    if (!navigator.geolocation){ b.title = 'Геолокация недоступна'; return; }
    stopWatch(); b.classList.add('busy');
    try { full.watch = navigator.geolocation.watchPosition(p => {
        b.classList.remove('busy'); b.classList.add('on'); full.user = [p.coords.latitude, p.coords.longitude, p.coords.accuracy];
        drawFull(); }, () => { b.classList.remove('busy'); b.classList.remove('on'); full.user = null; drawFull(); },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    } catch(e){ b.classList.remove('busy'); }
  }
  function centerOnMe(){ if (!full.user) return; const v = full.vb, cx = mx(full.user[1]), cy = my(full.user[0]);
    setView({ x: cx - v.w/2, y: cy - v.h/2, w: v.w, h: v.h }); }

  window.initMap = function(){
    $m('miniMap').addEventListener('click', openMap);
    $m('mapClose').addEventListener('click', closeMap);
    $m('mapIn').addEventListener('click', () => { const r = $m('mapSvg').getBoundingClientRect(); zoomAt(0.6, r.left + r.width/2, r.top + r.height/2); });
    $m('mapOut').addEventListener('click', () => { const r = $m('mapSvg').getBoundingClientRect(); zoomAt(1/0.6, r.left + r.width/2, r.top + r.height/2); });
    $m('mapFit').addEventListener('click', () => { const svg = $m('mapSvg'); full.vb = fitView(svg.clientWidth || 380, svg.clientHeight || 600, BOX); drawFull(); });
    $m('mapLocate').addEventListener('click', () => { if (full.user) centerOnMe(); else locate(); });
    $m('mapLocate').addEventListener('dblclick', () => { full.user = null; stopWatch(); $m('mapLocate').classList.remove('on'); drawFull(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$m('mapFull').hidden) closeMap(); });
    // жесты
    const svg = $m('mapSvg'), ptr = new Map(); let last = null;
    svg.style.touchAction = 'none';
    svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]); last = null; });
    svg.addEventListener('pointermove', e => {
      if (!ptr.has(e.pointerId)) return; const prev = ptr.get(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]);
      const r = svg.getBoundingClientRect(), v = full.vb;
      if (ptr.size === 1){ const k = v.w / r.width; setView({ x: v.x - (e.clientX - prev[0]) * k, y: v.y - (e.clientY - prev[1]) * k, w: v.w, h: v.h }); }
      else if (ptr.size === 2){ const [a, b] = [...ptr.values()], d = Math.hypot(a[0]-b[0], a[1]-b[1]);
        if (last) zoomAt(last / d, (a[0]+b[0])/2, (a[1]+b[1])/2); last = d; }
    });
    const up = e => { ptr.delete(e.pointerId); last = null; };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.deltaY > 0 ? 1.18 : 0.85, e.clientX, e.clientY); }, { passive: false });
    window.addEventListener('resize', () => { if (!$m('mapFull').hidden) setView(full.vb); renderMiniMap(); });
  };
})();
