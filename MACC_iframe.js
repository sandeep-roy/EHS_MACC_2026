(function () {
    const template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host {
                display: block;
                width: 100%;
                height: 100%;
            }
            iframe {
                width: 100%;
                height: 100%;
                border: none;
            }
        </style>
        <iframe id="frame"></iframe>
    `;

    class VariableWidthMACC extends HTMLElement {
        constructor() {
            super();
            this._shadow = this.attachShadow({ mode: "open" });
            this._shadow.appendChild(template.content.cloneNode(true));

            this._frame = this._shadow.querySelector("#frame");
            this._data = { project: [], abatement: [], mac: [] };
            this._dimTechId = "dimension";

            this._onMessage = this._onMessage.bind(this);
        }

        getDataBindings() {
            return {
                maccBinding: {
                    feeds: [
                        { id: "dimension", type: "dimension" },
                        { id: "measure_abate", type: "mainStructureMember" },
                        { id: "measure_mac", type: "mainStructureMember" }
                    ]
                }
            };
        }

        connectedCallback() {
            window.addEventListener("message", this._onMessage);
        }

        disconnectedCallback() {
            window.removeEventListener("message", this._onMessage);
        }

        onCustomWidgetBeforeUpdate(p) {
            if (p.maccBinding) this._ingest(p.maccBinding);
        }

        onCustomWidgetAfterUpdate(p) {
            if (p.maccBinding) this._ingest(p.maccBinding);
        }

        _ingest(binding) {
            const rows = binding.data || [];
            const P = [], A = [], M = [];

            try {
                const md = binding.metadata;
                this._dimTechId =
                    md?.dimensions?.[0]?.id ||
                    md?.dimensions?.[0]?.key ||
                    "dimension";
            } catch (_) { }

            for (const r of rows) {
                const d = r.dimensions?.[0] || {};
                const lbl = d.description ?? d.text ?? d.label ?? d.id ?? "";

                const ab = r.measures?.[0]?.raw ?? 0;
                const mc = r.measures?.[1]?.raw ?? 0;

                P.push(String(lbl));
                A.push(+ab);
                M.push(+mc);
            }

            this._data = { project: P, abatement: A, mac: M };
            this._render();
        }

        _onMessage(evt) {
            if (!this._frame || evt.source !== this._frame.contentWindow) return;
        }

        _render() {
            const payload = this._data;

            const html = `
                <html>
                <head>
                    <meta charset="utf-8" />
                    <style>
                        body {
                            margin: 0;
                            font-family: Arial, sans-serif;
                        }
                        .tooltip {
                            position: absolute;
                            background: rgba(0,0,0,0.7);
                            color: white;
                            padding: 6px 10px;
                            font-size: 12px;
                            border-radius: 4px;
                            pointer-events: none;
                        }
                    </style>
                </head>

                <body>
                    <div id="chartRoot"></div>

                    <!-- Lightweight D3 subset -->
                    <script>
                        ${LIGHTWEIGHT_D3_MINIFIED}
                    <\/script>

                    <script>
                        const DATA = ${JSON.stringify(payload)};

                        function drawMACC() {
                            const container = document.getElementById("chartRoot");
                            container.innerHTML = "";

                            const margin = { top: 30, right: 40, bottom: 60, left: 70 };
                            const width = container.clientWidth - margin.left - margin.right;
                            const height = container.clientHeight - margin.top - margin.bottom;

                            const svg = d3.select(container)
                                .append("svg")
                                .attr("width", width + margin.left + margin.right)
                                .attr("height", height + margin.top + margin.bottom)
                                .append("g")
                                .attr("transform", \`translate(\${margin.left},\${margin.top})\`);

                            // Build dataset
                            const p,
                                abate: DATA.abatement[i],
                                mac: DATA.mac[i]
                            })).sort((a, b) => d3.ascending(a.abate, b.abate));

                            dataset.forEach((d, i) => {
                                d.cumAbate = d3.sum(dataset.slice(0, i + 1), v => v.abate);
                            });

                            const x = d3.scaleLinear()
                                .domain([0, d3.sum(dataset, d => d.abate)])
                                .range([0, width]);

                            const y = d3.scaleLinear()
                                .domain([
                                    d3.min(dataset, d => d.mac),
                                    d3.max(dataset, d => d.mac)
                                ])
                                .nice()
                                .range([height, 0]);

                            const color = d3.scaleOrdinal(d3.schemeSet2);

                            let cumStart = 0;

                            svg.selectAll(".bar")
                                .data(dataset)
                                .enter()
                                .append("rect")
                                .attr("class", "bar")
                                .attr("x", d => {
                                    const val = cumStart;
                                    cumStart += d.abate;
                                    return x(val);
                                })
                                .attr("y", d => d.mac >= 0 ? y(d.mac) : y(0))
                                .attr("width", d => x(d.abate) - x(0))
                                .attr("height", d => Math.abs(y(d.mac) - y(0)))
                                .attr("fill", d => color(d.project));

                            const line = d3.line()
                                .x(d => x(d.cumAbate))
                                .y(d => y(d.mac))
                                .curve(d3.curveMonotoneX);

                            svg.append("path")
                                .datum(dataset)
                                .attr("fill", "none")
                                .attr("stroke", "#222")
                                .attr("stroke-width", 2)
                                .attr("d", line);

                            svg.append("g")
                                .attr("transform", "translate(0," + y(0) + ")")
                                .call(d3.axisBottom(x));

                            svg.append("g")
                                .call(d3.axisLeft(y));
                        }

                        window.addEventListener("resize", drawMACC);
                        drawMACC();
                    <\/script>
                </body>
                </html>
            `;

            const blob = new Blob([html], { type: "text/html" });
            this._frame.src = URL.createObjectURL(blob);
        }
    }

    customElements.define("variable-width-macc", VariableWidthMACC);

})();
