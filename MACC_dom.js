(function () {

  // ============================================================================
  //  VARIABLE WIDTH MACC — v1.7.7 (HTML Tooltip, SAP best-practice)
  //  - HTML tooltip panel (no Plotly native tooltip; no SAC overlay conflicts)
  //  - Stable render (deferred draw + debounced resize) for responsive containers
  //  - Extended fields in tooltip: Category, CumAbate, NPV, Capex, Opex
  //  - LA-safe: no errors if LA is disabled; optional enable later
  // ============================================================================

  // ---------------- Build Shadow DOM template ----------------
  const template = document.createElement("template");
  (function buildTemplate() {
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      :host { display:block; width:100%; height:100%; }

      #macc-root {
        position: relative;        /* anchor for HTML tooltip */
        width: 100%;
        height: 100%;
        overflow: hidden;
        pointer-events: auto !important;
        z-index: 5;
      }

      /* Dedicated Plotly target */
      #macc-plot {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      /* HTML tooltip panel (SAP safe pattern) */
      #macc-tip {
        position: absolute;
        max-width: 360px;
        background: #ffffff;
        color: #111;
        border: 1px solid rgba(0,0,0,0.15);
        border-radius: 6px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.18);
        padding: 10px 12px;
        font: 12px/1.35 "Segoe UI", Arial, sans-serif;
        pointer-events: none;      /* do not capture pointer */
        z-index: 9999;
        opacity: 0;
        transform: translate(-50%,-110%); /* above cursor by default */
        transition: opacity 80ms ease-out;
        white-space: normal;
      }
      #macc-tip.show { opacity: 0.98; }

      #macc-tip .ttl {
        font-weight: 600;
        margin-bottom: 6px;
      }
      #macc-tip .row {
        display: flex;
        align-items: baseline;
        gap: 6px;
      }
      #macc-tip .k { color:#555; min-width: 145px; }
      #macc-tip .v { color:#111; }
      #macc-tip .sep { height:6px; }

      /* Be explicit: our subtree owns pointer events */
      #macc-root, #macc-root * { pointer-events:auto !important; }
    `;

    const root = document.createElement("div");
    root.id = "macc-root";

    const plot = document.createElement("div");
    plot.id = "macc-plot";

    const tip  = document.createElement("div");
    tip.id = "macc-tip";

    root.appendChild(plot);
    root.appendChild(tip);

    template.content.appendChild(styleEl);
    template.content.appendChild(root);
  })();

  // ---------- Helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const macColor = (v) => {
    if (v < 0) return "rgba(39,174,96,0.95)";
    if (v < 25) return "rgba(241,196,15,0.95)";
    if (v < 50) return "rgba(230,126,34,0.95)";
    return "rgba(231,76,60,0.95)";
  };

  const dimSlot = (r, idx) => r?.[`dimension_${idx}`] || null;
  const meas    = (r, id) => {
    const v = r?.[`${id}_0`];
    return (typeof v === "object" && v !== null ? v.raw : v);
  };

  function detectDimTechId(binding, rows) {
    try {
      const md = binding?.metadata?.dimensions;
      if (md?.dimension_0?.id) return String(md.dimension_0.id);
      if (Array.isArray(md) && md[0]?.id) return String(md[0].id);
    } catch (_) {}
    try {
      const d0 = rows?.[0]?.dimension_0 || rows?.[0];
      if (d0?.dimensionId) return d0.dimensionId;
      if (d0?.id)         return d0.id;
    } catch (_) {}
    return "Project_ID"; // final fallback for your model
  }

  // Load Plotly
  function ensurePlotly() {
    if (window.Plotly?.newPlot) return Promise.resolve();
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

      // Shadow DOM
      this._shadow = this.attachShadow({ mode: "open" });
      this._shadow.appendChild(template.content.cloneNode(true));

      // Refs
      this._root      = this._shadow.querySelector("#macc-root");
      this._plotDiv   = this._shadow.querySelector("#macc-plot");
      this._tip       = this._shadow.querySelector("#macc-tip");

      // State
      this._initialized = false;
      this._plotted     = false;
      this._pendingDraw = false;

      this._props = {};
      this._data  = { project: [], abatement: [], mac: [], extra: [] };

      this._style = {
        widthCap: 10,     // %
        minWidth: 0.2,    // %
        xPadding: 5,      // % (currently unused in this layout)
        fontSize: 12
      };

      this._dimTechId = null;

      // Resize debounce
      this._resizeTimer = null;
      this._ro = new ResizeObserver(() => {
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => this._render(true), 100);
      });

      ensurePlotly().then(() => {
        this._initialized = true;
        if (this._root.isConnected) this._ro.observe(this._root);
        this._render();
      });
    }

    connectedCallback(){ if (this._initialized) this._ro.observe(this._root); }
    disconnectedCallback(){ try { this._ro.disconnect(); } catch(_){} }

    // ---------------- Data bindings ----------------
    getDataBindings(){
      return {
        maccBinding:{
          feeds:[
            { id:"dimension",       type:"dimension" },
            { id:"dimension_cat",   type:"dimension" },

            { id:"measure_abate",   type:"mainStructureMember" },
            { id:"measure_mac",     type:"mainStructureMember" },

            { id:"measure_cum",     type:"mainStructureMember" },
            { id:"measure_npv",     type:"mainStructureMember" },
            { id:"measure_capex",   type:"mainStructureMember" },
            { id:"measure_opex",    type:"mainStructureMember" }
          ]
        }
      };
    }

    onCustomWidgetBeforeUpdate(p){ this._apply(p); }
    onCustomWidgetAfterUpdate(p){  this._apply(p); }

    _apply(props) {
      if (!props) return;
      this._props = props;

      if ("maccBinding" in props) this._ingest(props.maccBinding);

      ["widthCap","minWidth","xPadding","fontSize"].forEach(k=>{
        if (k in props) this[k] = props[k];
      });
    }

    set widthCap(v){ this._style.widthCap = Number(v)||10; this._render(); }
    set minWidth(v){ this._style.minWidth = Number(v)||0.2; this._render(); }
    set xPadding(v){ this._style.xPadding = Number(v)||5; this._render(); }
    set fontSize(v){ this._style.fontSize = Number(v)||12; this._render(); }

    // ---------------- Ingest ----------------
    _ingest(binding){
      try{
        const rows = binding?.data || [];
        if (!Array.isArray(rows) || rows.length === 0) {
          this._plotDiv.innerHTML = "No data";
          this._plotted = false;
          return;
        }

        this._dimTechId = detectDimTechId(binding, rows);

        const proj=[], ab=[], mc=[], ex=[];

        for (const r of rows) {
          const d0   = dimSlot(r,0);  // Project ID dimension
          const dCat = dimSlot(r,1);  // Category (optional)

          const memberValue  = d0?.uniqueName || d0?.id || d0?.label;
          const projectLabel = d0?.label || d0?.id || String(memberValue);
          const key          = String(memberValue);

          const abVal = Number(meas(r,"measure_abate")) || 0;
          const macVal= Number(meas(r,"measure_mac"))   || 0;

          const cum   = meas(r,"measure_cum");
          const npv   = meas(r,"measure_npv");
          const capex = meas(r,"measure_capex");
          const opex  = meas(r,"measure_opex");
          const cat   = dCat?.label ?? dCat?.id;

          proj.push({ label:projectLabel, key });
          ab.push(abVal);
          mc.push(macVal);

          ex.push({ cumulative:cum, npv, capex, opex, category:cat });
        }

        this._data = { project:proj, abatement:ab, mac:mc, extra:ex };
        this._render();

      }catch(e){
        console.error("Ingest error:", e);
      }
    }

    // ---------------- Tooltip (HTML) ----------------
    _tipHtml(row) {
      const e = row.extra || {};
      const n = (v, d=0) => (Number.isFinite(v) ? (+v).toLocaleString(undefined, { maximumFractionDigits:d }) : "-");
      return `
        <div class="ttl">${row.Project?.label ?? ""}</div>
        <div class="row"><div class="k">Project ID:</div><div class="v">${row.Project?.key ?? ""}</div></div>
        ${e.category ? `<div class="row"><div class="k">Category:</div><div class="v">${e.category}</div></div>` : ""}
        <div class="row"><div class="k">MAC:</div><div class="v">${n(row.MAC,2)} EUR/tCO₂e</div></div>
        <div class="row"><div class="k">Total abatement:</div><div class="v">${n(row.Abate)} tCO₂e</div></div>
        ${Number.isFinite(e.cumulative) ? `<div class="row"><div class="k">Cumulative abatement:</div><div class="v">${n(e.cumulative)} tCO₂e</div></div>`:""}
        ${Number.isFinite(e.npv)        ? `<div class="row"><div class="k">NPV cost:</div><div class="v">${n(e.npv)} EUR</div></div>`:""}
        ${Number.isFinite(e.capex)      ? `<div class="row"><div class="k">Capex:</div><div class="v">${n(e.capex)} EUR</div></div>`:""}
        ${Number.isFinite(e.opex)       ? `<div class="row"><div class="k">Opex:</div><div class="v">${n(e.opex)} EUR/yr</div></div>`:""}
      `;
    }
    _tipShow(html, clientX, clientY) {
      const rect = this._root.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      this._tip.innerHTML = html;
      this._tip.style.left = `${x}px`;
      this._tip.style.top  = `${y}px`;
      this._tip.classList.add("show");
    }
    _tipHide(){ this._tip.classList.remove("show"); }

    // ---------------- Render ----------------
    _render(isResize=false){
      if (!this._initialized) return;

      // Avoid drawing too early while SAC is still calculating layout
      const w = this._root.clientWidth, h = this._root.clientHeight;
      if (w < 120 || h < 120) { this._pendingDraw = true; return; }

      const P=this._data.project,
            A=this._data.abatement,
            M=this._data.mac;

      if(!P.length){ this._plotDiv.innerHTML = "No data"; this._plotted=false; return; }

      // Build rows & sort
      let rows = P.map((p,i)=>({ Project:p, Abate:A[i], MAC:M[i], extra:this._data.extra[i] }));
      rows.sort((a,b)=>a.MAC-b.MAC);

      const total = rows.reduce((s,r)=>s+r.Abate,0);
      const capPct = clamp(this._style.widthCap,1,50)/100;
      const minPct = clamp(this._style.minWidth,0.05,5)/100;
      const capLim = total*capPct;
      const minLim = total*minPct;

      rows = rows.map(r=>({...r, AbateShown: clamp(r.Abate, minLim, capLim)}));

      const pxToDom = total / Math.max(1, this._plotDiv.clientWidth || this._root.clientWidth);
      rows = rows.map(r=>({...r, AbateShown: Math.max(r.AbateShown, 20*pxToDom)}));

      let c=0;
      rows = rows.map(r=>{ const xs=c, xe=c+r.AbateShown; c=xe; return {...r, x_mid:(xs+xe)/2}; });

      const x = rows.map(r=>r.x_mid);
      const y = rows.map(r=>r.MAC);
      const wBars = rows.map(r=>r.AbateShown);
      const colors = rows.map(r=>macColor(r.MAC));

      // BAR TRACE — no Plotly tooltip, we own hover via HTML panel
      const barTrace = {
        type: "bar",
        x, y, width: wBars,
        hoverinfo: "none",             // IMPORTANT: disable Plotly tooltip
        marker: { color: colors, line: { color: "rgba(0,0,0,0.9)", width: 1.5 } },
        // Keep customdata for LA / future needs
        customdata: rows.map(r => ([
          r.Project.label,     // 0
          r.Project.key,       // 1 (LA key)
          r.Abate,             // 2
          r.MAC,               // 3
          r.extra?.cumulative, // 4
          r.extra?.npv,        // 5
          r.extra?.capex,      // 6
          r.extra?.opex,       // 7
          r.extra?.category    // 8
        ]))
      };

      const layout = {
        margin:{t:50,l:80,r:40,b:60},

        // IMPORTANT: We keep Plotly hover engine ON to get plotly_hover events,
        // but we've disabled its tooltip via hoverinfo:"none" above.
        hovermode:"closest",

        xaxis:{ title: "Total Abatement (tCO₂e)" },
        yaxis:{ title: "MAC (EUR/tCO₂e)" }
      };

      // Defer the draw slightly so SAC finished layout
      setTimeout(() => {
        Plotly.newPlot(this._plotDiv, [barTrace], layout, {responsive:true})
          .then(gd => {
            this._plotted = true;

            // one more resize to ensure correct sampling after first paint
            setTimeout(() => { try{ Plotly.Plots.resize(gd); }catch(_){ } }, 90);

            // ---- HTML tooltip (SAP-safe) ----
            gd.on("plotly_hover", (ev) => {
              const p = ev?.points?.[0];
              if (!p) return;
              const idx = p.pointIndex;
              const row = rows[idx];
              if (!row) return;
              this._tipShow(this._tipHtml(row), ev.event.clientX, ev.event.clientY);
            });
            gd.on("plotly_unhover", () => this._tipHide());

            // OPTIONAL: Linked Analysis (kept safe; disabled unless enabled downstream)
            gd.on("plotly_click", (ev) => {
              const p = ev?.points?.[0]; if (!p) return;
              const key = p.customdata?.[1]; if (!key) return;

              // Uncomment if you want LA back later — remains safe if LA object doesn't exist.
              /*
              try {
                const la = this._props?.maccBinding?.getLinkedAnalysis?.()
                        || this.dataBindings?.getDataBinding?.()?.getLinkedAnalysis?.();
                if (!la?.isDataPointSelectionEnabled?.()) return;

                // Try plain first
                try { la.setFilters([{ [this._dimTechId]: key }]); }
                catch(e1){
                  // Unique name fallback for live BW/HANA
                  const val = (String(key).startsWith("[")
                               ? key
                               : `[${this._dimTechId}].[${this._dimTechId}].&[${key}]`);
                  la.setFilters([{ [this._dimTechId]: val }]);
                }
              } catch(e) { console.warn("[LA] skipped:", e); }
              */
            });

          })
          .catch(e => {
            console.error("Plot error:", e);
            this._plotDiv.innerHTML = "Plot error";
            this._plotted = false;
          });
      }, isResize ? 40 : 90);
    }

  }

  if (!customElements.get("variable-width-macc"))
    customElements.define("variable-width-macc", VariableWidthMACC);

})();
