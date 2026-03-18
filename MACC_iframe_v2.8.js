(function () {

  /* ------------------------------------------------------------
     TEMPLATE WITH ABSOLUTE-POSITIONED IFRAME
     (Fixes SAC layout and prevents squeezed chart)
  ------------------------------------------------------------ */
  const template = document.createElement("template");
  template.innerHTML = `
      <style>
        :host {
            display:block;
            width:100%;
            height:100%;
            position:relative;
        }
        iframe {
            position:absolute;
            top:0;
            left:0;
            width:100%;
            height:100%;
            border:none;
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

      /* Full dataset */
      this._data = {
        project: [],
        category: [],
        abatement: [],
        mac: [],
        cumulative: [],
        npv: [],
        capex: [],
        opex: []
      };

      this._onMessage = this._onMessage.bind(this);
    }

    /* ------------------------------------------------------------
       DATA BINDINGS FOR SAC
    ------------------------------------------------------------ */
    getDataBindings() {
      return {
        maccBinding: {
          feeds: [
            { id:"dimension",      type:"dimension" },
            { id:"dimension_cat",  type:"dimension" },
            { id:"measure_abate",  type:"mainStructureMember" },
            { id:"measure_mac",    type:"mainStructureMember" },
            { id:"measure_cum",    type:"mainStructureMember" },
            { id:"measure_npv",    type:"mainStructureMember" },
            { id:"measure_capex",  type:"mainStructureMember" },
            { id:"measure_opex",   type:"mainStructureMember" }
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

    /* ------------------------------------------------------------
       INGEST DATA FROM SAC
    ------------------------------------------------------------ */
    _ingest(binding) {
      const rows = binding.data || [];

      const P=[], CAT=[], A=[], M=[], CUM=[], NPV=[], CAP=[], OPX=[];

      for (const r of rows) {

        const project  = r.dimension_0?.label ?? r.dimension_0?.id ?? "";
        const category = r.dimension_cat_0?.label ?? "";

        const ab       = r.measure_abate_0?.raw ?? 0;
        const mac      = r.measure_mac_0?.raw ?? 0;
        const cum      = r.measure_cum_0?.raw ?? 0;
        const npv      = r.measure_npv_0?.raw ?? 0;
        const capex    = r.measure_capex_0?.raw ?? 0;
        const opex     = r.measure_opex_0?.raw ?? 0;

        P.push(project);
        CAT.push(category);
        A.push(ab);
        M.push(mac);
        CUM.push(cum);
        NPV.push(npv);
        CAP.push(capex);
        OPX.push(opex);
      }

      this._data = {
        project: P,
        category: CAT,
        abatement: A,
        mac: M,
        cumulative: CUM,
        npv: NPV,
        capex: CAP,
        opex: OPX
      };

      this._render();
    }

    /* ------------------------------------------------------------
       HANDLE CLICKS FROM IFRAME
    ------------------------------------------------------------ */
    _onMessage(evt) {
      if (evt.source !== this._frame.contentWindow) return;

      const msg = evt.data;

      if (msg?.type === "bar_click") {
        this.dispatchEvent(new CustomEvent("onSelect", {
          detail: { label: msg.label }
        }));
      }
    }

    /* ------------------------------------------------------------
       RENDER — Build the full HTML renderer inside iframe
    ------------------------------------------------------------ */
    _render() {

      const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">

<style>
  html, body {
      width:100%;
      height:100%;
      margin:0;
      padding:0;
      overflow:hidden;
      font-family:Arial;
  }

  #svg {
      position:absolute;
      top:0;
      left:0;
      width:100%;
      height:100%;
  }

  #tooltip {
      position:absolute;
      background:rgba(0,0,0,0.75);
      color:white;
      padding:6px 10px;
      border-radius:4px;
      font-size:12px;
      pointer-events:none;
      display:none;
      z-index:10;
      max-width:300px;
      line-height:1.4em;
  }
</style>

</head>
<body>

<div id="tooltip"></div>
<svg id="svg"></svg>

<script>

let DATA = null;

/* Receive data from SAC */
window.addEventListener("message", evt => {
    if (evt.data?.type === "update") {
        DATA = evt.data.payload;
        draw();
    }
});

const svg = document.getElementById("svg");
const tip = document.getElementById("tooltip");

/* ============================================================
   MAIN DRAW FUNCTION
============================================================ */
function draw() {
    if (!DATA) return;

    const W = svg.clientWidth  || 800;
    const H = svg.clientHeight || 600;

    svg.innerHTML = "";

    const margin = {
        top: 60,
        right: 60,
        bottom: 140,
        left: 180
    };

    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;

    /* Build dataset */
    const ds = DATA.project.map((p, i) => ({
        name: p,
        cat: DATA.category[i],
        abate: DATA.abatement[i],
        mac: DATA.mac[i],
        cum: DATA.cumulative[i],
        npv: DATA.npv[i],
        capex: DATA.capex[i],
        opex: DATA.opex[i]
    }));

    /* Sort by MAC */
    ds.sort((a, b) => a.mac - b.mac);

    /* Compute cumulative abatement */
    let cum = 0;
    ds.forEach(d => {
        d.x0 = cum;
        cum += d.abate;
        d.x1 = cum;
    });

    if (cum <= 0) return;

    const x = v => margin.left + (v / cum) * innerW;

    /* MAC color bins (kept from your original renderer) */
    function macColor(v) {
        if (v <= -1000) return "#238b45";
        if (v <= -500)  return "#74c476";
        if (v < 0)      return "#bae4b3";
        if (v <= 500)   return "#fee391";
        if (v <= 1500)  return "#fdae6b";
        if (v <= 3000)  return "#fd8d3c";
        return "#e31a1c";
    }

    /* C1: Hybrid shape-first-then-scale (your chosen option) */
    const SHAPE = 0.7;
    const SCALE = 1.25;

    ds.forEach(d => {
       d.macShaped = d.mac;
    });

    let shaped = ds.map(d => d.macShaped);
    
let max = Math.max(...ds.map(d => d.mac));
let min = Math.min(...ds.map(d => d.mac));

const PAD = (max - min) * 0.15; // 15% padding

max += PAD;
min -= PAD;

const y = v =>
    margin.top + (1 - (v - min) / (max - min)) * innerH;


    const y0 = y(0);

    /* Zero line */
    const zero = document.createElementNS(svg.namespaceURI, "line");
    zero.setAttribute("x1", margin.left);
    zero.setAttribute("x2", W - margin.right);
    zero.setAttribute("y1", y0);
    zero.setAttribute("y2", y0);
    zero.setAttribute("stroke", "#0044aa");
    zero.setAttribute("stroke-dasharray", "4,4");
    zero.setAttribute("stroke-width", "1.5");
    svg.appendChild(zero);

    /* Target line */
    const TARGET = 60000;
    if (TARGET < cum) {
        const tx = x(TARGET);
        const tl = document.createElementNS(svg.namespaceURI, "line");
        tl.setAttribute("x1", tx);
        tl.setAttribute("x2", tx);
        tl.setAttribute("y1", margin.top);
        tl.setAttribute("y2", H - margin.bottom);
        tl.setAttribute("stroke", "black");
        tl.setAttribute("stroke-dasharray", "6,6");
        tl.setAttribute("stroke-width", "2");
        svg.appendChild(tl);

        const lbl = document.createElementNS(svg.namespaceURI, "text");
        lbl.textContent = "Target: 60,000 tCO₂e";
        lbl.setAttribute("x", tx + 5);
        lbl.setAttribute("y", margin.top - 12);
        lbl.setAttribute("font-size", "12");
        svg.appendChild(lbl);
    }

    /* Draw bars */
    ds.forEach(d => {
        const rect = document.createElementNS(svg.namespaceURI, "rect");

        const bw = Math.max(10, x(d.abate) - x(0));

        rect.setAttribute("x", x(d.x0));
        rect.setAttribute("width", bw);
        rect.setAttribute("y", d.macShaped >= 0 ? y(d.macShaped) : y0);
        rect.setAttribute("height", Math.abs(y(d.macShaped) - y0));
        rect.setAttribute("fill", macColor(d.mac));
        rect.setAttribute("stroke", "#333");
        rect.setAttribute("stroke-width", "1.2");

        rect.style.cursor = "pointer";

        /* Tooltip */
        rect.addEventListener("mouseover", evt => {
            tip.style.display = "block";
            tip.innerHTML =
                "<b>" + d.name + "</b><br>" +
                "Category: " + d.cat + "<br>" +
                "MAC: " + d.mac + "<br>" +
                "Abatement: " + d.abate + "<br>" +
                "Cumulative: " + d.cum + "<br>" +
                "NPV: " + d.npv + "<br>" +
                "Capex: " + d.capex + "<br>" +
                "Opex: " + d.opex;
        });
        rect.addEventListener("mousemove", evt => {
            tip.style.left = evt.pageX + 10 + "px";
            tip.style.top  = evt.pageY - 20 + "px";
        });
        rect.addEventListener("mouseout", () => {
            tip.style.display = "none";
        });

        rect.addEventListener("click", () => {
            parent.postMessage({ type:"bar_click", label:d.name }, "*");
        });

        svg.appendChild(rect);
    });

    /* Axis labels */
    const xlab = document.createElementNS(svg.namespaceURI, "text");
    xlab.textContent = "Total Abatement (tCO₂e)";
    xlab.setAttribute("x", W/2);
    xlab.setAttribute("y", H - 50);
    xlab.setAttribute("text-anchor", "middle");
    xlab.setAttribute("font-size", "16");
    svg.appendChild(xlab);

    const ylab = document.createElementNS(svg.namespaceURI, "text");
    ylab.textContent = "MAC (EUR/tCO₂e)";
    ylab.setAttribute("transform", "rotate(-90)");
    ylab.setAttribute("x", -H/2);
    ylab.setAttribute("y", 70);
    ylab.setAttribute("text-anchor", "middle");
    ylab.setAttribute("font-size", "16");
    svg.appendChild(ylab);
}

/* Redraw on resize */
window.addEventListener("resize", draw);

</script>
</body>
</html>
`;

      /* Load iframe via Blob */
      const blob = new Blob([html], { type:"text/html" });
      const url  = URL.createObjectURL(blob);

      this._frame.src = url;

      this._frame.onload = () => {
        this._frame.contentWindow.postMessage({
          type:"update",
          payload:this._data
        }, "*");
      };
    }

  }

  customElements.define("variable-width-macc", VariableWidthMACC);

})();
