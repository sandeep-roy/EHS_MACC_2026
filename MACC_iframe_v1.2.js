(function () {

    /* ---------------------------------------------------------
       TEMPLATE: Shadow DOM + iframe
    --------------------------------------------------------- */
    const template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host {
                display: block;
                width: 100%;
                height: 100%;
            }
            #frame {
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

            this._data = {
                project: [],
                abatement: [],
                mac: []
            };

            this._onMessage = this._onMessage.bind(this);
        }


        /* ---------------------------------------------------------
           SAC → Data Binding Definition
        --------------------------------------------------------- */
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


        /* ---------------------------------------------------------
           SAC → BEFORE & AFTER update
        --------------------------------------------------------- */
        onCustomWidgetBeforeUpdate(payload) {
            if (payload.maccBinding) this._ingest(payload.maccBinding);
        }

        onCustomWidgetAfterUpdate(payload) {
            if (payload.maccBinding) this._ingest(payload.maccBinding);
        }


        /* ---------------------------------------------------------
           SAFE INGEST: Handles all SAC dataset formats
        --------------------------------------------------------- */
        _ingest(binding) {

            const rows = binding.data || [];
            const P = [], A = [], M = [];

            for (const r of rows) {

                // DIMENSION
                const dim =
                    r.dimensions?.[0] ||
                    r.dimension_0 ||
                    r["dimension"] ||
                    {};

                const label =
                    dim.description ??
                    dim.text ??
                    dim.label ??
                    dim.id ??
                    "";

                // ABATEMENT
                const ab =
                    r.measures?.[0]?.raw ??
                    r.measure_abate_0?.raw ??
                    r.measure_abate_0 ??
                    r["measure_abate"] ??
                    0;

                // MAC
                const mc =
                    r.measures?.[1]?.raw ??
                    r.measure_mac_0?.raw ??
                    r.measure_mac_0 ??
                    r["measure_mac"] ??
                    0;

                P.push(String(label));
                A.push(+ab);
                M.push(+mc);
            }

            this._data = { project: P, abatement: A, mac: M };
            this._render();
        }


        /* ---------------------------------------------------------
           Handle events coming FROM iframe (click, clear)
        --------------------------------------------------------- */
        _onMessage(evt) {
            if (evt.source !== this._frame.contentWindow) return;

            const msg = evt.data;
            if (!msg) return;

            // Placeholder for SAC Linked Analysis (if enabled later)
            if (msg.type === "bar_click") {
                this.dispatchEvent(new CustomEvent("onSelect", {
                    detail: { label: msg.label }
                }));
            }

            if (msg.type === "clear_selection") {
                this.dispatchEvent(new CustomEvent("onSelect", {
                    detail: { label: null }
                }));
            }
        }


        /* ---------------------------------------------------------
           Render iframe with MACC visualization
        --------------------------------------------------------- */
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
                            overflow: hidden;
                        }

                        #chart {
                            width: 100%;
                            height: 100%;
                        }

                        .tooltip {
                            position: absolute;
                            padding: 6px 10px;
                            background: rgba(0,0,0,0.75);
                            color: white;
                            font-size: 12px;
                            border-radius: 4px;
                            pointer-events: none;
                            display: none;
                        }
                    </style>
                </head>

                <body>
                    <div id="chart"></div>
                    <div id="tip" class="tooltip"></div>

                    <script>
                        const DATA = ${JSON.stringify(payload)};

                        const container = document.getElementById("chart");
                        const tooltip = document.getElementById("tip");

                        function draw() {

                            const w = container.clientWidth;
                            const h = container.clientHeight;
                            const margin = { top: 25, right: 20, bottom: 40, left: 60 };
                            const innerW = w - margin.left - margin.right;
                            const innerH = h - margin.top - margin.bottom;

                            container.innerHTML = "";

                            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                            svg.setAttribute("width", w);
                            svg.setAttribute("height", h);
                            container.appendChild(svg);

                            const g = document.createElementNS(svg.namespaceURI, "g");
                            g.setAttribute("transform", \`translate(\${margin.left},\${margin.top})\`);
                            svg.appendChild(g);

                            // Build MACC dataset
                            const ds = DATA.project.map((p,i)=>({
                                project: p,
                                abate: DATA.abatement[i],
                                mac: DATA.mac[i]
                            })).sort((a,b)=>a.abate - b.abate);

                            let cum = 0;
                            for (const d of ds) {
                                d.x0 = cum;
                                d.x1 = cum + d.abate;
                                cum += d.abate;
                            }

                            // X-Scale
                            const maxCum = cum;
                            const x = v => (v / maxCum) * innerW;

                            // Y-Scale
                            const maxMAC = Math.max(...ds.map(d=>d.mac));
                            const minMAC = Math.min(...ds.map(d=>d.mac));
                            const y = v => innerH - ((v - minMAC) / (maxMAC - minMAC)) * innerH;

                            // Draw bars
                            ds.forEach(d => {
                                const rect = document.createElementNS(svg.namespaceURI, "rect");

                                rect.setAttribute("x", x(d.x0));
                                rect.setAttribute("y", d.mac >= 0 ? y(d.mac) : y(0));
                                rect.setAttribute("width", Math.max(1, x(d.abate) - x(0)));
                                rect.setAttribute("height", Math.abs(y(d.mac) - y(0)));
                                rect.setAttribute("fill", "#4a90e2");
                                rect.style.cursor = "pointer";

                                rect.addEventListener("mouseover", evt => {
                                    tooltip.style.display = "block";
                                    tooltip.innerHTML =
                                        "<b>" + d.project + "</b><br>" +
                                        "Abatement: " + d.abate + "<br>" +
                                        "MAC: " + d.mac;
                                });

                                rect.addEventListener("mousemove", evt => {
                                    tooltip.style.left = (evt.pageX + 10) + "px";
                                    tooltip.style.top = (evt.pageY - 20) + "px";
                                });

                                rect.addEventListener("mouseout", () => {
                                    tooltip.style.display = "none";
                                });

                                rect.addEventListener("click", () => {
                                    parent.postMessage({
                                        type: "bar_click",
                                        label: d.project
                                    }, "*");
                                });

                                g.appendChild(rect);
                            });

                        }

                        window.addEventListener("resize", draw);
                        draw();

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
