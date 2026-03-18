(function () {

    const template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host { display:block; width:100%; height:100%; }
            #frame { width:100%; height:100%; border:none; }
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
            this._onMessage = this._onMessage.bind(this);
        }

        getDataBindings() {
            return {
                maccBinding:{
                    feeds:[
                        { id:"dimension", type:"dimension" },
                        { id:"measure_abate", type:"mainStructureMember" },
                        { id:"measure_mac", type:"mainStructureMember" }
                    ]
                }
            };
        }

        connectedCallback(){ window.addEventListener("message", this._onMessage); }
        disconnectedCallback(){ window.removeEventListener("message", this._onMessage); }

        onCustomWidgetBeforeUpdate(p){ if (p.maccBinding) this._ingest(p.maccBinding); }
        onCustomWidgetAfterUpdate(p){ if (p.maccBinding) this._ingest(p.maccBinding); }

        _ingest(binding){
            const rows = binding.data || [];
            const P=[], A=[], M=[];

            for (const r of rows){
                const dim = r.dimension_0;
                const label = dim?.label ?? dim?.id ?? "";

                const ab = r.measure_abate_0?.raw ?? 0;
                const mc = r.measure_mac_0?.raw ?? 0;

                P.push(label);
                A.push(ab);
                M.push(mc);
            }

            this._data = { project:P, abatement:A, mac:M };
            this._render();
        }

        _onMessage(evt){
            if (evt.source !== this._frame.contentWindow) return;
            const msg = evt.data;
            if (!msg) return;

            if (msg.type === "bar_click") {
                this.dispatchEvent(new CustomEvent("onSelect", { detail: { label: msg.label }}));
            }
        }

        _render(){
            const d = this._data;

            const html = `
                <html><head>
                <meta charset="UTF-8" />
                <style>
                    body { margin:0; overflow:hidden; font-family:Arial; }
                    #tooltip {
                        position:absolute; background:rgba(0,0,0,0.75);
                        color:white; padding:6px 10px; border-radius:4px;
                        font-size:12px; display:none; pointer-events:none;
                    }
                </style>
                </head>

                <body>
                    <div id="tooltip"></div>
                    <svg id="svg" width="100%" height="100%"></svg>

                    <script>
                        const DATA = ${JSON.stringify(d)};
                        const svg = document.getElementById("svg");
                        const tip = document.getElementById("tooltip");

                        function draw() {

                            const W = svg.clientWidth;
                            const H = svg.clientHeight;
                            svg.innerHTML = "";

                            const margin = {top:40, right:40, bottom:60, left:70};
                            const innerW = W - margin.left - margin.right;
                            const innerH = H - margin.top - margin.bottom;

                            // Build dataset
                            const ds = DATA.project.map((p,i)=>({
                                name:p,
                                abate:DATA.abatement[i],
                                mac:DATA.mac[i]
                            }));

                            // Sort by MAC (correct MACC order)
                            ds.sort((a,b)=> a.mac - b.mac);

                            // Cumulative abatement
                            let cum = 0;
                            ds.forEach(d=>{ d.x0 = cum; cum += d.abate; d.x1 = cum; });

                            if (cum <= 0) return;

                            const x = v => margin.left + (v/cum)*innerW;

                            // Y-scale with padding
                            let macVals = ds.map(d=>d.mac);
                            let maxMAC = Math.max(...macVals);
                            let minMAC = Math.min(...macVals);

                            const PAD = (maxMAC - minMAC) * 0.15;
                            maxMAC += PAD;
                            minMAC -= PAD;
                            if (maxMAC === minMAC) maxMAC += 1;

                            const y = v =>
                                margin.top + (1 - (v - minMAC)/(maxMAC-minMAC)) * innerH;

                            const y0 = y(0);

                            // Zero dotted line
                            const zero = document.createElementNS(svg.namespaceURI,"line");
                            zero.setAttribute("x1", margin.left);
                            zero.setAttribute("x2", W-margin.right);
                            zero.setAttribute("y1", y0);
                            zero.setAttribute("y2", y0);
                            zero.setAttribute("stroke", "#0033aa");
                            zero.setAttribute("stroke-dasharray","4,4");
                            zero.setAttribute("stroke-width", 1.5);
                            svg.appendChild(zero);

                            // Target line at 60k
                            const TARGET = 60000;
                            if (TARGET < cum) {
                                const tx = x(TARGET);
                                const tline = document.createElementNS(svg.namespaceURI,"line");
                                tline.setAttribute("x1", tx);
                                tline.setAttribute("x2", tx);
                                tline.setAttribute("y1", margin.top);
                                tline.setAttribute("y2", H-margin.bottom);
                                tline.setAttribute("stroke", "black");
                                tline.setAttribute("stroke-dasharray","6,6");
                                tline.setAttribute("stroke-width",2);
                                svg.appendChild(tline);

                                const label = document.createElementNS(svg.namespaceURI,"text");
                                label.textContent = "Target: " + TARGET.toLocaleString() + " tCO₂e";
                                label.setAttribute("x", tx + 5);
                                label.setAttribute("y", margin.top + 15);
                                label.setAttribute("font-size","12");
                                svg.appendChild(label);
                            }

                            // Bars
                            ds.forEach(d=>{
                                const rect = document.createElementNS(svg.namespaceURI,"rect");
                                const bw = Math.max(8, x(d.abate)-x(0));

                                rect.setAttribute("x", x(d.x0));
                                rect.setAttribute("width", bw);
                                rect.setAttribute("y", d.mac >= 0 ? y(d.mac) : y0);
                                rect.setAttribute("height", Math.abs(y(d.mac)-y0));
                                rect.setAttribute("fill", d.mac < 0 ? "#2ca25f" : "#de2d26");
                                rect.style.cursor="pointer";

                                rect.addEventListener("mouseover", evt=>{
                                    tip.style.display="block";
                                    tip.innerHTML =
                                        "<b>"+d.name+"</b><br>"+
                                        "MAC: "+d.mac+"<br>"+
                                        "Abatement: "+d.abate;
                                });
                                rect.addEventListener("mousemove", evt=>{
                                    tip.style.left = evt.pageX+10+"px";
                                    tip.style.top  = evt.pageY-20+"px";
                                });
                                rect.addEventListener("mouseout",()=> tip.style.display="none");

                                rect.addEventListener("click",()=>{
                                    parent.postMessage({ type:"bar_click", label:d.name },"*");
                                });

                                svg.appendChild(rect);
                            });

                            // Axes labels
                            const xlab = document.createElementNS(svg.namespaceURI,"text");
                            xlab.textContent = "Total Abatement (tCO₂e)";
                            xlab.setAttribute("x", W/2);
                            xlab.setAttribute("y", H-15);
                            xlab.setAttribute("text-anchor","middle");
                            xlab.setAttribute("font-size","14");
                            svg.appendChild(xlab);

                            const ylab = document.createElementNS(svg.namespaceURI,"text");
                            ylab.textContent = "MAC (EUR/tCO₂e)";
                            ylab.setAttribute("transform","rotate(-90)");
                            ylab.setAttribute("x", -H/2);
                            ylab.setAttribute("y", 20);
                            ylab.setAttribute("text-anchor","middle");
                            ylab.setAttribute("font-size","14");
                            svg.appendChild(ylab);
                        }

                        window.addEventListener("resize", draw);
                        draw();
                    <\/script>
                </body>
                </html>
            `;

            const blob = new Blob([html], {type:"text/html"});
            this._frame.src = URL.createObjectURL(blob);
        }
    }

    customElements.define("variable-width-macc", VariableWidthMACC);

})();
