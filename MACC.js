(function () {

  /* ===== Template (modebar right in Shadow DOM) ===== */
  const template = document.createElement("template");
  template.innerHTML = `
    <style>
      :host { display:block; width:100%; height:100%; }
      #macc-container {
        width:100%;
        height:100%;
        position:relative;
        pointer-events:auto; 
      }
      #macc-container .modebar {
        right: 6px !important;
        left: auto !important;
        top: 6px !important;
      }
    </style>
    <div id="macc-container"></div>
  `;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt0  = (n) => Number(n).toLocaleString(undefined, {maximumFractionDigits:0});

  function posMacGradient(mac, maxPos) {
    const t = maxPos > 0 ? clamp(mac / maxPos, 0, 1) : 0;
    const stops = [
      [0,   [245,215,110]],
      [0.6, [243,156,18]],
      [1.0, [231,76,60]]
    ];
    let c0 = stops[0], c1 = stops[stops.length-1];
    for (let i=0;i<stops.length-1;i++){
      if (t>=stops[i][0] && t<=stops[i+1][0]) { c0=stops[i]; c1=stops[i+1]; break; }
    }
    const span = (c1[0]-c0[0])||1e-6;
    const lt   = (t - c0[0])/span;
    const r = Math.round(c0[1][0] + lt*(c1[1][0]-c0[1][0]));
    const g = Math.round(c0[1][1] + lt*(c1[1][1]-c0[1][1]));
    const b = Math.round(c0[1][2] + lt*(c1[1][2]-c0[1][2]));
    return `rgb(${r},${g},${b})`;
  }

  class VariableWidthMACC extends HTMLElement {
    constructor() {
      super();

      this._shadow = this.attachShadow({mode:"open"});
      this._shadow.appendChild(template.content.cloneNode(true));
      this._container = this._shadow.querySelector("#macc-container");

      this._initialized = false;
      this._plotted     = false;

      this._data = { project:[], abatement:[], mac:[] };

      this._style = {
        widthCap  : 10,
        minWidth  : 0.2,
        xPadding  : 5,
        fontSize  : 12,
        colorMode : "gradient"
      };

      console.log("[MACC] v1.1.0 loaded");

      if (typeof Plotly === "undefined") {
        const s = document.createElement("script");
        s.src   = "https://cdn.plot.ly/plotly-2.27.0.min.js";
        s.async = false;
        s.onload = () => { this._initialized = true; this._render(); };
        document.head.appendChild(s);
      } else {
        this._initialized = true;
      }

      this._resizeObserver = new (window.ResizeObserver||class { observe(){} disconnect(){} })(
        () => { if (this._initialized && this._plotted) { try { Plotly.Plots.resize(this._container); } catch(_){} } }
      );
    }

    connectedCallback(){ try { this._resizeObserver.observe(this._container); } catch(_){} }
    disconnectedCallback(){ try { this._resizeObserver.disconnect(); } catch(_){} }

    getDataBindings() {
      return {
        maccBinding: {
          feeds: [
            {id:"dimension",     type:"dimension"},
            {id:"measure_abate", type:"mainStructureMember"},
            {id:"measure_mac",   type:"mainStructureMember"}
          ]
        }
      };
    }

    set widthCap(v){  this._style.widthCap  = Number(v)||10;  this._render(); }
    set minWidth(v){  this._style.minWidth  = Number(v)||0.2; this._render(); }
    set xPadding(v){  this._style.xPadding  = Number(v)||5;   this._render(); }
    set fontSize(v){  this._style.fontSize  = Number(v)||12;  this._render(); }
    set colorMode(v){ this._style.colorMode = v||"gradient";  this._render(); }

    onCustomWidgetBeforeUpdate(p){ this._applyProps(p); }
    onCustomWidgetAfterUpdate(p){  this._applyProps(p); }

    _applyProps(p){
      if (!p) return;
      if ("maccBinding" in p) this._ingestBinding(p.maccBinding);
      ["widthCap","minWidth","xPadding","fontSize","colorMode"].forEach(k=>{
        if (k in p) this[k] = p[k];
      });
    }

    onCustomWidgetResize(){
      if (this._initialized && this._plotted){
        try { Plotly.Plots.resize(this._container); } catch(_){}
      }
    }

    /* ============================
       SAFE BINDING INGESTION
    =============================== */
    _ingestBinding(binding){
      try {
        if (!binding) { this._setEmpty("Bind Project + Abatement + MAC."); return; }

        const rows = binding.data || binding.value || binding.resultSet || binding.rows || [];
        if (!Array.isArray(rows) || rows.length===0) { this._setEmpty("No rows. Check filters."); return; }

        const md    = binding.metadata || {};
        const feeds = md.feeds || {};
        const findByType = (t)=>Object.keys(feeds).find(k => (feeds[k] && String(feeds[k].type).toLowerCase()===t));

        const dimId = feeds.dimension     ? "dimension"     : (findByType("dimension")||"dimension");
        const abId  = feeds.measure_abate ? "measure_abate" : (Object.keys(feeds).find(k=>/abate/i.test(k))||findByType("mainstructuremember"));
        const macId = feeds.measure_mac   ? "measure_mac"   : (Object.keys(feeds).find(k=>/\bmac\b/i.test(k))||findByType("mainstructuremember"));

        const dimKey = `${dimId}_0`;
        const abKey  = `${abId}_0`;
        const macKey = `${macId}_0`;

        const getNum = (obj)=>{
          if (obj==null) return NaN;
          if (typeof obj==="number") return obj;
          if (typeof obj.raw==="number") return obj.raw;
          if (typeof obj.value==="number")return obj.value;
          if (obj.formatted){
            const x=Number(String(obj.formatted).replace(/[^\d.\-]/g,""));
            return Number.isFinite(x)?x:NaN;
          }
          const x=Number(obj);
          return Number.isFinite(x)?x:NaN;
        };

        const proj=[], ab=[], mc=[];
        for (const r of rows) {
          const d = r[dimKey] ||
                    (Array.isArray(r.dimensions)&&r.dimensions[0]) ||
                    r.dimensions_0 || {};
          const label = d.description ?? d.text ?? d.label ?? d.id ?? "";
          const abObj = r[abKey]  ?? (Array.isArray(r.measures)?r.measures[0]:r.measures_0);
          const mcObj = r[macKey] ?? (Array.isArray(r.measures)?r.measures[1]:r.measures_1);

          proj.push(String(label));
          ab.push(getNum(abObj));
          mc.push(getNum(mcObj));
        }

        this._data.project   = proj;
        this._data.abatement = ab.map(x => Number.isFinite(x)?x:0);
        this._data.mac       = mc.map(x => Number.isFinite(x)?x:0);
        this._render();
      } catch (e) {
        console.error("[MACC] ingest error:", e);
        this._setEmpty("Binding error. See console.");
      }
    }

    _setEmpty(msg){
      this._container.innerHTML =
        `<div style="font:12px var(--sapFontFamily,Arial); color:#666; padding:8px;">${msg}</div>`;
      this._plotted=false;
    }

    /* ============================
       RENDER (with tooltip fixes)
    =============================== */
    _render(){
      if (!this._initialized || !this._container) return;

      const P = this._data.project, 
            A = this._data.abatement, 
            M = this._data.mac;

      if (P.length===0) { this._setEmpty("No data."); return; }
      if (A.length!==P.length || M.length!==P.length) { this._setEmpty("Row mismatch."); return; }

      let rows=[];
      for (let i=0;i<P.length;i++) rows.push({Project:P[i], Abatement:A[i], MAC:M[i]});
      rows.sort((a,b)=>a.MAC-b.MAC);

      const total = rows.reduce((s,r)=>s+(r.Abatement||0),0);
      if (total<=0){ this._setEmpty("No abatement > 0."); return; }

      const capPct = clamp(this._style.widthCap,1,50)/100;
      const minPct = clamp(this._style.minWidth,0.05,5)/100;
      const padPct = clamp(this._style.xPadding,0,20)/100;
      const fsize  = clamp(this._style.fontSize,8,24);

      const capLim = total*capPct;
      const minLim = total*minPct;

      rows = rows.map(r => ({...r, AbateShown: clamp(r.Abatement, minLim, capLim)}));

      const pxMin = 12;
      const pxToAb = total / Math.max(1,this._container.clientWidth);
      rows = rows.map(r => ({...r, AbateShown: Math.max(r.AbateShown, pxMin*pxToAb)}));

      let cum=0;
      rows = rows.map(r=>{
        const xs=cum, xe=cum+r.AbateShown; cum=xe;
        return {...r, x_mid:(xs+xe)/2, CumShown:xe};
      });

      const maxCum = cum;
      const maxPos = Math.max(0,...rows.map(r=>r.MAC));
      const maxAbs = Math.max(1,...rows.map(r=>Math.abs(r.MAC)));

      const colors = (this._style.colorMode==="single")
        ? rows.map(r=> (r.MAC<0 ? "#27ae60" : "#E67E22"))
        : rows.map(r=> (r.MAC<0 ? "#27ae60" : posMacGradient(r.MAC, maxPos)));

      /* --- FILTER-SAFE customdata (CRITICAL FOR HOVER) --- */
      const tooltipData = rows.map(r => ({
        project: String(r.Project || ""),
        abate  : Number(r.Abatement || 0),
        width  : Number(r.AbateShown || 0)
      }));

      const barTrace = {
        type:"bar",
        x:rows.map(r=>r.x_mid),
        y:rows.map(r=>r.MAC),
        width:rows.map(r=>r.AbateShown),
        marker:{ color:colors, line:{ color:"rgba(0,0,0,0.25)", width:1 } },

        customdata: tooltipData,

        /* --- SAC-SAFE TEMPLATE (NO :,.* formatting) --- */
        hovertemplate:
          "<b>%{customdata.project}</b><br>"+
          "MAC: %{y} EUR/tCO₂e<br>"+
          "Abatement: %{customdata.abate} tCO₂e<br>"+
          "Width: %{customdata.width} tCO₂e<extra></extra>",

        hoverlabel:{
          bgcolor:"white",
          bordercolor:"#444",
          font:{size:fsize}
        }
      };

      const pad = Math.max(pxMin*pxToAb, maxCum*padPct);
      const xRange = [-pad, maxCum+pad];

      const layout = {
        margin:{t:36,l:76,r:30,b:64},
        showlegend:false,
        hovermode:"closest",
        xaxis:{
          title:"Total Abatement (tCO₂e)",
          type:"linear",
          range:xRange,
          tickformat:"~s",
          tickfont:{size:fsize},
          titlefont:{size:fsize},
          showline:true, mirror:true, gridcolor:"rgba(0,0,0,0.06)"
        },
        yaxis:{
          title:"MAC (EUR/tCO₂e)",
          range:[-maxAbs*1.2, maxAbs*1.2],
          tickfont:{size:fsize},
          titlefont:{size:fsize},
          showline:true, mirror:true, zeroline:true, gridcolor:"rgba(0,0,0,0.06)"
        },
        bargap:0,
        bargroupgap:0
      };

      const config = {
        responsive:true,
        displaylogo:false,
        displayModeBar:true,
        staticPlot:false
      };

      try {
        if (this._plotted) Plotly.react(this._container, [barTrace], layout, config);
        else {
          const p = Plotly.newPlot(this._container, [barTrace], layout, config);
          if (p && typeof p.then==="function") p.then(()=>this._plotted=true);
          else this._plotted=true;
        }
      } catch(_){}

      /* --- FORCE TOOLTIP HITBOX ALWAYS ACTIVE --- */
      setTimeout(()=>{
        try {
          const svg = this._container.querySelector(".main-svg");
          if (svg) svg.style.pointerEvents = "auto";
        } catch(_){}
        try { Plotly.Plots.resize(this._container); } catch(_){}
      },60);
    }
  }

  customElements.define("variable-width-macc", VariableWidthMACC);

})();
