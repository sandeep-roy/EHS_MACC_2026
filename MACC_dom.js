(function () {

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
        z-index: 5; /* above SAC chrome */
      }

      /* Force hover, shapes, annotations in VIEW MODE */
      #macc-container, #macc-container * { pointer-events:auto !important; }
      #macc-container .hoverlayer,
      #macc-container .layer-above,
      #macc-container .draglayer {
        pointer-events:auto !important;
      }

      /* Modebar pinned */
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

  // ----- Helpers -----
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const macColor = (v) => {
    if (v < 0) return "rgba(39,174,96,0.95)";
    if (v < 25) return "rgba(241,196,15,0.95)";
    if (v < 50) return "rgba(230,126,34,0.95)";
    return "rgba(231,76,60,0.95)";
  };

  // safe HTML fragments (no literal < >)
  const LT = String.fromCharCode(60);
  const GT = String.fromCharCode(62);
  const BR = LT + "br" + GT;
  const EXTRA = LT + "extra" + GT + LT + "/extra" + GT;

  // Load Plotly
  function ensurePlotly() {
    if (window.Plotly && window.Plotly.newPlot) return Promise.resolve();
    if (window.__maccPlotlyLoading) return window.__maccPlotlyLoading;

    window.__maccPlotlyLoading = new Promise((resolve, reject) => {
      try {
        const s = document.createElement("script");
        s.src = "https://cdn.plot.ly/plotly-2.27.0.min.js";
        s.async = true;
        s.onload = () => resolve();
        s.onerror = (e) => reject(e);
        document.head.appendChild(s);
      } catch (e) { reject(e); }
    });
    return window.__maccPlotlyLoading;
  }

  // ------- DIMENSION AUTO-DETECTOR (critical for LA) --------
  function detectDimensionId(binding, rows) {

    // 1) Primary: SAC metadata (EDIT MODE)
    try {
      const md = binding?.metadata?.dimensions;
      if (Array.isArray(md) && md.length && md[0]) {
        const cand = md[0].id || md[0].name || md[0].key || md[0].dimensionId;
        if (cand) return String(cand);
      }
    } catch (_) {}

    // 2) Secondary: Row-level dimension object (e.g., dimensionId)
    try {
      const r0 = rows?.[0];
      const d0 = r0?.dimension_0 || r0?.dimensions_0 || r0;
      const cand = d0?.dimensionId || d0?.id || d0?.name || d0?.key;
      if (cand) return String(cand);
    } catch (_) {}

    // 3) FINAL fallback: hardcoded because your model uses "Project name"
    return "Project name";
  }

  // -----------------------------------------------------------

  class VariableWidthMACC extends HTMLElement {

    constructor() {
      super();

      // Shadow DOM
      this._shadow = this.attachShadow({ mode: "open" });
      this._shadow.appendChild(template.content.cloneNode(true));
      this._container = this._shadow.querySelector("#macc-container");

      // State
      this._initialized = false;
      this._plotted = false;
      this._graph = null;

      this._data = { project: [], abatement: [], mac: [] };

      // Styling
      this._style = {
        widthCap:10,
        minWidth:0.2,
        xPadding:5,
        fontSize:12
      };

      // The SAC technical dimension id (auto-detected)
      this._dimTechId = null;

      // ResizeObserver
      this._onResizeObs = this._onResizeObs.bind(this);
      this._ro = new (window.ResizeObserver || class {observe(){} disconnect(){}})(this._onResizeObs);

      ensurePlotly().then(() => {
        this._initialized = true;
        if (this._container.isConnected) this._ro.observe(this._container);
        this._render();
      }).catch((e)=>console.error("Plotly load error", e));
    }

    connectedCallback(){
      try{ if(this._initialized) this._ro.observe(this._container);}catch(_){}
    }
    disconnectedCallback(){
      try{ this._ro.disconnect(); }catch(_){}
    }

    // ---------- SAC Data binding feeds ----------
    getDataBindings(){
      return {
        maccBinding:{
          feeds:[
            {id:"dimension", type:"dimension"},
            {id:"measure_abate", type:"mainStructureMember"},
            {id:"measure_mac", type:"mainStructureMember"}
          ]
        }
      };
    }

    onCustomWidgetBeforeUpdate(p){ this._apply(p); }
    onCustomWidgetAfterUpdate(p){  this._apply(p); }

    _apply(props){
      if(!props) return;

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
    _onResizeObs(){
      this.onCustomWidgetResize();
    }

    // ------------- INGEST (Your model: Project_ID + Project_name) -------------
    _ingest(binding){
      try{
        const rows = binding?.data || binding?.rows || [];
        if(!Array.isArray(rows) || rows.length===0){
          this._setEmpty("No data"); return;
        }

        // Detect technical dimension id
        this._dimTechId = detectDimensionId(binding, rows);
        console.log("[MACC v1.4.5] dimTechId =", this._dimTechId);

        // Extract your fields
        const proj=[], ab=[], mc=[];

        for(const r of rows){
          const d = r.dimension_0 || r.dimensions_0 || r;

          const projectId   = d.Project_ID;
          const projectName = d.Project_name ?? projectId;

          // Member key = PROJECT_ID (critical for LA)
          const key = String(projectId);

          const av = r.measure_abate_0?.raw ?? r.measure_abate_0 ?? r.measures?.[0]?.raw ?? 0;
          const mv = r.measure_mac_0?.raw   ?? r.measure_mac_0   ?? r.measures?.[1]?.raw ?? 0;

          proj.push({label:projectName, key});
          ab.push(Number(av)||0);
          mc.push(Number(mv)||0);
        }

        this._data.project   = proj;
        this._data.abatement = ab;
        this._data.mac       = mc;

        this._render();

      }catch(e){
        console.error("Ingest error:", e);
        this._setEmpty("Error processing data");
      }
    }

    // ------------- Rendering -------------
    _setEmpty(msg){
      this._container.innerHTML = "";
      const el = document.createElement("div");
      el.style.font="12px Arial"; el.style.color="#666"; el.style.padding="8px";
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

      if(!P.length){ this._setEmpty("No data"); return; }

      // Build rows
      let rows=[];
      for(let i=0;i<P.length;i++)
        rows.push({Project:P[i], Abate:A[i], MAC:M[i]});
      rows.sort((a,b)=>a.MAC-b.MAC);

      const total = rows.reduce((s,r)=>s+r.Abate,0);
      if(total<=0){this._setEmpty("No abatement");return;}

      const capPct = clamp(this._style.widthCap,1,50)/100;
      const minPct = clamp(this._style.minWidth,0.05,5)/100;
      const padPct = clamp(this._style.xPadding,0,20)/100;
      const fsize  = clamp(this._style.fontSize,8,24);

      const capLim = total*capPct;
      const minLim = total*minPct;

      // Width bounds
      rows = rows.map(r=>({...r,AbateShown:clamp(r.Abate,minLim,capLim)}));

      // Min px width conversion
      const pxMin=20, W=this._container.clientWidth||1, pxToDom=total/W;
      rows = rows.map(r=>({...r,AbateShown:Math.max(r.AbateShown,pxMin*pxToDom)}));

      let c=0;
      rows=rows.map(r=>{
        const xs=c, xe=c+r.AbateShown; c=xe;
        return {...r,x_mid:(xs+xe)/2};
      });

      const y=rows.map(r=>r.MAC),
            x=rows.map(r=>r.x_mid),
            w=rows.map(r=>r.AbateShown),
            colors=rows.map(r=>macColor(r.MAC));

      let selectedKeys=new Set();

      const barTrace={
        type:"bar",
        x,y,width:w,
        marker:{color:colors, line:{color:"rgba(0,0,0,0.9)", width:1.5}},
        customdata: rows.map(r=>[r.Project.label, r.Abate, r.Project.key]),
        hovertemplate:
          "Project: %{customdata[0]}"+BR+
          "MAC: %{y:.2f} EUR/tCO₂e"+BR+
          "Abatement: %{customdata[1]:,.0f} tCO₂e"+EXTRA
      };

      const maxCum = Math.max(...rows.map(r=>r.x_mid+r.AbateShown/2));
      const xPad = maxCum*padPct;
      const xRange=[-xPad, maxCum+xPad];

      const yMin=Math.min(...y,0)*1.25;
      const yMax=Math.max(...y,0)*1.25;

      const layout={
        margin:{t:50,l:80,r:40,b:60},
        hovermode:"closest",
        hoverdistance:15,
        xaxis:{range:xRange, title:"Total Abatement (tCO₂e)", tickformat:"~s"},
        yaxis:{range:[yMin,yMax], title:"MAC (EUR/tCO₂e)"},
        shapes:[
          {type:"line",x0:60000,x1:60000,y0:yMin,y1:yMax,line:{color:"black",width:3,dash:"dash"}},
          {type:"line",x0:xRange[0],x1:xRange[1],y0:50,y1:50,line:{color:"blue",width:3,dash:"dot"}}
        ],
        annotations:[
          {x:60000,y:yMax*0.97,text:"Target: 60k tCO₂e",showarrow:false,font:{size:fsize}},
          {x:xRange[1],y:50,text:"Carbon price: 50 EUR/tCO₂e",xanchor:"right",showarrow:false,font:{size:fsize}}
        ]
      };

      const config={
        responsive:true,
        displaylogo:false,
        displayModeBar:true
      };

      const first=!this._plotted;

      Plotly.newPlot(this._container,[barTrace],layout,config)
        .then(gd=>{
          this._graph=gd;
          this._plotted=true;

          requestAnimationFrame(()=>{ try{Plotly.Plots.resize(gd);}catch(_){}});

          if(first){

            gd.on("plotly_click",ev=>{
              const p=ev?.points?.[0];
              if(!p) return;
              const memberKey=p.customdata?.[2];
              if(!memberKey) return;

              const multi=!!(ev.event&&(ev.event.ctrlKey||ev.event.metaKey||ev.event.shiftKey));
              if(multi){
                if(selectedKeys.has(memberKey)) selectedKeys.delete(memberKey);
                else selectedKeys.add(memberKey);
              } else {
                selectedKeys.clear(); selectedKeys.add(memberKey);
              }

              // Highlight
              Plotly.restyle(gd,{
                "marker.line.width":[rows.map(r=>selectedKeys.has(r.Project.key)?3:1.5)],
                "marker.opacity":[rows.map(r=>selectedKeys.size===0?1:(selectedKeys.has(r.Project.key)?1:0.35))]
              });

              // LA
              try{
                const db=this.dataBindings.getDataBinding?.();
                const la=db?.getLinkedAnalysis?.();
                if(!la) return;

                const enabled=la.isDataPointSelectionEnabled?.();
                console.log("LA enabled:",enabled,"dimId:",this._dimTechId);

                if(!enabled) return;
                if(!this._dimTechId) return;

                const sel=[...selectedKeys].map(k=>({[this._dimTechId]:String(k)}));
                console.log("setFilters:",sel);

                la.setFilters(sel);

              }catch(e){ console.error("LA error",e); }

            });

            gd.on("plotly_doubleclick",()=>{
              if(!selectedKeys.size) return;
              selectedKeys.clear();

              Plotly.restyle(gd,{
                "marker.line.width":[rows.map(_=>1.5)],
                "marker.opacity":[rows.map(_=>1)]
              });

              try{
                const db=this.dataBindings.getDataBinding?.();
                db?.getLinkedAnalysis?.().removeFilters?.();
              }catch(_){}
            });
          }

        }).catch(e=>{
          console.error("Plot error:",e);
          this._setEmpty("Plot error");
        });

    }
  }

  if(!customElements.get("variable-width-macc"))
    customElements.define("variable-width-macc", VariableWidthMACC);

})();
