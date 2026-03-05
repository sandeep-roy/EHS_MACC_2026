(function () {
  // ========= Template =========
  const template = document.createElement("template");
  template.innerHTML = `
    <div id="macc-container" style="width:100%; height:100%; overflow:hidden;"></div>
  `;

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

      // Version banner (helps confirm cache busting)
      try { console.log("[MACC] build=1.0.3 (feeds+readability) loaded"); } catch(_) {}

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

    // ========= Lifecycle hooks (Optimized Story Experience)
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

    // ========= Robust ingestion for all SAC binding shapes (including your tenant's)
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
        // Dimension (tenant-specific key first; fallbacks for other shapes)
        const d =
          r[dimKey] ||
          (Array.isArray(r.dimensions) && r.dimensions[0]) ||
          r.dimensions_0 ||
          {};

        const proj =
          d.description ?? d.text ?? d.label ?? d.id ?? "";

        // Measures (tenant-specific keys + fallbacks)
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

      // Smart x-axis: log if there is any positive abatement, else linear
      const posAbateExists = rows.some(r => r.Abatement > 0);
      let xAxisType = posAbateExists ? "log" : "linear";

      // If none are positive (e.g., extreme filters), still show something
      if (!posAbateExists) {
        rows = rows.map(r => ({ ...r, Abatement: Math.abs(r.Abatement) }));
      }

      // Sort by MAC (ascending)
      rows.sort((a, b) => a.MAC - b.MAC);

      // Cap widths so one project doesn't dominate (now 12% of total)
      const totalAbate = rows.reduce((s, r) => s + (r.Abatement || 0), 0);
      if (totalAbate <= 0) {
        this._setEmpty("No abatement values found.");
        return;
      }
      const capLimit = totalAbate * 0.12; // tighter cap improves readability
      rows = rows.map(r => ({ ...r, AbateShown: Math.min(r.Abatement, capLimit) }));

      // Minimum displayed width to keep tiny bars visible (0.5% of total)
      const minFrac = 0.005;
      const minWidth = totalAbate * minFrac;
      rows = rows.map(r => ({ ...r, AbateShown: Math.max(r.AbateShown, minWidth) }));

      // Cumulative positions
      let cum = 0;
      rows = rows.map(r => {
        const xStart = cum;
        const xEnd = cum + r.AbateShown;
        cum = xEnd;
        return { ...r, x_mid: (xStart + xEnd) / 2, CumShown: xEnd };
      });

      // Scale cumulative line relative to MAC range, but place on secondary axis
      const maxMAC = Math.max(1, ...rows.map(r => Math.abs(r.MAC)));
      const maxCum = Math.max(1e-6, ...rows.map(r => r.CumShown));
      rows = rows.map(r => ({ ...r, CumScaled: (r.CumShown / maxCum) * maxMAC * 1.1 }));

      // ----------------------------------------
      // PLOTLY TRACES (readability-optimized)
      // ----------------------------------------
      const barTrace = {
        type: "bar",
        x: rows.map(r => r.x_mid + (xAxisType === "log" ? 1e-6 : 0)),
        y: rows.map(r => r.MAC),
        width: rows.map(r => r.AbateShown),
        marker: {
          color: rows.map(r => (r.MAC < 0 ? "#27ae60" : "#e74c3c")),
          line: { color: "rgba(0,0,0,0.3)", width: 1 }
        },
        // tooltips only (no persistent labels on bars)
        text: rows.map(
          r =>
            `Project: ${r.Project}<br>` +
            `MAC: ${r.MAC.toLocaleString(undefined, { maximumFractionDigits: 2 })} EUR/tCO₂e<br>` +
            `Abatement: ${r.Abatement.toLocaleString()} tCO₂e<br>` +
            `Width (Shown): ${r.AbateShown.toLocaleString()} tCO₂e`
        ),
        hoverinfo: "text",
        name: "MAC"
      };

      const cumTrace = {
        type: "scatter",
        mode: "lines+markers",
        x: rows.map(r => r.CumShown + (xAxisType === "log" ? 1e-6 : 0)),
        y: rows.map(r => r.CumScaled),
        marker: { size: 6, color: "rgba(30, 100, 255, 0.95)" },
        line: { width: 2.5, color: "rgba(30, 100, 255, 0.95)" },
        hoverinfo: "text",
        text: rows.map(r => `Cumulative Abatement: ${r.CumShown.toLocaleString()} tCO₂e`),
        name: "Cumulative",
        yaxis: "y2" // secondary axis
      };

      // ----------------------------------------
      // LAYOUT (secondary y-axis + margins + tick styling)
      // ----------------------------------------
      const layout = {
        title: "Variable‑Width Marginal Abatement Cost Curve (MACC)",
        margin: { t: 48, l: 70, r: 70, b: 60 },
        showlegend: false,
        hoverlabel: { bgcolor: "white", font: { size: 11 } },
        xaxis: {
          title: "Total Abatement (tCO₂e)",
          type: xAxisType,
          tickformat: "~s",               // 1k, 10k, 100k
          tickfont: { size: 10 },
          gridcolor: "rgba(0,0,0,0.06)",
          minor: { showgrid: false }
        },
        yaxis: {
          title: "MAC (EUR/tCO₂e)",
          zeroline: true,
          tickfont: { size: 10 },
          gridcolor: "rgba(0,0,0,0.06)"
        },
        // Secondary y axis for cumulative curve so it no longer stretches MAC axis
        yaxis2: {
          title: "Scaled Cumulative (relative)",
          overlaying: "y",
          side: "right",
          showgrid: false,
          tickfont: { size: 10 },
          rangemode: "tozero"
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
    }
  }

  customElements.define("variable-width-macc", VariableWidthMACC);
})();
