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

            // Iframe reference
            this._frame = this._shadow.querySelector("#frame");

            // Data container
            this._data = {
                project: [],
                abatement: [],
                mac: []
            };

            this._dimTechId = "dimension";

            // Bind message handler
            this._onMessage = this._onMessage.bind(this);
        }

        // SAC binding structure
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

        // SAC → before update
        onCustomWidgetBeforeUpdate(p) {
            if (p.maccBinding) {
                this._ingest(p.maccBinding);
            }
        }

        // SAC → after update
        onCustomWidgetAfterUpdate(p) {
            if (p.maccBinding) {
                this._ingest(p.maccBinding);
            }
        }

        // Read SAC dataset rows
        _ingest(binding) {
            const rows = binding.data || [];
            const P = [], A = [], M = [];

            try {
                const md = binding.metadata;
                this._dimTechId =
                    md?.dimensions?.[0]?.id ||
                    md?.dimensions?.[0]?.key ||
                    "dimension";
            } catch (err) {
                console.warn("Metadata error:", err);
            }

            for (const r of rows) {
                const d = r.dimensions?.[0] || {};
                const lbl = d.description ?? d.text ?? d.label ?? d.id ?? "";

                const ab = r.measures?.[0]?.raw ?? 0;
                const mc = r.measures?.[1]?.raw ?? 0;

                P.push(String(lbl));
                A.push(+ab);
                M.push(+mc);
            }

            this._data = {
                project: P,
                abatement: A,
                mac: M
            };

            this._render();
        }

        // For incoming messages from iframe only
        _onMessage(evt) {
            if (!this._frame || evt.source !== this._frame.contentWindow) {
                return; // Ignore messages not from our iframe
            }

            const msg = evt.data;
            if (!msg) return;

            console.log("[MACC Widget] Received message from iframe:", msg);

            // PLACEHOLDER: Handle future linked‑analysis events here
            // Example:
            // if (msg.type === "selection") { ... }
        }

        // Render fresh iframe content
        _render() {
            const html = `
                <html>
                <head>
                    <style>
                        body {
                            margin: 0;
                            font-family: Arial, sans-serif;
                        }
                    </style>
                </head>
                <body>
                    <div id="chartRoot"></div>

                    <script>
                        // Data injected into iframe
                        const MACC_DATA = ${JSON.stringify(this._data)};

                        console.log("MACC Data inside iframe:", MACC_DATA);

                        // TODO: Insert your MACC rendering logic here
                        // -----------------------------------------
                        // Example:
                        // drawMACCChart(MACC_DATA);
                        // -----------------------------------------

                        // Placeholder to confirm communication
                        window.parent.postMessage(
                            { type: "macc_iframe_loaded", payload: MACC_DATA },
                            "*"
                        );
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
