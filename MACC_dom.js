(function () {

  // ---------------- Build Shadow DOM template ----------------
  const template = document.createElement("template");
  (function buildTemplate() {
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      :host { display:block; width:100%; height:100%; }

      #macc-container {
        width:100%;
        height:100%;
        position:relative;
        pointer-events:auto !important;
        z-index: 5;
      }

      #macc-container, #macc-container * { pointer-events:auto !important; }
      #macc-container .hoverlayer,
      #macc-container .layer-above,
      #macc-container .draglayer {
        pointer-events:auto !important;
      }

      #macc-container .modebar {
        right:6px !important;
        left:auto !important;
        top:6px !important;
      }
    `;

    const root = document.createElement("div");
    root.id = "macc-container";

    template.content.appendChild(styleEl);
    template.content.appendChild(root);
  })();

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const macColor = (v) => {
    if (v < 0) return "rgba(39,174,96,0.95)";
    if (v < 25) return "rgba(241,196,15,0.95)";
    if (v < 50) return "rgba(230,126,34,0.95)";
    return "rgba(231,76,60,0.95)";
  };

  const LT = "<", GT = ">";
  const BR = LT + "br" + GT;
  const EXTRA = LT + "extra" + GT + LT + "/extra" + GT;

  // Load Plotly
  function ensurePlotly() {
    if (window.Plotly && window.Plotly.newPlot) return Promise.resolve();
    if (window.__maccPlotlyLoading) return window.__maccPlotlyLoading;

    window.__maccPlotlyLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.plot.ly/plotly-2.27.0.min.js";
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });

    return window.__maccPlotlyLoading;
  }

  class VariableWidthMACC extends HTMLElement {

    constructor() {
      super();

      this._shadow = this.attachShadow({ mode: "open" });
      this._shadow.appendChild(template.content.cloneNode(true));
      this._container = this._shadow.querySelector("#macc-container");

      this._initialized = false;
      this._plotted = false;
      this._graph = null;

      this._props = {};

      this._data = { project: [], abatement: [], mac: [] };

      this._style = {
        widthCap: 10,
        minWidth: 0.2,
        xPadding: 5,
        fontSize: 12
      };

      // FINAL — LA uses Project_name
      this._dimTechId = "Project_name";

      this._onResizeObs = this._onResizeObs.bind(this);
      this._ro = new (window.ResizeObserver || class { observe() {} disconnect() {} })(this._onResizeObs);

      ensurePlotly().then(() => {
        this._initialized = true;
        if (this._container.isConnected) this._ro.observe(this._container);
        this._render();
      });
    }

    connectedCallback() {
      if (this._initialized) this._ro.observe(this._container);
    }

    disconnectedCallback() {
      this._ro.disconnect();
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

    onCustomWidgetBeforeUpdate(p) { this._apply(p); }
    onCustomWidgetAfterUpdate(p) { this._apply(p); }

    _apply(props) {
      if (!props) return;

      this._props = props;  // needed for LA

      if ("maccBinding" in props) this._ingest(props.maccBinding);

      ["widthCap", "minWidth", "xPadding", "fontSize"].forEach(k => {
        if (k in props) this[k] = props[k];
      });
    }

    set widthCap(v) { this._style.widthCap = Number(v) || 10; this._render(); }
    set minWidth(v) { this._style.minWidth = Number(v) || 0.2; this._render(); }
    set xPadding(v) { this._style.xPadding = Number(v) || 5; this._render(); }
    set fontSize(v) { this._style.fontSize = Number(v) || 12; this._render(); }

    onCustomWidgetResize() {
      if (this._initialized && this._plotted) {
        Plotly.Plots.resize(this._graph);
      }
    }

    _onResizeObs() { this.onCustomWidgetResize(); }

    // ---------------- INGEST ------------------
    _ingest(binding) {
      try {
        const rows = binding?.data || [];
        if (!rows.length) return this._setEmpty("No data");

        const proj = [], ab = [], mc = [];

        for (const r of rows) {
          const d = r.dimension_0 || r;

          const projectName = d.Project_name; // FINAL — dimension
          const key = String(projectName);    // LA uses this exact value

          const av = r.measure_abate_0?.raw ?? r.measure_abate_0 ?? 0;
          const mv = r.measure_mac_0?.raw ?? r.measure_mac_0 ?? 0;

          proj.push({ label: projectName, key });
          ab.push(Number(av));
          mc.push(Number(mv));
        }

        this._data.project = proj;
        this._data.abatement = ab;
        this._data.mac = mc;

        this._render();
        
        console.log("DIM METADATA:", binding?.metadata);
        console.log("ROW SAMPLE:", rows[0]);


      } catch (e) {
        console.error("Ingest error:", e);
        this._setEmpty("Data error");
      }
    }

    // ---------------- RENDERING ------------------
    _setEmpty(msg) {
      this._container.innerHTML = "";
      const el = document.createElement("div");
      el.style = "font:12px Arial;color:#666;padding:8px;";
      el.textContent = msg;
      this._container.appendChild(el);
      this._plotted = false;
    }

    _render() {
      if (!this._initialized) return;

      const P = this._data.project,
        A = this._data.abatement,
        M = this._data.mac;

      if (!P.length) return this._setEmpty("No data");

      let rows = P.map((p, i) => ({
        Project: p,
        Abate: A[i],
        MAC: M[i]
      }));

      rows.sort((a, b) => a.MAC - b.MAC);

      const total = rows.reduce((s, r) => s + r.Abate, 0);
      if (total <= 0) return this._setEmpty("No abatement");

      const capPct = clamp(this._style.widthCap, 1, 50) / 100;
      const minPct = clamp(this._style.minWidth, 0.05, 5) / 100;
      const padPct = clamp(this._style.xPadding, 0, 20) / 100;

      const capLim = total * capPct;
      const minLim = total * minPct;

      rows = rows.map(r => ({
        ...r,
        AbateShown: clamp(r.Abate, minLim, capLim)
      }));

      const W = this._container.clientWidth || 1;
      const pxToDom = total / W;

      rows = rows.map(r => ({
        ...r,
        AbateShown: Math.max(r.AbateShown, 20 * pxToDom)
      }));

      let c = 0;
      rows = rows.map(r => {
        const xs = c;
        const xe = c + r.AbateShown;
        c = xe;
        return { ...r, x_mid: (xs + xe) / 2 };
      });

      const x = rows.map(r => r.x_mid);
      const y = rows.map(r => r.MAC);
      const w = rows.map(r => r.AbateShown);
      const colors = rows.map(r => macColor(r.MAC));

      const barTrace = {
        type: "bar",
        x, y, width: w,
        marker: { color: colors, line: { color: "rgba(0,0,0,0.9)", width: 1.5 }},
        customdata: rows.map(r => [r.Project.label, r.Abate, r.Project.key]),
        hovertemplate:
          "Project: %{customdata[0]}" + BR +
          "MAC: %{y:.2f} EUR/tCO₂e" + BR +
          "Abatement: %{customdata[1]:,.0f} tCO₂e" + EXTRA
      };

      const xRange = [-500, c + 500];
      const yMin = Math.min(...y, 0) * 1.25;
      const yMax = Math.max(...y, 0) * 1.25;

      const layout = {
        margin: { t: 50, l: 80, r: 40, b: 60 },
        hovermode: "closest",
        xaxis: { range: xRange, title: "Total Abatement (tCO₂e)" },
        yaxis: { range: [yMin, yMax], title: "MAC (EUR/tCO₂e)" }
      };

      Plotly.newPlot(this._container, [barTrace], layout, { responsive: true })
        .then(gd => {

          this._graph = gd;
          this._plotted = true;

          const selectedKeys = new Set();

          // ---------------- CLICK HANDLER -----------------
          gd.on("plotly_click", ev => {
            const p = ev?.points?.[0];
            if (!p) return;

            const key = p.customdata?.[2];
            if (!key) return;

            const multi = ev.event?.ctrlKey || ev.event?.metaKey || ev.event?.shiftKey;

            if (multi) {
              if (selectedKeys.has(key)) selectedKeys.delete(key);
              else selectedKeys.add(key);
            } else {
              selectedKeys.clear();
              selectedKeys.add(key);
            }

            Plotly.restyle(gd, {
              "marker.line.width": [rows.map(r => selectedKeys.has(r.Project.key) ? 3 : 1.5)],
              "marker.opacity": [rows.map(r => selectedKeys.size === 0 ? 1 : (selectedKeys.has(r.Project.key) ? 1 : 0.3))]
            });

            // ----------- LINKED ANALYSIS (FINAL) -----------
            try {
              const la = this._props?.maccBinding?.getLinkedAnalysis?.();
              if (!la) return;

              if (!la.isDataPointSelectionEnabled?.()) return;

              const sel = [...selectedKeys].map(k => ({
                Project_name: k
              }));

              console.log("LA Filters:", sel);
              la.setFilters(sel);
            } catch (e) {
              console.error("LA error:", e);
            }
          });

          // ---------------- DOUBLE CLICK: RESET -------------
          gd.on("plotly_doubleclick", () => {

            selectedKeys.clear();

            Plotly.restyle(gd, {
              "marker.line.width": [rows.map(() => 1.5)],
              "marker.opacity": [rows.map(() => 1)]
            });

            try {
              const la = this._props?.maccBinding?.getLinkedAnalysis?.();
              la?.removeFilters?.();
            } catch (_) {}
          });

        });
    }
  }

  if (!customElements.get("variable-width-macc"))
    customElements.define("variable-width-macc", VariableWidthMACC);

})();
