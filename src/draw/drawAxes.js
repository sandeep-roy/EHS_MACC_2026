import { state } from "../state.js";

export function drawAxes() {
  const svg = state.svg;

  const yAxisLayer = svg.querySelector("#yAxisLayer");
  const axisLayer = svg.querySelector("#axisLayer");

  const { margin, innerW } = state.layout;
  const { y, y0, minMAC, maxMAC } = state.scales;

  // Zero line
  const zeroLine = document.createElementNS(svg.namespaceURI, "line");
  zeroLine.setAttribute("x1", margin.left);
  zeroLine.setAttribute("x2", margin.left + innerW);
  zeroLine.setAttribute("y1", y0);
  zeroLine.setAttribute("y2", y0);
  zeroLine.setAttribute("stroke", "#0044aa");
  zeroLine.setAttribute("stroke-width", "1.5");
  axisLayer.appendChild(zeroLine);

  // Y-axis ticks + labels
  for (let i = 0; i <= 6; i++) {
    let v = minMAC + (i / 6) * (maxMAC - minMAC);
    let ypos = y(v);

    const tick = document.createElementNS(svg.namespaceURI, "line");
    tick.setAttribute("x1", margin.left - 6);
    tick.setAttribute("x2", margin.left);
    tick.setAttribute("y1", ypos);
    tick.setAttribute("y2", ypos);
    tick.setAttribute("stroke", "#444");
    yAxisLayer.appendChild(tick);

    const label = document.createElementNS(svg.namespaceURI, "text");
    label.setAttribute("x", margin.left - 10);
    label.setAttribute("y", ypos + 4);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("font-size", "14");
    label.textContent = Math.round(v).toLocaleString();
    yAxisLayer.appendChild(label);
  }
}
