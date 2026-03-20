import { state } from "../state.js";

export function drawGrid() {
  const svg = state.svg;
  const grid = svg.querySelector("#gridLayer");

  const { margin, innerW, innerH } = state.layout;
  const { x, y, minMAC, maxMAC, totalAbate } = state.scales;

  // Horizontal gridlines (MAC)
  for (let i = 0; i <= 6; i++) {
    let v = minMAC + (i / 6) * (maxMAC - minMAC);
    let ypos = y(v);

    const line = document.createElementNS(svg.namespaceURI, "line");
    line.setAttribute("x1", margin.left);
    line.setAttribute("x2", margin.left + innerW);
    line.setAttribute("y1", ypos);
    line.setAttribute("y2", ypos);
    line.setAttribute("stroke", "#ddd");
    grid.appendChild(line);
  }

  // Vertical gridlines (Abatement)
  for (let i = 0; i <= 6; i++) {
    let v = (i / 6) * totalAbate;
    let xpos = x(v);

    const line = document.createElementNS(svg.namespaceURI, "line");
    line.setAttribute("x1", xpos);
    line.setAttribute("x2", xpos);
    line.setAttribute("y1", margin.top);
    line.setAttribute("y2", margin.top + innerH);
    line.setAttribute("stroke", "#eee");
    grid.appendChild(line);
  }
}
