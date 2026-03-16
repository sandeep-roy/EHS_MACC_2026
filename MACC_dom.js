(function () {

  // ============================================================================
  //  VARIABLE WIDTH MACC — v1.7.9 (Legend + HTML tooltip, SAC-safe)
  //  - Classic 5-bucket legend for MAC (Excel-style thresholds)
  //  - HTML tooltip (Category, Cum, NPV, Capex, Opex, MAC, Abate, ID & Label)
  //  - Bars are truly variable-width: proportional to Total abatement
  //  - Zoom/pan/autosize/double-click stable (rebind each cycle)
  //  - Plotly toolbar hidden + hoverlayer suppressed (CSS + JS)
  //  - Debounced + deferred rendering for SAC responsive layout
  //  - Linked Analysis disabled in this build (we can re-enable later)
  // ============================================================================

  // ---------- Shadow DOM template ----------
  const template = document.createElement("template");
  (function buildTemplate() {
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      :host { display:block; width:100%; height:100%; }

      /* Root container (anchor for tooltip & legend positioning) */
      #macc-root {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
        pointer-events: auto !important;
        z-index: 5;
      }

      /* Plotly render target */
      #macc-plot {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      /* Suppress Plotly's native hover bubble & toolbar always */
      #macc-plot .hoverlayer { display: none !important; }
      #macc-plot .modebar    { display: none !important; }

      /* HTML tooltip panel */
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
        transform: translate(-50%,-110%);
        transition: opacity 80ms ease-out;
      }
      #macc-tip.show { opacity: 0.98; }
      #macc-tip .ttl { font-weight: 600; margin-bottom: 6px; }
      #macc-tip .row { display:flex; align-items:baseline; gap:6px; }
      #macc-tip .k   { color:#555; min-width:145px; }
      #macc-tip .v   { color:#111; }

      /* Classic 5-bucket MAC legend (top-right) */
      #macc-legend {
        position: absolute;
        top: 8px;
        right: 10px;
        background: rgba(255,255,255,0.96);
        border: 1px solid rgba(0,0,0,0.12);
        border-radius: 6px;
        box-shadow: 0 4px 14px rgba(0,0,0,0.12);
        padding: 8px 10px;
        font: 12px/1.3 "Segoe UI", Arial, sans-serif;
        color: #222;
        z-index: 20;
        pointer-events: none;  /* strictly display */
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
        width: 14px; height: 14px;
        border-radius: 3px;
        border: 1px solid rgba(0,0,0,0.25);
        flex: 0 0 14px;
      }
      #macc-legend .label {
        color: #222;
        white-space: nowrap;
      }
    `;

    const root   = document.createElement("div");
    root.id = "macc-root";

    const plot   = document.createElement("div");
    plot.id = "macc-plot";

    const tip    = document.createElement("div");
    tip.id = "macc-tip";

    const legend = document.createElement("div");
    legend.id = "macc-legend";

    root.appendChild(plot);
    root.appendChild(tip);
    root.appendChild(legend);

    template.content.appendChild(styleEl);
    template.content.appendChild(root);
  })();

  // ---------- Utility helpers ----------
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

  // Excel-like MAC color ramp with adjustable thresholds
  function macColorFactory(th) {
    const { neg2, neg1, pos1, pos2 } = th; // defaults below
    return (v) => {
      if (v <= neg2) return "#2ECC71";  // deep green
      if (v <= neg1) return "#ABEBC6";  // light green
      if (v <= pos1) return "#F7DC6F";  // yellow
      if (v <= pos2) return "#F5B041";  // orange
      return "#E74C3C";                 // red
    };
  }

  const dimSlot = (r, idx) => r?.[`dimension_${idx}`] || null;
  const meas    = (r, id)  => {
    const v = r?.[`${id}_0`];
    return (typeof v === "object" && v !== null) ? v.raw : v; // SAC measure objects sometimes hold {raw, formatted}
  };

  function detectDimTechId(binding, rows){
    try {
      const md = binding?.metadata?.dimensions;
      if (md?.dimension_0?.id) return String(md.dimension_0.id);
      if (Array.isArray(md) && md[0]?.id) return String(md[0].id);
    } catch(_) {}
    try {
      const d0 = rows?.[0]?.dimension_0;
      if (d0?.dimensionId) return d0.dimensionId;
      if (d0?.id) return d0.id;
    } catch(_) {}
    return "Project_ID"; // safe fallback for your model
  }

  // ---------- Plotly loader ----------
  function ensurePlotly() {
    if (window.Plotly?.newPlot) return Promise.resolve();
    if (window.__maccPlotlyLoading) return window.__maccPlotlyLoading;
    window.__maccPlotlyLoading = new Promise((resolve,reject)=>{
      const s = document.createElement("script");
      s.src   = "https://cdn.plot.ly/plotly-2.27.0.min.js";
      s.async = true;
      s.onload= resolve;
      s.onerror= reject;
      document.head.appendChild(s);
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
      this._version = "v1.7.9";
      console.log("%c[MACC] Loaded", "color:green", this._version);

      // State
      this._initialized = false;
      this._plotted     = false;

      // Linked Analysis disabled (we can re-enable later)
      this._supportsLA  = false;

      // Data & style state
      this._props = {};
      this._data  = { project:[], abatement:[], mac:[], extra:[] };

      this._style = {
        fontSize: 12,

        // TRUE variable width control
        minBarPx: 6,   // small pixel floor so tiny projects are still visible

        // Excel-style MAC thresholds (A: classic bucket legend)
        macThresh: { neg2:-500, neg1:0, pos1:300, pos2:1000 },

        // Legend toggles
        showLegend: true,
        legendTitle: "MAC Color Legend"
      };
      this._macColor = macColorFactory(this._style.macThresh);

      this._dimTechId = null;

      // Mouse handlers (avoid duplicates on rebinding)
      this._onMoveHandler  = null;
      this._onLeaveHandler = null;

      // MutationObserver for Plotly overlays
      this._overlayMO = null;

      // Resize debounce
      this._resizeTimer = null;
      this._ro = new ResizeObserver(()=>{
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(()=> this._render(true), 100);
      });

      ensurePlotly().then(()=>{
        this._initialized = true;
        if (this._root.isConnected) this._ro.observe(this._root);
        this._renderLegend(); // draw legend immediately with defaults
        this._render();
      });
    }

    connectedCallback(){ if (this._initialized) this._ro.observe(this._root); }
    disconnectedCallback(){
      try{ this._ro.disconnect(); }catch(_){}
      try{
        if (this._onMoveHandler)  this._plotDiv.removeEventListener("mousemove", this._onMoveHandler);
        if (this._onLeaveHandler) this._plotDiv.removeEventListener("mouseleave", this._onLeaveHandler);
      }catch(_){}
      this._stopOverlayObserver();
    }

    // ---------- Data binding contract ----------
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
      if (!props) return;
      this._props = props;

      if ("maccBinding" in props) this._ingest(props.maccBinding);

      // External overrides (optional)
      if (props.fontSize)   this._style.fontSize = Number(props.fontSize)||12;
      if (props.minBarPx)   this._style.minBarPx = Math.max(1, Number(props.minBarPx)||6);
      if (props.showLegend !== undefined) this._style.showLegend = !!props.showLegend;
      if (props.legendTitle) this._style.legendTitle = String(props.legendTitle);

      if (props.macNeg2!=null || props.macNeg1!=null || props.macPos1!=null || props.macPos2!=null) {
        this._style.macThresh = {
          neg2: props.macNeg2 ?? this._style.macThresh.neg2,
          neg1: props.macNeg1 ?? this._style.macThresh.neg1,
          pos1: props.macPos1 ?? this._style.macThresh.pos1,
          pos2: props.macPos2 ?? this._style.macThresh.pos2
        };
        this._macColor = macColorFactory(this._style.macThresh);
        this._renderLegend(); // thresholds changed → refresh legend
      }

      this._render();
    }

    // ---------- Ingest ----------
    _ingest(binding){
      try{
        const rows = binding?.data || [];
        if (!rows.length){
          this._plotDiv.innerHTML = "No data";
          this._plotted = false;
          return;
        }

        this._dimTechId = detectDimTechId(binding, rows);

        const proj=[], ab=[], mc=[], ex=[];
        for (const r of rows) {
          const d0   = dimSlot(r,0);  // Project ID dimension
          const dCat = dimSlot(r,1);  // Category (optional)

          const memberValue  = d0?.uniqueName || d0?.id || d0?.label;
          const projectLabel = d0?.label || d0?.id || String(memberValue);
          const key          = String(memberValue);

          const abVal = Number(meas(r,"measure_abate")) || 0;
          const macVal= Number(meas(r,"measure_mac"))   || 0;

          const cum   = meas(r,"measure_cum");
          const npv   = meas(r,"measure_npv");
          const capex = meas(r,"measure_capex");
          const opex  = meas(r,"measure_opex");
          const cat   = dCat?.label ?? dCat?.id;

          proj.push({ label:projectLabel, key });
          ab.push(abVal);
          mc.push(macVal);
          ex.push({ cumulative:cum, npv, capex, opex, category:cat });
        }

        this._data = { project:proj, abatement:ab, mac:mc, extra:ex };
        this._render();

      }catch(e){
        console.error("Ingest error:", e);
      }
    }

    // ---------- Legend ----------
    _formatN(n){ return (Number(n)).toLocaleString(undefined,{maximumFractionDigits:0}); }
    _renderLegend(){
      if (!this._legend) return;
      if (!this._style.showLegend) { this._legend.style.display="none"; return; }

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
        ...buckets.map(b=>(
          `<div class="item">
             <span class="swatch" style="background:${b.color}"></span>
             <span class="label">${b.label}</span>
           </div>`
        ))
      ].join("");

      this._legend.innerHTML = html;
      this._legend.style.display = "block";
    }

    // ---------- HTML tooltip ----------
    _tipHtml(row) {
      const e = row.extra || {};
      const n = (v,d=0)=>(Number.isFinite(+v)?(+v).toLocaleString(undefined,{maximumFractionDigits:d}):"–");
      const t = [];
      t.push(`<div class="ttl">${row.Project?.label ?? ""}</div>`);
      t.push(`<div class="row"><div class="k">Project ID:</div><div class="v">${row.Project.key ?? "–"}</div></div>`);
      if (e.category) t.push(`<div class="row"><div class="k">Category:</div><div class="v">${e.category}</div></div>`);
      t.push(`<div class="row"><div class="k">MAC:</div><div class="v">${n(row.MAC,2)} EUR/tCO₂e</div></div>`);
      t.push(`<div class="row"><div class="k">Total abatement:</div><div class="v">${n(row.Abate)} tCO₂e</div></div>`);
      t.push(`<div class="row"><div class="k">Cumulative abatement:</div><div class="v">${n(e.cumulative)} tCO₂e</div></div>`);
      t.push(`<div class="row"><div class="k">NPV cost:</div><div class="v">${n(e.npv)} EUR</div></div>`);
      t.push(`<div class="row"><div class="k">Capex:</div><div class="v">${n(e.capex)} EUR</div></div>`);
      t.push(`<div class="row"><div class="k">Opex:</div><div class="v">${n(e.opex)} EUR/yr</div></div>`);
      return t.join("");
    }
    _tipMove(clientX, clientY){
      const rect = this._root.getBoundingClientRect();
      this._tip.style.left = `${clientX - rect.left}px`;
      this._tip.style.top  = `${clientY - rect.top}px`;
    }
    _tipHide(){ this._tip.classList.remove("show"); }

    // ---------- Overlays suppression ----------
    _suppressPlotlyOverlays() {
      try {
        this._plotDiv.querySelectorAll(".hoverlayer,.modebar")
          .forEach(n => n && (n.style.display = "none"));
      } catch (_) {}
    }
    _startOverlayObserver() {
      this._stopOverlayObserver();
      this._overlayMO = new MutationObserver(() => this._suppressPlotlyOverlays());
      this._overlayMO.observe(this._plotDiv, { childList: true, subtree: true });
    }
    _stopOverlayObserver() {
      try { this._overlayMO?.disconnect(); } catch(_) {}
    }

    // ---------- (Re)bind hover handlers ----------
    _bindHoverHandlers(gd, rows) {
      // prevent duplicates
      gd.removeAllListeners?.("plotly_hover");
      gd.removeAllListeners?.("plotly_unhover");

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

      gd.on("plotly_unhover", () => this._tipHide());

      // Keep tooltip following pointer (Plotly may not refire 'hover' every pixel)
      const onMove = (e) => {
        if (this._tip.classList.contains("show")) this._tipMove(e.clientX, e.clientY);
      };
      const onLeave = () => this._tipHide();

      this._plotDiv.removeEventListener("mousemove", this._onMoveHandler);
      this._plotDiv.removeEventListener("mouseleave", this._onLeaveHandler);
      this._onMoveHandler  = onMove;
      this._onLeaveHandler = onLeave;
      this._plotDiv.addEventListener("mousemove", this._onMoveHandler, { passive:true });
      this._plotDiv.addEventListener("mouseleave", this._onLeaveHandler, { passive:true });
    }

    // ---------- Render ----------
    _render(isResize=false){
      if (!this._initialized) return;

      const rootW = this._root.clientWidth;
      const rootH = this._root.clientHeight;
      if (rootW < 120 || rootH < 120) return;

      const P=this._data.project,
            A=this._data.abatement,
            M=this._data.mac;

      if (!P.length){ this._plotDiv.innerHTML="No data"; this._plotted=false; return; }

      // Build rows & sort by MAC
      let rows = P.map((p,i)=>({ Project:p, Abate:A[i], MAC:M[i], extra:this._data.extra[i] }));
      rows.sort((a,b)=>a.MAC-b.MAC);

      // === TRUE VARIABLE WIDTH (domain = abatement units) ===
      const totalAb = rows.reduce((s,r)=>s+r.Abate,0);
      const pxToDom = totalAb / Math.max(1, this._plotDiv.clientWidth || rootW); // domain units per pixel
      const minDom  = this._style.minBarPx * pxToDom;                              // pixel floor in domain units

      rows = rows.map(r=>({ ...r, AbateShown: Math.max(r.Abate, minDom) }));

      // Place bars sequentially across the x-axis using the variable widths
      let c=0;
      rows = rows.map(r=>{ const xs=c, xe=c+r.AbateShown; c=xe; return {...r, x_mid:(xs+xe)/2}; });

      const x  = rows.map(r=>r.x_mid);
      const y  = rows.map(r=>r.MAC);
      const w  = rows.map(r=>r.AbateShown);
      const col= rows.map(r=>this._macColor(r.MAC));

      const barTrace = {
        type:"bar",
        x, y, width:w,
        marker:{ color:col, line:{ color:"rgba(0,0,0,0.9)", width:1.5 }},
        hoverinfo:"none",   // we manage tooltip
        customdata: rows.map(r=>([
          r.Project.label, r.Project.key, r.Abate, r.MAC,
          r.extra?.cumulative, r.extra?.npv, r.extra?.capex, r.extra?.opex, r.extra?.category
        ]))
      };

      const layout={
        margin:{t:50,l:80,r:40,b:60},
        hovermode:"closest",        // keep Plotly hit-testing ON
        hoverdistance:25,
        spikedistance:25,
        xaxis:{title:"Total Abatement (tCO₂e)"},
        yaxis:{title:"MAC (EUR/tCO₂e)"}
      };

      // Defer the draw slightly so SAC has settled the responsive layout
      setTimeout(() => {
        Plotly.newPlot(this._plotDiv, [barTrace], layout, {
          responsive: true,
          displayModeBar: false,    // hide toolbar
          displaylogo: false
        }).then(gd => {
          this._plotted = true;

          // one more resize to ensure correct sampling after first paint
          setTimeout(() => { try{ Plotly.Plots.resize(gd); }catch(_){ } }, 90);

          // Suppress overlays now & on every redraw; rebind hover handlers every cycle
          this._suppressPlotlyOverlays();
          this._startOverlayObserver();
          const rebind = () => {
            this._suppressPlotlyOverlays();
            this._bindHoverHandlers(gd, rows);
          };
          rebind();

          gd.on("plotly_relayout",    () => { this._tipHide(); rebind(); });
          gd.on("plotly_redraw",      rebind);
          gd.on("plotly_autosize",    rebind);
          gd.on("plotly_doubleclick", () => { this._tipHide(); rebind(); });

        }).catch(e=>{
          console.error("Plot error:",e);
          this._plotDiv.innerHTML="Plot error";
        });
      }, isResize ? 40 : 100);
    }
  }

  if (!customElements.get("variable-width-macc"))
    customElements.define("variable-width-macc", VariableWidthMACC);

})();
