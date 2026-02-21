import { useState, useMemo, useCallback, useRef } from "react";

const AXIS_MIN = -2;
const AXIS_MAX = 10;
const T_MIN = -1;
const T_MAX = 10;
const STEPS = 600;
const CHART_W = 500;
const CHART_H = 200;
const GRID_W = 1020;

// ── Custom palette ──
const C = {
  bg:         "#000000",
  card:       "#433455",
  cardBord:   "#666092",
  grid:       "#5d687240",
  zero:       "#6f6776",
  textMain:   "#c5ccb8",
  textDim:    "#9a9a97",
  textFaint:  "#6e6962",
  xSig:       "#6eaa78",     // sage green
  hSig:       "#7ca1c0",     // steel blue
  integ:      "#be955c",     // warm gold
  integFill:  "rgba(190,149,92,0.18)",
  result:     "#c28d75",     // terracotta
  accent:     "#68aca9",     // teal (slider, toggle)
  titleHi:    "#c38890",     // dusty rose (title accent)
  dropZone:   "#557064",     // dark sage
  dropActive: "#387080",     // deep teal
  dropBord:   "#7e9e9950",   // grey-teal
  chipStep:   "#38708040",   chipStepB:   "#38708070",
  chipRamp:   "#93a16740",   chipRampB:   "#93a16770",
  chipSin:    "#416aa340",   chipSinB:    "#416aa370",
  chipExp:    "#9a4f5040",   chipExpB:    "#9a4f5070",
  chipSpec:   "#8b558040",   chipSpecB:   "#8b558070",
  rose:       "#c38890",
  plum:       "#8b5580",
  mauve:      "#8d6268",
  lavender:   "#a593a5",
  indigo:     "#666092",
  khaki:      "#9d9f7f",
  olive:      "#93a167",
  brick:      "#9a4f50",
  deepTeal:   "#387080",
  blueMed:    "#416aa3",
};

const GROUP_COLORS = { step: C.chipStep, ramp: C.chipRamp, sin: C.chipSin, exp: C.chipExp, special: C.chipSpec };
const GROUP_BORDER = { step: C.chipStepB, ramp: C.chipRampB, sin: C.chipSinB, exp: C.chipExpB, special: C.chipSpecB };

function linspace(a, b, n) { const arr = []; for (let i = 0; i < n; i++) arr.push(a + (i / (n - 1)) * (b - a)); return arr; }
function intRange(a, b) { const arr = []; for (let i = a; i <= b; i++) arr.push(i); return arr; }

const SIGNALS = {
  unit_step:   { label: "u(t)",                     labelD: "u[n]",                     fn: t => t >= 0 ? 1 : 0,                                                fnD: n => n >= 0 ? 1 : 0,                              group: "step" },
  rect_pulse:  { label: "u(t) − u(t−3)",           labelD: "u[n] − u[n−3]",           fn: t => (t >= 0 && t < 3) ? 1 : 0,                                     fnD: n => (n >= 0 && n < 3) ? 1 : 0,                   group: "step" },
  linear_ramp: { label: "t·(u(t)−u(t−1))",         labelD: "n·(u[n]−u[n−3])",         fn: t => (t >= 0 && t < 1) ? t : 0,                                     fnD: n => (n >= 0 && n < 3) ? n : 0,                   group: "ramp" },
  sawtooth:    { label: "(t/3)·(u(t)−u(t−3))",     labelD: "(n/3)·(u[n]−u[n−3])",     fn: t => (t >= 0 && t < 3) ? t / 3 : 0,                                 fnD: n => (n >= 0 && n < 3) ? n / 3 : 0,               group: "ramp" },
  sin_step:    { label: "sin(t)·u(t)",              labelD: "sin(n)·u[n]",              fn: t => t >= 0 ? Math.sin(t) : 0,                                      fnD: n => n >= 0 ? Math.sin(n) : 0,                    group: "sin" },
  sin_pulse:   { label: "sin(t)·(u(t)−u(t−2π))",   labelD: "sin(n)·(u[n]−u[n−6])",   fn: t => (t >= 0 && t < 2 * Math.PI) ? Math.sin(t) : 0,                  fnD: n => (n >= 0 && n < 6) ? Math.sin(n) : 0,         group: "sin" },
  cos_pulse:   { label: "cos(t)·(u(t)−u(t−π))",    labelD: "cos(n)·(u[n]−u[n−3])",   fn: t => (t >= 0 && t < Math.PI) ? Math.cos(t) : 0,                      fnD: n => (n >= 0 && n < 3) ? Math.cos(n) : 0,         group: "sin" },
  exp_decay:   { label: "e⁻ᵗ·u(t)",               labelD: "0.8ⁿ·u[n]",               fn: t => t >= 0 ? Math.exp(-t) : 0,                                     fnD: n => n >= 0 ? Math.pow(0.8, n) : 0,               group: "exp" },
  damped_sin:  { label: "e⁻ᵗsin(t)·u(t)",         labelD: "0.8ⁿsin(n)·u[n]",         fn: t => t >= 0 ? Math.exp(-t) * Math.sin(t) : 0,                        fnD: n => n >= 0 ? Math.pow(0.8, n) * Math.sin(n) : 0, group: "exp" },
  impulse:     { label: "δ(t)",                     labelD: "δ[n]",                     fn: t => Math.abs(t) < 0.02 ? 25 : 0,                                   fnD: n => n === 0 ? 1 : 0, isImpulse: true,            group: "special" },
};
const SIGNAL_KEYS = Object.keys(SIGNALS);

function convolve(xFn, hFn, tVal, lo, hi, n) {
  const dt = (hi - lo) / (n - 1); let sum = 0;
  for (let i = 0; i < n; i++) { const tau = lo + i * dt; const v = xFn(tau) * hFn(tVal - tau); sum += (i === 0 || i === n - 1) ? v * 0.5 : v; }
  return sum * dt;
}
function convolveDiscrete(xFn, hFn, nVal, lo, hi) { let sum = 0; for (let k = lo; k <= hi; k++) sum += xFn(k) * hFn(nVal - k); return sum; }

function Chart({ data, xLabel, title, width = CHART_W, height = CHART_H,
  yMin: fYMin, yMax: fYMax, marker, colors,
  shaded, shadedColor, discrete = false, stemData, legend }) {

  const pad = { top: 28, right: 16, bottom: 40, left: 48 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const allY = data.flatMap(d => d.points.map(p => p.y));
  if (shaded) shaded.forEach(s => s.points.forEach(p => allY.push(p.y)));
  if (stemData) stemData.forEach(s => s.points.forEach(p => allY.push(p.y)));
  const dataYMin = Math.min(0, ...allY);
  const dataYMax = Math.max(0.5, ...allY);
  const yMin = fYMin !== undefined ? fYMin : dataYMin * 1.15 - 0.1;
  const yMax = fYMax !== undefined ? fYMax : dataYMax * 1.15;
  const sx = x => pad.left + ((x - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * w;
  const sy = y => pad.top + ((yMax - y) / (yMax - yMin)) * h;
  const toPath = pts => pts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(" ");
  const toArea = pts => { if (!pts.length) return ""; return toPath(pts) + `L${sx(pts[pts.length-1].x).toFixed(2)},${sy(0).toFixed(2)} L${sx(pts[0].x).toFixed(2)},${sy(0).toFixed(2)} Z`; };
  const yTicks = [];
  const yRange = yMax - yMin;
  const yStep = yRange <= 1.5 ? 0.25 : yRange <= 3 ? 0.5 : yRange <= 6 ? 1 : yRange <= 12 ? 2 : 5;
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax + 0.001; v += yStep) yTicks.push(v);
  const xTicks = [];
  for (let v = Math.ceil(AXIS_MIN); v <= AXIS_MAX + 0.001; v += 1) xTicks.push(v);
  const uid = title.replace(/[^a-zA-Z0-9]/g, "") + width;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        <defs><clipPath id={`c-${uid}`}><rect x={pad.left} y={pad.top} width={w} height={h} /></clipPath></defs>
        <text x={pad.left} y={16} fill={C.textMain} fontSize="16" fontWeight="700" fontFamily="'DM Serif Display',serif">{title}</text>
        {yTicks.map(v => (
          <g key={`y${v}`}>
            <line x1={pad.left} x2={pad.left+w} y1={sy(v)} y2={sy(v)} stroke={C.grid} />
            <text x={pad.left-8} y={sy(v)+4} fill={C.textDim} fontSize="11" fontWeight="500" textAnchor="end" fontFamily="'DM Sans',sans-serif">{Math.abs(v)<0.001?"0":v%1===0?v:v.toFixed(1)}</text>
          </g>
        ))}
        {xTicks.map(v => (
          <g key={`x${v}`}>
            <line x1={sx(v)} x2={sx(v)} y1={pad.top} y2={pad.top+h} stroke={C.grid} />
            <text x={sx(v)} y={pad.top+h+14} fill={C.textDim} fontSize="11" fontWeight="500" textAnchor="middle" fontFamily="'DM Sans',sans-serif">{v}</text>
          </g>
        ))}
        {yMin<0&&yMax>0&&<line x1={pad.left} x2={pad.left+w} y1={sy(0)} y2={sy(0)} stroke={C.zero} strokeWidth="1.5"/>}
        {AXIS_MIN<0&&<line x1={sx(0)} x2={sx(0)} y1={pad.top} y2={pad.top+h} stroke={C.zero} strokeWidth="1.5"/>}
        <g clipPath={`url(#c-${uid})`}>
          {shaded?.map((s,i)=><path key={`sh${i}`} d={toArea(s.points)} fill={shadedColor||C.integFill}/>)}
          {!discrete&&data.map((d,i)=>(<path key={i} d={toPath(d.points)} fill="none" stroke={colors?.[i]||C.xSig} strokeWidth="2.5" strokeLinecap="round"/>))}
          {discrete&&stemData?.map((s,si)=>(
            <g key={`stem-${si}`}>
              <path d={toPath(s.points)} fill="none" stroke={colors?.[si]||C.xSig} strokeWidth="1.5" strokeDasharray="3,4" opacity="0.4"/>
              {s.points.map((p,pi)=>(<g key={`s${si}-${pi}`}><line x1={sx(p.x)} x2={sx(p.x)} y1={sy(0)} y2={sy(p.y)} stroke={colors?.[si]||C.xSig} strokeWidth="2" opacity="0.7"/><circle cx={sx(p.x)} cy={sy(p.y)} r="3.5" fill={colors?.[si]||C.xSig} stroke={C.bg} strokeWidth="1.5"/></g>))}
            </g>
          ))}
          {marker&&(<g><line x1={sx(marker.x)} x2={sx(marker.x)} y1={pad.top} y2={pad.top+h} stroke={marker.color} strokeWidth="1" strokeDasharray="4,3" opacity="0.4"/><circle cx={sx(marker.x)} cy={sy(marker.y)} r="5" fill={marker.color} stroke={C.bg} strokeWidth="2"/></g>)}
        </g>
        <text x={pad.left+w/2} y={height-4} fill={C.textDim} fontSize="12" fontWeight="600" textAnchor="middle" fontFamily="'DM Sans',sans-serif">{xLabel}</text>
        <rect x={pad.left} y={pad.top} width={w} height={h} fill="none" stroke={C.cardBord} strokeWidth="1.5" rx="1"/>
      </svg>
      {legend && <div style={{display:"flex",gap:14,justifyContent:"center",padding:"4px 0 2px",flexWrap:"wrap"}}>{legend}</div>}
    </div>
  );
}

function SignalChip({ sigKey, discrete, isDragging, onDragStart, onTouchStart, onClick }) {
  const sig = SIGNALS[sigKey]; const grp = sig.group;
  return (
    <div draggable onDragStart={e=>{e.dataTransfer.setData("text/plain",sigKey);onDragStart?.(sigKey);}}
      onTouchStart={()=>onTouchStart?.(sigKey)} onClick={()=>onClick?.(sigKey)}
      style={{
        padding:"6px 14px",borderRadius:3,cursor:"grab",
        background:GROUP_COLORS[grp],border:`1px solid ${GROUP_BORDER[grp]}`,
        fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif",
        color:C.textMain,whiteSpace:"nowrap",userSelect:"none",
        opacity:isDragging?0.4:1,transition:"opacity 0.15s",touchAction:"none",
      }}>{discrete?sig.labelD:sig.label}</div>
  );
}

function DropZone({ label, color, sigKey, discrete, onDrop, onSelect, isOver }) {
  const sig = SIGNALS[sigKey];
  return (
    <div onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="copy";}}
      onDrop={e=>{e.preventDefault();const k=e.dataTransfer.getData("text/plain");if(SIGNALS[k])onDrop(k);}}
      style={{
        display:"flex",alignItems:"center",gap:10,
        background:isOver?`${C.cardBord}`:`${C.card}90`,
        border:`2px dashed ${isOver?color:`${C.cardBord}60`}`,
        borderRadius:3,padding:"8px 14px",transition:"all 0.15s",
        width:"100%",boxSizing:"border-box",minWidth:0,
      }}>
      <span style={{color,fontWeight:700,fontSize:18,fontFamily:"'DM Serif Display',serif",whiteSpace:"nowrap",flexShrink:0}}>{label}</span>
      <span style={{color:C.textFaint,fontSize:13,flexShrink:0}}>=</span>
      <div style={{padding:"4px 8px",borderRadius:2,background:`${color}18`,border:`1px solid ${color}35`,fontSize:13,fontWeight:600,color:C.textMain,fontFamily:"'DM Sans',sans-serif",minHeight:24,display:"flex",alignItems:"center",whiteSpace:"nowrap",flexShrink:0}}>
        {discrete?sig.labelD:sig.label}
      </div>
      <select value={sigKey} onChange={e=>onSelect(e.target.value)}
        style={{flex:"1 1 auto",minWidth:0,padding:"6px 10px",background:C.card,color:C.lavender,border:`1px solid ${C.cardBord}`,borderRadius:3,cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif",boxSizing:"border-box",overflow:"hidden",textOverflow:"ellipsis"}}>
        <option value="" disabled>Select equation</option>
        {SIGNAL_KEYS.map(k=>(<option key={k} value={k}>{discrete?SIGNALS[k].labelD:SIGNALS[k].label}</option>))}
      </select>
    </div>
  );
}

export default function ConvolutionDemo() {
  const [t,setT]=useState(1.5);
  const [n,setN]=useState(4);
  const [xKey,setXKey]=useState("exp_decay");
  const [hKey,setHKey]=useState("rect_pulse");
  const [discrete,setDiscrete]=useState(false);
  const [dragging,setDragging]=useState(null);
  const [overX,setOverX]=useState(false);
  const [overH,setOverH]=useState(false);
  const [touchDrag,setTouchDrag]=useState(null);

  const xFn=SIGNALS[xKey].fn,hFn=SIGNALS[hKey].fn;
  const xFnD=SIGNALS[xKey].fnD,hFnD=SIGNALS[hKey].fnD;
  const tauPts=useMemo(()=>linspace(AXIS_MIN,AXIS_MAX,STEPS),[]);
  const tPts=useMemo(()=>linspace(AXIS_MIN,AXIS_MAX,STEPS),[]);
  const nRange=useMemo(()=>intRange(AXIS_MIN,AXIS_MAX),[]);

  const xOrigC=useMemo(()=>tauPts.map(v=>({x:v,y:xFn(v)})),[tauPts,xFn]);
  const hOrigC=useMemo(()=>tauPts.map(v=>({x:v,y:hFn(v)})),[tauPts,hFn]);
  const xOrigD=useMemo(()=>nRange.map(k=>({x:k,y:xFnD(k)})),[nRange,xFnD]);
  const hOrigD=useMemo(()=>nRange.map(k=>({x:k,y:hFnD(k)})),[nRange,hFnD]);

  const xTauC=useMemo(()=>tauPts.map(tau=>({x:tau,y:xFn(tau)})),[tauPts,xFn]);
  const hFlipC=useMemo(()=>tauPts.map(tau=>({x:tau,y:hFn(t-tau)})),[tauPts,hFn,t]);
  const prodC=useMemo(()=>tauPts.map(tau=>({x:tau,y:xFn(tau)*hFn(t-tau)})),[tauPts,xFn,hFn,t]);
  const shadedC=useMemo(()=>{const p=prodC.filter(p=>Math.abs(p.y)>1e-9);return p.length>1?[{points:p}]:[];},[prodC]);
  const yFullC=useMemo(()=>tPts.map(tv=>({x:tv,y:convolve(xFn,hFn,tv,-10,20,1500)})),[tPts,xFn,hFn]);
  const yDrawnC=useMemo(()=>yFullC.filter(p=>p.x<=t),[yFullC,t]);
  const curYC=useMemo(()=>{const idx=yFullC.findIndex(p=>p.x>=t);if(idx<=0)return yFullC[0]?.y??0;const a=yFullC[idx-1],b=yFullC[idx];return a.y+((t-a.x)/(b.x-a.x))*(b.y-a.y);},[yFullC,t]);

  const xStemD=useMemo(()=>nRange.map(k=>({x:k,y:xFnD(k)})),[nRange,xFnD]);
  const hFlipD=useMemo(()=>nRange.map(k=>({x:k,y:hFnD(n-k)})),[nRange,hFnD,n]);
  const prodD=useMemo(()=>nRange.map(k=>({x:k,y:xFnD(k)*hFnD(n-k)})),[nRange,xFnD,hFnD,n]);
  const yFullD=useMemo(()=>nRange.map(nv=>({x:nv,y:convolveDiscrete(xFnD,hFnD,nv,-20,30)})),[nRange,xFnD,hFnD]);
  const yDrawnD=useMemo(()=>yFullD.filter(p=>p.x<=n),[yFullD,n]);
  const curYD=useMemo(()=>yFullD.find(p=>p.x===n)?.y??0,[yFullD,n]);

  const ym=(arr,pad=0.1)=>{const vals=arr.map(p=>p.y);return[Math.min(0,...vals)*1.15-pad,Math.max(0.5,...vals)*1.15+pad*0.5];};
  const [origXYMin,origXYMax]=useMemo(()=>ym(discrete?xOrigD:xOrigC),[discrete,xOrigC,xOrigD]);
  const [origHYMin,origHYMax]=useMemo(()=>ym(discrete?hOrigD:hOrigC),[discrete,hOrigC,hOrigD]);
  const slideAll=useMemo(()=>discrete?[...xStemD,...hFlipD]:[...xTauC,...hFlipC],[discrete,xStemD,hFlipD,xTauC,hFlipC]);
  const [slideYMin,slideYMax]=useMemo(()=>ym(slideAll),[slideAll]);
  const [integYMin,integYMax]=useMemo(()=>ym(discrete?prodD:prodC),[discrete,prodD,prodC]);
  const [resYMin,resYMax]=useMemo(()=>ym(discrete?yFullD:yFullC),[discrete,yFullD,yFullC]);

  const currentVal=discrete?n:t;
  const currentY=discrete?curYD:curYC;
  const paramLabel=discrete?"n":"t";

  const handleTouchEnd=useCallback((e)=>{
    if(!touchDrag)return;
    const touch=e.changedTouches[0];
    const el=document.elementFromPoint(touch.clientX,touch.clientY);
    if(el){const zone=el.closest?.("[data-dropzone]");if(zone){const target=zone.getAttribute("data-dropzone");if(target==="x")setXKey(touchDrag);if(target==="h")setHKey(touchDrag);}}
    setTouchDrag(null);
  },[touchDrag]);

  const combSrc=discrete?[...xStemD,...hFlipD,...prodD,...yFullD]:[...xTauC,...hFlipC,...prodC,...yFullC];
  const [combYMin,combYMax]=useMemo(()=>[Math.min(0,...combSrc.map(p=>p.y))*1.15-0.1,Math.max(1,...combSrc.map(p=>p.y))*1.2],[combSrc]);

  const L=(c,txt)=><span key={txt} style={{fontSize:12,fontWeight:600,color:c}}>{txt}</span>;

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.textMain,fontFamily:"'DM Sans',sans-serif",padding:"28px 16px",display:"flex",flexDirection:"column",alignItems:"center"}}
      onTouchEnd={handleTouchEnd} onDragEnd={()=>{setDragging(null);setOverX(false);setOverH(false);}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet"/>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body, #root { background: ${C.bg}; min-height: 100vh; }
        input[type="range"]{-webkit-appearance:none;appearance:none;background:${C.indigo};border-radius:4px;height:5px;outline:none}
        input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:${C.accent};border:2px solid ${C.bg};cursor:pointer;box-shadow:0 0 12px ${C.accent}40}
        input[type="range"]::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:${C.accent};border:2px solid ${C.bg};cursor:pointer}
      `}</style>

      <div style={{textAlign:"center",marginBottom:18}}>
        <h1 style={{fontSize:36,fontWeight:700,color:C.textMain,margin:0,fontFamily:"'DM Serif Display',serif"}}>
          Convolution <span style={{color:C.titleHi}}>Visualizer</span>
        </h1>
      </div>

      {/* Chip tray */}
      <div style={{background:`${C.card}90`,border:`1px solid ${C.cardBord}60`,borderRadius:3,padding:"10px 16px",marginBottom:8,width:"100%",maxWidth:GRID_W}}>
        <div style={{fontSize:13,color:C.lavender,marginBottom:6,fontWeight:800}}>Drag a signal into x(t) or h(t)</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {SIGNAL_KEYS.map(k=>(<SignalChip key={k} sigKey={k} discrete={discrete} isDragging={dragging===k||touchDrag===k}
            onDragStart={setDragging} onTouchStart={setTouchDrag}
            onClick={key=>{if(xKey===key)setHKey(key);else setXKey(key);}}/>))}
        </div>
      </div>

      {/* Drop zones + toggle */}
      <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap",justifyContent:"center",alignItems:"stretch",width:"100%",maxWidth:GRID_W}}>
        <div data-dropzone="x" style={{flex:"1 1 0",minWidth:280}}
          onDragOver={e=>{e.preventDefault();setOverX(true);}} onDragLeave={()=>setOverX(false)}
          onDrop={e=>{e.preventDefault();const k=e.dataTransfer.getData("text/plain");if(SIGNALS[k])setXKey(k);setOverX(false);setDragging(null);}}>
          <DropZone label={discrete?"x[n]":"x(t)"} color={C.xSig} sigKey={xKey} discrete={discrete} onDrop={setXKey} onSelect={setXKey} isOver={overX}/>
        </div>
        <div data-dropzone="h" style={{flex:"1 1 0",minWidth:280}}
          onDragOver={e=>{e.preventDefault();setOverH(true);}} onDragLeave={()=>setOverH(false)}
          onDrop={e=>{e.preventDefault();const k=e.dataTransfer.getData("text/plain");if(SIGNALS[k])setHKey(k);setOverH(false);setDragging(null);}}>
          <DropZone label={discrete?"h[n]":"h(t)"} color={C.hSig} sigKey={hKey} discrete={discrete} onDrop={setHKey} onSelect={setHKey} isOver={overH}/>
        </div>
        <div style={{display:"flex",gap:0,alignSelf:"stretch"}}>
          {["Continuous","Discrete"].map((lb,i)=>{
            const active=(i===0&&!discrete)||(i===1&&discrete);
            return(<button key={lb} onClick={()=>setDiscrete(i===1)} style={{padding:"8px 22px",fontSize:14,fontWeight:600,fontFamily:"'DM Sans',sans-serif",background:active?C.cardBord:`${C.card}90`,color:active?C.textMain:C.lavender,border:`1px solid ${C.cardBord}`,borderRadius:i===0?"3px 0 0 3px":"0 3px 3px 0",cursor:"pointer",transition:"all 0.15s"}}>{lb}</button>);
          })}
        </div>
      </div>

      {/* Slider */}
      <div style={{background:`${C.card}90`,border:`1px solid ${C.cardBord}60`,borderRadius:3,padding:"12px 20px",marginBottom:12,width:"100%",maxWidth:GRID_W}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8,flexWrap:"wrap",gap:6}}>
          <span style={{fontSize:16,color:C.lavender,fontFamily:"'DM Serif Display',serif",fontWeight:700}}>{discrete?"Sample index":"Time shift"}</span>
          <div style={{display:"flex",alignItems:"baseline",gap:8}}>
            <span style={{fontSize:28,fontWeight:700,color:C.textMain,fontFamily:"'DM Serif Display',serif"}}>{paramLabel} = {discrete?n:t.toFixed(2)}</span>
          </div>
        </div>
        {discrete
          ?<input type="range" min={Math.ceil(T_MIN)} max={Math.floor(T_MAX)} step={1} value={n} onChange={e=>setN(parseInt(e.target.value))} style={{width:"100%",cursor:"pointer"}}/>
          :<input type="range" min={T_MIN} max={T_MAX} step={0.01} value={t} onChange={e=>setT(parseFloat(e.target.value))} style={{width:"100%",cursor:"pointer"}}/>
        }
        <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
          <span style={{fontSize:11,fontWeight:500,color:C.textFaint}}>{discrete?Math.ceil(T_MIN):T_MIN}</span>
          <span style={{fontSize:11,fontWeight:500,color:C.textFaint}}>{discrete?Math.floor(T_MAX):T_MAX}</span>
        </div>
      </div>

      {/* 2-column grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,width:"100%",maxWidth:GRID_W,alignItems:"stretch"}}>

        {/* Row 1: Original x(t) | Original h(t) */}
        <div style={{background:`${C.card}90`,border:`1px solid ${C.cardBord}60`,borderRadius:3,padding:"10px 12px 4px",display:"flex",flexDirection:"column"}}>
          <Chart title={discrete?"x[n]":"x(t)"} xLabel={discrete?"n":"t"}
            data={discrete?[{points:[]}]:[{points:xOrigC}]}
            stemData={discrete?[{points:xOrigD}]:undefined}
            discrete={discrete} colors={[C.xSig]} yMin={origXYMin} yMax={origXYMax}
            legend={[L(C.xSig,`━ ${discrete?SIGNALS[xKey].labelD:SIGNALS[xKey].label}`)]}/>
        </div>
        <div style={{background:`${C.card}90`,border:`1px solid ${C.cardBord}60`,borderRadius:3,padding:"10px 12px 4px",display:"flex",flexDirection:"column"}}>
          <Chart title={discrete?"h[n]":"h(t)"} xLabel={discrete?"n":"t"}
            data={discrete?[{points:[]}]:[{points:hOrigC}]}
            stemData={discrete?[{points:hOrigD}]:undefined}
            discrete={discrete} colors={[C.hSig]} yMin={origHYMin} yMax={origHYMax}
            legend={[L(C.hSig,`━ ${discrete?SIGNALS[hKey].labelD:SIGNALS[hKey].label}`)]}/>
        </div>

        {/* Row 2: Sliding view | Integrand */}
        <div style={{background:`${C.card}90`,border:`1px solid ${C.cardBord}60`,borderRadius:3,padding:"10px 12px 4px",display:"flex",flexDirection:"column"}}>
          <Chart title={discrete?"x[k] and h[n−k]":"x(τ) and h(t−τ)"} xLabel={discrete?"k":"τ"}
            data={discrete?[{points:[]},{points:[]}]:[{points:xTauC},{points:hFlipC}]}
            stemData={discrete?[{points:xStemD},{points:hFlipD}]:undefined}
            discrete={discrete} colors={[C.xSig,C.hSig]} yMin={slideYMin} yMax={slideYMax}
            legend={[L(C.xSig,discrete?"━ x[k]":"━ x(τ)"),L(C.hSig,discrete?"━ h[n−k]":"━ h(t−τ)")]}/>
        </div>
        <div style={{background:`${C.card}90`,border:`1px solid ${C.cardBord}60`,borderRadius:3,padding:"10px 12px 4px",display:"flex",flexDirection:"column"}}>
          <Chart title="Integrand" xLabel={discrete?"k":"τ"}
            data={discrete?[{points:[]}]:[{points:prodC}]}
            stemData={discrete?[{points:prodD}]:undefined}
            discrete={discrete} shaded={!discrete?shadedC:undefined} shadedColor={C.integFill}
            colors={[C.integ]} yMin={integYMin} yMax={integYMax}
            legend={[L(C.integ,discrete?"━ x[k]·h[n−k]":"━ x(τ)·h(t−τ)"),L(`${C.integ}60`,discrete?"Σ sum":"█ ∫ region")]}/>
        </div>

        {/* Row 3: Result | Combined */}
        <div style={{background:`${C.card}90`,border:`1px solid ${C.cardBord}60`,borderRadius:3,padding:"10px 12px 4px",display:"flex",flexDirection:"column"}}>
          <Chart title={discrete?"Result · y[n]":"Result · y(t)"} xLabel={discrete?"n":"t"}
            data={discrete?[{points:[]}]:[{points:yDrawnC}]}
            stemData={discrete?[{points:yDrawnD}]:undefined}
            discrete={discrete} colors={[C.result]}
            marker={{x:currentVal,y:currentY,color:C.result}}
            yMin={resYMin} yMax={resYMax}
            legend={[L(C.result,discrete?"━ y[n]":"━ y(t)")]}/>
        </div>
        <div style={{background:`${C.card}90`,border:`1px solid ${C.cardBord}60`,borderRadius:3,padding:"10px 12px 4px",display:"flex",flexDirection:"column"}}>
          <Chart title="Combined View" xLabel={discrete?"n / k":"t / τ"}
            data={discrete?[{points:[]},{points:[]},{points:[]},{points:[]}]:[{points:xTauC},{points:hFlipC},{points:prodC},{points:yDrawnC}]}
            stemData={discrete?[{points:xStemD},{points:hFlipD},{points:prodD},{points:yDrawnD}]:undefined}
            discrete={discrete} colors={[C.xSig,C.hSig,C.integ,C.result]}
            marker={{x:currentVal,y:currentY,color:C.result}}
            yMin={combYMin} yMax={combYMax}
            legend={[L(C.xSig,discrete?"━ x[k]":"━ x(τ)"),L(C.hSig,discrete?"━ h[n−k]":"━ h(t−τ)"),L(C.integ,discrete?"━ prod":"━ integ"),L(C.result,discrete?"━ y[n]":"━ y(t)")]}/>
        </div>
      </div>
    </div>
  );
}
