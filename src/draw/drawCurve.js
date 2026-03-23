// ======================================================================
// drawCurve.js — cumulative abatement curve (right Y axis)
// ======================================================================

import { state } from "../state.js";

export function drawCurve() {
  const svg = state.svg;
  const layer = svg.querySelector("#curveLayer");
  layer.innerHTML = "";

  const { x, yCum } = state.scales;
  const rows = state.rows;
  if (!rows || rows.length === 0) return;

  let dStr = "";

  for (let i = 0; i < rows.length; i++) {
    const d = rows[i];

    const px = x(d.cum);
    const py = yCum(d.cum);

    if (i === 0) dStr += `M ${px},${py}`;
    else dStr += ` L ${px},${py}`;
  }

  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", dStr);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#0066cc");
  path.setAttribute("stroke-width", "2.5");

  layer.appendChild(path);
}
