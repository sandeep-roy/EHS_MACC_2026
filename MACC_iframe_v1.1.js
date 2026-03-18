(function () {

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

            // Widget-local data storage
            this._data = {
                project: [],
                abatement: [],
                mac: []
            };

            this._onMessage = this._onMessage.bind(this);
        }

        /* SAC → Widget feed definition */
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

        onCustomWidgetBeforeUpdate(payload) {
            if (payload.maccBinding) {
                this._ingest(payload.maccBinding);
            }
        }

        onCustomWidgetAfterUpdate(payload) {
            if (payload.maccBinding) {
                this._ingest(payload.maccBinding);
            }
        }

        /* SAFE INGESTION LOGIC */
        _ingest(binding) {
            const rows = binding.data || [];
            const P = [], A = [], M = [];

            for (const r of rows) {

                /* ---- DIMENSION: PROJECT ID ---- */
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

                /* ---- MEASURE: ABATEMENT ---- */
                const ab =
                    r.measures?.[0]?.raw ??
                    r.measure_abate_0?.raw ??
                    r.measure_abate_0 ??
                    r["measure_abate"] ??
                    0;

                /* ---- MEASURE: MAC ---- */
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

        /* Reserved for future linked-analysis support */
        _onMessage(evt) {
            if (evt.source !== this._frame.contentWindow) return;
        }

        /* Render iframe content */
        _render() {

            const payload = this._data;

            const html = `
                <html>
                <head>
                    <meta charset="utf-8" />
                    <style>
                        body {
                            margin: 0;
                            padding: 10px;
                            font-family: Arial, sans-serif;
                            overflow: auto;
                            color: #222;
                        }
                        pre {
                            white-space: pre-wrap;
                            font-size: 14px;
                        }
                    </style>
                </head>

                <body>
                    <script>
                        // Data coming from SAC widget
                        const MACC_DATA = ${JSON.stringify(payload)};

                        // TEMP: Display the data for debugging
                        // (Replace this with your visual renderer)
                        document.body.innerHTML =
                            "<h3>MACC Data Received</h3>" +
                            "<pre>" + JSON.stringify(MACC_DATA, null, 2) + "</pre>";
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
