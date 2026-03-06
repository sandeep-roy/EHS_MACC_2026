(function () {

    const template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host { display:block; width:100%; height:100%; }
            #frame {
                width:100%; 
                height:100%; 
                border:0;
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
<body style="margin:0; padding:0; font-family:sans-serif;">
    <div id="chart" style="width:100%; height:100%;"></div>

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

        rows.forEach(r=>{
            const width = Math.max(r.Abate, 1); // minimal width fallback
            const mid   = cum + width/2;
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
                color: y.map(v => v < 0 ? "#27ae60" : "#e67e22"),
                line:{color:"black", width:1}
            },
            hovertemplate:
                "<b>%{customdata[0]}</b><br>"+
                "MAC: %{y}<br>"+
                "Abatement: %{customdata[1]}<br>"+
                "<extra></extra>",
            customdata: rows.map(r=>[r.Project, r.Abate])
        };

        const layout = {
            margin:{t:20,l:60,r:20,b:60},
            xaxis:{ title:"Total Abatement (tCO2e)" },
            yaxis:{ title:"MAC (EUR/tCO2e)" },
            hovermode:"closest"
        };

        Plotly.newPlot("chart", [trace], layout, {responsive:true});
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
