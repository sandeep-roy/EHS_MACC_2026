(function () {

  // ============================================================================
  //  VARIABLE WIDTH MACC — v1.7.9a
  //  - Legend (Excel-style 5-bucket MAC color scale)
  //  - True variable-width bars (proportional to Total Abatement)
  //  - HTML Tooltip with full KPIs (MAC, Abatement, CumAbate, NPV, Capex, Opex)
  //  - Zoom/Pan/Reset stable (event rebind after every Plotly lifecycle event)
  //  - SAC-safe (MutationObserver for hoverlayer/modebar suppression)
  //  - Lifecycle safe (connectedCallback/disconnectedCallback + cleanup)
  //  - No SAC override on hover (Plotly hoverlayer disabled)
  // ============================================================================

  const template = document.createElement("template");

  (function buildTemplate() {

    const styleEl = document.createElement("style");
    styleEl.textContent = `

      :host { display:block; width:100%; height:100%; }

      /* ROOT container */
      #macc-root {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        pointer-events: auto !important;
        z-index: 5;
      }

      #macc-plot {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      /* Always suppress Plotly's default tooltip + modebar */
      #macc-plot .hoverlayer {
        display: none !important;
      }
      #macc-plot .modebar {
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
      #macc-tip.show {
        opacity: 0.98;
      }
      #macc-tip .ttl {
        font-weight: 600;
        margin-bottom: 6px;
      }
      #macc-tip .row {
        display: flex;
        align-items: baseline;
        gap: 6px;
        margin: 2px 0;
      }
      #macc-tip .k {
        color: #555;
        min-width: 145px;
      }
      #macc-tip .v {
        color: #111;
      }

      /* LEGEND (top-right) */
      #macc-legend {
        position: absolute;
        top: 12px;
        right: 10px;
        background: rgba(255,255,255,0.96);
        border: 1px solid rgba(0,0,0,0.12);
        border-radius: 6px;
        padding: 8px 10px;
        box-shadow: 0 4px 14px rgba(0,0,0,0.12);
        font: 12px/1.35 "Segoe UI", Arial, sans-serif;
        color: #222;
        z-index: 20;
        pointer-events: none;
        max-width: 220px;
      }
      #macc-legend .title {
        font-weight: 600;
        margin-bottom: 6px;
      }
      #macc-legend .item {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 2px 0;
      }
      #macc-legend .swatch {
        width: 14px;
        height: 14px;
        border-radius: 3px;
        border: 1px solid rgba(0,0,0,0.25);
        flex: 0 0 14px;
      }
      #macc-legend .label {
        white-space: nowrap;
        color: #222;
      }
    `;

    const root = document.createElement("div");
    root.id = "macc-root";

    const plotDiv = document.createElement("div");
    plotDiv.id = "macc-plot";

    const tooltip = document.createElement("div");
    tooltip.id = "macc-tip";

    const legend = document.createElement("div");
    legend.id = "macc-legend";

    root.appendChild(plotDiv);
    root.appendChild(tooltip);
    root.appendChild(legend);

    template.content.appendChild(styleEl);
    template.content.appendChild(root);
  })();


  // ============================================================================
  // UTILITY HELPERS
  // ============================================================================

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  function macColorFactory(th) {
    const { neg2, neg1, pos1, pos2 } = th;
    return (v) => {
      if (v <= neg2) return "#2ECC71";   // deep green
      if (v <= neg1) return "#ABEBC6";   // light green
      if (v <= pos1) return "#F7DC6F";   // yellow
      if (v <= pos2) return "#F5B041";   // orange
      return "#E74C3C";                  // red
    };
  }

  const dimSlot = (row, idx) => row?.[`dimension_${idx}`] || null;

  const meas = (row, id) => {
    const val = row?.[`${id}_0`];
    return (typeof val === "object" && val !== null)
      ? val.raw
      : val;
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
      if (d0?.id) return d0.id;
    } catch (_) {}
    return "Project_ID";
  }

  // Load Plotly if needed
  function ensurePlotly() {
    if (window.Plotly?.newPlot) return Promise.resolve();
    if (window.__maccPlotlyLoading) return window.__maccPlotlyLoading;

    window.__maccPlotlyLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.plot.ly/plotly-2.27.0.min.js";
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    return window.__maccPlotlyLoading;
  }
  class VariableWidthMACC extends HTMLElement {

    constructor(){
      super();

      this._shadow  = this.attachShadow({ mode:"open" });
      this._shadow.appendChild(template.content.cloneNode(true));

      // DOM refs
      this._root    = this._shadow.querySelector("#macc-root");
      this._plotDiv = this._shadow.querySelector("#macc-plot");
      this._tip     = this._shadow.querySelector("#macc-tip");
      this._legend  = this._shadow.querySelector("#macc-legend");

      // Version marker
      this._version = "v1.7.9a";
      console.log("%c[MACC] Loaded", "color:green", this._version);

      // State
      this._initialized = false;
      this._plotted     = false;
      this._graph       = null;
      this._isConnected = true;

      // Linked Analysis disabled (safe during tooltip/zoom dev)
      this._supportsLA = false;

      // Data + style state
      this._props = {};
      this._data  = { project:[], abatement:[], mac:[], extra:[] };

      this._style = {
        fontSize: 12,

        // BAR WIDTH CONTROL (true variable width)
        minBarPx: 6,   // tiny projects visible
        // maxBarPx not used — width comes directly from abatement

        // Excel-style MAC thresholds (legend + color)
        macThresh: { neg2:-500, neg1:0, pos1:300, pos2:1000 },

        // Legend settings
        showLegend: true,
        legendTitle: "MAC Color Legend"
      };
      this._macColor = macColorFactory(this._style.macThresh);

      this._dimTechId = null;

      // Hover/pointer handlers
      this._onMoveHandler  = null;
      this._onLeaveHandler = null;

      // Overlay suppression observer
      this._overlayMO = null;

      // Timer registry
      this._timeouts = [];

      // Resize debounce
      this._resizeTimer = null;
      this._ro = new ResizeObserver(()=>{
        this._clearAllTimeouts();
        this._setTimeout(()=> this._render(true), 100);
      });

      // Wait for Plotly, then initialize
      ensurePlotly().then(()=>{
        this._initialized = true;
        if (this._root.isConnected) this._ro.observe(this._root);
        this._renderLegend();
        this._render();
      });
    }


    // ============================================================================
    // TIMER HELPERS (SAFE CLEANUP)
    // ============================================================================
    _setTimeout(fn, ms) {
      const id = setTimeout(() => {
        this._timeouts = this._timeouts.filter(t => t !== id);
        try { fn(); } catch(_) {}
      }, ms);
      this._timeouts.push(id);
      return id;
    }

    _clearAllTimeouts() {
      try { this._timeouts.forEach(id => clearTimeout(id)); } catch(_){}
      this._timeouts = [];
    }


    // ============================================================================
    // OVERLAY SUPPRESSION (HIDE PLOTLY TOOLTIP/MODEBAR)
    // ============================================================================
    _suppressPlotlyOverlays() {
      try {
        this._plotDiv?.querySelectorAll(".hoverlayer,.modebar")
          .forEach(el => el && (el.style.display = "none"));
      } catch(_) {}
    }

    _startOverlayObserver() {
      this._stopOverlayObserver();
      this._overlayMO = new MutationObserver(() => this._suppressPlotlyOverlays());
      this._overlayMO.observe(this._plotDiv, { childList:true, subtree:true });
    }

    _stopOverlayObserver() {
      try { this._overlayMO?.disconnect(); } catch(_){}
      this._overlayMO = null;
    }


    // ============================================================================
    // LIFECYCLE — BEST PRACTICE (attach/detach cleanly)
    // ============================================================================
    connectedCallback() {
      this._isConnected = true;

      try { if (this._initialized) this._ro.observe(this._root); } catch(_){}

      // If SAC detached/purged Plotly but widget reappears — re-render
      if (this._initialized && !this._graph && (this._data?.project?.length || 0) > 0) {
        this._setTimeout(()=> this._render(), 0);
      }
    }

    disconnectedCallback() {
      this._isConnected = false;

      // stop tooltip
      try { this._tipHide?.(); } catch(_){}

      // stop overlays observer
      this._stopOverlayObserver();

      // stop resize observer
      try { this._ro?.disconnect?.(); } catch(_){}

      // remove hover listeners
      try {
        if (this._onMoveHandler)
          this._plotDiv?.removeEventListener("mousemove", this._onMoveHandler);
        if (this._onLeaveHandler)
          this._plotDiv?.removeEventListener("mouseleave", this._onLeaveHandler);
      } catch(_){}
      this._onMoveHandler = this._onLeaveHandler = null;

      // purge Plotly
      try { if (this._graph) Plotly.purge(this._plotDiv); } catch(_){}
      this._graph = null;

      // clear pending timeouts
      this._clearAllTimeouts();
    }

    /** Optional SAC hooks */
    onCustomWidgetEnterDom()  { this.connectedCallback(); }
    onCustomWidgetLeaveDom()  { this.disconnectedCallback(); }
    // ============================================================================
    // DATA BINDING + APPLICATION OF PROPERTIES
    // ============================================================================

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

    onCustomWidgetBeforeUpdate(props){ this._apply(props); }
    onCustomWidgetAfterUpdate(props){  this._apply(props); }

    _apply(props){
      if (!props) return;
      this._props = props;

      // Ingest incoming SAC data
      if ("maccBinding" in props) {
        this._ingest(props.maccBinding);
      }

      // OPTIONAL RUNTIME PROPERTIES
      if (props.fontSize)
        this._style.fontSize = Number(props.fontSize) || 12;

      if (props.minBarPx)
        this._style.minBarPx = Math.max(1, Number(props.minBarPx));

      if (props.showLegend !== undefined)
        this._style.showLegend = !!props.showLegend;

      if (props.legendTitle)
        this._style.legendTitle = String(props.legendTitle);

      // MAC color thresholds
      if (props.macNeg2 !== undefined ||
          props.macNeg1 !== undefined ||
          props.macPos1 !== undefined ||
          props.macPos2 !== undefined) {

        this._style.macThresh = {
          neg2: props.macNeg2 ?? this._style.macThresh.neg2,
          neg1: props.macNeg1 ?? this._style.macThresh.neg1,
          pos1: props.macPos1 ?? this._style.macThresh.pos1,
          pos2: props.macPos2 ?? this._style.macThresh.pos2
        };

        this._macColor = macColorFactory(this._style.macThresh);
        this._renderLegend();
      }

      this._render();
    }


    // ============================================================================
    // INGEST SAC DATA → INTERNAL FORMAT
    // ============================================================================

    _ingest(binding){
      try {
        const rows = binding?.data || [];
        if (!rows.length){
          this._plotDiv.innerHTML = "No data";
          this._plotted = false;
          return;
        }

        this._dimTechId = detectDimTechId(binding, rows);

        const proj=[], ab=[], mc=[], ex=[];

        for (const r of rows) {

          const d0   = dimSlot(r, 0);   // Project ID
          const dCat = dimSlot(r, 1);   // Category

          const member = d0?.uniqueName || d0?.id || d0?.label;
          const label  = d0?.label || d0?.id || String(member);
          const key    = String(member);

          const abVal = Number(meas(r,"measure_abate")) || 0;
          const macVal= Number(meas(r,"measure_mac"))   || 0;

          proj.push({ label, key });
          ab.push(abVal);
          mc.push(macVal);

          ex.push({
            cumulative : meas(r,"measure_cum"),
            npv        : meas(r,"measure_npv"),
            capex      : meas(r,"measure_capex"),
            opex       : meas(r,"measure_opex"),
            category   : dCat?.label ?? dCat?.id
          });
        }

        this._data = {
          project: proj,
          abatement: ab,
          mac: mc,
          extra: ex
        };

        this._render();
      }
      catch(e){
        console.error("MACC ingest error:", e);
      }
    }


    // ============================================================================
    // LEGEND (Classic 5-Bucket MAC Color Legend)
    // ============================================================================

    _formatN(n){
      return (Number(n)).toLocaleString(undefined,{maximumFractionDigits:0});
    }

    _renderLegend(){
      if (!this._legend) return;

      if (!this._style.showLegend){
        this._legend.style.display = "none";
        return;
      }

      const th = this._style.macThresh;

      const buckets = [
        { color:"#2ECC71", label:`MAC ≤ ${this._formatN(th.neg2)}` },
        { color:"#ABEBC6", label:`${this._formatN(th.neg2)} to ${this._formatN(th.neg1)}` },
        { color:"#F7DC6F", label:`${this._formatN(th.neg1)} to ${this._formatN(th.pos1)}` },
        { color:"#F5B041", label:`${this._formatN(th.pos1)} to ${this._formatN(th.pos2)}` },
        { color:"#E74C3C", label:`> ${this._formatN(th.pos2)}` }
      ];

      const html = [
        `<div class="title">${this._style.legendTitle}</div>`,
        ...buckets.map(b => `
          <div class="item">
            <span class="swatch" style="background:${b.color}"></span>
            <span class="label">${b.label}</span>
          </div>
        `)
      ].join("");

      this._legend.innerHTML = html;
      this._legend.style.display = "block";
    }


    // ============================================================================
    // HTML TOOLTIP ENGINE
    // ============================================================================

    _tipHtml(row){
      const e = row.extra || {};
      const fmt = (v,d=0)=>
        (Number.isFinite(+v)? (+v).toLocaleString(undefined,{maximumFractionDigits:d}) : "–");

      return `
        <div class="ttl">${row.Project?.label ?? ""}</div>

        <div class="row"><div class="k">Project ID:</div>
             <div class="v">${row.Project.key ?? "–"}</div></div>

        ${e.category ? `
          <div class="row"><div class="k">Category:</div>
               <div class="v">${e.category}</div></div>
        ` : ""}

        <div class="row"><div class="k">MAC:</div>
             <div class="v">${fmt(row.MAC,2)} EUR/tCO₂e</div></div>

        <div class="row"><div class="k">Total abatement:</div>
             <div class="v">${fmt(row.Abate)} tCO₂e</div></div>

        <div class="row"><div class="k">Cumulative abatement:</div>
             <div class="v">${fmt(e.cumulative)} tCO₂e</div></div>

        <div class="row"><div class="k">NPV cost:</div>
             <div class="v">${fmt(e.npv)} EUR</div></div>

        <div class="row"><div class="k">Capex:</div>
             <div class="v">${fmt(e.capex)} EUR</div></div>

        <div class="row"><div class="k">Opex:</div>
             <div class="v">${fmt(e.opex)} EUR/yr</div></div>
      `;
    }

    _tipMove(clientX, clientY){
      const rect = this._root.getBoundingClientRect();
      this._tip.style.left = `${clientX - rect.left}px`;
      this._tip.style.top  = `${clientY - rect.top}px`;
    }

    _tipHide(){
      this._tip.classList.remove("show");
    }
    // ============================================================================
    // RE-BIND HOVER HANDLERS (HTML tooltip)
    // ============================================================================

    _bindHoverHandlers(gd, rows) {

      // Remove old handlers to avoid duplicates
      gd.removeAllListeners?.("plotly_hover");
      gd.removeAllListeners?.("plotly_unhover");

      // When user hovers a bar
      gd.on("plotly_hover", (ev) => {
        const p = ev?.points?.[0];
        if (!p) return;

        const row = rows[p.pointIndex];
        if (!row) return;

        this._tip.innerHTML = this._tipHtml(row);
        this._tip.classList.add("show");

        if (ev.event?.clientX != null && ev.event?.clientY != null) {
          this._tipMove(ev.event.clientX, ev.event.clientY);
        }
      });

      // When mouse leaves hover area
      gd.on("plotly_unhover", () => this._tipHide());

      // Move tooltip smoothly with mouse
      const onMove = (e) => {
        if (this._tip.classList.contains("show")) {
          this._tipMove(e.clientX, e.clientY);
        }
      };

      const onLeave = () => this._tipHide();

      // Remove old movement listeners if existing
      this._plotDiv.removeEventListener("mousemove", this._onMoveHandler);
      this._plotDiv.removeEventListener("mouseleave", this._onLeaveHandler);

      // Register new handlers
      this._onMoveHandler  = onMove;
      this._onLeaveHandler = onLeave;

      this._plotDiv.addEventListener("mousemove", onMove, { passive:true });
      this._plotDiv.addEventListener("mouseleave", onLeave, { passive:true });
    }



    // ============================================================================
    // RENDER (Zoom-stable, SAC-stable, variable-width engine)
    // ============================================================================

    _render(isResize=false){
      if (!this._initialized || this._isConnected === false) return;

      const rootW = this._root.clientWidth;
      const rootH = this._root.clientHeight;

      if (rootW < 120 || rootH < 120) return;

      const P = this._data.project;
      const A = this._data.abatement;
      const M = this._data.mac;

      if (!P.length){
        this._plotDiv.innerHTML = "No data";
        this._plotted = false;
        return;
      }

      // Build rows
      let rows = P.map((p,i)=>({
        Project: p,
        Abate  : A[i],
        MAC    : M[i],
        extra  : this._data.extra[i]
      }));

      // Sort by MAC ascending
      rows.sort((a,b)=> a.MAC - b.MAC);

      // TRUE VARIABLE WIDTH in domain units
      const totalAb = rows.reduce((s,r)=>s+r.Abate,0);
      const pxToDom = totalAb / Math.max(1, this._plotDiv.clientWidth || rootW);
      const minDom  = this._style.minBarPx * pxToDom;

      rows = rows.map(r=>({
        ...r,
        AbateShown: Math.max(r.Abate, minDom)
      }));

      // Build x positions sequentially
      let c = 0;
      rows = rows.map(r => {
        const xs = c, xe = c + r.AbateShown;
        c = xe;
        return { ...r, x_mid:(xs + xe) / 2 };
      });

      const x   = rows.map(r => r.x_mid);
      const y   = rows.map(r => r.MAC);
      const w   = rows.map(r => r.AbateShown);
      const col = rows.map(r => this._macColor(r.MAC));

      const barTrace = {
        type: "bar",
        x,
        y,
        width: w,
        marker:{
          color: col,
          line:{ color:"rgba(0,0,0,0.9)", width:1.5 }
        },
        hoverinfo:"none",
        customdata: rows.map(r => ([
          r.Project.label,
          r.Project.key,
          r.Abate,
          r.MAC,
          r.extra?.cumulative,
          r.extra?.npv,
          r.extra?.capex,
          r.extra?.opex,
          r.extra?.category
        ]))
      };

      const layout = {
        margin:{ t:50, l:80, r:40, b:60 },
        hovermode:"closest",
        hoverdistance:25,
        spikedistance:25,
        xaxis:{ title:"Total Abatement (tCO₂e)" },
        yaxis:{ 
title: "MAC (EUR/tCO₂e)",
+ zeroline: true,
+ zerolinecolor: "#000",
+ zerolinewidth: 2,
+ range: [
+   -Math.max(...y.map(v => Math.abs(v))),
+    Math.max(...y.map(v => Math.abs(v)))
+ ]
 }
      };

      // Debounced + deferred rendering for SAC layout stability
      this._clearAllTimeouts();
      this._setTimeout(() => {

        Plotly.newPlot(this._plotDiv, [barTrace], layout, {
          responsive:true,
          displayModeBar:false,
          displaylogo:false
        }).then(gd => {

          this._graph   = gd;
          this._plotted = true;

          // Ensure the graph resized after initial paint
          this._setTimeout(() => {
            try { Plotly.Plots.resize(gd); } catch(_) {}
          }, 90);

          // Suppress overlays and attach mutation observer
          this._suppressPlotlyOverlays();
          this._startOverlayObserver();

          // Rebind hover handlers after each Plotly lifecycle event
          const rebind = () => {
            this._suppressPlotlyOverlays();
            this._bindHoverHandlers(gd, rows);
          };

          // Initial binding
          rebind();

          gd.on("plotly_relayout",    () => { this._tipHide(); rebind(); });
          gd.on("plotly_redraw",      () => { rebind(); });
          gd.on("plotly_autosize",    () => { rebind(); });
          gd.on("plotly_doubleclick", () => { this._tipHide(); rebind(); });
        })

        .catch(err => {
          console.error("Plot error:", err);
          this._plotDiv.innerHTML = "Plot error";
        });

      }, isResize ? 40 : 100);
    }
  }


  // ============================================================================
  // CUSTOM ELEMENT REGISTRATION
  // ============================================================================

  if (!customElements.get("variable-width-macc")) {
    customElements.define("variable-width-macc", VariableWidthMACC);
  }

})();
