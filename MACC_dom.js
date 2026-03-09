(function () {

  // ---------- Shadow DOM template (SAC-safe, not escaped) ----------
  const template = document.createElement("template");
  template.innerHTML = `
    <style>
      :host { display:block; width:100%; height:100%; }
      #macc-container { width:100%; height:100%; position:relative; }
      /* Plotly modebar position tweak (top-right) */
      #macc-container .modebar {
        right: 6px !important; left: auto !important; top: 6px !important;
      }
    </style>
    <div id="macc-container"></div>
  `;

  // Clamp helper
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Positive MAC gradient bins
  const macBinColor = (v) => {
    if (v < 0)   return "rgba(39,174,96,0.95)";   // green
    if (v < 25)  return "rgba(241,196,15,0.95)";  // yellow
    if (v < 50)  return "rgba(230,126,34,0.95)";  // orange
                 return "rgba(231,76,60,0.95)";   // red
  };

  // Singleton loader for Plotly
  function ensurePlotly() {
    if (window.Plotly && window.Plotly.newPlot) return Promise.resolve();
    if (window.__maccPlotlyLoading)             return window.__maccPlotlyLoading;

    window.__maccPlotlyLoading = new Promise((resolve, reject) => {
      try {
        const s = document.createElement("script");
        s.src   = "https://cdn.plot.ly/plotly-2.27.0.min.js";
        s.async = true;
        s.onload = () => resolve();
        s.onerror = (e) => reject(e);
        document.head.appendChild(s);
      } catch (e) {
        reject(e);
      }
    });
    return window.__maccPlotlyLoading;
  }

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
      this._data = { project: [], abatement: [], mac: [] };

      // Styling properties (same as your styling panel)
      this._style = {
        widthCap: 10,     // %
        minWidth: 0.2,    // %
        xPadding: 5,      // %
        fontSize: 12,     // px
        colorMode: "gradient"
      };

      // Technical dimension id for Linked Analysis
      this._dimTechId = "dimension";

      // Bind handlers
      this._onResizeObs = this._onResizeObs.bind(this);

      // ResizeObserver
      this._ro = new (window.ResizeObserver || class { observe(){} disconnect(){} })(this._onResizeObs);

      // Kick off Plotly load; render after load
      ensurePlotly().then(() => {
        this._initialized = true;
        if (this._container.isConnected) this._ro.observe(this._container);
        this._render();
      }).catch((e) => {
        console.error("[MACC DOM] Failed to load Plotly:", e);
        this._setEmpty("Plotly failed to load.");
      });
    }

    connectedCallback() {
      try { if (this._initialized) this._ro.observe(this._container); } catch(_){}
    }
    disconnectedCallback() {
      try { this._ro.disconnect(); } catch(_){}
    }

    // ---------- Data binding feeds ----------
    getDataBindings() {
      return {
        maccBinding: {
          feeds: [
            { id: "dimension",     type: "dimension" },
            { id: "measure_abate", type: "mainStructureMember" },
            { id: "measure_mac",   type: "mainStructureMember" }
          ]
        }
      };
    }

    // ---------- Styling panel property setters ----------
    set widthCap(v){  this._style.widthCap  = Number(v)||10;  this._render(); }
    set minWidth(v){  this._style.minWidth  = Number(v)||0.2; this._render(); }
    set xPadding(v){  this._style.xPadding  = Number(v)||5;   this._render(); }
    set fontSize(v){  this._style.fontSize  = Number(v)||12;  this._render(); }
    set colorMode(v){ this._style.colorMode = v||"gradient";  this._render(); }

    // ---------- SAC lifecycle ----------
    onCustomWidgetBeforeUpdate(props){ this._applyProps(props); }
    onCustomWidgetAfterUpdate(props){  this._applyProps(props); }
    _applyProps(props){
      if (!props) return;

      // Data
      if ("maccBinding" in props) this._ingest(props.maccBinding);

      // Styling props
      ["widthCap","minWidth","xPadding","fontSize","colorMode"].forEach(p=>{
        if (p in props) this[p] = props[p];
      });
    }

    onCustomWidgetResize() {
      if (this._initialized && this._plotted) {
        try { Plotly.Plots.resize(this._container); } catch(_){}
      }
    }
    _onResizeObs() { this.onCustomWidgetResize(); }

    // ---------- Ingestion ----------
    _ingest(binding){
      try {
        const rows =
          binding?.data || binding?.value || binding?.resultSet || binding?.rows || [];

        if (!Array.isArray(rows) || rows.length === 0) {
          this._setEmpty("No data rows. Check filters.");
          return;
        }

        // Try to pick a technical dimension id to build Linked Analysis selections
        const md = binding.metadata || {};
        this._dimTechId = md?.dimensions?.[0]?.id || md?.dimensions?.[0]?.key || "dimension";

        const proj=[], ab=[], mc=[];
        for (const r of rows) {
          const d  = r.dimension_0 || r.dimensions_0 || (Array.isArray(r.dimensions)? r.dimensions[0] : {}) || {};
          const p  = d.description ?? d.text ?? d.label ?? d.id ?? "";
          const av = r.measure_abate_0?.raw ?? r.measure_abate_0 ?? (Array.isArray(r.measures)? r.measures[0]?.raw : 0) ?? 0;
          const mv = r.measure_mac_0?.raw   ?? r.measure_mac_0   ?? (Array.isArray(r.measures)? r.measures[1]?.raw : 0) ?? 0;

          proj.push(String(p));
          ab.push(Number(av)||0);
          mc.push(Number(mv)||0);
        }

        this._data.project   = proj;
        this._data.abatement = ab;
        this._data.mac       = mc;

        this._render();

      } catch (e) {
        console.error("[MACC DOM] ingest error:", e);
        this._setEmpty("Binding error. See console.");
      }
    }

    // ---------- Rendering ----------
    _setEmpty(msg){
      if (!this._container) return;
      this._container.innerHTML = `<div style="font:12px var(--sapFontFamily,Arial); color:#666; padding:8px;">${msg}</div>`;
      this._plotted = false;
    }

    _render(){
      if (!this._initialized || !this._container) return;

      const P = this._data.project || [];
      const A = this._data.abatement || [];
      const M = this._data.mac || [];

      if (P.length === 0) { this._setEmpty("No data."); return; }
      if (A.length !== P.length || M.length !== P.length) {
        this._setEmpty("Row mismatch between dimension and measures.");
        return;
      }

      // Build rows and sort by MAC
      let rows = [];
      for (let i=0;i<P.length;i++) rows.push({ Project:P[i], Abate:+A[i]||0, MAC:+M[i]||0 });
      rows.sort((a,b)=>a.MAC - b.MAC);

      const total = rows.reduce((s,r)=>s + (r.Abate||0), 0);
      if (total <= 0) { this._setEmpty("No abatement > 0."); return; }

      // Styling panel settings with bounds
      const capPct = clamp(this._style.widthCap, 1, 50) / 100;   // 1–50%
      const minPct = clamp(this._style.minWidth, 0.05, 5) / 100; // 0.05–5%
      const padPct = clamp(this._style.xPadding, 0, 20) / 100;   // 0–20%
      const fsize  = clamp(this._style.fontSize, 8, 24);

      // Cap & min width (domain) per row
      const capLim = total * capPct;
      const minLim = total * minPct;
      rows = rows.map(r => ({ ...r, AbateShown: clamp(r.Abate, minLim, capLim) }));

      // Absolute minimum pixel width → convert to domain
      const pxMin  = 18;
      const widthPx = Math.max(1, this._container.clientWidth || 1);
      const pxToDom = total / widthPx; // domain per pixel
      rows = rows.map(r => ({ ...r, AbateShown: Math.max(r.AbateShown, pxMin * pxToDom) }));

      // Compute positions
      let cum=0;
      rows = rows.map(r=>{
        const xs=cum, xe=cum + r.AbateShown; cum=xe;
        return { ...r, x_mid:(xs+xe)/2, CumShown:xe };
      });

      const maxCum = cum;
      const y = rows.map(r => r.MAC);
      const x = rows.map(r => r.x_mid);
      const w = rows.map(r => r.AbateShown);

      // Colors
      const colors = rows.map(r => macBinColor(r.MAC));

      // Visual emphasis arrays updated on selection
      let selected = new Set();
      const lineW = () => rows.map(r => selected.has(r.Project) ? 3 : 1.5);
      const opac  = () => rows.map(r => selected.size===0 ? 1 : (selected.has(r.Project) ? 1 : 0.35));

      // Trace
      const barTrace = {
        type: "bar",
        x, y, width: w,
        marker: { color: colors, line: { color: "rgba(0,0,0,0.85)", width: lineW() }, opacity: opac() },
        customdata: rows.map(r => [r.Project, r.Abate]),
        hovertemplate:
          "<b>%{customdata[0]}</b><br>"+
          "MAC: %{y:.2f} EUR/tCO₂e<br>"+
          "Abatement: %{customdata[1]:,.0f} tCO₂e<extra></extra>"
      };

      // Axes padding
      const xPad = Math.max(pxMin*pxToDom*1.5, maxCum * padPct);
      const xRange = [-xPad, maxCum + xPad];

      // Helper lines
      const yMin = Math.min(...y, 0) * 1.25;
      const yMax = Math.max(...y, 0) * 1.25;

      // Base layout
      const layout = {
        margin: { t:50, l:80, r:40, b:60 },
        hovermode: "closest",
        xaxis: {
          title: "Total Abatement (tCO₂e)",
          range: xRange,
          tickformat: "~s",
          automargin: true,
          titlefont: { size: fsize },
          tickfont:  { size: fsize }
        },
        yaxis: {
          title: "MAC (EUR/tCO₂e)",
          zeroline: true,
          automargin: true,
          titlefont: { size: fsize },
          tickfont:  { size: fsize }
        },
        shapes: [
          { type: "line", x0: 60000, x1: 60000, y0: yMin, y1: yMax, line: { color:"black", width:3, dash:"dash" } },
          { type: "line", x0: xRange[0], x1: xRange[1], y0: 50, y1: 50, line: { color:"blue", width:3, dash:"dot" } }
        ],
        annotations: [
          { x: 60000, y: yMax * 0.95, text:"Target: 60k tCO₂e", showarrow:false, font:{ size: fsize } },
          { x: xRange[1], y: 50, text:"Carbon price: 50 EUR/tCO₂e", showarrow:false, xanchor:"right", font:{ size: fsize } }
        ]
      };

      // --- Per-bar annotations (MAC + Abatement) ---
      const barLabels = rows.map((r,i) => ({
        x: x[i],
        y: y[i] >= 0 ? y[i] + yMax*0.03 : y[i] - yMax*0.05,
        text: `MAC ${r.MAC.toFixed(1)} | ${r.Abate.toLocaleString()} t`,
        showarrow: false,
        font: { size: Math.max(10, fsize-1), color: "#111" },
        bgcolor: "rgba(255,255,255,0.6)",
        bordercolor: "rgba(0,0,0,0.15)",
        borderpad: 3,
        align: "center"
      }));
      layout.annotations.push(...barLabels);

      // Config
      const config = { displaylogo:false, responsive:true, staticPlot:false };

      // Render
      const plot = () => {
        if (this._plotted) {
          Plotly.react(this._container, [barTrace], layout, config);
        } else {
          Plotly.newPlot(this._container, [barTrace], layout, config)
            .then(() => this._plotted = true)
            .catch(() => this._plotted = false);
        }
      };
      plot();

      // ----- Interaction: multi/single select & Linked Analysis -----
      // NOTE: Linked Analysis requires Optimized/Unified Story + dataBinding; set "Filter on Data Point Selection" in the story. 
      const containerEl = this._container;
      containerEl.on && containerEl.removeAllListeners && containerEl.removeAllListeners(); // in case re-binding

      // SAFER: attach via Plotly events API on container
      this._container.on?.("plotly_click", (ev) => {
        const p = ev?.points?.[0];
        if (!p) return;
        const label = p.customdata?.[0];
        if (!label) return;

        const multi = !!(ev.event && (ev.event.ctrlKey || ev.event.metaKey || ev.event.shiftKey));
        if (multi) {
          if (selected.has(label)) selected.delete(label); else selected.add(label);
        } else {
          selected.clear(); selected.add(label);
        }

        // Update visuals
        Plotly.restyle(this._container, {
          "marker.line.width": [rows.map(r => selected.has(r.Project) ? 3 : 1.5)],
          "marker.opacity":    [rows.map(r => selected.size===0 ? 1 : (selected.has(r.Project) ? 1 : 0.35))]
        });

        // Linked Analysis driver
        try {
          const db = this.dataBindings.getDataBinding?.();
          const la = db?.getLinkedAnalysis?.();
          if (la && la.isDataPointSelectionEnabled?.()) {
            const selections = Array.from(selected).map(lbl => ({ [this._dimTechId]: String(lbl) }));
            la.setFilters(selections); // Selection[]
          }
        } catch(e) {
          console.warn("[MACC DOM] LA setFilters error:", e);
        }
      });

      this._container.on?.("plotly_doubleclick", () => {
        if (selected.size === 0) return;
        selected.clear();

        Plotly.restyle(this._container, {
          "marker.line.width": [rows.map(_=>1.5)],
          "marker.opacity":    [rows.map(_=>1)]
        });

        try {
          const db = this.dataBindings.getDataBinding?.();
          db?.getLinkedAnalysis?.().removeFilters?.();
        } catch(e) {
          console.warn("[MACC DOM] LA removeFilters error:", e);
        }
      });
    }
  }

  customElements.define("variable-width-macc", VariableWidthMACC);
})();