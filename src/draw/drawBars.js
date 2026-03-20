import { state } from "../state.js";
import { macColor } from "../utils/colors.js";

export function drawBars() {
  const svg = state.svg;
  const layer = svg.querySelector("#barLayer");

  const rows = state.rows;
  const { x, y, y0 } = state.scales;
  const { scale, translateX } = state;

  const { margin } = state.layout;
  const scaleX = (state.layout.innerW / state.scales.totalAbate);

  rows.forEach(d => {
    const width = Math.max(4, (d.x1 - d.x0) * scaleX);

    const bar = document.createElementNS(svg.namespaceURI, "rect");
    bar.setAttribute("x", x(d.x0));
    bar.setAttribute("width", width);
    bar.setAttribute("y", d.mac >= 0 ? y(d.mac) : y0);
    bar.setAttribute("height", Math.abs(y(d.mac) - y0));
    bar.setAttribute("fill", macColor(d.mac));
    bar.setAttribute("stroke", "#333");
    bar.setAttribute("stroke-width", "1.2");
    bar.style.cursor = "pointer";
    bar.__row = d;

    layer.appendChild(bar);
  });
}
