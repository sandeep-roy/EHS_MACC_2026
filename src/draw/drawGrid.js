// ======================================================================
// drawGrid.js — Draws MACC chart grid lines using domain-based x-scale
// ======================================================================

import { state } from "../state.js";

export function drawGrid() {
  const svg = state.svg;
  const layer = svg.querySelector("#gridLayer");
  layer.innerHTML = "";

  const { x, y, minMAC, maxMAC, domainLeft, domainRight } = state.scales;
  const { margin, innerW, innerH } = state.layout;

  // ---------------------------------------------------------------
  // 1. Horizontal gridlines (MAC axis)
  // ---------------------------------------------------------------
  for (let i = 0; i <= 6; i++) {
    const macValue = minMAC + (i / 6) * (maxMAC - minMAC);
    const ypos = y(macValue);

    const line = document.createElementNS(svg.namespaceURI, "line");
    line.setAttribute("x1", margin.left);
    line.setAttribute("x2", margin.left + innerW);
    line.setAttribute("y1", ypos);
    line.setAttribute("y2", ypos);
    line.setAttribute("stroke", "#ddd");

    layer.appendChild(line);
  }

  // ---------------------------------------------------------------
  // 2. Vertical gridlines (Total abatement axis)
  // ---------------------------------------------------------------
  for (let i = 0; i <= 6; i++) {
    const v = domainLeft + (i / 6) * (domainRight - domainLeft);
    const xpos = x(v);

    const line = document.createElementNS(svg.namespaceURI, "line");
    line.setAttribute("x1", xpos);
    line.setAttribute("x2", xpos);
    line.setAttribute("y1", margin.top);
    line.setAttribute("y2", margin.top + innerH);
    line.setAttribute("stroke", "#eee");

    layer.appendChild(line);
  }
}
