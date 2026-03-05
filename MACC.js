
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
            { id: "dimension", type: "dimension" },              // Project
            { id: "measure_abate", type: "mainStructureMember" },// Abatement
            { id: "measure_mac", type: "mainStructureMember" }   // MAC
          ]
        }
      };
    }

    // ========= SAC lifecycle hooks =========
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

    // ========= Binding ingestion: ResultSet → arrays
    _ingestBinding(binding) {
      // Some tenants send { data: [...] }, some { value:[...] }, etc. Be robust
      const rows =
        (binding && (binding.data || binding.value || binding.resultSet || binding.rows)) || [];
console.log("=== RAW BINDING OBJECT ===");
console.log(binding);

if (Array.isArray(rows)) {
  console.log("=== RAW ROW SAMPLE (first 3) ===");
  console.log(rows.slice(0, 3));
}
      if (!Array.isArray(rows) || rows.length === 0) {
        this._setEmpty("Bind a dimension (Project) and two measures (Abatement, MAC).");
        return;
      }

      const projects = [];
      const abates = [];
      const macs = [];

      // SAC rows can carry different shapes. Community samples show shapes like:
      //  r.dimensions[0].label / id and r.measures[0].raw, r.measures[1].raw
      //  or flattened keys (dimensions_0, measures_0) in some examples.  [3](https://community.sap.com/t5/technology-blog-posts-by-members/transforming-sac-with-custom-widgets-part-4-custom-widgets-data-binding/ba-p/13566709)
      for (const r of rows) {
        // dimension
        let proj = "";
        if (Array.isArray(r.dimensions) && r.dimensions[0]) {
          const d = r.dimensions[0];
          proj = d.description ?? d.text ?? d.label ?? d.id ?? "";
        } else if (r.dimensions_0) {
          const d = r.dimensions_0;
          proj = d.description ?? d.text ?? d.label ?? d.id ?? "";
        }

        // helper to coerce measure value
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

        // measures (first two)
        let m0, m1;
        if (Array.isArray(r.measures)) {
          m0 = r.measures[0];
          m1 = r.measures[1];
        } else {
          m0 = r.measures_0;
          m1 = r.measures_1;
        }

        projects.push(String(proj || ""));
        abates.push(getNum(m0));
        macs.push(getNum(m1));
      }

      this._data.project = projects;
      this._data.abatement = abates.map(v => (Number.isFinite(v) ? v : 0));
      this._data.mac = macs.map(v => (Number.isFinite(v) ? v : 0));
      this._render();
    }

    // ========= Rendering =========
    _setEmpty(msg) {
      if (this._container) {
        this._container.innerHTML =
          `<div style="font:12px/1.4 var(--sapFontFamily,Arial); color:#6b6d70; padding:8px;">${msg}</div>`;
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
      // filter non-positive abatement (x-axis is log)
      let rows = [];
      for (let i = 0; i < project.length; i++) {
        rows.push({ Project: project[i], Abatement: Math.max(0, abate[i]), MAC: mac[i] });
      }
      rows = rows.filter(r => r.Abatement > 0);
      if (rows.length === 0) {
        this._setEmpty("No positive abatement values to plot on log scale.");
        return;
      }

      // sort by MAC
      rows.sort((a, b) => a.MAC - b.MAC);

      // cap widths at 20% of total
      const totalAbate = rows.reduce((s, r) => s + r.Abatement, 0);
      const capLimit = totalAbate * 0.20;
      rows = rows.map(r => ({ ...r, AbateShown: Math.min(r.Abatement, capLimit) }));

      // cumulative positions
      let cum = 0;
      rows = rows.map(r => {
        const xStart = cum;
        const xEnd = cum + r.AbateShown;
        cum = xEnd;
        return { ...r, x_mid: (xStart + xEnd) / 2, CumShown: xEnd };
      });

      // scale cum line to MAC axis
      const maxMAC = Math.max(1, ...rows.map(r => Math.abs(r.MAC)));
      const maxCum = Math.max(1e-6, ...rows.map(r => r.CumShown));
      rows = rows.map(r => ({ ...r, CumScaled: (r.CumShown / maxCum) * maxMAC * 1.1 }));

      // traces
      const barTrace = {
        type: "bar",
        x: rows.map(r => r.x_mid + 1e-6),
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
