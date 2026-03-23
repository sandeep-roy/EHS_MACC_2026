// ======================================================================
// drawCurve.js — cumulative curve, markers, tooltip
// ======================================================================

import { state } from "../state.js";

export function drawCurve() {
  const svg = state.svg;
  const layer = svg.querySelector("#curveLayer");
  layer.innerHTML = "";

  const tip = state.tooltip;
  const rows = state.rows;
  const { x, yCum } = state.scales;

  if (!rows || rows.length === 0) return;

  // ---- Build line path ----
  let dStr = "";
  rows.forEach((r, i) => {
    const px = x(r.cum);
    const py = yCum(r.cum);
    dStr += (i === 0 ? `M` : ` L`) + ` ${px},${py}`;
  });

  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", dStr);
  path.setAttribute("stroke", "#0066cc");
  path.setAttribute("stroke-width", "2.5");
  path.setAttribute("fill", "none");
  layer.appendChild(path);

  // ---- Add marker circles ----
  rows.forEach(r => {
    const dot = document.createElementNS(svg.namespaceURI, "circle");
    dot.setAttribute("cx", x(r.cum));
    dot.setAttribute("cy", yCum(r.cum));
    dot.setAttribute("r", 4);
    dot.setAttribute("fill", "#0066cc");
    dot.__row = r;
    layer.appendChild(dot);
  });
}
