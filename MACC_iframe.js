(function () {

  const template = document.createElement("template");
  template.innerHTML = `
    <style>
      :host { display:block; width:100%; height:100%; }
      #frame {
        width:100%;
        height:100%;
        border:0;
        overflow:hidden;
      }
    </style>
    <iframe id="frame" title="MACC Plotly Frame"></iframe>
  `;

  class VariableWidthMACC extends HTMLElement {
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode:"open" });
      this._shadow.appendChild(template.content.cloneNode(true));
      this._frame = this._shadow.querySelector("#frame");
      this._data = { project:[], abatement:[], mac:[] };
    }

    /* SAC Builder data feeds */
    getDataBindings() {
      return {
        maccBinding: {
          feeds: [
            { id:"dimension",     type:"dimension" },
            { id:"measure_abate", type:"mainStructureMember" },
            { id:"measure_mac",   type:"mainStructureMember" }
          ]
        }
      };
    }

    onCustomWidgetBeforeUpdate(changedProps) {
      if ("maccBinding" in changedProps) this._ingest(changedProps.maccBinding);
    }
    onCustomWidgetAfterUpdate(changedProps) {
      if ("maccBinding" in changedProps) this._ingest(changedProps.maccBinding);
    }

    /* Robust ingestion from SAC binding rows */
    _ingest(binding) {
      const rows = binding?.data || binding?.value || binding?.resultSet || binding?.rows || [];
      const projects = [];
      const abates = [];
      const macs = [];

      for (const r of rows) {
        const d  = r.dimension_0 || r.dimensions_0 || (Array.isArray(r.dimensions) ? r.dimensions[0] : {}) || {};
        const p  = d.description ?? d.text ?? d.label ?? d.id ?? "";
        const ab = r.measure_abate_0?.raw ?? r.measure_abate_0 ?? (Array.isArray(r.measures) ? r.measures[0]?.raw : 0) ?? 0;
        const mc = r.measure_mac_0?.raw   ?? r.measure_mac_0   ?? (Array.isArray(r.measures) ? r.measures[1]?.raw : 0) ?? 0;

        projects.push(String(p));
        abates.push(Number(ab) || 0);
        macs.push(Number(mc) || 0);
      }

      this._data = { project:projects, abatement:abates, mac:macs };
      this._render();
    }

    _render() {
      const { project, abatement, mac } = this._data;

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    html, body { height:100%; margin:0; }
    #chart { width:100%; height:100%; min-height:480px; }
  </style>
  <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
</head>
<body>
  <div id="chart"></div>

  <script>
    // Data injected from parent widget
    const project = ${JSON.stringify(project)};
    const abate   = ${JSON.stringify(abatement)};
    const mac     = ${JSON.stringify(mac)};

    function draw() {
      try {
        // Build and sort rows by MAC
        let rows = project.map((p,i)=>({ Project:p, Abate:abate[i], MAC:mac[i] }))
                          .sort((a,b)=>a.MAC - b.MAC);

        // Totals and domain scaling for min pixel width
        const totalAb = rows.reduce((s,r)=>s + (Number(r.Abate)||0), 0);
        let cum = 0;
        const x = [], y = [], w = [], custom = [];

        // Convert "pixels → domain" using total width vs. iframe width
        const MIN_PX = 18;
        const pxToDom = (totalAb > 0 && window.innerWidth > 0) ? (totalAb / window.innerWidth) : 1;

        rows.forEach(r => {
          const width = Math.max(Number(r.Abate)||0, MIN_PX * pxToDom);
          const mid   = cum + width / 2;

          x.push(mid);
          y.push(Number(r.MAC)||0);
          w.push(width);
          custom.push([r.Project, Number(r.Abate)||0]);

          cum += width;
        });

        // Color bins for MAC values
        const colors = y.map(v => {
          if (v < 0)   return "rgba(39,174,96,0.95)";   // green
          if (v < 25)  return "rgba(241,196,15,0.95)";  // yellow
          if (v < 50)  return "rgba(230,126,34,0.95)";  // orange
                        return "rgba(231,76,60,0.95)";   // red
        });

        // Bar trace
        const bar = {
          type: "bar",
          x, y, width: w,
          marker: { color: colors, line: { color: "rgba(0,0,0,0.75)", width: 1.5 } },
          customdata: custom,
          hovertemplate:
            "<b>%{customdata[0]}</b><br>"+
            "MAC: %{y:.2f} EUR/tCO₂e<br>"+
            "Abatement: %{customdata[1]:,.0f} tCO₂e<extra></extra>"
        };

        // Axis padding
        const xPad = cum * 0.03;
        const xRange = [-xPad, cum + xPad];

        // Target and carbon price lines
        const yMin = Math.min(...y, 0) * 1.25;
        const yMax = Math.max(...y, 0) * 1.25;

        const targetLine = {
          type: "line", x0: 60000, x1: 60000, y0: yMin, y1: yMax,
          line: { color: "black", width: 3, dash: "dash" }
        };

        const carbonLine = {
          type: "line", x0: xRange[0], x1: xRange[1], y0: 50, y1: 50,
          line: { color: "blue", width: 3, dash: "dot" }
        };

        const layout = {
          margin: { t: 50, l: 80, r: 40, b: 60 },
          hovermode: "closest",
          shapes: [targetLine, carbonLine],
          annotations: [
            { x: 60000, y: yMax * 0.95, text: "Target: 60k tCO₂e", showarrow: false, font: { size: 12 }, yanchor:"bottom" },
            { x: xRange[1], y: 50, text: "Carbon price: 50 EUR/tCO₂e", showarrow: false, font: { size: 12 }, xanchor:"right", yanchor:"bottom" }
          ],
          xaxis: {
            title: "Total Abatement (tCO₂e)",
            range: xRange,
            tickformat: "~s",
            automargin: true
          },
          yaxis: {
            title: "MAC (EUR/tCO₂e)",
            automargin: true,
            zeroline: true
          }
        };

        Plotly.newPlot("chart", [bar], layout, {
          responsive: true,
          displaylogo: false,
          displayModeBar: true
        });
      } catch (err) {
        console.error("[MACC iframe] draw error:", err);
        const el = document.getElementById("chart");
        if (el) el.innerHTML = "<div style='padding:8px;font:12px Arial;color:#a00'>Plot error. See console.</div>";
      }
    }

    // Wait until Plotly is available, then draw
    (function waitPlotly(){
      if (window.Plotly && window.Plotly.newPlot) return draw();
      setTimeout(waitPlotly, 30);
    })();

    // Redraw on resize to keep min-px logic stable
    window.addEventListener("resize", () => {
      if (window.Plotly && window.Plotly.react) draw();
    });
  </script>
</body>
</html>
      `;

      const blob = new Blob([html], { type: "text/html" });
      this._frame.src = URL.createObjectURL(blob);
    }
  }

  customElements.define("variable-width-macc", VariableWidthMACC);

})();
