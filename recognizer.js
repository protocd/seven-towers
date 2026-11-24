/* Нейросеть: узнаёт, какая из семи высоток в кадре (или «не высотка»).
   DINOv2-small (int8, ONNX) + линейная голова. Всё локально, интернет не нужен.
   Recognizer.load() подгружает onnxruntime-web и модель (один раз), Recognizer.classify(canvas) даёт
   { cls, prob, margin, ok, probs }. ok = это высотка, уверенность >= порога и отрыв от второго места >= margin. */
const Recognizer = (function(){
  let sess = null, H = null, loading = null;
  const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225], N = 224;

  function loadScript(src){
    return new Promise((res, rej)=>{ const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = ()=>rej(new Error('не загрузился ' + src)); document.head.appendChild(s); });
  }
  function load(){
    if (!loading) loading = (async ()=>{
      H = await (await fetch('head.json')).json();
      if (typeof ort === 'undefined') await loadScript('ort.wasm.min.js');
      ort.env.wasm.wasmPaths = new URL('./', document.baseURI).href; ort.env.wasm.numThreads = 1;
      sess = await ort.InferenceSession.create('dinov2_small_int8.onnx', { executionProviders: ['wasm'] });
    })().catch(e=>{ loading = null; throw e; });
    return loading;
  }

  /* три вида кадра: весь кадр, центральный квадрат, квадрат ближе (так же, как при обучении) */
  function tensor(src){
    const w = src.width, h = src.height, s = Math.min(w, h), cx = w / 2, cy = h / 2;
    const boxes = [[0, 0, w, h], [cx - s / 2, cy - s / 2, s, s], [cx - s * .35, cy - s * .35, s * .7, s * .7]];
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high';
    const out = new Float32Array(boxes.length * 3 * N * N);
    boxes.forEach((b, v)=>{
      g.drawImage(src, b[0], b[1], b[2], b[3], 0, 0, N, N);
      const d = g.getImageData(0, 0, N, N).data, base = v * 3 * N * N;
      for (let i = 0; i < N * N; i++) for (let k = 0; k < 3; k++) out[base + k * N * N + i] = (d[i * 4 + k] / 255 - MEAN[k]) / STD[k];
    });
    return new ort.Tensor('float32', out, [boxes.length, 3, N, N]);
  }
  function softmax(z){ const m = Math.max(...z), e = z.map(v => Math.exp(v - m)), s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s); }

  async function classify(src){
    await load();
    const res = await sess.run({ pixel_values: tensor(src) });
    const o = res.last_hidden_state, f = o.data, V = o.dims[0], T = o.dims[1], C = o.dims[2];   // [views, 257, 384]
    const K = H.classes.length, p = new Array(K).fill(0);
    for (let v = 0; v < V; v++){
      const feat = new Float32Array(2 * C), base = v * T * C;
      for (let j = 0; j < C; j++){ feat[j] = f[base + j]; let a = 0; for (let t = 1; t < T; t++) a += f[base + t * C + j]; feat[C + j] = a / (T - 1); }
      const z = new Array(K);
      for (let c = 0; c < K; c++){ let a = H.b[c]; const W = H.W[c]; for (let j = 0; j < 2 * C; j++) a += W[j] * ((feat[j] - H.mean[j]) / H.sd[j]); z[c] = a; }
      softmax(z).forEach((q, i)=>p[i] += q / V);
    }
    const order = p.map((v, i)=>i).sort((i, j)=>p[j] - p[i]), top = order[0], sec = order[1], cls = H.classes[top];
    const probs = {}; H.classes.forEach((c, i)=>probs[c] = +p[i].toFixed(3));
    return { cls, prob: p[top], margin: p[top] - p[sec], ok: cls !== 'other' && p[top] >= H.threshold && p[top] - p[sec] >= H.margin, probs };
  }
  return { load, classify };
})();
