(function () {
  // ========= Template with CSS to right-align the Plotly modebar =========
  const template = document.createElement("template");
  template.innerHTML = `
    <style>
      :host { display:block; width:100%; height:100%; }
      #macc-container {
        width:80%; height:75%;
        position:relative;        /* for absolute children (modebar) */
        pointer-events:auto;      /* allow hover/tips in SAC */
        background:transparent;
      }
      /* Pin Plotly modebar top-right inside the container */
      #macc-container .modebar {
        right: 6px !important;
        left: auto !important;
        top: 6px !important;
      }
    </style>
    <div id="macc-container"></div>
  `;

  // ---- helpers ----
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt0 = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const fmt2 = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

  // Gradient for positive MAC (yellow -> orange -> red)
  function posMacColor(mac, maxPos) {
    const t = maxPos > 0 ? clamp(mac / maxPos, 0, 1) : 0;
    const stops = [
      [0,   [245, 215, 110]],  // #F5D76E
      [0.6, [243, 156, 18 ]],  // #F39C12
      [1.0, [231, 76,  60 ]]   // #E74C3C
    ];
    let c0 = stops[0], c1 = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) { c0 = stops[i]; c1 = stops[i + 1]; break; }
    }
    const span = (c1[0] - c0[0]) || 1e-6;
    const lt = (t - c0[0]) / span;
    const r = Math.round(c0[1][0] + lt * (c1[1][0] - c0[1][0]));
    const g = Math.round(c0[1][1] + lt * (c1[1][1] - c0[1][1]));
    const b = Math.round(c0[1][2] + lt * (c1[1][2] - c0[1][2]));
    return `rgb(${r},${g},${b})`;
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

      // Style properties (with defaults matching JSON)
      this._style = {
        widthCap: 10,     // %
        minWidth: 0.2,    // %
        xPadding: 5,      // %
        fontSize: 12,     // px
        colorMode: "gradient" // "gradient" | "single"
      };

      // Version tag (helps confirm cache-busting)
      try { console.log("[MACC] build=1.0.7 (bars-only, styling panel, resize, modebar right)"); } catch (_) {}

      // Load Plotly if needed
      if (typeof Plotly === "undefined") {
        const script = document.createElement("script");
        script.src = "https://cdn.plot.ly/plotly-2.27.0.min.js";
        script.async = false;
        script.onload = () => { this._initialized = true; this._render(); };
        document.head.appendChild(script);
      } else {
        this._initialized = true;
      }

      // ResizeObserver – resize even if SAC doesn’t call our hook
      this._resizeObserver = new (window.ResizeObserver || class { observe(){} disconnect(){} })(() => {
        if (this._initialized && this._plotted) {
          try { Plotly.Plots.resize(this._container); } catch (_) {}
        }
      });
    }

    connectedCallback()   { try { this._resizeObserver.observe(this._container); } catch (_) {} }
    disconnectedCallback(){ try { this._resizeObserver.disconnect(); } catch (_) {} }

    // ======= Data Binding advert (feeds) =======
    getDataBindings() {
      return {
        maccBinding: {
          feeds: [
            { id: "dimension",      type: "dimension" },            // Project
            { id: "measure_abate",  type: "mainStructureMember" },  // Abatement
            { id: "measure_mac",    type: "mainStructureMember" }   // MAC
          ]
        }
      };
    }

    // ======= Property setters (Styling panel) =======
    set widthCap(v)  { this._style.widthCap  = Number(v) || 10;  this._render(); }
    set minWidth(v)  { this._style.minWidth  = Number(v) || 0.2; this._render(); }
    set xPadding(v)  { this._style.xPadding  = Number(v) || 5;   this._render(); }
    set fontSize(v)  { this._style.fontSize  = Number(v) || 12;  this._render(); }
    set colorMode(v) { this._style.colorMode = (v || "gradient"); this._render(); }

    // ======= SAC lifecycle =======
    onCustomWidgetBeforeUpdate(changedProps) { this._applyChangedProps(changedProps); }
    onCustomWidgetAfterUpdate(changedProps)  { this._applyChangedProps(changedProps); }

    _applyChangedProps(changedProps) {
      if (!changedProps) return;
      if ("maccBinding" in changedProps) this._ingestBinding(changedProps.maccBinding);

      // react to styling props changed by the Styling panel
      ["widthCap","minWidth","xPadding","fontSize","colorMode"].forEach(p => {
        if (p in changedProps) this[p] = changedProps[p];
      });
    }

    onCustomWidgetResize() {
      if (this._initialized && this._container && this._plotted) {
        try { Plotly.Plots.resize(this._container); } catch (_) {}
      }
    }

    // ======= Ingestion: robust to tenant payload shapes =======
    _ingestBinding(binding) {
      if (!binding) { this._setEmpty("Bind a model with a dimension and two measures."); return; }
      const rows =
        binding.data || binding.value || binding.resultSet || binding.rows || [];
      if (!Array.isArray(rows) || rows.length === 0) {
        this._setEmpty("No data rows. Check filters or data source."); return;
      }

      const md = binding.metadata || {};
      const feeds = md.feeds || {};
      const findFeedIdByType = (t) =>
        Object.keys(feeds).find(k => (feeds[k] && String(feeds[k].type).toLowerCase() === t));
      const dimFeedId = feeds.dimension ? "dimension" : (findFeedIdByType("dimension") || "dimension");
      const abtFeedId = feeds.measure_abate
        ? "measure_abate"
        : (Object.keys(feeds).find(k => /abate/i.test(k)) || findFeedIdByType("mainstructuremember"));
      const macFeedId = feeds.measure_mac
        ? "measure_mac"
        : (Object.keys(feeds).find(k => /\bmac\b/i.test(k)) || findFeedIdByType("mainstructuremember"));
      const dimKey = `${dimFeedId}_0`;
      const abtKey = `${abtFeedId}_0`;
      const macKey = `${macFeedId}_0`;

      const projects = [];
      const abates   = [];
      const macs     = [];
      const getNum = (obj) => {
        if (obj == null) return NaN;
        if (typeof obj === "number") return obj;
        if (typeof obj.raw === "number") return obj.raw;
        if (typeof obj.value === "number") return obj.value;
        if (typeof obj.formatted === "string") {
          const n = Number(String(obj.formatted).replace(/[^\d.\-]/g, ""));
          return Number.isFinite(n) ? n : NaN;
        }
        const n = Number(obj);
        return Number.isFinite(n) ? n : NaN;
      };

      for (const r of rows) {
        const d = r[dimKey] || (Array.isArray(r.dimensions) && r.dimensions[0]) || r.dimensions_0 || {};
        const proj = d.description ?? d.text ?? d.label ?? d.id ?? "";
        let abObj = r[abtKey], macObj = r[macKey];
        if (abObj == null) { if (Array.isArray(r.measures)) abObj = r.measures[0]; else abObj = r.measures_0; }
        if (macObj == null) { if (Array.isArray(r.measures)) macObj = r.measures[1]; else macObj = r.measures_1; }

        projects.push(String(proj));
        abates.push(getNum(abObj));
        macs.push(getNum(macObj));
      }

      this._data.project   = projects;
      this._data.abatement = abates.map(v => (Number.isFinite(v) ? v : 0));
      this._data.mac       = macs.map(v => (Number.isFinite(v) ? v : 0));
      this._render();
    }

    // ======= Rendering =======
    _setEmpty(msg) {
      if (this._container) {
        this._container.innerHTML =
          `<div style="font:12px var(--sapFontFamily,Arial); color:#6b6d70; padding:8px;">${msg}</div>`;
      }
      this._plotted = false;
    }

    _render() {
      if (!this._initialized || !this._container) return;

      const project = this._data.project || [];
      const abate = (this._data.abatement || []).map(n => Number(n) || 0);
      const mac = (this._data.mac || []).map(n => Number(n) || 0);

      if (project.length === 0) { this._setEmpty("Bind Project (dimension) and Abatement & MAC (measures)."); return; }
      if (abate.length !== project.length || mac.length !== project.length) {
        this._setEmpty("Row mismatch. Ensure both measures align with the dimension."); return;
      }

      // Build & sort by MAC
      let rows = [];
      for (let i = 0; i < project.length; i++) rows.push({ Project: project[i], Abatement: abate[i], MAC: mac[i] });
      rows.sort((a, b) => a.MAC - b.MAC);

      const totalAbate = rows.reduce((s, r) => s + (r.Abatement || 0), 0);
      if (totalAbate <= 0) { this._setEmpty("No abatement values found."); return; }

      // Pull styling settings (with bounds)
      const widthCapPct = clamp(this._style.widthCap, 1, 50) / 100;    // 1–50%
      const minWidthPct = clamp(this._style.minWidth, 0.05, 5) / 100;  // 0.05–5%
      const xPadPct     = clamp(this._style.xPadding, 0, 20) / 100;    // 0–20%
      const fontSize    = clamp(this._style.fontSize, 8, 24);

      // Width controls
      const capLimit = totalAbate * widthCapPct;
      const minWidth = totalAbate * minWidthPct;
      rows = rows.map(r => ({ ...r, AbateShown: clamp(r.Abatement, minWidth, capLimit) }));

      // Variable-width positions
      let cum = 0;
      rows = rows.map(r => {
        const xStart = cum;
        const xEnd   = cum + r.AbateShown;
        cum = xEnd;
        return { ...r, x_mid: (xStart + xEnd) / 2, CumShown: xEnd };
      });

      const maxCum   = Math.max(1e-6, ...rows.map(r => r.CumShown));
      const maxPos   = Math.max(0, ...rows.map(r => r.MAC));
      const maxAbs   = Math.max(1, ...rows.map(r => Math.abs(r.MAC)));

      // Colors
      const colors = (this._style.colorMode === "single")
        ? rows.map(r => (r.MAC < 0 ? "#27ae60" : "#E67E22")) // negative green / single positive orange
        : rows.map(r => (r.MAC < 0 ? "#27ae60" : posMacColor(r.MAC, maxPos)));

      // ---- TRACE (bars only + tooltips) ----
      const barTrace = {
        type: "bar",
        x: rows.map(r => r.x_mid),
        y: rows.map(r => r.MAC),
        width: rows.map(r => r.AbateShown),
        marker: { color: colors, line: { color: "rgba(0,0,0,0.25)", width: 1 } },
        hovertemplate:
          "<b>%{customdata[0]}</b><br>" +
          "MAC: %{y:.2f} EUR/tCO₂e<br>" +
          "Abatement: %{customdata[1]} tCO₂e<br>" +
          "Width (Shown): %{customdata[2]} tCO₂e<extra></extra>",
        customdata: rows.map(r => [r.Project, fmt0(r.Abatement), fmt0(r.AbateShown)]),
        name: "MAC"
      };

      // Side padding so bars don’t look crushed at extremes
      const xPad = Math.max(minWidth * 2, maxCum * xPadPct);
      const xRange = [-xPad, maxCum + xPad];

      // ---- LAYOUT ----
      const layout = {
        margin: { t: 36, l: 76, r: 30, b: 64 },
        title: { text: "Marginal Abatement Cost Curve (MACC)", font: { size: fontSize + 2 } },
        showlegend: false,
        hovermode: "closest",
        hoverdistance: 20,
        spikedistance: 20,
        xaxis: {
          title: "Total Abatement (tCO₂e)",
          type: "linear",
          range: xRange,
          tickformat: "~s",
          tickfont: { size: fontSize },
          titlefont: { size: fontSize },
          showline: true,
          mirror: true,
          gridcolor: "rgba(0,0,0,0.06)"
        },
        yaxis: {
          title: "MAC (EUR/tCO₂e)",
          range: [-maxAbs * 1.15, maxAbs * 1.15],
          tickfont: { size: fontSize },
          titlefont: { size: fontSize },
          showline: true,
          mirror: true,
          zeroline: true,
          gridcolor: "rgba(0,0,0,0.06)"
        },
        bargap: 0,
        bargroupgap: 0
      };

      // ---- CONFIG (modebar right, tooltips enabled) ----
      const config = {
        displaylogo: false,
        displayModeBar: true,
        responsive: true,
        staticPlot: false,
        modeBarButtonsToRemove: []
      };

      if (this._plotted) {
        Plotly.react(this._container, [barTrace], layout, config);
      } else {
        Plotly.newPlot(this._container, [barTrace], layout, config)
          .then(() => (this._plotted = true))
          .catch(() => (this._plotted = false));
      }
    }
  }

  customElements.define("variable-width-macc", VariableWidthMACC);
})();
