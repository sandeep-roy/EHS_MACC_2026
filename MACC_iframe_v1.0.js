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

            // Data passed to iframe
            this._data = {
                project: [],
                abatement: [],
                mac: []
            };

            this._onMessage = this._onMessage.bind(this);
        }

        /* SAC data binding definition */
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

        /* Before SAC updates widget data */
        onCustomWidgetBeforeUpdate(payload) {
            if (payload.maccBinding) {
                this._ingest(payload.maccBinding);
            }
        }

        /* After SAC updates widget data */
        onCustomWidgetAfterUpdate(payload) {
            if (payload.maccBinding) {
                this._ingest(payload.maccBinding);
            }
        }

        /* Parse SAC dataset rows into arrays */
        _ingest(binding) {
            const rows = binding.data || [];
            const P = [], A = [], M = [];

            for (const r of rows) {
                const dim = r.dimensions?.[0];
                const label = dim?.description ?? dim?.text ?? dim?.label ?? dim?.id ?? "";

                const abate = r.measures?.[0]?.raw ?? 0;
                const mac = r.measures?.[1]?.raw ?? 0;

                P.push(String(label));
                A.push(+abate);
                M.push(+mac);
            }

            this._data = { project: P, abatement: A, mac: M };
            this._render();
        }

        /* Handle messages FROM iframe (selection, reset, etc.) */
        _onMessage(evt) {
            if (evt.source !== this._frame.contentWindow) return;

            const msg = evt.data;
            if (!msg) return;

            // Reserved for future linked-analysis hooks
        }

        /* Inject HTML into iframe */
        _render() {

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
                        </style>
                    </head>

                    <body>
                        <script>
                            // Data from SAC
                            const MACC_DATA = ${JSON.stringify(this._data)};

                            // Your original MACC rendering logic goes here:
                            // Example:
                            // drawMACC(MACC_DATA);

                            // For now, just show data for debugging:
                            document.body.innerHTML =
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
