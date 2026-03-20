import { state } from "../state.js";
import { applyTransform, clampTransform } from "../utils/math.js";

export function initBoxZoom() {
  const svg = state.svg;
  let startX = null;
  let rect = null;

  svg.addEventListener("mousedown", e => {
    // only left-click
    if (e.button !== 0) return;

    startX = e.offsetX;

    // Create selection rectangle
    rect = document.createElementNS(svg.namespaceURI, "rect");
    rect.setAttribute("id", "zoom-rect");
    rect.setAttribute("y", state.layout.margin.top);
    rect.setAttribute("height", state.layout.innerH);
    rect.setAttribute("fill", "rgba(0,0,0,0.15)");
    rect.setAttribute("stroke", "rgba(0,0,0,0.4)");
    rect.setAttribute("stroke-dasharray", "4 2");

    svg.appendChild(rect);
  });

  svg.addEventListener("mouseup", e => {
  if (startX === null || !rect) return;

  const endX = e.offsetX;

  const x1 = Math.min(startX, endX);
  const x2 = Math.max(startX, endX);

  rect.remove();
  rect = null;

  if (Math.abs(x2 - x1) < 20) {
    startX = null;
    return;
  }

  // Convert screen → world correctly
  const leftWorld = screenToWorld(x1);
  const rightWorld = screenToWorld(x2);

  // width selected in world-space
  const selectedWidth = rightWorld - leftWorld;

  // world width of full bar area
  const totalWorldWidth = state.scales.totalAbate;

  // compute scale factor
  const newScale = (state.layout.innerW / (selectedWidth * (state.layout.innerW / totalWorldWidth)));

  state.scale = Math.min(5, Math.max(0.3, newScale));

  // compute translateX so leftWorld aligns with margin.left
  state.translateX =
    state.layout.margin.left - (leftWorld - state.layout.margin.left) * state.scale;

  clampTransform();
  applyTransform();

  startX = null;
});
}
// Helper to transform screen coordinate back to world coordinate

function screenToWorld(screenX) {
  const { margin } = state.layout;
  return margin.left + ((screenX - state.translateX - margin.left) / state.scale);
}
