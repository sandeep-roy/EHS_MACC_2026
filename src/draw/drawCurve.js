// ======================================================================
// drawCurve.js — Cumulative Abatement Curve (Domain-Based)
// ======================================================================

import { state } from "../state.js";

export function drawCurve() {
  const svg = state.svg;
  const layer = svg.querySelector("#curveLayer");
  layer.innerHTML = "";

  const { x } = state.scales;
  const { margin, innerH } = state.layout;

  // Build cumulative abatement array
  let cum = 0;
  const pts = [];
  for (const d of state.rows) {
    cum += d.abate;
    pts.push({ x: x(cum), y: margin.top + innerH * 0.05 }); // small visual offset
  }

  if (pts.length < 2) return;

  // Build SVG path
  let dStr = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    dStr += ` L ${pts[i].x},${pts[i].y}`;
  }

  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", dStr);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#0066cc");
  path.setAttribute("stroke-width", "2");

  layer.appendChild(path);
}
