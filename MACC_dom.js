/* VARIABLE WIDTH MACC — v1.8.0 (SAC-stable)
 * - HTML tooltip (no Plotly tooltip, CSS hidden)
 * - Variable-width bars (width ∝ Total Abatement, with min px width)
 * - Uses Plotly.react on updates + onCustomWidgetResize
 * - Loads Plotly from SAP-hosted ZIP first (/plotly-2.27.0.min.js), CDN as fallback
 * - SAC lifecycle-compliant per Dev Guide
 */
(function () {
  // ---------- Template (shadow DOM) ----------
  const template = document.createElement("template");
  template.innerHTML = `
    <style>
      :host { display: block; width: 100%; height: 100%; }
      #macc-root { position: relative; width: 100%; height: 100%; overflow: hidden; pointer-events: auto; }
      #macc-plot { position: absolute; inset: 0; width: 100%; height: 100%; }
      /* Suppress Plotly UI/hoverlayer: we render our HTML tooltip */
      #macc-plot .hoverlayer { display: none !important; }
      #macc-plot .modebar { display: none !important; }

      /* HTML tooltip */
      #macc-tip {
        position: absolute; max-width: 360px;
        background: #fff; color: #111; border: 1px solid rgba(0,0,0,.18);
        border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,.18);
        padding: 10px 12px; font: 12px/1.35 "Segoe UI", Arial, sans-serif;
        pointer-events: none; z-index: 9999; opacity: 0; white-space: normal;
        transform: translate(-50%, -110%); transition: opacity 80ms ease-out;
      }
      #macc-tip.show { opacity: .98; }
      #macc-tip .ttl { font-weight: 600; margin-bottom: 6px; }
      #macc-tip .row { display: flex; align-items: baseline; gap: 6px; margin: 2px 0; }
      #macc-tip .k { color: #555; min-width: 145px; }
      #macc-tip .v { color: #111; }

      /* Legend (top-right) */
      #macc-legend {
        position: absolute; top: 12px; right: 10px;
        background: rgba(255,255,255,.96); border: 1px solid rgba(0,0,0,.12);
        border-radius: 6px; padding: 8px 10px; box-shadow: 0 4px 14px rgba(0,0,0,.12);
        font: 12px/1.35 "Segoe UI", Arial, sans-serif; color: #222; z-index: 20; pointer-events: none; max-width: 220px;
      }
      #macc-legend .title { font-weight: 600; margin-bottom: 6px; }
      #macc-legend .item { display: flex; align-items: center; gap: 8px; margin: 2px 0; }
      #macc-legend .swatch { width: 14px; height: 14px; border-radius: 3px; border: 1px solid rgba(0,0,0,.25); flex: 0 0 14px; }
      #macc-legend .label { white-space: nowrap; color: #222; }
    </style>
    <div id="macc-root">
      <div id="macc-plot"></div>
      <div id="macc-tip"></div>
      <div id="macc-legend"></div>
    </div>
  `;

  // ---------- Helpers ----------
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const dimSlot = (row, idx) => row?.[`dimension_${idx}`] ?? null;
  const meas = (row, id) => {
    const v = row?.[`${id}_0`];
    return (typeof v === "object" && v !== null) ? v.raw : v;
  };
  function macColorFactory(th) {
    const { neg2, neg1, pos1, pos2 } = th;
    return (v) => {
      if (v <= neg2) return "#2ECC71"; // deep green
      if (v <= neg1) return "#ABEBC6"; // light green
      if (v <= pos1) return "#F7DC6F"; // yellow
      if (v <= pos2) return "#F5B041"; // orange
      return "#E74C3C";               // red
    };
  }
  function ensurePlotly() {
    if (window.Plotly?.newPlot) return Promise.resolve();
    if (window.__maccPlotlyLoading) return window.__maccPlotlyLoading;
    // Prefer SAP-hosted file from ZIP; fallback to CDN only if needed
    window.__maccPlotlyLoading = new Promise((resolve, reject) => {
      const tryLoad = (src, onErr) => {
        const s = document.createElement("script");
        s.src = src; s.async = true; s.onload = () => resolve(); s.onerror = onErr; document.head.appendChild(s);
      };
      tryLoad("/plotly-2.27.0.min.js", () => {
        tryLoad("https://cdn.plot.ly/plotly-2.27.0.min.js", () => reject(new Error("Plotly load failed")));
      });
    });
    return window.__maccPlotlyLoading;
  }

  class VariableWidthMACC extends HTMLElement {
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: "open" });
      this._shadow.appendChild(template.content.cloneNode(true));

      // Refs
      this._root = this._shadow.querySelector("#macc-root");
      this._plotDiv = this._shadow.querySelector("#macc-plot");
      this._tip = this._shadow.querySelector("#macc-tip");
      this._legend = this._shadow.querySelector("#macc-legend");

      // State
      this._initialized = false;
      this._graph = null;
      this._props = {};
      this._data = { project: [], abatement: [], mac: [], extra: [] };
      this._style = {
        fontSize: 12,
        minBarPx: 6,
        macThresh: { neg2: -500, neg1: 0, pos1: 300, pos2: 1000 },
        showLegend: true,
        legendTitle: "MAC Color Legend"
      };
      this._macColor = macColorFactory(this._style.macThresh);
      this._onMoveHandler = null;
      this._onLeaveHandler = null;

      // Fallback resize observer (SAC calls onCustomWidgetResize anyway)
      this._ro = new ResizeObserver(() => this._render(true));

      ensurePlotly().then(() => {
        this._initialized = true;
        if (this.isConnected) this._ro.observe(this._root);
        this._renderLegend();
        this._render(false);
      });
    }

    // ---------- SAC lifecycle (per Dev Guide) ----------
    connectedCallback() {
      if (this._initialized) this._ro.observe(this._root);
    }
    disconnectedCallback() {
      try { this._ro.disconnect(); } catch {}
      this._unbindHoverHandlers();
      this._tipHide();
      try { if (this._graph) window.Plotly?.purge?.(this._plotDiv); } catch {}
      this._graph = null;
    }
    onCustomWidgetResize(width, height) {
      if (this._graph) {
        try { window.Plotly.Plots.resize(this._graph); } catch {}
      }
    }
    onCustomWidgetBeforeUpdate(props) { this._apply(props); }
    onCustomWidgetAfterUpdate(props) { this._apply(props); }

    // ---------- Props & Data Binding ----------
    getDataBindings() {
      return {
        maccBinding: {
          feeds: [
            { id: "dimension", type: "dimension" },
            { id: "dimension_cat", type: "dimension" },
            { id: "measure_abate", type: "mainStructureMember" },
            { id: "measure_mac", type: "mainStructureMember" },
            { id: "measure_cum", type: "mainStructureMember" },
            { id: "measure_npv", type: "mainStructureMember" },
            { id: "measure_capex", type: "mainStructureMember" },
            { id: "measure_opex", type: "mainStructureMember" }
          ]
        }
      };
    }
    _apply(props) {
      if (!props) return;
      this._props = { ...this._props, ...props };

      if ("maccBinding" in props) this._ingest(props.maccBinding);

      if (props.fontSize != null) this._style.fontSize = Number(props.fontSize) || 12;
      if (props.minBarPx != null) this._style.minBarPx = Math.max(1, Number(props.minBarPx));
      if (props.showLegend != null) this._style.showLegend = !!props.showLegend;
      if (props.legendTitle != null) this._style.legendTitle = String(props.legendTitle);

      const thresholdsChanged =
        props.macNeg2 != null || props.macNeg1 != null || props.macPos1 != null || props.macPos2 != null;

      if (thresholdsChanged) {
        this._style.macThresh = {
          neg2: props.macNeg2 ?? this._style.macThresh.neg2,
          neg1: props.macNeg1 ?? this._style.macThresh.neg1,
          pos1: props.macPos1 ?? this._style.macThresh.pos1,
          pos2: props.macPos2 ?? this._style.macThresh.pos2
        };
        this._macColor = macColorFactory(this._style.macThresh);
        this._renderLegend();
      }
      this._render(false);
    }
    _ingest(binding) {
      try {
        const rows = binding?.data ?? [];
        if (!rows.length) {
          this._plotDiv.innerHTML = "No data";
          return;
        }
        const proj = [], ab = [], mc = [], ex = [];
        for (const r of rows) {
          const d0 = dimSlot(r, 0);
          const dCat = dimSlot(r, 1);
          const key = d0?.uniqueName ?? d0?.id ?? d0?.label ?? "";
          const label = d0?.label ?? d0?.id ?? String(key);
          proj.push({ label, key });
          ab.push(Number(meas(r, "measure_abate")) || 0);
          mc.push(Number(meas(r, "measure_mac")) || 0);
          ex.push({
            cumulative: meas(r, "measure_cum"),
            npv: meas(r, "measure_npv"),
            capex: meas(r, "measure_capex"),
            opex: meas(r, "measure_opex"),
            category: dCat?.label ?? dCat?.id
          });
        }
        this._data = { project: proj, abatement: ab, mac: mc, extra: ex };
      } catch (e) {
        console.error("MACC ingest error:", e);
      }
    }

    // ---------- Legend ----------
    _formatN(n) { return (Number(n)).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
    _renderLegend() {
      if (!this._legend) return;
      if (!this._style.showLegend) { this._legend.style.display = "none"; return; }
      const th = this._style.macThresh;
      const buckets = [
        { color: "#2ECC71", label: `MAC ≤ ${this._formatN(th.neg2)}` },
        { color: "#ABEBC6", label: `${this._formatN(th.neg2)} to ${this._formatN(th.neg1)}` },
        { color: "#F7DC6F", label: `${this._formatN(th.neg1)} to ${this._formatN(th.pos1)}` },
        { color: "#F5B041", label: `${this._formatN(th.pos1)} to ${this._formatN(th.pos2)}` },
        { color: "#E74C3C", label: `> ${this._formatN(th.pos2)}` }
      ];
      this._legend.innerHTML = [
        `<div class="title">${this._style.legendTitle}</div>`,
        ...buckets.map(b => `
          <div class="item">
            <span class="swatch" style="background:${b.color}"></span>
            <span class="label">${b.label}</span>
          </div>
        `)
      ].join("");
      this._legend.style.display = "block";
    }

    // ---------- Tooltip ----------
    _tipHtml(row) {
      const e = row.extra ?? {};
      const fmt = (v, d = 0) => (Number.isFinite(+v) ? (+v).toLocaleString(undefined, { maximumFractionDigits: d }) : "–");
      return `
        <div class="ttl">${row.Project?.label ?? ""}</div>
        <div class="row"><div class="k">Project ID:</div><div class="v">${row.Project?.key ?? "–"}</div></div>
        ${e.category ? `<div class="row"><div class="k">Category:</div><div class="v">${e.category}</div></div>` : ""}
        <div class="row"><div class="k">MAC:</div><div class="v">${fmt(row.MAC,2)} EUR/tCO₂e</div></div>
        <div class="row"><div class="k">Total abatement:</div><div class="v">${fmt(row.Abate)} tCO₂e</div></div>
        <div class="row"><div class="k">Cumulative abatement:</div><div class="v">${fmt(e.cumulative)} tCO₂e</div></div>
        <div class="row"><div class="k">NPV cost:</div><div class="v">${fmt(e.npv)} EUR</div></div>
        <div class="row"><div class="k">Capex:</div><div class="v">${fmt(e.capex)} EUR</div></div>
        <div class="row"><div class="k">Opex:</div><div class="v">${fmt(e.opex)} EUR/yr</div></div>
      `;
    }
    _tipMove(clientX, clientY) {
      const rect = this._root.getBoundingClientRect();
      this._tip.style.left = `${clientX - rect.left}px`;
      this._tip.style.top = `${clientY - rect.top}px`;
    }
    _tipHide() { this._tip.classList.remove("show"); }

    _unbindHoverHandlers() {
      try {
        this._plotDiv?.removeEventListener("mousemove", this._onMoveHandler);
        this._plotDiv?.removeEventListener("mouseleave", this._onLeaveHandler);
      } catch {}
      this._onMoveHandler = this._onLeaveHandler = null;
      try {
        this._graph?.removeAllListeners?.("plotly_hover");
        this._graph?.removeAllListeners?.("plotly_unhover");
        this._graph?.removeAllListeners?.("plotly_click");
        this._graph?.removeAllListeners?.("plotly_relayout");
        this._graph?.removeAllListeners?.("plotly_redraw");
        this._graph?.removeAllListeners?.("plotly_doubleclick");
      } catch {}
    }
    _bindHoverHandlers(gd, rows) {
      this._unbindHoverHandlers();

      gd.on("plotly_hover", (ev) => {
        const p = ev?.points?.[0];
        if (!p) return;
        const row = rows[p.pointIndex];
        if (!row) return;
        this._tip.innerHTML = this._tipHtml(row);
        this._tip.classList.add("show");
        if (ev.event?.clientX != null && ev.event?.clientY != null) {
          this._tipMove(ev.event.clientX, ev.event.clientY);
        }
      });
      gd.on("plotly_unhover", () => this._tipHide());

      // Move tooltip with mouse
      this._onMoveHandler = (e) => { if (this._tip.classList.contains("show")) this._tipMove(e.clientX, e.clientY); };
      this._onLeaveHandler = () => this._tipHide();
      this._plotDiv.addEventListener("mousemove", this._onMoveHandler, { passive: true });
      this._plotDiv.addEventListener("mouseleave", this._onLeaveHandler, { passive: true });

      // Click → dispatch onSelect event
      gd.on("plotly_click", (ev) => {
        const p = ev?.points?.[0];
        if (!p) return;
        const row = rows[p.pointIndex];
        if (!row) return;
        this.dispatchEvent(new CustomEvent("onSelect", {
          detail: {
            projectKey: row.Project?.key,
            projectLabel: row.Project?.label,
            mac: row.MAC,
            abatement: row.Abate,
            category: row.extra?.category
          },
          bubbles: true
        }));
      });

      // Keep handlers on relayout/redraw
      gd.on("plotly_relayout", () => { this._tipHide(); this._bindHoverHandlers(gd, rows); });
      gd.on("plotly_redraw", () => { this._bindHoverHandlers(gd, rows); });
      gd.on("plotly_doubleclick", () => { this._tipHide(); this._bindHoverHandlers(gd, rows); });
    }

    // ---------- Render ----------
    _render(isResize) {
      if (!this._initialized) return;
      const P = this._data.project, A = this._data.abatement, M = this._data.mac;
      if (!P.length) { this._plotDiv.innerHTML = "No data"; return; }

      // Build & sort rows by MAC asc
      let rows = P.map((p, i) => ({ Project: p, Abate: A[i], MAC: M[i], extra: this._data.extra[i] }))
                  .sort((a, b) => a.MAC - b.MAC);

      // Determine minimum bar width in DOM units to guarantee visibility
      const totalAb = rows.reduce((s, r) => s + (Number(r.Abate) || 0), 0);
      const pxToDom = totalAb / Math.max(1, this._plotDiv.clientWidth || this._root.clientWidth || 1);
      const minDom = this._style.minBarPx * pxToDom;

      // Expand each width to at least minDom and accumulate x-midpoints
      let accum = 0;
      rows = rows.map(r => {
        const shown = Math.max(Number(r.Abate) || 0, minDom);
        const xs = accum, xe = accum + shown; accum = xe;
        return { ...r, AbateShown: shown, x_mid: (xs + xe) / 2 };
      });

      const x = rows.map(r => r.x_mid);
      const y = rows.map(r => r.MAC);
      const w = rows.map(r => r.AbateShown);
      const col = rows.map(r => this._macColor(r.MAC));

      const trace = {
        type: "bar",
        x, y, width: w,
        marker: { color: col, line: { color: "rgba(0,0,0,0.9)", width: 1.2 } },
        hoverinfo: "none" // our HTML tooltip handles hover
      };

      const yAbsMax = Math.max(1, ...y.map(v => Math.abs(v)));
      const yPad = Math.max(5, yAbsMax * 0.05);
      const layout = {
        margin: { t: 50, l: 80, r: 40, b: 60 },
        hovermode: "closest",
        xaxis: { title: "Total Abatement (tCO₂e)", zeroline: false },
        yaxis: {
          title: "MAC (EUR/tCO₂e)",
          zeroline: true, zerolinecolor: "#000", zerolinewidth: 2,
          range: [-(yAbsMax + yPad), (yAbsMax + yPad)]
        }
      };
      const config = { responsive: true, displayModeBar: false, displaylogo: false };

      const doBind = (gd) => {
        this._graph = gd;
        this._bindHoverHandlers(gd, rows);
        setTimeout(() => { try { window.Plotly.Plots.resize(gd); } catch {} }, 60);
      };

      if (this._graph) {
        window.Plotly.react(this._plotDiv, [trace], layout, config).then(doBind).catch(err => {
          console.error("Plotly.react error:", err);
        });
      } else {
        window.Plotly.newPlot(this._plotDiv, [trace], layout, config).then(doBind).catch(err => {
          console.error("Plotly.newPlot error:", err);
          this._plotDiv.innerHTML = "Plot error";
        });
      }
    }
  }

  if (!customElements.get("variable-width-macc")) {
    customElements.define("variable-width-macc", VariableWidthMACC);
  }
})();
