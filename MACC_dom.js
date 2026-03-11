(function () {

  // ============================================================================
  //  VARIABLE WIDTH MACC — v1.7.0
  //  Option B: Category color coding + rich tooltip (with optional fields)
  //  - Robust Linked Analysis (Project_ID): tech id from metadata, member = uniqueName||id||label
  //  - UniqueName retry for BW/HANA live if plain id fails
  //  - Optional feeds for: Category, Baseline, Unit, EF, Lifetime, Ramp-up, Start, Rank,
  //                        Cumulative abatement, NPV, Capex, Opex
  // ============================================================================

  // ---------------- Build Shadow DOM template ----------------
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
      }

      #macc-container, #macc-container * { pointer-events:auto !important; }
      #macc-container .hoverlayer,
      #macc-container .layer-above,
      #macc-container .draglayer { pointer-events:auto !important; }

      #macc-container .modebar {
        right:6px !important;
        left:auto !important;
        top:6px !important;
      }
    `;

    const root = document.createElement("div");
    root.id = "macc-container";

    template.content.appendChild(styleEl);
    template.content.appendChild(root);
  })();

  // ---------- Helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const macColor = (v) => {
    if (v < 0)  return "rgba(39,174,96,0.95)";   // green-ish
    if (v < 25) return "rgba(241,196,15,0.95)";  // yellow
    if (v < 50) return "rgba(230,126,34,0.95)";  // orange
    return "rgba(231,76,60,0.95)";               // red-ish
  };

  const CATEGORY_PALETTE = [
    "#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd",
    "#8c564b","#e377c2","#7f7f7f","#bcbd22","#17becf"
  ];
  const colorForCategory = (name) => {
    if (!name) return "#888";
    let h = 0;
    for (let i=0;i<name.length;i++) h = (h*31 + name.charCodeAt(i))>>>0;
    return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length];
  };

  const LT = "<", GT = ">";
  const BR = LT + "br" + GT;
  const EXTRA = LT + "extra" + GT + LT + "/extra" + GT;

  // Load Plotly
  function ensurePlotly() {
    if (window.Plotly && window.Plotly.newPlot) return Promise.resolve();
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

  // ---------- Safe accessors for SAC rows ----------
  const dimSlot = (r, idx) => r?.[`dimension_${idx}`] || null;         // dimension_i
  const meas    = (r, id) => {                                        // measure_id_0  (raw if object)
    const v = r?.[`${id}_0`];
    return (typeof v === "object" && v !== null ? v.raw : v);
  };

  // ---------- Detect technical dimension id ----------
  function detectDimTechId(binding, rows) {
    try {
      const md = binding?.metadata?.dimensions;
      if (md?.dimension_0?.id) return String(md.dimension_0.id);       // object shape
      if (Array.isArray(md) && md[0]?.id) return String(md[0].id);     // array shape
    } catch(_) {}

    try {
      const d0 = rows?.[0]?.dimension_0 || rows?.[0];
      const guess = d0?.dimensionId || d0?.idProperty || d0?.idKey || d0?.id;
      if (guess && typeof guess === "string") return guess;
    } catch(_) {}

    return "Project_ID"; // final fallback aligned to your public dimension
  }

  class VariableWidthMACC extends HTMLElement {

    constructor() {
      super();

      this._shadow = this.attachShadow({ mode: "open" });
      this._shadow.appendChild(template.content.cloneNode(true));
      this._container = this._shadow.querySelector("#macc-container");

      this._initialized = false;
      this._plotted = false;
      this._graph = null;

      this._props = {};

      this._data = { project: [], abatement: [], mac: [], extra: [] };

      this._style = {
        widthCap: 10,
        minWidth: 0.2,
        xPadding: 5,
        fontSize: 12,
        colorMode: "category" // Option B default
      };

      this._dimTechId = null;

      this._onResizeObs = this._onResizeObs.bind(this);
      this._ro = new (window.ResizeObserver || class { observe(){} disconnect(){} })(this._onResizeObs);

      ensurePlotly().then(() => {
        this._initialized = true;
        if (this._container.isConnected) this._ro.observe(this._container);
        this._render();
      });
    }

    connectedCallback(){ if (this._initialized) this._ro.observe(this._container); }
    disconnectedCallback(){ try{ this._ro.disconnect(); } catch(_){} }

    // ---- Data bindings (must align with JSON) ----
    getDataBindings(){
      return {
        maccBinding:{
          feeds:[
            { id:"dimension",        type:"dimension" },

            { id:"dimension_cat",    type:"dimension" },
            { id:"dimension_base",   type:"dimension" },
            { id:"dimension_unit",   type:"dimension" },
            { id:"dimension_ef",     type:"dimension" },
            { id:"dimension_life",   type:"dimension" },
            { id:"dimension_ramp",   type:"dimension" },
            { id:"dimension_start",  type:"dimension" },
            { id:"dimension_rank",   type:"dimension" },

            { id:"measure_abate",    type:"mainStructureMember" },
            { id:"measure_mac",      type:"mainStructureMember" },

            { id:"measure_cum",      type:"mainStructureMember" },
            { id:"measure_npv",      type:"mainStructureMember" },
            { id:"measure_capex",    type:"mainStructureMember" },
            { id:"measure_opex",     type:"mainStructureMember" }
          ]
        }
      };
    }

    // ---- Props & lifecycle ----
    onCustomWidgetBeforeUpdate(p){ this._apply(p); }
    onCustomWidgetAfterUpdate(p){  this._apply(p); }

    _apply(props){
      if(!props) return;
      this._props = props;

      if("maccBinding" in props) this._ingest(props.maccBinding);

      ["widthCap","minWidth","xPadding","fontSize","colorMode"].forEach(k=>{
        if(k in props) this[k] = props[k];
      });
    }

    set widthCap(v){this._style.widthCap=Number(v)||10; this._render();}
    set minWidth(v){this._style.minWidth=Number(v)||0.2; this._render();}
    set xPadding(v){this._style.xPadding=Number(v)||5; this._render();}
    set fontSize(v){this._style.fontSize=Number(v)||12; this._render();}
    set colorMode(v){ this._style.colorMode = (v==="category"?"category":"gradient"); this._render(); }

    onCustomWidgetResize(){
      if(this._initialized && this._plotted){
        try{ Plotly.Plots.resize(this._graph); }catch(_){}
      }
    }
    _onResizeObs(){ this.onCustomWidgetResize(); }

    // ---- INGEST ----
    _ingest(binding){
      try{
        const rows = binding?.data || [];
        if(!Array.isArray(rows) || rows.length===0) return this._setEmpty("No data");

        this._dimTechId = detectDimTechId(binding, rows);
        console.log("[MACC] dimTechId:", this._dimTechId);

        const proj=[], ab=[], mc=[], ex=[];

        for(const r of rows){
          // dimensions
          const d0     = dimSlot(r,0) || r; // driver
          const dCat   = dimSlot(r,1);
          const dBase  = dimSlot(r,2);
          const dUnit  = dimSlot(r,3);
          const dEF    = dimSlot(r,4);
          const dLife  = dimSlot(r,5);
          const dRamp  = dimSlot(r,6);
          const dStart = dimSlot(r,7);
          const dRank  = dimSlot(r,8);

          // member for LA
          const memberValue  = d0?.uniqueName || d0?.id || d0?.label;
          const projectLabel = d0?.label || d0?.id || String(memberValue);
          const key = String(memberValue);

          // measures
          const abate  = Number(meas(r,"measure_abate")) || 0;
          const macVal = Number(meas(r,"measure_mac"))   || 0;

          // optional measures
          const cum   = meas(r,"measure_cum");
          const npv   = meas(r,"measure_npv");
          const capex = meas(r,"measure_capex");
          const opex  = meas(r,"measure_opex");

          // optional dimension labels
          const cat   = dCat?.label ?? dCat?.id;
          const base  = dBase?.label ?? dBase?.id;
          const unit  = dUnit?.label ?? dUnit?.id;
          const ef    = dEF?.label ?? dEF?.id;
          const life  = dLife?.label ?? dLife?.id;
          const ramp  = dRamp?.label ?? dRamp?.id;
          const start = dStart?.label ?? dStart?.id;
          const rank  = dRank?.label ?? dRank?.id;

          proj.push({ label:projectLabel, key, category:cat });
          ab.push(abate);
          mc.push(macVal);

          ex.push({ cumulative:cum, npv, capex, opex, category:cat,
                    baseline:base, unit, ef, lifetime:life, rampup:ramp,
                    startyear:start, rank });
        }

        this._data.project   = proj;
        this._data.abatement = ab;
        this._data.mac       = mc;
        this._data.extra     = ex;

        this._render();
      }catch(e){
        console.error("Ingest error:", e);
        this._setEmpty("Data error");
      }
    }

    // ---- RENDER ----
    _setEmpty(msg){
      this._container.innerHTML = "";
      const el = document.createElement("div");
      el.style = "font:12px Arial;color:#666;padding:8px;";
      el.textContent = msg;
      this._container.appendChild(el);
      this._plotted = false;
      this._graph = null;
    }

    _render(){
      if(!this._initialized) return;

      const P=this._data.project,
            A=this._data.abatement,
            M=this._data.mac;

      if(!P.length) return this._setEmpty("No data");

      // rows and sort by MAC
      let rows = P.map((p,i)=>({ Project:p, Abate:A[i], MAC:M[i] }));
      rows.sort((a,b)=>a.MAC-b.MAC);

      const total = rows.reduce((s,r)=>s+r.Abate,0);
      if(total<=0) return this._setEmpty("No abatement");

      const capPct = clamp(this._style.widthCap,1,50)/100;
      const minPct = clamp(this._style.minWidth,0.05,5)/100;

      const capLim = total*capPct;
      const minLim = total*minPct;

      rows = rows.map(r=>({...r, AbateShown:clamp(r.Abate,minLim,capLim)}));

      const W = this._container.clientWidth||1;
      const pxToDom = total/W;
      rows = rows.map(r=>({...r, AbateShown:Math.max(r.AbateShown,20*pxToDom)}));

      let c=0;
      rows = rows.map(r=>{ const xs=c, xe=c+r.AbateShown; c=xe; return {...r, x_mid:(xs+xe)/2}; });

      const x = rows.map(r=>r.x_mid);
      const y = rows.map(r=>r.MAC);
      const w = rows.map(r=>r.AbateShown);

      const colors = rows.map((r,i)=>{
        if(this._style.colorMode==="category"){
          const cat = this._data.extra?.[i]?.category;
          return colorForCategory(cat);
        }
        return macColor(r.MAC);
      });

      const barTrace = {
        type:"bar",
        x,y,width:w,
        marker:{ color:colors, line:{ color:"rgba(0,0,0,0.9)", width:1.5 }},
        customdata: rows.map((r,i)=>[
          r.Project.label,                    // 0
          r.Abate,                            // 1
          r.Project.key,                      // 2
          r.MAC,                              // 3
          this._data.extra?.[i]?.cumulative,  // 4
          this._data.extra?.[i]?.npv,         // 5
          this._data.extra?.[i]?.category,    // 6
          this._data.extra?.[i]?.baseline,    // 7
          this._data.extra?.[i]?.unit,        // 8
          this._data.extra?.[i]?.ef,          // 9
          this._data.extra?.[i]?.capex,       // 10
          this._data.extra?.[i]?.opex,        // 11
          this._data.extra?.[i]?.lifetime,    // 12
          this._data.extra?.[i]?.rampup,      // 13
          this._data.extra?.[i]?.startyear,   // 14
          this._data.extra?.[i]?.rank         // 15
        ]),
        hovertemplate:
          "<b>%{customdata[0]}</b><br>" +
          "Project ID: %{customdata[2]}<br>" +
          "Rank: %{customdata[15]}<br>" +
          "Category: %{customdata[6]}<br>" +
          "MAC: %{customdata[3]:,.2f} EUR/tCO₂e<br>" +
          "Total abatement: %{customdata[1]:,.0f} tCO₂e<br>" +
          "Cumulative abatement: %{customdata[4]:,.0f} tCO₂e<br>" +
          "NPV cost: %{customdata[5]:,.0f} EUR<br>" +
          "Capex: %{customdata[10]:,.0f} EUR<br>" +
          "Opex: %{customdata[11]:,.0f} EUR/yr<br>" +
          "Baseline activity: %{customdata[7]}<br>" +
          "Unit: %{customdata[8]} | EF (start year): %{customdata[9]}<br>" +
          "Lifetime: %{customdata[12]} yrs | Ramp-up: %{customdata[13]} yrs<br>" +
          "Start year: %{customdata[14]}<extra></extra>"
      };

      const xRange = [-500, c+500];
      const yMin = Math.min(...y,0)*1.25;
      const yMax = Math.max(...y,0)*1.25;

      const layout={
        margin:{t:50,l:80,r:40,b:60},
        hovermode:"closest",
        xaxis:{range:xRange, title:"Total Abatement (tCO₂e)"},
        yaxis:{range:[yMin,yMax], title:"MAC (EUR/tCO₂e)"}
      };

      Plotly.newPlot(this._container,[barTrace],layout,{responsive:true})
        .then(gd=>{
          this._graph=gd; this._plotted=true;

          const selectedKeys=new Set();

          // ---- Linked Analysis helpers ----
          const getLA = () => {
            try { const la1 = this._props?.maccBinding?.getLinkedAnalysis?.(); if (la1) return la1; } catch(_){}
            try { const la2 = this.dataBindings?.getDataBinding?.()?.getLinkedAnalysis?.(); if (la2) return la2; } catch(_){}
            return null;
          };
          const buildSelections = (keys, dimId) => [...keys].map(k => ({ [dimId]: k }));

          gd.on("plotly_click", ev=>{
            const p=ev?.points?.[0]; if(!p) return;
            const key=p.customdata?.[2]; if(key==null) return;

            const multi = !!(ev.event?.ctrlKey || ev.event?.metaKey || ev.event?.shiftKey);
            if (multi) { if (selectedKeys.has(key)) selectedKeys.delete(key); else selectedKeys.add(key); }
            else { selectedKeys.clear(); selectedKeys.add(key); }

            Plotly.restyle(gd,{
              "marker.line.width":[rows.map(r=>selectedKeys.has(r.Project.key)?3:1.5)],
              "marker.opacity":[rows.map(r=>selectedKeys.size===0?1:(selectedKeys.has(r.Project.key)?1:0.30))]
            });

            // --- LA apply with uniqueName retry for live sources ---
            try{
              const la = getLA();
              if(!la) return;

              const enabled = la.isDataPointSelectionEnabled?.();
              if(!enabled) return;

              const plain = buildSelections(selectedKeys, this._dimTechId);
              try {
                la.setFilters(plain);
              } catch (e1) {
                // Retry with uniqueName format if plain fails (BW/HANA live often needs this)
                const unSel = [...selectedKeys].map(k=>{
                  const isUN = typeof k==="string" && k.startsWith("[") && k.includes("].&[");
                  const v = isUN ? k : `[${this._dimTechId}].[${this._dimTechId}].&[${k}]`;
                  return { [this._dimTechId]: v };
                });
                try { la.setFilters(unSel); } catch(e2){ console.error("[LA] setFilters failed:", e1, e2); }
              }
            }catch(e){ console.error("[LA] error:", e); }
          });

          gd.on("plotly_doubleclick", ()=>{
            selectedKeys.clear();
            Plotly.restyle(gd,{
              "marker.line.width":[rows.map(()=>1.5)],
              "marker.opacity":[rows.map(()=>1)]
            });
            try{ getLA()?.removeFilters?.(); }catch(_){}
          });

        })
        .catch(e=>{
          console.error("Plot error:",e);
          this._setEmpty("Plot error");
        });

    } // render

  } // class

  if(!customElements.get("variable-width-macc"))
    customElements.define("variable-width-macc", VariableWidthMACC);

})();
