(function () {

  // ============================================================================
  //  VARIABLE WIDTH MACC — v1.7.2
  //  - Tooltip includes Category, Cumulative abatement, NPV, Capex, Opex
  //  - Linked Analysis (Project_ID) robust with uniqueName fallback
  //  - Optional additional feeds (safe if unbound)
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
    if (v < 0) return "rgba(39,174,96,0.95)";
    if (v < 25) return "rgba(241,196,15,0.95)";
    if (v < 50) return "rgba(230,126,34,0.95)";
    return "rgba(231,76,60,0.95)";
  };

  const dimSlot = (r, idx) => r?.[`dimension_${idx}`] || null;
  const meas    = (r, id) => {
    const v = r?.[`${id}_0`];
    return (typeof v === "object" && v !== null ? v.raw : v);
  };

  function detectDimTechId(binding, rows) {
    try {
      const md = binding?.metadata?.dimensions;
      if (md?.dimension_0?.id) return String(md.dimension_0.id);
      if (Array.isArray(md) && md[0]?.id) return String(md[0].id);
    } catch (_) {}

    try {
      const d0 = rows?.[0]?.dimension_0 || rows?.[0];
      const guess = d0?.dimensionId || d0?.idKey || d0?.id;
      if (guess && typeof guess === "string") return guess;
    } catch (_) {}

    return "Project_ID";
  }

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
        fontSize: 12
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
    disconnectedCallback(){ try{ this._ro.disconnect(); }catch(_){} }

    getDataBindings(){
      return {
        maccBinding:{
          feeds:[
            { id:"dimension",        type:"dimension" },

            // optional fields
            { id:"dimension_cat",    type:"dimension" },

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

    onCustomWidgetBeforeUpdate(p){ this._apply(p); }
    onCustomWidgetAfterUpdate(p){ this._apply(p); }

    _apply(props){
      if(!props) return;
      this._props = props;

      if("maccBinding" in props) this._ingest(props.maccBinding);

      ["widthCap","minWidth","xPadding","fontSize"].forEach(k=>{
        if(k in props) this[k] = props[k];
      });
    }

    set widthCap(v){this._style.widthCap=Number(v)||10; this._render();}
    set minWidth(v){this._style.minWidth=Number(v)||0.2; this._render();}
    set xPadding(v){this._style.xPadding=Number(v)||5; this._render();}
    set fontSize(v){this._style.fontSize=Number(v)||12; this._render();}

    onCustomWidgetResize(){
      if(this._initialized && this._plotted){
        try{ Plotly.Plots.resize(this._graph); }catch(_){}
      }
    }
    _onResizeObs(){ this.onCustomWidgetResize(); }

    // ---------------- INGEST ----------------
    _ingest(binding){
      try{
        const rows = binding?.data || [];
        if(!rows.length) return this._setEmpty("No data");

        this._dimTechId = detectDimTechId(binding, rows);
        console.log("[MACC] dimTechId:", this._dimTechId);

        const proj=[], ab=[], mc=[], ex=[];

        for(const r of rows){
          const d0 = dimSlot(r,0) || r;     // Project ID dimension
          const dCat = dimSlot(r,1);

          const memberValue  = d0?.uniqueName || d0?.id || d0?.label;
          const projectLabel = d0?.label || d0?.id || String(memberValue);
          const key          = String(memberValue);

          const abVal = Number(meas(r,"measure_abate")) || 0;
          const macVal= Number(meas(r,"measure_mac"))   || 0;

          const cum   = meas(r,"measure_cum");
          const npv   = meas(r,"measure_npv");
          const capex = meas(r,"measure_capex");
          const opex  = meas(r,"measure_opex");

          const category = dCat?.label ?? dCat?.id;

          proj.push({ label:projectLabel, key });
          ab.push(abVal);
          mc.push(macVal);
          ex.push({
            cumulative: cum,
            npv, capex, opex, category
          });
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

    // ---------------- RENDER ----------------
    _setEmpty(msg){
      this._container.innerHTML="";
      const el=document.createElement("div");
      el.style="font:12px Arial;color:#666;padding:8px;";
      el.textContent=msg;
      this._container.appendChild(el);
      this._plotted=false;
      this._graph=null;
    }

    _render(){
      if(!this._initialized) return;

      const P=this._data.project,
            A=this._data.abatement,
            M=this._data.mac;

      if(!P.length) return this._setEmpty("No data");

      let rows = P.map((p,i)=>({ Project:p, Abate:A[i], MAC:M[i], extra:this._data.extra[i] }));
      rows.sort((a,b)=>a.MAC-b.MAC);

      const total = rows.reduce((s,r)=>s+r.Abate,0);
      if(total<=0) return this._setEmpty("No abatement");

      const capPct = clamp(this._style.widthCap,1,50)/100;
      const minPct = clamp(this._style.minWidth,0.05,5)/100;

      const capLim = total*capPct;
      const minLim = total*minPct;

      rows = rows.map(r=>({...r,AbateShown:clamp(r.Abate,minLim,capLim)}));

      const W=this._container.clientWidth||1;
      const pxToDom = total/W;
      rows = rows.map(r=>({...r,AbateShown:Math.max(r.AbateShown,20*pxToDom)}));

      let c=0;
      rows = rows.map(r=>{ const xs=c, xe=c+r.AbateShown; c=xe; return {...r,x_mid:(xs+xe)/2}; });

      const x = rows.map(r=>r.x_mid);
      const y = rows.map(r=>r.MAC);
      const w = rows.map(r=>r.AbateShown);
      const colors = rows.map(r=>macColor(r.MAC));

      // --------------- BAR TRACE WITH EXTENDED TOOLTIP ----------------
      const barTrace = {
        type:"bar",
        x, y, width:w,
        marker:{
          color:colors,
          line:{ color:"rgba(0,0,0,0.9)", width:1.5 }
        },

        customdata: rows.map(r => ([
         // r.Project.label,          // 0 Project name
          r.Project.key,            // 1 Project ID
          r.Abate,                  // 2 Total abatement
          r.MAC,                    // 3 MAC
          r.extra.cumulative,       // 4 Cumulative abatement
          r.extra.npv,              // 5 NPV
          r.extra.capex,            // 6 Capex
          r.extra.opex,             // 7 Opex
          r.extra.category          // 8 Category
        ])),

        hovertemplate:
          "<b>%{customdata[0]}</b><br>" +
          "Project ID: %{customdata[1]}<br><br>" +
          "Category: %{customdata[8]}<br>" +
          "MAC: %{customdata[3]:,.2f} EUR/tCO₂e<br>" +
          "Total abatement: %{customdata[2]:,.0f} tCO₂e<br>" +
          "Cumulative abatement: %{customdata[4]:,.0f} tCO₂e<br>" +
          "NPV cost: %{customdata[5]:,.0f} EUR<br>" +
          "Capex: %{customdata[6]:,.0f} EUR<br>" +
          "Opex: %{customdata[7]:,.0f} EUR/yr<br>" +
          "<extra></extra>"
      };

      const xRange=[-500,c+500],
            yMin=Math.min(...y,0)*1.25,
            yMax=Math.max(...y,0)*1.25;

      const layout={
        margin:{t:50,l:80,r:40,b:60},
        hovermode:"closest",
        xaxis:{range:xRange, title:"Total Abatement (tCO₂e)"},
        yaxis:{range:[yMin,yMax], title:"MAC (EUR/tCO₂e)"}
      };

      Plotly.newPlot(this._container,[barTrace],layout,{responsive:true})
        .then(gd=>{
          this._graph=gd;
          this._plotted=true;

          const selectedKeys = new Set();

          const getLA = () => {
            try { const la1=this._props?.maccBinding?.getLinkedAnalysis?.(); if(la1) return la1; } catch(_){}
            try { const la2=this.dataBindings?.getDataBinding?.()?.getLinkedAnalysis?.(); if(la2) return la2; } catch(_){}
            return null;
          };

          const buildSelections = (keys, dimId) => [...keys].map(k => ({ [dimId]: k }));

          gd.on("plotly_click", ev=>{
            const p=ev?.points?.[0]; if(!p) return;
            const key=p.customdata?.[1]; if(key==null) return;

            const multi=!!(ev.event?.ctrlKey || ev.event?.metaKey || ev.event?.shiftKey);

            if(multi){ if(selectedKeys.has(key)) selectedKeys.delete(key); else selectedKeys.add(key); }
            else { selectedKeys.clear(); selectedKeys.add(key); }

            Plotly.restyle(gd,{
              "marker.line.width":[rows.map(r=>selectedKeys.has(r.Project.key)?3:1.5)],
              "marker.opacity":[rows.map(r=>selectedKeys.size===0?1:(selectedKeys.has(r.Project.key)?1:0.30))]
            });

            // ---- Linked Analysis ----
            try{
              const la=getLA();
              if(!la) return;

              const enabled=la.isDataPointSelectionEnabled?.();
              if(!enabled) return;

              const plain = buildSelections(selectedKeys,this._dimTechId);
              try { la.setFilters(plain); }
              catch(e1){
                // UniqueName fallback
                const unSel = [...selectedKeys].map(k=>{
                  const isUN = typeof k==="string" && k.startsWith("[") && k.includes("].&[");
                  const v = isUN ? k : `[${this._dimTechId}].[${this._dimTechId}].&[${k}]`;
                  return { [this._dimTechId]: v };
                });
                try { la.setFilters(unSel); } catch(e2){ console.error("[LA] fail:", e1, e2); }
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

        }).catch(e=>{
          console.error("Plot error:",e);
          this._setEmpty("Plot error");
        });

    }

  }

  if(!customElements.get("variable-width-macc"))
    customElements.define("variable-width-macc", VariableWidthMACC);

})();
