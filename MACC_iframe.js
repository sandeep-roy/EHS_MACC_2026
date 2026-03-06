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

        /* Binding definition for SAC Builder panel */
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

        /* Convert SAC binding rows into arrays for iframe plot */
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

            /* Build dynamic HTML page for iframe */
            const html = `
<!DOCTYPE html>
<html>
<head>
    <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
</head>
<body style="margin:0; padding:0; background:white; font-family:sans-serif;">
    <div id="chart" style="width:100%; height:100%; min-height:420px;"></div>

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
            /* Strong minimum visible width */
            const MIN_PX = 18;
            const pxToDom = cum > 0 ? cum / window.innerWidth : 1;
            const width = Math.max(r.Abate, MIN_PX * pxToDom);

            const mid = cum + width/2;
            x.push(mid);
            y.push(r.MAC);
            w.push(width);

            cum += width;
        });

        const trace = {
            type:"bar",
            x:x,
            y:y,
            width:w,
            marker:{
                color: y.map(v => v < 0
                    ? "rgba(39,174,96,0.95)"     // green
                    : "rgba(230,126,34,0.95)"    // orange
                ),
                line:{ color:"rgba(0,0,0,0.7)", width:1.5 }
            },
            hovertemplate:
                "<b>%{customdata[0]}</b><br>"+
                "MAC: %{y}<br>"+
                "Abatement: %{customdata[1]}<br>"+
                "<extra></extra>",
            customdata: rows.map(r=>[r.Project, r.Abate])
        };

        const layout = {
            margin:{t:30,l:80,r:20,b:60},
            hovermode:"closest",
            xaxis:{
                title:"Total Abatement (tCO₂e)",
                range:[-cum*0.03, cum*1.03],  // 3% padding on both sides
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
            displayModeBar:true,
            staticPlot:false
        });
    </script>
</body>
</html>
            `;

            /* Render iframe content */
            const blob = new Blob([html], {type:"text/html"});
            this._frame.src = URL.createObjectURL(blob);
        }
    }

    customElements.define("variable-width-macc", VariableWidthMACC);

})();
