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
        <iframe id="frame"></iframe>
    `;

    class VariableWidthMACC extends HTMLElement {
        constructor() {
            super();
            this._shadow = this.attachShadow({ mode:"open" });
            this._shadow.appendChild(template.content.cloneNode(true));
            this._frame = this._shadow.querySelector("#frame");
            this._data = { project:[], abatement:[], mac:[] };
        }

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
            if ("maccBinding" in changedProps)
                this._ingest(changedProps.maccBinding);
        }

        onCustomWidgetAfterUpdate(changedProps) {
            if ("maccBinding" in changedProps)
                this._ingest(changedProps.maccBinding);
        }

        _ingest(binding) {
            const rows = binding.data || [];
            const projects = [];
            const abates = [];
            const macs = [];

            for (const r of rows) {
                const d = (r.dimension_0 || r.dimensions_0 || r.dimensions?.[0] || {});
                const proj = d.description ?? d.text ?? d.label ?? d.id ?? "";
                const ab = r.measure_abate_0?.raw ?? r.measure_abate_0 ?? r.measures?.[0]?.raw ?? 0;
                const mc = r.measure_mac_0?.raw   ?? r.measure_mac_0   ?? r.measures?.[1]?.raw   ?? 0;

                projects.push(String(proj));
                abates.push(Number(ab));
                macs.push(Number(mc));
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
    <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
</head>
<body style="margin:0; padding:0; background:white;">
    <div id="chart" style="width:100%; height:100%; min-height:480px;"></div>

    <script>
        const project = ${JSON.stringify(project)};
        const abate   = ${JSON.stringify(abatement)};
        const mac     = ${JSON.stringify(mac)};

        let rows = project.map((p,i)=>({
            Project:p,
            Abate:abate[i],
            MAC:mac[i]
        })).sort((a,b)=>a.MAC-b.MAC);

        const x = [];
        const y = [];
        const w = [];

        let cum = 0;

        rows.forEach(r => {
            const MIN_PX = 18;
            const pxToDom = cum > 0 ? cum / window.innerWidth : 1;
            const width = Math.max(r.Abate, MIN_PX * pxToDom);
            const mid = cum + width/2;

            x.push(mid);
            y.push(r.MAC);
            w.push(width);

            cum += width;
        });


        // -------- COLOR BINS ----------
        const colorBins = y.map(v => {
            if (v < 0) return "rgba(39,174,96,0.95)";        // green
            if (v < 25) return "rgba(241,196,15,0.95)";      // yellow
            if (v < 50) return "rgba(230,126,34,0.95)";      // orange
            return "rgba(231,76,60,0.95)";                   // red
        });

        const trace = {
            type:"bar",
            x:x,
            y:y,
            width:w,
            marker:{
                color:colorBins,
                line:{ color:"rgba(0,0,0,0.7)", width:1.5 }
            },
            customdata: rows.map(r=>[r.Project, r.Abate]),
            hovertemplate:
                "<b>%{customdata[0]}</b><br>"+
                "MAC: %{y}<br>"+
                "Abatement: %{customdata[1]}<br>"+
                "<extra></extra>"
        };

        // -------- TARGET LINE at 60,000 ----------
        const targetLine = {
            type:"line",
            x0:60000, x1:60000,
            y0:Math.min(...y)*1.2,
            y1:Math.max(...y)*1.2,
            line:{ color:"black", width:3, dash:"dash" }
        };

        // -------- CARBON PRICE LINE at 50 ----------
        const carbonLine = {
            type:"line",
            x0:-cum*0.03,
            x1:cum*1.03,
            y0:50, y1:50,
            line:{ color:"blue", width:3, dash:"dot" }
        };

        const layout = {
            margin:{t:50,l:80,r:40,b:60},
            hovermode:"closest",
            shapes:[targetLine, carbonLine],
            annotations:[
                {
                    x:60000, y:Math.max(...y)*1.15,
                    text:"Target: 60k tCO₂e",
                    showarrow:false,
                    font:{size:12}
                },
                {
                    x:cum, y:50,
                    text:"Carbon price: 50 EUR/tCO₂e",
                    showarrow:false,
                    font:{size:12},
                    xanchor:"right"
                }
            ],
            xaxis:{
                title:"Total Abatement (tCO₂e)",
                range:[-cum*0.03, cum*1.03],
                tickformat:"~s",
                automargin:true
            },
            yaxis:{
                title:"MAC (EUR/tCO₂e)",
                automargin:true
            }
        };

        Plotly.newPlot("chart", [trace], layout, {
            responsive:true,
            displaylogo:false,
            displayModeBar:true
        });

    </script>
</body>
</html>
            `;

            const blob = new Blob([html], {type:"text/html"});
            this._frame.src = URL.createObjectURL(blob);
        }
    }

    customElements.define("variable-width-macc", VariableWidthMACC);

})();
