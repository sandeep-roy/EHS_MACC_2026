(function () {

  // ============================================================================
  //  VARIABLE WIDTH MACC — v1.7.7b (HTML Tooltip, SAC‑safe)
  //  - HTML tooltip (no Plotly or SAC tooltip)
  //  - hoverlayer suppressed via CSS
  //  - plotly_hover driven tooltip
  //  - Stable rendering (deferred + debounced)
  //  - Linked Analysis turned fully OFF for clean behavior
  // ============================================================================

  const template = document.createElement("template");

  (function buildTemplate() {
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      :host { display:block; width:100%; height:100%; }

      #macc-root {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        pointer-events: auto !important;
      }

      #macc-plot {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      /* --------- CRITICAL ---------
         Force-hide Plotly's native hover bubble
         so only HTML tooltip is visible.
      */
      #macc-plot .hoverlayer {
        display: none !important;
      }

      /* HTML tooltip */
      #macc-tip {
        position: absolute;
        max-width: 360px;
        background: #ffffff;
        color: #111;
        border: 1px solid rgba(0,0,0,0.18);
        border-radius: 6px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.18);
        padding: 10px 12px;
        font: 12px/1.35 "Segoe UI", Arial, sans-serif;
        pointer-events: none;
        z-index: 9999;
        opacity: 0;
        white-space: normal;
        transform: translate(-50%, -110%);
        transition: opacity 80ms ease-out;
      }
      #macc-tip.show { opacity: 0.98; }

      #macc-tip .ttl {
        font-weight: 600;
        margin-bottom: 6px;
      }
      #macc-tip .row {
        display: flex;
        align-items: baseline;
        gap: 6px;
      }
      #macc-tip .k { color:#555; min-width: 145px; }
      #macc-tip .v { color:#111; }
    `;

    const root = document.createElement("div");
    root.id = "macc-root";

    const plot = document.createElement("div");
    plot.id = "macc-plot";

    const tip = document.createElement("div");
    tip.id = "macc-tip";

    root.appendChild(plot);
    root.appendChild(tip);

    template.content.appendChild(styleEl);
    template.content.appendChild(root);
  })();

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
    } catch (_) {}
    try {
      const d0 = rows?.[0]?.dimension_0;
      if (d0?.dimensionId) return d0.dimensionId;
      if (d0?.id)         return d0.id;
    } catch (_) {}
    return "Project_ID";
  }

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

      this._shadow   = this.attachShadow({ mode: "open" });
      this._shadow.appendChild(template.content.cloneNode(true));

      this._root     = this._shadow.querySelector("#macc-root");
      this._plotDiv  = this._shadow.querySelector("#macc-plot");
      this._tip      = this._shadow.querySelector("#macc-tip");

      // Completely disable LA for this stable version
      this._supportsLA = false;

      this._initialized = false;
      this._plotted     = false;
      this._pendingDraw = false;

      this._props = {};
      this._data  = { project: [], abatement: [], mac: [], extra: [] };

      this._style = {
        widthCap: 10,
        minWidth: 0.2,
        xPadding: 5,
        fontSize: 12
      };

      this._dimTechId = null;

      this._resizeTimer = null;
      this._ro = new ResizeObserver(() => {
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => this._render(true), 100);
      });

      ensurePlotly().then(() => {
        this._initialized = true;
        if (this._root.isConnected) this._ro.observe(this._root);
        this._render();
      });
    }

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

    _apply(props){
      if(!props) return;
      this._props = props;

      if ("maccBinding" in props) this._ingest(props.maccBinding);

      ["widthCap","minWidth","xPadding","fontSize"].forEach(k=>{
        if (k in props) this[k] = props[k];
      });
    }

    onCustomWidgetBeforeUpdate(p){ this._apply(p); }
    onCustomWidgetAfterUpdate(p){  this._apply(p); }

    _ingest(binding){
      try{
        const rows = binding?.data || [];
        if (!rows.length){ this._plotDiv.innerHTML="No data"; return; }

        this._dimTechId = detectDimTechId(binding, rows);

        const proj=[], ab=[], mc=[], ex=[];

        for(const r of rows){
          const d0   = dimSlot(r,0);
          const dCat = dimSlot(r,1);

          const memberValue  = d0?.uniqueName || d0?.id || d0?.label;
          const projectLabel = d0?.label || d0?.id;
          const key          = String(memberValue);

          proj.push({ label:projectLabel, key });
          ab.push(+meas(r,"measure_abate") || 0);
          mc.push(+meas(r,"measure_mac")   || 0);

          ex.push({
            cumulative: meas(r,"measure_cum"),
            npv:        meas(r,"measure_npv"),
            capex:      meas(r,"measure_capex"),
            opex:       meas(r,"measure_opex"),
            category:   dCat?.label ?? dCat?.id
          });
        }

        this._data = { project:proj, abatement:ab, mac:mc, extra:ex };
        this._render();

      }catch(e){
        console.error("Ingest error:", e);
      }
    }

    _tipHtml(row) {
      const e = row.extra || {};
      const n = (v,d=0)=>(Number.isFinite(+v)?(+v).toLocaleString(undefined,{maximumFractionDigits:d}):"-");
      return `
        <div class="ttl">${row.Project?.label ?? ""}</div>
        <div class="row"><div class="k">Project ID:</div><div class="v">${row.Project.key}</div></div>
        ${e.category ? `<div class="row"><div class="k">Category:</div><div class="v">${e.category}</div></div>` : ""}
        <div class="row"><div class="k">MAC:</div><div class="v">${n(row.MAC,2)} EUR/tCO₂e</div></div>
        <div class="row"><div class="k">Total abatement:</div><div class="v">${n(row.Abate)} tCO₂e</div></div>
        ${Number.isFinite(e.cumulative) ? `<div class="row"><div class="k">Cumulative abatement:</div><div class="v">${n(e.cumulative)} tCO₂e</div></div>` : ""}
        ${Number.isFinite(e.npv)        ? `<div class="row"><div class="k">NPV cost:</div><div class="v">${n(e.npv)} EUR</div></div>` : ""}
        ${Number.isFinite(e.capex)      ? `<div class="row"><div class="k">Capex:</div><div class="v">${n(e.capex)} EUR</div></div>` : ""}
        ${Number.isFinite(e.opex)       ? `<div class="row"><div class="k">Opex:</div><div class="v">${n(e.opex)} EUR/yr</div></div>` : ""}
      `;
    }

    _tipShow(html, cx, cy) {
      const rect = this._root.getBoundingClientRect();
      this._tip.innerHTML = html;
      this._tip.style.left = `${cx - rect.left}px`;
      this._tip.style.top  = `${cy - rect.top}px`;
      this._tip.classList.add("show");
    }

    _tipHide(){ this._tip.classList.remove("show"); }

    _render(isResize=false){
      if (!this._initialized) return;

      const rootW = this._root.clientWidth;
      const rootH = this._root.clientHeight;
      if (rootW < 120 || rootH < 120) { this._pendingDraw = true; return; }

      const P=this._data.project,
            A=this._data.abatement,
            M=this._data.mac;

      if (!P.length){ this._plotDiv.innerHTML="No data"; return; }

      let rows = P.map((p,i)=>({ Project:p, Abate:A[i], MAC:M[i], extra:this._data.extra[i] }));
      rows.sort((a,b)=>a.MAC-b.MAC);

      const total  = rows.reduce((s,r)=>s+r.Abate,0);
      const capPct = clamp(this._style.widthCap,1,50)/100;
      const minPct = clamp(this._style.minWidth,0.05,5)/100;
      const capLim = total*capPct;
      const minLim = total*minPct;

      rows = rows.map(r=>({...r, AbateShown:clamp(r.Abate,minLim,capLim)}));

      const pxToDom = total / Math.max(1, this._plotDiv.clientWidth || rootW);
      rows = rows.map(r=>({...r, AbateShown:Math.max(r.AbateShown,20*pxToDom)}));

      let c=0;
      rows = rows.map(r=>{ let xs=c, xe=c+r.AbateShown; c=xe; return {...r,x_mid:(xs+xe)/2}; });

      const x  = rows.map(r=>r.x_mid);
      const y  = rows.map(r=>r.MAC);
      const w  = rows.map(r=>r.AbateShown);
      const col= rows.map(r=>macColor(r.MAC));

      const barTrace = {
        type:"bar",
        x,y,width:w,
        marker:{ color:col, line:{ color:"rgba(0,0,0,0.9)", width:1.5 }},
        hoverinfo:"none",
        customdata: rows.map(r=>([
          r.Project.label, r.Project.key, r.Abate, r.MAC,
          r.extra?.cumulative, r.extra?.npv, r.extra?.capex, r.extra?.opex, r.extra?.category
        ]))
      };

      const layout={
        margin:{t:50,l:80,r:40,b:60},
        hovermode:"closest",
        hoverdistance:25,
        spikedistance:25,
        xaxis:{title:"Total Abatement (tCO₂e)"},
        yaxis:{title:"MAC (EUR/tCO₂e)"}
      };

      const draw = () => {
        Plotly.newPlot(this._plotDiv,[barTrace],layout,{responsive:true})
          .then(gd=>{
            this._plotted=true;

            setTimeout(()=>{ try{ Plotly.Plots.resize(gd); }catch(_){ } },90);

            gd.on("plotly_hover", ev => {
              console.log("[MACC] plotly_hover fired");
              const p = ev?.points?.[0];
              if (!p) return;
              const idx = p.pointIndex;
              const row = rows[idx];
              if (!row) return;
              this._tipShow(this._tipHtml(row), ev.event.clientX, ev.event.clientY);
            });

            gd.on("plotly_unhover", () => this._tipHide());

            // LA disabled in this stable version
          })
          .catch(e=>{
            console.error("Plot error:",e);
            this._plotDiv.innerHTML="Plot error";
          });
      };

      setTimeout(draw, isResize ? 40 : 100);
    }
  }

  if (!customElements.get("variable-width-macc"))
    customElements.define("variable-width-macc", VariableWidthMACC);

})();
