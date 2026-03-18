(function () {

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

    getDataBindings() {
      return {
        maccBinding: {
          feeds: [
            { id:"dimension",     type:"dimension" },
            { id:"dimension_cat", type:"dimension" },
            { id:"measure_abate", type:"mainStructureMember" },
            { id:"measure_mac",   type:"mainStructureMember" },
            { id:"measure_cum",   type:"mainStructureMember" },
            { id:"measure_npv",   type:"mainStructureMember" },
            { id:"measure_capex", type:"mainStructureMember" },
            { id:"measure_opex",  type:"mainStructureMember" }
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

    onCustomWidgetBeforeUpdate(p){ if(p.maccBinding) this._ingest(p.maccBinding); }
    onCustomWidgetAfterUpdate(p){ if(p.maccBinding) this._ingest(p.maccBinding); }

    _ingest(binding) {
      const rows = binding.data || [];
      const P=[], CAT=[], A=[], M=[], CUM=[], NPV=[], CAP=[], OPX=[];

      for (const r of rows) {
        P.push(r.dimension_0?.label ?? r.dimension_0?.id ?? "");
        CAT.push(r.dimension_cat_0?.label ?? "");
        A.push(r.measure_abate_0?.raw ?? 0);
        M.push(r.measure_mac_0?.raw ?? 0);
        CUM.push(r.measure_cum_0?.raw ?? 0);
        NPV.push(r.measure_npv_0?.raw ?? 0);
        CAP.push(r.measure_capex_0?.raw ?? 0);
        OPX.push(r.measure_opex_0?.raw ?? 0);
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

    _onMessage(evt) {
      if (evt.source !== this._frame.contentWindow) return;

      if (evt.data?.type === "bar_click") {
        this.dispatchEvent(new CustomEvent("onSelect", {
          detail: { label: evt.data.label }
        }));
      }
    }

    _render() {

      /* CHANGE THIS TO YOUR GITHUB PAGES URL */
      this._frame.src = "https://sandeep-roy.github.io/EHS_MACC_2026/iframe.html";

      const sendData = () => {
        this._frame.contentWindow.postMessage({
          type: "update",
          payload: this._data
        }, "*");
      };

      this._frame.onload = () => setTimeout(sendData, 50);
    }

  }

  customElements.define("variable-width-macc", VariableWidthMACC);

})();
