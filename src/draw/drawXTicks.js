import { state } from "../state.js";
import { formatShortNumber } from "../utils/format.js";

export function drawXTicks() {
  const svg = state.svg;
  const axis = svg.querySelector("#axisLayer");
  const layerText = svg.querySelector("#xTickTextLayer");

  axis.querySelectorAll(".xtick").forEach(e => e.remove());
  layerText.querySelectorAll(".xtickText").forEach(e => e.remove());

  const { margin, innerH, innerW } = state.layout;
  const { x, y0, totalAbate } = state.scales;

  const worldToScreenX = xLocal =>
    margin.left + ((xLocal - margin.left) * state.scale) + state.translateX;

  for (let i = 0; i <= 6; i++) {
    const v = (i / 6) * totalAbate;
    const xLocal = x(v);
    const xScreen = worldToScreenX(xLocal);

    // tick line (scaled)
    const tick = document.createElementNS(svg.namespaceURI, "line");
    tick.classList.add("xtick");
    tick.setAttribute("x1", xLocal);
    tick.setAttribute("x2", xLocal);
    tick.setAttribute("y1", y0);
    tick.setAttribute("y2", y0 + 8);
    tick.setAttribute("stroke", "#444");
    axis.appendChild(tick);

    // label (unscaled)
    const label = document.createElementNS(svg.namespaceURI, "text");
    label.classList.add("xtickText");
    label.textContent = formatShortNumber(v);
    label.setAttribute("x", xScreen);
    label.setAttribute("y", margin.top + innerH + 30);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", "14");
    layerText.appendChild(label);
  }
}
