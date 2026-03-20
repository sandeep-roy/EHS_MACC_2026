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

  svg.addEventListener("mousemove", e => {
    if (startX === null || !rect) return;

    const x1 = Math.min(startX, e.offsetX);
    const x2 = Math.max(startX, e.offsetX);

    rect.setAttribute("x", x1);
    rect.setAttribute("width", Math.abs(x2 - x1));
  });

  svg.addEventListener("mouseup", e => {
    if (startX === null || !rect) return;

    const endX = e.offsetX;

    const x1 = Math.min(startX, endX);
    const x2 = Math.max(startX, endX);

    // Clean up selection rectangle
    rect.remove();
    rect = null;

    const minSelect = x1;
    const maxSelect = x2;

    if (Math.abs(maxSelect - minSelect) < 20) {
      // too small → treat as click
      startX = null;
      return;
    }

    // ----- Convert screen coords to "world" coords -----
    const { margin } = state.layout;
    const left = screenToWorld(minSelect, margin.left);
    const right = screenToWorld(maxSelect, margin.left);

    // compute new scale
    const visibleWidth = right - left;
    const total = state.scales.totalAbate;
    const newScale = state.layout.innerW / ((visibleWidth / total) * state.layout.innerW);

    // update global state
    state.scale = newScale;

    // adjust translateX so left edge aligns with view
    state.translateX = margin.left - (left - margin.left) * newScale;

    clampTransform();
    applyTransform();

    startX = null;
  });
}

// Helper to transform screen coordinate back to world coordinate
function screenToWorld(screenX, marginLeft) {
  return marginLeft + (screenX - marginLeft - state.translateX) / state.scale;
}
