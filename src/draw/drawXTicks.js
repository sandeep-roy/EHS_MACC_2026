// ======================================================================
// drawXTicks.js — Draws unscaled X-axis tick labels
// ======================================================================

import { state } from "../state.js";
import { formatShortNumber } from "../utils/format.js";

export function drawXTicks() {
  const svg = state.svg;
  const layer = svg.querySelector("#xTickTextLayer");
  layer.innerHTML = "";

  const { x, domainLeft, domainRight } = state.scales;
  const { margin, innerH } = state.layout;

  for (let i = 0; i <= 6; i++) {
    const v = domainLeft + (i / 6) * (domainRight - domainLeft);
    const xpos = x(v);

    const label = document.createElementNS(svg.namespaceURI, "text");
    label.textContent = formatShortNumber(v);
    label.setAttribute("x", xpos);
    label.setAttribute("y", margin.top + innerH + 30);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", "14");

    layer.appendChild(label);
  }
}
