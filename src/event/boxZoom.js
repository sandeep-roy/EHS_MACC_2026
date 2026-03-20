import { state } from "../state.js";
import { applyTransform, clampTransform } from "../utils/math.js";

let boxMode = false;

export function initBoxZoom() {
  const svg = state.svg;
  const btn = document.getElementById("zoom-box");
  const overlay = svg.querySelector("#overlayLayer");

  let startX = null;
  let rect = null;

  btn.onclick = () => {
    boxMode = !boxMode;
    btn.style.background = boxMode ? "#d0e0ff" : "#fff";
    svg.style.cursor = boxMode ? "crosshair" : "default";
  };

  svg.addEventListener("mousedown", e => {
    if (!boxMode || e.button !== 0) return;

    startX = getSvgX(e, svg);

    rect = document.createElementNS(svg.namespaceURI, "rect");
    rect.setAttribute("y", state.layout.margin.top);
    rect.setAttribute("height", state.layout.innerH);
    rect.setAttribute("fill", "rgba(0, 120, 215, 0.25)");
    rect.setAttribute("stroke", "rgba(0, 120, 215, 0.9)");
    rect.setAttribute("stroke-width", "1.2");
    rect.setAttribute("stroke-dasharray", "4 2");
    rect.style.pointerEvents = "none";

    overlay.appendChild(rect);
  });

  svg.addEventListener("mousemove", e => {
    if (!boxMode || startX === null || !rect) return;

    const x = getSvgX(e, svg);

    const x1 = Math.min(startX, x);
    const x2 = Math.max(startX, x);

    rect.setAttribute("x", x1);
    rect.setAttribute("width", x2 - x1);
  });

  svg.addEventListener("mouseup", e => {
    if (!boxMode || startX === null || !rect) return;

    const endX = getSvgX(e, svg);

    const x1 = Math.min(startX, endX);
    const x2 = Math.max(startX, endX);

    rect.remove();
    rect = null;
    boxMode = false;
    btn.style.background = "#fff";

    if (Math.abs(x2 - x1) < 20) {
      startX = null;
      return;
    }

    const leftWorld = screenToWorld(x1);
    const rightWorld = screenToWorld(x2);

    const worldWidth = rightWorld - leftWorld;
    const totalAb = state.scales.totalAbate;
    const pxPerWorld = state.layout.innerW / totalAb;

    state.scale = state.layout.innerW / (worldWidth * pxPerWorld);
    state.translateX =
      state.layout.margin.left -
      (leftWorld - state.layout.margin.left) * state.scale;

    clampTransform();
    applyTransform();

    startX = null;
  });
}

function getSvgX(evt, svg) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse()).x;
}

function screenToWorld(screenX) {
  const { margin } = state.layout;
  return margin.left + ((screenX - state.translateX - margin.left) / state.scale);
}
