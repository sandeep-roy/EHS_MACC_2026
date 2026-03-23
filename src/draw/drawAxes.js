// ======================================================================
// drawAxes.js — Left axis (MAC) + Right axis (CUMULATIVE)
// ======================================================================

import { state } from "../state.js";

export function drawAxes() {
  const svg = state.svg;

  const yAxisLeft = svg.querySelector("#yAxisLayer");
  const axisLayer = svg.querySelector("#axisLayer");
  const xAxisLabelLayer = svg.querySelector("#xAxisLabelLayer");

  yAxisLeft.innerHTML = "";
  axisLayer.innerHTML = "";
  xAxisLabelLayer.innerHTML = "";

  const { x, y, y0, minMAC, maxMAC, yCum, maxCUM } = state.scales;
  const { margin, innerW, innerH, W, H } = state.layout;

  // ------------------ LEFT AXIS (MAC) -------------------
  for (let i = 0; i <= 6; i++) {
    const macVal = minMAC + (i / 6) * (maxMAC - minMAC);
    const ypos = y(macVal);

    const tick = document.createElementNS(svg.namespaceURI, "line");
    tick.setAttribute("x1", margin.left - 6);
    tick.setAttribute("x2", margin.left);
    tick.setAttribute("y1", ypos);
    tick.setAttribute("y2", ypos);
    tick.setAttribute("stroke", "#444");
    yAxisLeft.appendChild(tick);

    const label = document.createElementNS(svg.namespaceURI, "text");
    label.textContent = Math.round(macVal).toLocaleString();
    label.setAttribute("x", margin.left - 10);
    label.setAttribute("y", ypos + 4);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("font-size", "13");
    yAxisLeft.appendChild(label);
  }

  // ------------------ RIGHT AXIS (CUMULATIVE) -------------------
  for (let i = 0; i <= 6; i++) {
    const cumVal = (i / 6) * maxCUM;
    const ypos = yCum(cumVal);

    const tick = document.createElementNS(svg.namespaceURI, "line");
    tick.setAttribute("x1", margin.left + innerW);
    tick.setAttribute("x2", margin.left + innerW + 6);
    tick.setAttribute("y1", ypos);
    tick.setAttribute("y2", ypos);
    tick.setAttribute("stroke", "#444");
    yAxisLeft.appendChild(tick);

    const label = document.createElementNS(svg.namespaceURI, "text");
    label.textContent = Math.round(cumVal).toLocaleString();
    label.setAttribute("x", margin.left + innerW + 10);
    label.setAttribute("y", ypos + 4);
    label.setAttribute("text-anchor", "start");
    label.setAttribute("font-size", "13");
    yAxisLeft.appendChild(label);
  }

  // ------------------ ZERO LINE (MAC=0) -------------------
  const zeroLine = document.createElementNS(svg.namespaceURI, "line");
  zeroLine.setAttribute("x1", margin.left);
  zeroLine.setAttribute("x2", margin.left + innerW);
  zeroLine.setAttribute("y1", y0);
  zeroLine.setAttribute("y2", y0);
  zeroLine.setAttribute("stroke", "#0044aa");
  zeroLine.setAttribute("stroke-width", "1.4");
  axisLayer.appendChild(zeroLine);

  // ------------------ AXIS LABELS -------------------
  // X-axis label
  const xlab = document.createElementNS(svg.namespaceURI, "text");
  xlab.textContent = "Total Abatement (tCO₂e)";
  xlab.setAttribute("x", margin.left + innerW / 2);
  xlab.setAttribute("y", margin.top + innerH + 55);
  xlab.setAttribute("text-anchor", "middle");
  xlab.setAttribute("font-size", "18");
  xAxisLabelLayer.appendChild(xlab);

  // Left Y-axis label (MAC)
  const ylabLeft = document.createElementNS(svg.namespaceURI, "text");
  ylabLeft.textContent = "MAC (EUR/tCO₂e)";
  ylabLeft.setAttribute("transform", "rotate(-90)");
  ylabLeft.setAttribute("x", -H / 2);
  ylabLeft.setAttribute("y", margin.left - 60);
  ylabLeft.setAttribute("text-anchor", "middle");
  ylabLeft.setAttribute("font-size", "18");
  yAxisLeft.appendChild(ylabLeft);

  // Right Y-axis label (Cumulative)
  const ylabRight = document.createElementNS(svg.namespaceURI, "text");
  ylabRight.textContent = "Cumulative Abatement (tCO₂e)";
  ylabRight.setAttribute("transform", "rotate(-90)");
  ylabRight.setAttribute("x", -H / 2);
  ylabRight.setAttribute("y", margin.left + innerW + 60);
  ylabRight.setAttribute("text-anchor", "middle");
  ylabRight.setAttribute("font-size", "18");
  yAxisLeft.appendChild(ylabRight);
}
