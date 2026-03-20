// ======================================================================
// pan.js — FINAL STABLE VERSION (safe, no recursion, no freeze)
// ======================================================================

import { state } from "../state.js";
import { render } from "../main.js";

export function initPan() {
  const svg = state.svg;

  let isDragging = false;
  let lastX = null;

  svg.addEventListener("mousedown", evt => {
    if (evt.button !== 0) return;

    // Disable panning during rectangular zoom mode
    const zoomBtn = document.getElementById("zoom-box");
    const boxMode = zoomBtn && zoomBtn.style.background === "rgb(208, 224, 255)";
    if (boxMode) return;

    isDragging = true;
    lastX = getSvgX(evt, svg);
    svg.style.cursor = "grabbing";
  });

  svg.addEventListener("mousemove", evt => {
    if (!isDragging) return;

    const curX = getSvgX(evt, svg);
    const dx = curX - lastX;
    lastX = curX;

    let { domainLeft, domainRight, totalAbate } = state.scales;
    const { innerW } = state.layout;

    const range = domainRight - domainLeft;
    if (range <= 0) return;

    const moveWorld = (dx / innerW) * range;

    let newLeft = domainLeft - moveWorld;
    let newRight = domainRight - moveWorld;

    // ----- HARD CLAMP -----
    const width = newRight - newLeft;

    if (newLeft < 0) {
      newLeft = 0;
      newRight = width;
    }

    if (newRight > totalAbate) {
      newRight = totalAbate;
      newLeft = totalAbate - width;
    }

    state.scales.domainLeft = newLeft;
    state.scales.domainRight = newRight;

    render();
  });

  svg.addEventListener("mouseup", () => {
    isDragging = false;
    svg.style.cursor = "default";
  });

  svg.addEventListener("mouseleave", () => {
    isDragging = false;
    svg.style.cursor = "default";
  });
}

function getSvgX(evt, svg) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse()).x;
}
