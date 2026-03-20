// ======================================================================
// drawBars.js — Draws MACC bars using domain-based X scaling
// ======================================================================
// This version DOES NOT use CSS transforms.
// Bars are redrawn on every render based on the current domain.
// ======================================================================

import { state } from "../state.js";
import { macColor } from "../utils/colors.js";

export function drawBars() {

  const svg = state.svg;
  const barLayer = svg.querySelector("#barLayer");

  // Clear existing bars
  barLayer.innerHTML = "";

  const { x, y, y0 } = state.scales;
  const margin = state.layout.margin;

  for (const d of state.rows) {

    // ------------------------------------------------------------------
    // Compute bar width and position using domain-based x-scale
    // ------------------------------------------------------------------
    let xLeft = x(d.x0);
    let xRight = x(d.x1);

    if (!isFinite(xLeft) || !isFinite(xRight)) continue;

    let width = xRight - xLeft;
    if (width < 1) width = 1;  // keep bar visible when deeply zoomed

    const bar = document.createElementNS(svg.namespaceURI, "rect");
    bar.setAttribute("x", xLeft);
    bar.setAttribute("width", width);

    const yTop = d.mac >= 0 ? y(d.mac) : y0;
    const h = Math.abs(y(d.mac) - y0);

    bar.setAttribute("y", yTop);
    bar.setAttribute("height", h);

    // Color
    bar.setAttribute("fill", macColor(d.mac));

    // Remove stroke to prevent black gaps after zoom
    bar.setAttribute("stroke", "none");

    // Store reference for tooltip / selection
    bar.__row = d;

    barLayer.appendChild(bar);
  }
}
