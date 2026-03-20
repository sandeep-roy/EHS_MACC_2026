import { state } from "../state.js";

export function drawLabels() {
  const svg = state.svg;

  const { margin, innerW, innerH, H } = state.layout;

  // X axis label
  const xlab = document.createElementNS(svg.namespaceURI, "text");
  xlab.textContent = "Total Abatement";
  xlab.setAttribute("x", margin.left + innerW / 2);
  xlab.setAttribute("y", margin.top + innerH + 55);
  xlab.setAttribute("text-anchor", "middle");
  xlab.setAttribute("font-size", "18");
  svg.querySelector("#xAxisLabelLayer").appendChild(xlab);

  // Y axis label
  const ylab = document.createElementNS(svg.namespaceURI, "text");
  ylab.textContent = "MAC (EUR/tCO₂e)";
  ylab.setAttribute("transform", "rotate(-90)");
  ylab.setAttribute("x", -H / 2);
  ylab.setAttribute("y", 60);
  ylab.setAttribute("text-anchor", "middle");
  ylab.setAttribute("font-size", "18");
  svg.querySelector("#yAxisLayer").appendChild(ylab);
}
