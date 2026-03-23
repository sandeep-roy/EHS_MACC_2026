// ======================================================================
// drawTooltip.js — Unified tooltip handler for bars + cumulative curve
// ======================================================================

import { state } from "../state.js";

export function initTooltip() {

  const svg = state.svg;
  const tip = state.tooltip;

  svg.addEventListener("mousemove", evt => {

    const el = document.elementFromPoint(evt.clientX, evt.clientY);

    // ---------- 1. CUMULATIVE CURVE MARKERS ----------
    if (el && el.tagName === "circle" && el.__row) {
      const d = el.__row;

      tip.style.display = "block";
      tip.style.left = evt.clientX + 12 + "px";
      tip.style.top = evt.clientY - 20 + "px";

      tip.innerHTML = `
        <b>${d.name}</b><br>
        <u>Cumulative Curve</u><br>
        Cumulative: ${d.cum.toLocaleString()} tCO₂e<br>
        MAC: ${d.mac}<br>
        Abatement: ${d.abate}
      `;
      return;   // stop here → prevent bar tooltip override
    }

    // ---------- 2. BAR TOOLTIP ----------
    if (el && el.tagName === "rect" && el.__row) {
      const d = el.__row;

      tip.style.display = "block";
      tip.style.left = evt.clientX + 12 + "px";
      tip.style.top = evt.clientY - 20 + "px";

      tip.innerHTML = `
        <b>${d.name}</b><br>
        <u>Abatement Bar</u><br>
        Category: ${d.cat}<br>
        MAC: ${d.mac}<br>
        Abatement: ${d.abate}<br>
        Cumulative: ${d.cum}<br>
        NPV: ${d.npv}<br>
        Capex: ${d.capex}<br>
        Opex: ${d.opex}
      `;
      return;
    }

    // ---------- 3. NOT OVER ANY INTERACTIVE ELEMENT ----------
    tip.style.display = "none";
  });
}
