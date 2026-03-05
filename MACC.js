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

      // Data arrays
      this._data = {
        project: [],
        abatement: [],
        mac: []
      };

      this._initialized = false;

      // Load Plotly dynamically
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

    // Resize hook for SAC
    onCustomWidgetResize() {
      if (this._initialized && this._container) {
        Plotly.Plots.resize(this._container);
      }
    }

    // -----------------------------------------------
    // SAC PROPERTY SETTERS (auto-convert strings → arrays)
    // -----------------------------------------------

    set project(val) {
      if (typeof val === "string")
        this._data.project = val.split(",").map(s => s.trim());
      else this._data.project = val || [];
      this._render();
    }

    set abatement(val) {
      if (typeof val === "string")
        this._data.abatement = val.split(",").map(Number);
      else this._data.abatement = (val || []).map(Number);
      this._render();
    }

    set mac(val) {
      if (typeof val === "string")
        this._data.mac = val.split(",").map(Number);
      else this._data.mac = (val || []).map(Number);
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

      // Prevent empty rendering
      if (!project.length || !abate.length || !mac.length) {
        this._container.innerHTML = "Please provide project, abatement, and MAC inputs.";
        return;
      }

      let rows = [];
      for (let i = 0; i < project.length; i++) {
        rows.push({
          Project: project[i],
          Abatement: abate[i],
          MAC: mac[i]
        });
      }

      // Sort by MAC
      rows.sort((a, b) => a.MAC - b.MAC);

      // Width cap
      const totalAbate = rows.reduce((s, r) => s + r.Abatement, 0);
      const capFactor = 0.20;
      const capLimit = totalAbate * capFactor;

      rows = rows.map(r => ({
        ...r,
        AbateShown: Math.min(r.Abatement, capLimit)
      }));

      // Cumulative width
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

      // Scale cumulative line
      const maxMAC = Math.max(...rows.map(r => Math.abs(r.MAC)));
      const maxCum = Math.max(...rows.map(r => r.CumShown));

      rows = rows.map(r => ({
        ...r,
        CumScaled: (r.CumShown / maxCum) * maxMAC * 1.1
      }));

      // ----------------------------------------
      // PLOTLY TRACES
      // ----------------------------------------
      const barTrace = {
        type: "bar",
        x: rows.map(r => r.x_mid + 1),
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
        x: rows.map(r => r.CumShown + 1),
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
        margin: { t: 50, l: 60, r: 40, b: 40 },
        showlegend: false,
        hoverlabel: { bgcolor: "white" }
      };

      Plotly.newPlot(this._container, [barTrace, cumTrace], layout, {
        displaylogo: false
      });
    }
  }

  customElements.define("variable-width-macc", VariableWidthMACC);
})();
