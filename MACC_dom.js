(function () {

  // ============================================================================
  //  VARIABLE WIDTH MACC — v1.7.6 (Stable Container Version)
  //  - Dynamic tooltip (Category, CumAbate, NPV, Capex, Opex)
  //  - Stable rendering pipeline for SAC Responsive Layout
  //  - Debounced resize + delayed Plotly render to prevent distortion
  //  - Linked Analysis compatible (safe fallback if disabled)
  // ============================================================================

  const template = document.createElement("template");
  (function buildTemplate() {
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      :host { display:block; width:100%; height:100%; }

      #macc-container {
        width:100%;
        height:100%;
        position:relative;
        pointer-events:auto !important;
        z-index: 5;
        overflow: hidden;
      }

      #macc-container, #macc-container * { pointer-events:auto !important; }
    `;

    const root = document.createElement("div");
    root.id = "macc-container";

    template.content.appendChild(styleEl);
    template.content.appendChild(root);
  })();

  // ---------- Helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const macColor = (v) => {
    if (v < 0) return "rgba(39,174,96,0.95)";
    if (v < 25) return "rgba(241,196,15,0.95)";
    if (v < 50) return "rgba(230,126,34,0.95)";
    return "rgba(231,76,60,0.95)";
  };

  const dimSlot = (r, idx) => r?.[`dimension_${idx}`] || null;
  const meas = (r, id) => {
    const v = r?.[`${id}_0`];
    return (typeof v === "object" ? v.raw : v);
  };

  function detectDimTechId(binding, rows) {
    try {
      const md = binding?.metadata?.dimensions;
      if (md?.dimension_0?.id) return String(md.dimension_0.id);
      if (Array.isArray(md) && md[0]?.id) return String(md[0].id);
    } catch {}

    try {
      const d0 = rows?.[0]?.dimension_0;
      if (d0?.dimensionId) return d0.dimensionId;
      if (d0?.id) return d0.id;
    } catch {}

    return "Project_ID";
  }

  // Load Plotly
  function ensurePlotly() {
    if (window.Plotly?.newPlot) return Promise.resolve();
    if (window.__maccPlotlyLoading) return window.__maccPlotlyLoading;

    window.__maccPlotlyLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.plot.ly/plotly-2.27.0.min.js";
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return window.__maccPlotlyLoading;
  }

  class VariableWidthMACC extends HTMLElement {

    constructor() {
      super();

      this._shadow = this.attachShadow({ mode: "open" });
      this._shadow.appendChild(template.content.cloneNode(true));
      this._container = this._shadow.querySelector("#macc-container");

      this._initialized = false;
      this._plotted = false;
      this._pendingRender = false;

      this._props = {};
      this._data  = { project: [], abatement: [], mac: [], extra: [] };

      this._style = {
        widthCap: 10,
        minWidth: 0.2,
        xPadding: 5,
        fontSize: 12
      };

      this._dimTechId = null;

      this._resizeObserver = new ResizeObserver(() => {
        this._debouncedResize();
      });

      ensurePlotly().then(() => {
        this._initialized = true;
        this._resizeObserver.observe(this._container);
        this._render();
      });

      // resize debouncing
      this._resizeTimer = null;
    }

    // ---------------- Resize Debounce ----------------
    _debouncedResize() {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this._render(true), 80);
    }

    // ---------------- Data Binding ----------------
    getDataBindings(){
      return {
        maccBinding:{
          feeds:[
            { id:"dimension",       type:"dimension" },
            { id:"dimension_cat",   type:"dimension" },

            { id:"measure_abate",   type:"mainStructureMember" },
            { id:"measure_mac",     type:"mainStructureMember" },

            { id:"measure_cum",     type:"mainStructureMember" },
            { id:"measure_npv",     type:"mainStructureMember" },
            { id:"measure_capex",   type:"mainStructureMember" },
            { id:"measure_opex",    type:"mainStructureMember" }
          ]
        }
      };
    }

    onCustomWidgetBeforeUpdate(p){ this._apply(p); }
    onCustomWidgetAfterUpdate(p){  this._apply(p); }

    _apply(props){
      if(!props) return;
      this._props = props;

      if("maccBinding" in props) this._ingest(props.maccBinding);

      ["widthCap","minWidth","xPadding","fontSize"].forEach(k=>{
        if(k in props) this[k] = props[k];
      });
    }

    // ---------------- INGEST ----------------
    _ingest(binding){
      try{
        const rows=binding?.data||[];
        if(!rows.length) return;

        this._dimTechId = detectDimTechId(binding, rows);

        const proj=[], ab=[], mc=[], ex=[];

        for(const r of rows){
          const d0   = dimSlot(r,0);
          const dCat = dimSlot(r,1);

          const memberValue  = d0?.uniqueName || d0?.id || d0?.label;
          const projectLabel = d0?.label || d0?.id;
          const key          = String(memberValue);

          proj.push({ label:projectLabel, key });
          ab.push(Number(meas(r,"measure_abate")) || 0);
          mc.push(Number(meas(r,"measure_mac"))   || 0);

          ex.push({
            cumulative : meas(r,"measure_cum"),
            npv        : meas(r,"measure_npv"),
            capex      : meas(r,"measure_capex"),
            opex       : meas(r,"measure_opex"),
            category   : dCat?.label ?? dCat?.id
          });
        }

        this._data = { project:proj, abatement:ab, mac:mc, extra:ex };
        this._render();

      }catch(e){
        console.error("Ingest error:", e);
      }
    }

    // ---------------- RENDER ----------------
    _render(isResize=false){
      if(!this._initialized) return;

      if (isResize && !this._plotted) return;

      const width  = this._container.clientWidth;
      const height = this._container.clientHeight;

      if (width < 80 || height < 80) {
        this._pendingRender = true;
        return;
      }
      if (this._pendingRender && !isResize) {
        this._pendingRender = false;
      }

      const P=this._data.project,
            A=this._data.abatement,
            M=this._data.mac;

      if(!P.length){
        this._container.innerHTML="No data";
        return;
      }

      let rows = P.map((p,i)=>({
        Project:p, Abate:A[i], MAC:M[i], extra:this._data.extra[i]
      }));

      rows.sort((a,b)=>a.MAC-b.MAC);

      const total = rows.reduce((s,r)=>s+r.Abate,0);

      const capPct = clamp(this._style.widthCap,1,50)/100;
      const minPct = clamp(this._style.minWidth,0.05,5)/100;

      const capLim = total*capPct;
      const minLim = total*minPct;

      rows = rows.map(r=>({...r,AbateShown:clamp(r.Abate,minLim,capLim)}));

      const pxToDom = total / (width||1);

      rows = rows.map(r=>({...r,AbateShown:Math.max(r.AbateShown,20*pxToDom)}));

      let c=0;
      rows = rows.map(r=>{
        let xs=c, xe=c+r.AbateShown; c=xe;
        return {...r, x_mid:(xs+xe)/2};
      });

      const x=rows.map(r=>r.x_mid);
      const y=rows.map(r=>r.MAC);
      const w=rows.map(r=>r.AbateShown);
      const colors = rows.map(r=>macColor(r.MAC));


      // ---------------- Dynamic Tooltip ----------------
      const hoverText = rows.map((r,i)=>{
        const e = r.extra;
        const L = [];
        L.push(`<b>${r.Project.label}</b>`);
        L.push(`Project ID: ${r.Project.key}`);

        if(e.category) L.push(`Category: ${e.category}`);

        L.push(`MAC: ${r.MAC.toLocaleString(undefined,{maximumFractionDigits:2})} EUR/tCO₂e`);
        L.push(`Total abatement: ${Math.round(r.Abate).toLocaleString()} tCO₂e`);

        if(isFinite(e.cumulative))
          L.push(`Cumulative abatement: ${Math.round(e.cumulative).toLocaleString()} tCO₂e`);

        if(isFinite(e.npv))
          L.push(`NPV cost: ${Math.round(e.npv).toLocaleString()} EUR`);

        if(isFinite(e.capex))
          L.push(`Capex: ${Math.round(e.capex).toLocaleString()} EUR`);

        if(isFinite(e.opex))
          L.push(`Opex: ${Math.round(e.opex).toLocaleString()} EUR/yr`);

        return L.join("<br>");
      });


      // ---------------- BAR TRACE ----------------
      const barTrace = {
        type:"bar",
        x,y,width:w,
        marker:{
          color:colors,
          line:{color:"rgba(0,0,0,0.9)", width:1.5}
        },

        customdata: rows.map(r=>([
          r.Project.label,
          r.Project.key,
          r.Abate,
          r.MAC,
          r.extra.cumulative,
          r.extra.npv,
          r.extra.capex,
          r.extra.opex,
          r.extra.category
        ])),

        text: hoverText,
        hoverinfo: "text",
        hovertemplate: "%{text}<extra></extra>"
      };

      const layout = {
        margin:{t:50,l:80,r:40,b:60},

        hovermode:false,     // disable SAC tooltip overlay

        xaxis:{title:"Total Abatement (tCO₂e)"},
        yaxis:{title:"MAC (EUR/tCO₂e)"}
      };

      setTimeout(() => {
        Plotly.newPlot(this._container,[barTrace],layout,{responsive:true})
          .then(gd=>{
            this._graph=gd;
            this._plotted=true;

            setTimeout(() => Plotly.Plots.resize(gd), 90);
          });
      }, 60);
    }

  }

  if(!customElements.get("variable-width-macc"))
    customElements.define("variable-width-macc", VariableWidthMACC);

})();
