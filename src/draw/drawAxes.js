// ======================================================================
// drawAxes.js — Draws Y-axis ticks, labels, and MAC=0 line
// ======================================================================

import { state } from "../state.js";

export function drawAxes() {
  const svg = state.svg;

  // Clear existing
  const yAxis = svg.querySelector("#yAxisLayer");
  const axisLayer = svg.querySelector("#axisLayer");
  const xAxisLabelLayer = svg.querySelector("#xAxisLabelLayer");

  yAxis.innerHTML = "";
  axisLayer.innerHTML = "";
  xAxisLabelLayer.innerHTML = "";

  const { x, y, y0, minMAC, maxMAC } = state.scales;
  const { margin, innerW, innerH, H } = state.layout;

  // ---------------------------------------------------------------
  // 1. Zero line (MAC = 0)
  // ---------------------------------------------------------------
  const zeroLine = document.createElementNS(svg.namespaceURI, "line");
  zeroLine.setAttribute("x1", margin.left);
  zeroLine.setAttribute("x2", margin.left + innerW);
  zeroLine.setAttribute("y1", y0);
  zeroLine.setAttribute("y2", y0);
  zeroLine.setAttribute("stroke", "#0044aa");
  zeroLine.setAttribute("stroke-width", "1.5");
  axisLayer.appendChild(zeroLine);

  // ---------------------------------------------------------------
  // 2. Y-axis tick marks + labels
  // ---------------------------------------------------------------
  for (let i = 0; i <= 6; i++) {
    const v = minMAC + (i / 6) * (maxMAC - minMAC);
    const ypos = y(v);

    // Tick
    const tick = document.createElementNS(svg.namespaceURI, "line");
    tick.setAttribute("x1", margin.left - 6);
    tick.setAttribute("x2", margin.left);
    tick.setAttribute("y1", ypos);
    tick.setAttribute("y2", ypos);
    tick.setAttribute("stroke", "#444");
    yAxis.appendChild(tick);

    // Label
    const label = document.createElementNS(svg.namespaceURI, "text");
    label.textContent = Math.round(v).toLocaleString();
    label.setAttribute("x", margin.left - 10);
    label.setAttribute("y", ypos + 4);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("font-size", "14");

    yAxis.appendChild(label);
  }

  // ---------------------------------------------------------------
  // 3. X-axis label (static)
  // ---------------------------------------------------------------
  const xlab = document.createElementNS(svg.namespaceURI, "text");
  xlab.textContent = "Total Abatement";
  xlab.setAttribute("x", margin.left + innerW / 2);
  xlab.setAttribute("y", margin.top + innerH + 55);
  xlab.setAttribute("text-anchor", "middle");
  xlab.setAttribute("font-size", "18");
  xAxisLabelLayer.appendChild(xlab);

  // ---------------------------------------------------------------
  // 4. Y-axis label (vertical)
  // ---------------------------------------------------------------
  const ylab = document.createElementNS(svg.namespaceURI, "text");
  ylab.textContent = "MAC (EUR/tCO₂e)";
  ylab.setAttribute("transform", "rotate(-90)");
  ylab.setAttribute("x", -H / 2);
  ylab.setAttribute("y", margin.left - 60);
  ylab.setAttribute("text-anchor", "middle");
  ylab.setAttribute("font-size", "18");
  yAxis.appendChild(ylab);
}
