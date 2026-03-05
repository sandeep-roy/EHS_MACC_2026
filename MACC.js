
(function () {
  // ========= Template =========
  const template = document.createElement("template");
  template.innerHTML = `
    <div id="macc-container" style="width:100%; height:100%; overflow:hidden;"></div>
  `;

  // --------- utilities ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const formatInt = (n) =>
    Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const format2 = (n) =>
    Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

  // simple positive MAC gradient (yellow -> orange -> red)
  function posMacColor(mac, maxPos) {
    const t = maxPos > 0 ? clamp(mac / maxPos, 0, 1) : 0;
    // interpolate between #F5D76E (yellow) -> #F39C12 (orange) -> #E74C3C (red)
    const stops = [
      [0, [245, 215, 110]],
      [0.6, [243, 156, 18]],
      [1.0, [231, 76, 60]]
    ];
    // find segment
    let c0 = stops[0], c1 = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        c0 = stops[i]; c1 = stops[i + 1]; break;
      }
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

      // Internal state
      this._initialized = false;
      this._plotted = false;
      this._data = { project: [], abatement: [], mac: [] };

      try { console.log("[MACC] build=1.0.4 (variable-width, true cum y2)"); } catch(_) {}

      // Load Plotly if needed
      if (typeof Plotly === "undefined") {
        const script = document.createElement("script");
        script.src = "https://cdn.plot.ly/plotly-2.27.0.min.js";
        script.async = false;
        script.onload = () => {
          this._initialized = true;
          this._render();
        };
        document.head.appendChild(script);
      } else {
        this._initialized = true;
      }
    }

    // ========= Tell SAC that this widget has a Data Binding called "maccBinding"
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

    // ========= Lifecycle hooks
    onCustomWidgetBeforeUpdate(changedProps) {
      if (changedProps && "maccBinding" in changedProps) {
        this._ingestBinding(changedProps.maccBinding);
      }
    }

    onCustomWidgetAfterUpdate(changedProps) {
      if (changedProps && "maccBinding" in changedProps) {
        this._ingestBinding(changedProps.maccBinding);
      }
    }

    onCustomWidgetResize() {
      if (this._initialized && this._container && this._plotted) {
        try { Plotly.Plots.resize(this._container); } catch (_) {}
      }
    }

    // ========= Robust ingestion for SAC binding shapes (including your tenant)
    _ingestBinding(binding) {
      if (!binding) {
        this._setEmpty("Bind a model with a dimension and two measures.");
        return;
      }

      const rows =
        binding.data ||
        binding.value ||
        binding.resultSet ||
        binding.rows ||
        [];

      if (!Array.isArray(rows) || rows.length === 0) {
        this._setEmpty("No data rows. Check filters or data source.");
        return;
      }

      // Read metadata & feed IDs
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
        // Dimension
        const d =
          r[dimKey] ||
          (Array.isArray(r.dimensions) && r.dimensions[0]) ||
          r.dimensions_0 ||
          {};

        const proj = d.description ?? d.text ?? d.label ?? d.id ?? "";

        // Measures
        let abObj = r[abtKey];
        let macObj = r[macKey];

        if (abObj == null) {
          if (Array.isArray(r.measures)) abObj = r.measures[0];
          else abObj = r.measures_0;
        }
        if (macObj == null) {
          if (Array.isArray(r.measures)) macObj = r.measures[1];
          else macObj = r.measures_1;
        }

        projects.push(String(proj));
        abates.push(getNum(abObj));
        macs.push(getNum(macObj));
      }

      this._data.project   = projects;
      this._data.abatement = abates.map(v => (Number.isFinite(v) ? v : 0));
      this._data.mac       = macs.map(v => (Number.isFinite(v) ? v : 0));

      this._render();
    }

    // ========= Rendering =========
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

      if (project.length === 0) {
        this._setEmpty("Bind a dimension (Project) and two measures (Abatement, MAC).");
        return;
      }
      if (abate.length !== project.length || mac.length !== project.length) {
        this._setEmpty("Row mismatch. Ensure both measures align with the dimension.");
        return;
      }

      // Build rows
      let rows = [];
      for (let i = 0; i < project.length; i++) {
        rows.push({ Project: project[i], Abatement: abate[i], MAC: mac[i] });
      }

      // Sort by MAC (ascending), as per MACC convention
      rows.sort((a, b) => a.MAC - b.MAC);

      // Compute totals/limits
      const totalAbate = rows.reduce((s, r) => s + (r.Abatement || 0), 0);
      if (totalAbate <= 0) {
        this._setEmpty("No abatement values found.");
        return;
      }

      // Cap widths so one project doesn't dominate: 12% of total
      const capLimit = totalAbate * 0.12;
      rows = rows.map(r => ({ ...r, AbateShown: Math.min(r.Abatement, capLimit) }));

      // Minimum displayed width to keep tiny bars visible (0.5% of total)
      const minFrac = 0.005;
      const minWidth = totalAbate * minFrac;
      rows = rows.map(r => ({ ...r, AbateShown: Math.max(r.AbateShown, minWidth) }));

      // Cumulative positions for x (variable widths)
      let cum = 0;
      rows = rows.map(r => {
        const xStart = cum;
        const xEnd = cum + r.AbateShown;
        cum = xEnd;
        return { ...r, x_mid: (xStart + xEnd) / 2, CumShown: xEnd };
      });

      // Prepare axes helpers
      const maxMAC = Math.max(1, ...rows.map(r => Math.abs(r.MAC)));
      const maxCum = Math.max(1e-6, ...rows.map(r => r.CumShown));
      const maxPosMac = Math.max(0, ...rows.map(r => r.MAC));

      // Colors: negative MAC -> green; positive MAC -> gradient yellow->red
      const colors = rows.map(r =>
        r.MAC < 0 ? "#27ae60" : posMacColor(r.MAC, maxPosMac)
      );

      // Decide which bars get outside labels (avoid clutter)
      const labelThreshold = totalAbate * 0.04; // show value label only if width >= 4% of total
      const barText = rows.map(r =>
        r.AbateShown >= labelThreshold ? formatInt(r.Abatement) : ""
      );

      // -------- TRACES --------
      const barTrace = {
        type: "bar",
        x: rows.map(r => r.x_mid),          // variable-width bar centers
        y: rows.map(r => r.MAC),            // MAC height
        width: rows.map(r => r.AbateShown), // variable widths
        marker: {
          color: colors,
          line: { color: "rgba(0,0,0,0.25)", width: 1 }
        },
        // show minimal labels on sufficiently wide bars; rest via hover
        text: barText,
        textposition: "outside",
        textfont: { size: 10 },
        hovertemplate:
          "<b>%{customdata[0]}</b><br>" +
          "MAC: %{y:.2f} EUR/tCO₂e<br>" +
          "Abatement: %{customdata[1]} tCO₂e<br>" +
          "Width (Shown): %{customdata[2]} tCO₂e<extra></extra>",
        customdata: rows.map(r => [r.Project, formatInt(r.Abatement), formatInt(r.AbateShown)]),
        name: "MAC"
      };

      // Cumulative line on the right axis with value labels
      const cumTrace = {
        type: "scatter",
        mode: "lines+markers+text",
        x: rows.map(r => r.CumShown),
        y: rows.map(r => r.CumShown),  // y2 axis will represent actual cumulative abatement
        yaxis: "y2",
        marker: { size: 6, color: "rgba(30, 100, 255, 0.95)" },
        line: { width: 2.5, color: "rgba(30, 100, 255, 0.95)" },
        text: rows.map(r => formatInt(r.CumShown)),
        textposition: "top center",
        textfont: { size: 10, color: "rgba(30, 100, 255, 0.95)" },
        hovertemplate:
          "Cumulative Abatement: %{y:.0f} tCO₂e<extra></extra>",
        name: "Cumulative"
      };

      // -------- LAYOUT --------
      const layout = {
        title: "Marginal Abatement Cost Curve (MACC)",
        margin: { t: 48, l: 72, r: 72, b: 64 },
        showlegend: false,
        hoverlabel: { bgcolor: "white", font: { size: 11 } },
        // X axis: variable width—use linear scale so small bars are visible
        xaxis: {
          title: "Total Abatement (tCO₂e)",
          type: "linear",
          tickformat: "~s",               // 1k, 10k, 100k
          tickfont: { size: 10 },
          gridcolor: "rgba(0,0,0,0.06)",
          rangemode: "tozero"
        },
        // Left Y: MAC
        yaxis: {
          title: "MAC (EUR/tCO₂e)",
          zeroline: true,
          tickfont: { size: 10 },
          gridcolor: "rgba(0,0,0,0.06)",
          range: [-Math.max(100, maxMAC * 1.15), Math.max(100, maxMAC * 1.15)]
        },
        // Right Y2: true cumulative abatement values (same units as X)
        yaxis2: {
          title: "Cumulative Abatement (tCO₂e)",
          overlaying: "y",
          side: "right",
          showgrid: false,
          tickfont: { size: 10 },
          rangemode: "tozero",
          range: [0, maxCum * 1.05]
        }
      };

      const config = { displaylogo: false, responsive: true };

      if (this._plotted) {
        Plotly.react(this._container, [barTrace, cumTrace], layout, config);
      } else {
        Plotly.newPlot(this._container, [barTrace, cumTrace], layout, config)
          .then(() => (this._plotted = true))
          .catch(() => (this._plotted = false));
      }

      // Optional: project name annotations (vertical) for small N
      // (uncomment if you want labels under each bar; keep N<=25 to avoid clutter)
      /*
      if (rows.length <= 25) {
        const ann = rows.map(r => ({
          x: r.x_mid,
          y: 0,
          xref: "x",
          yref: "y",
          xanchor: "center",
          yanchor: "top",
          text: r.Project,
          showarrow: false,
          textangle: -90,
          font: { size: 10, color: "#444" },
          yshift: 18
        }));
        Plotly.relayout(this._container, { annotations: ann });
      } else {
        Plotly.relayout(this._container, { annotations: [] });
      }
      */
    }
  }

  customElements.define("variable-width-macc", VariableWidthMACC);
})();
