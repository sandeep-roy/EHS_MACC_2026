(function () {
  const template = document.createElement("template");
  template.innerHTML = `
    <style>
      .group { margin: 10px 0; font-family: var(--sapFontFamily, Arial); }
      label { font-size: 13px; display:block; margin-bottom:4px; }
      input, select {
        width: 95%;
        padding: 4px;
        font-size: 13px;
        border: 1px solid #ccc;
        border-radius: 2px;
      }
    </style>

    <div class="group">
      <label>Width Cap (% of total)</label>
      <input id="widthCap" type="number" min="1" max="50"/>
    </div>

    <div class="group">
      <label>Minimum Width (% of total)</label>
      <input id="minWidth" type="number" min="0.1" max="5" step="0.1"/>
    </div>

    <div class="group">
      <label>X Padding (%)</label>
      <input id="xPadding" type="number" min="0" max="20" />
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

    onCustomWidgetBeforeUpdate(changedProps) {}

    onCustomWidgetAfterUpdate(changedProps) {
      // load current values into inputs
      this._shadow.getElementById("widthCap").value = changedProps.widthCap ?? 10;
      this._shadow.getElementById("minWidth").value = changedProps.minWidth ?? 0.2;
      this._shadow.getElementById("xPadding").value = changedProps.xPadding ?? 5;
      this._shadow.getElementById("fontSize").value = changedProps.fontSize ?? 12;
      this._shadow.getElementById("colorMode").value = changedProps.colorMode ?? "gradient";

      this._addListeners();
    }

    _addListeners() {
      const fire = (name, value) =>
        this.dispatchEvent(new CustomEvent("propertiesChanged", {
          detail: { properties: { [name]: value } }
        }));

      this._shadow.getElementById("widthCap").onchange = (e) =>
        fire("widthCap", Number(e.target.value));

      this._shadow.getElementById("minWidth").onchange = (e) =>
        fire("minWidth", Number(e.target.value));

      this._shadow.getElementById("xPadding").onchange = (e) =>
        fire("xPadding", Number(e.target.value));

      this._shadow.getElementById("fontSize").onchange = (e) =>
        fire("fontSize", Number(e.target.value));

      this._shadow.getElementById("colorMode").onchange = (e) =>
        fire("colorMode", e.target.value);
    }
  }

  customElements.define("variable-width-macc-styling", VariableWidthMACCStyling);
})();