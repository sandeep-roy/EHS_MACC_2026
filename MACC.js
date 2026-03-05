(function () {
  // ===== Template =====
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
      this._data = {
        project: [],
        abatement: [],
        mac: []
      };

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

    // ========= SAC lifecycle hooks =========

    /**
     * Called by SAC after properties (incl. data binding) update.
     * @param {object} changedProps - e.g., { dataBinding: <resultset> }
     */
    onCustomWidgetAfterUpdate(changedProps) {
      if ("dataBinding" in changedProps) {
        this._updateDataFromSAC(changedProps.dataBinding);
      }
    }

    /**
     * Some tenants fire before/after; be defensive.
     */
    onCustomWidgetBeforeUpdate(changedProps) {
      if ("dataBinding" in changedProps) {
        this._updateDataFromSAC(changedProps.dataBinding, /*isBefore*/ true);
      }
    }

    /**
     * SAC calls this on resize.
     */
    onCustomWidgetResize() {
      if (this._initialized && this._container && this._plotted) {
        try {
          Plotly.Plots.resize(this._container);
        } catch (e) {
          // no-op
        }
      }
    }

    /**
     * Some SAC builds assign properties directly.
     */
    set dataBinding(val) {
      this._updateDataFromSAC(val);
    }

    // ========= Data Binding (ResultSet) =========

    /**
     * Converts SAC ResultSet → arrays: project[], abatement[], mac[]
     * Expects: 1 dimension (Project), 2 measures (Abatement, MAC)
     * Accepts different metadata shapes; falls back to first two measures.
     */
    _updateDataFromSAC(binding, isBefore = false) {
      if (!binding) {
        this._setEmptyMessage("Bind a model with 1 dimension and 2 measures (Abatement, MAC).");
        return;
      }

      // Rows: try common keys SAC uses for ResultSet payloads.
      const rows =
        binding.data ||
        binding.value ||
        binding.resultSet ||
        binding.rows ||
        [];

      if (!Array.isArray(rows) || rows.length === 0) {
        this._setEmptyMessage("No data rows. Check story filters or binding.");
        return;
      }

      // Try to detect column names to pick correct measures
      const measuresMeta =
        (binding.columns && (binding.columns.measures || binding.columns.Measures)) ||
        (binding.metadata && (binding.metadata.measures || binding.metadata.Measures)) ||
        [];

      const measureNames = measuresMeta.map(m =>
        (m.name || m.id || m.label || "").toString().toLowerCase()
      );

      // Infer measure indices
      let abatementIdx = measureNames.findIndex(n =>
        /abat(e)?ment|volume|tco2e/.test(n)
      );
      let macIdx = measureNames.findIndex(n =>
        /\bmac\b|cost|eur\/t/.test(n)
      );

      // Fallbacks if names not found
      if (abatementIdx < 0) abatementIdx = 0;
      if (macIdx < 0) macIdx = measureNames.length > 1 ? 1 : 0;
      if (macIdx === abatementIdx && measureNames.length > 1) {
        macIdx = 1; // avoid both mapping to the first measure
      }

      // Extract arrays robustly
      const dimIndex = 0; // first dimension
      const projects = [];
      const abates = [];
      const macs = [];

      for (const r of rows) {
        // dimension label
        const dimArr = r.dimensions || r.dimension || r.Dimensions || [];
        const dimObj = dimArr[dimIndex] || {};
        const proj =
          dimObj.description ??
          dimObj.text ??
          dimObj.label ??
          dimObj.id ??
          ""; // fallback empty string

        // measures
        const msrArr = r.measures || r.Measures || r.values || [];
        const getNum = (obj) => {
          if (obj == null) return NaN;
          if (typeof obj === "number") return obj;
          if (typeof obj.raw === "number") return obj.raw;
          if (typeof obj.value === "number") return obj.value;
          if (typeof obj.formatted === "string") {
            const n = Number(String(obj.formatted).replace(/[^\d.\-]/g, ""));
            return Number.isFinite(n) ? n : NaN;
          }
          const asNum = Number(obj);
          return Number.isFinite(asNum) ? asNum : NaN;
        };

        const ab = getNum(msrArr[abatementIdx]);
        const mc = getNum(msrArr[macIdx]);

        projects.push(String(proj));
        abates.push(Number.isFinite(ab) ? ab : 0);
        macs.push(Number.isFinite(mc) ? mc : 0);
      }

      // Assign
      this._data.project = projects;
      this._data.abatement = abates;
      this._data.mac = macs;

      // Render
      this._render();
    }

    // ========= Rendering =========

    _setEmptyMessage(msg) {
      if (!this._container) return;
      this._container.innerHTML =
        `<div style="font: 12px/1.4 var(--sapFontFamily,Arial); color:#6b6d70; padding:8px;">${msg}</div>`;
      this._plotted = false;
    }

    _render() {
      if (!this._initialized || !this._container) return;

      const project = this._data.project || [];
      const abate = (this._data.abatement || []).map(n => Number(n) || 0);
      const mac = (this._data.mac || []).map(n => Number(n) || 0);

      // Guard conditions
      if (project.length === 0) {
        this._setEmptyMessage("Bind a dimension (Project) and two measures (Abatement, MAC).");
        return;
      }
      if (abate.length !== project.length || mac.length !== project.length) {
        this._setEmptyMessage("Rows mismatch. Ensure both measures align with the dimension.");
        return;
      }
      if (abate.every(v => v === 0) && mac.every(v => v === 0)) {
        this._setEmptyMessage("All-zero data. Check measure selection or story filter.");
        return;
      }

      // Merge + clean (filter out non-positive abatement because of log axis on X)
      let rows = [];
      for (let i = 0; i < project.length; i++) {
        rows.push({
          Project: project[i],
          Abatement: Math.max(0, abate[i]),
          MAC: mac[i]
        });
      }
      rows = rows.filter(r => r.Abatement > 0);

      if (rows.length === 0) {
        this._setEmptyMessage("No positive abatement values to plot on log scale.");
        return;
      }

      // Sort by MAC ascending (typical MACC)
      rows.sort((a, b) => a.MAC - b.MAC);

      // Width capping to avoid single huge bars dominating (20% of total)
      const totalAbate = rows.reduce((s, r) => s + r.Abatement, 0);
      const capLimit = totalAbate * 0.20;
      rows = rows.map(r => ({ ...r, AbateShown: Math.min(r.Abatement, capLimit) }));

      // Build cumulative positions
      let cum = 0;
      rows = rows.map(r => {
        const xStart = cum;
        const xEnd = cum + r.AbateShown;
        cum = xEnd;
        return {
          ...r,
          x_mid: (xStart + xEnd) / 2,
          CumShown: xEnd
        };
      });

      // Scale the cumulative line to MAC axis
      const maxMAC = Math.max(1, ...rows.map(r => Math.abs(r.MAC))); // avoid 0
      const maxCum = Math.max(1e-6, ...rows.map(r => r.CumShown));
      rows = rows.map(r => ({ ...r, CumScaled: (r.CumShown / maxCum) * maxMAC * 1.1 }));

      // Plotly traces
      const barTrace = {
        type: "bar",
        x: rows.map(r => r.x_mid + 1e-6), // avoid log(0)
        y: rows.map(r => r.MAC),
        width: rows.map(r => r.AbateShown),
        marker: {
          color: rows.map(r => (r.MAC < 0 ? "#27ae60" : "#e74c3c")),
          line: { color: "black", width: 1 }
        },
        text: rows.map(
          r =>
            `Project: ${r.Project}<br>` +
            `MAC: ${r.MAC} EUR/tCO₂e<br>` +
            `Abatement: ${r.Abatement} tCO₂e<br>` +
            `Width (Shown): ${r.AbateShown} tCO₂e`
        ),
        hoverinfo: "text",
        name: "MAC"
      };

      const cumTrace = {
        type: "scatter",
        mode: "lines+markers",
        x: rows.map(r => r.CumShown + 1e-6),
        y: rows.map(r => r.CumScaled),
        marker: { size: 7, color: "blue" },
        line: { width: 3, color: "blue" },
        hoverinfo: "text",
        text: rows.map(r => `Cumulative Abatement: ${r.CumShown} tCO₂e`),
        name: "Cumulative"
      };

      const layout = {
        title: "Variable‑Width Marginal Abatement Cost Curve (MACC)",
        xaxis: { title: "Total Abatement (tCO₂e)", type: "log" },
        yaxis: { title: "MAC (EUR/tCO₂e)" },
        margin: { t: 50, l: 60, r: 40, b: 50 },
        showlegend: false,
        hoverlabel: { bgcolor: "white" }
      };

      const config = { displaylogo: false };

      // Render or update
      if (this._plotted) {
        Plotly.react(this._container, [barTrace, cumTrace], layout, config);
      } else {
        Plotly.newPlot(this._container, [barTrace, cumTrace], layout, config)
          .then(() => (this._plotted = true))
          .catch(() => this._plotted = false);
      }
    }
  }

  // Register custom element
  customElements.define("variable-width-macc", VariableWidthMACC);
})();
