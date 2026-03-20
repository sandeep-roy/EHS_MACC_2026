// ======================================================================
// drawTooltip.js — Tooltip hover logic for MACC chart
// ======================================================================
// Works with:
//   ✔ domain-based zoom (no transforms)
//   ✔ accurate hit-testing over rectangles
//   ✔ screen-space tooltip positioning
//   ✔ SAC IFRAME embed (clientX/Y safe)
// ======================================================================

import { state } from "../state.js";

export function initTooltip() {

  const svg = state.svg;
  const tip = state.tooltip;

  // Hide tooltip initially
  tip.style.display = "none";

  svg.addEventListener("mousemove", evt => {

    // Determine which bar (if any) is under the pointer
    const bar = getBarUnderPointer(evt);
    if (!bar) {
      tip.style.display = "none";
      return;
    }

    const d = bar.__row;
    if (!d) {
      tip.style.display = "none";
      return;
    }

    // -------------------------------------------------------------
    // Position tooltip using screen (client) coordinates
    // SAC-safe and unaffected by zoom/pan
    // -------------------------------------------------------------
    tip.style.display = "block";
    tip.style.left = evt.clientX + 12 + "px";
    tip.style.top = evt.clientY - 20 + "px";

    // Tooltip content
    tip.innerHTML = `
      <b>${d.name}</b><br>
      Category: ${d.cat}<br>
      MAC: ${d.mac}<br>
      Abatement: ${d.abate}<br>
      Cumulative: ${d.cum}<br>
      NPV: ${d.npv}<br>
      Capex: ${d.capex}<br>
      Opex: ${d.opex}
    `;
  });
}

// ======================================================================
// Helper: Determine which bar is under the mouse
// ======================================================================
function getBarUnderPointer(evt) {
  // elementFromPoint uses screen coordinates → returns topmost element
  const el = document.elementFromPoint(evt.clientX, evt.clientY);

  // Bars are <rect> with __row attached in drawBars.js
  if (el && el.tagName === "rect" && el.__row) {
    return el;
  }

  return null;
}
