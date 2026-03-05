(function () {
  let template = document.createElement("template");
  template.innerHTML = `
    <div id="macc-container" style="width:100%; height:100%;"></div>
  `;

  class VariableWidthMACC extends HTMLElement {
    constructor() {
      super();

      // Shadow DOM
      this._shadow = this.attachShadow({ mode: "open" });
      this._shadow.appendChild(template.content.cloneNode(true));
      this._container = this._shadow.querySelector("#macc-container");

      // Data arrays passed by SAC
      this._data = {
        project: [],
        abatement: [],
        mac: []
      };

      this._initialized = false;

      // ------------------------------------------------
      // Load Plotly dynamically (metadata.json forbids dependencies)
      // ------------------------------------------------
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

    // SAC resize hook
    onCustomWidgetResize() {
      if (this._initialized) {
        Plotly.Plots.resize(this._container);
      }
    }

    // -------------------------------
    // SAC property setters
    // -------------------------------
    set project(val) {
      this._data.project = val || [];
      this._render();
    }

    set abatement(val) {
      this._data.abatement = (val || []).map(Number);
      this._render();
    }

    set mac(val) {
      this._data.mac = (val || []).map(Number);
      this._render();
    }

    // ------------------------------------------------
    // MAIN RENDER FUNCTION
    // ------------------------------------------------
    _render() {
      if (!this._initialized) return;

      const project = this._data.project;
      const abate = this._data.abatement;
      const mac = this._data.mac;

      // Abort until all arrays have rows
      if (!project.length || !abate.length || !mac.length) return;

      const n = project.length;
      let rows = [];

      // Merge into row objects
      for (let i = 0; i < n; i++) {
        rows.push({
          Project: project[i],
          Abatement: abate[i],
          MAC: mac[i]
        });
      }

      // Sort by MAC (standard MACC order)
      rows.sort((a, b) => a.MAC - b.MAC);

      // ----------------------------------------
      // WIDTH CAPPING (prevents huge projects dominating)
      // ----------------------------------------
      const totalAbate = rows.reduce((s, r) => s + r.Abatement, 0);
      const capFactor = 0.20;            // 20% of total abatement max
      const capLimit = totalAbate * capFactor;

      rows = rows.map(r => ({
        ...r,
        AbateShown: Math.min(r.Abatement, capLimit)
      }));

      // ----------------------------------------
      // Compute cumulative x positions
      // ----------------------------------------
      let cum = 0;
      rows = rows.map(r => {
        const x_start = cum;
        const x_end = cum + r.AbateShown;
        cum = x_end;
        return {
          ...r,
          x_mid: (x_start + x_end) / 2,
          CumShown: x_end
        };
      });

      // ----------------------------------------
      // Scale cumulative line to MAC axis range
      // ----------------------------------------
      const maxMAC = Math.max(...rows.map(r => Math.abs(r.MAC)));
      const maxCum = Math.max(...rows.map(r => r.CumShown));

      rows = rows.map(r => ({
        ...r,
        CumScaled: (r.CumShown / maxCum) * maxMAC * 1.1
      }));

      // ----------------------------------------
      // Build Plotly traces
      // ----------------------------------------

      // Bars with variable widths
      const barTrace = {
        type: "bar",
        x: rows.map(r => r.x_mid + 1),        // +1 avoids log(0)
        y: rows.map(r => r.MAC),
        width: rows.map(r => r.AbateShown),
        marker: {
          color: rows.map(r => (r.MAC < 0 ? "#27ae60" : "#e74c3c")),
          line: { color: "black", width: 1 }
        },
        text: rows.map(r =>
          `Project: ${r.Project}<br>` +
          `MAC: ${r.MAC.toFixed(2)} EUR/tCO₂e<br>` +
          `Abatement: ${r.Abatement} tCO₂e<br>` +
          `Width (Shown): ${r.AbateShown} tCO₂e`
        ),
        hoverinfo: "text",
        name: "MAC"
      };

      // Cumulative line
      const cumTrace = {
        type: "scatter",
        mode: "lines+markers",
        x: rows.map(r => r.CumShown + 1),
        y: rows.map(r => r.CumScaled),
        marker: { size: 7, color: "blue" },
        line: { width: 3, color: "blue" },
        hoverinfo: "text",
        text: rows.map(r => `Cumulative Abatement: ${r.CumShown} tCO₂e`),
        name: "Cumulative"
      };

      // ----------------------------------------
      // Layout
      // ----------------------------------------
      const layout = {
        title: "Variable‑Width Marginal Abatement Cost Curve (MACC)",
        xaxis: {
          title: "Total Abatement (tCO₂e)",
          type: "log"
        },
        yaxis: {
          title: "MAC (EUR / tCO₂e)",
          zeroline: true
        },
        margin: { t: 50, l: 60, r: 40, b: 40 },
        showlegend: false,
        hoverlabel: { bgcolor: "white" }
      };

      // Render
      Plotly.newPlot(this._container, [barTrace, cumTrace], layout, {
        displaylogo: false
      });
    }
  }

  customElements.define(
    "com-custom-macc-variablewidth",
    VariableWidthMACC
  );
})();
