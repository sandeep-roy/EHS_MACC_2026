(function () {

  const template = document.createElement("template");
  template.innerHTML = `
    <style>
      .group { margin: 10px 0; font-family: var(--sapFontFamily, Arial, sans-serif); }
      label { font-size: 13px; display:block; margin-bottom:4px; }
      input, select {
        width: 95%;
        padding: 4px;
        font-size: 13px;
        border: 1px solid #ccc;
        border-radius: 2px;
        background: #fff;
      }
    </style>

    <div class="group">
      <label>Width Cap (% of total)</label>
      <input id="widthCap" type="number" min="1" max="50"/>
    </div>

    <div class="group">
      <label>Minimum Width (% of total)</label>
      <input id="minWidth" type="number" min="0.05" max="5" step="0.05"/>
    </div>

    <div class="group">
      <label>X Padding (% of total, each side)</label>
      <input id="xPadding" type="number" min="0" max="20"/>
    </div>

    <div class="group">
      <label>Font Size (px)</label>
      <input id="fontSize" type="number" min="8" max="24"/>
    </div>

    <div class="group">
      <label>Color Mode</label>
      <select id="colorMode">
        <option value="gradient">Green + Gradient (default)</option>
        <option value="single">Single Color</option>
      </select>
    </div>
  `;

  class VariableWidthMACCStyling extends HTMLElement {
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: "open" });
      this._shadow.appendChild(template.content.cloneNode(true));
    }

    onCustomWidgetAfterUpdate(props) {
      this._shadow.getElementById("widthCap").value  = props.widthCap  ?? 10;
      this._shadow.getElementById("minWidth").value  = props.minWidth  ?? 0.2;
      this._shadow.getElementById("xPadding").value  = props.xPadding  ?? 5;
      this._shadow.getElementById("fontSize").value  = props.fontSize  ?? 12;
      this._shadow.getElementById("colorMode").value = props.colorMode ?? "gradient";
      this._wire();
    }

    _wire() {
      const fire = (n,v) =>
        this.dispatchEvent(new CustomEvent("propertiesChanged", {
          detail:{ properties:{ [n]:v } }
        }));

      this._shadow.getElementById("widthCap").onchange  = (e)=>fire("widthCap", Number(e.target.value));
      this._shadow.getElementById("minWidth").onchange  = (e)=>fire("minWidth", Number(e.target.value));
      this._shadow.getElementById("xPadding").onchange  = (e)=>fire("xPadding", Number(e.target.value));
      this._shadow.getElementById("fontSize").onchange  = (e)=>fire("fontSize", Number(e.target.value));
      this._shadow.getElementById("colorMode").onchange = (e)=>fire("colorMode", e.target.value);
    }
  }

  customElements.define("variable-width-macc-styling", VariableWidthMACCStyling);

})();
