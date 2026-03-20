// ======================================================================
// pan.js — Domain-based horizontal panning with boundary clamps
// ======================================================================

import { state } from "../state.js";
import { render } from "../main.js";

export function initPan() {
  const svg = state.svg;

  let isDragging = false;
  let startX = null;

  svg.addEventListener("mousedown", evt => {
    if (evt.button !== 0) return;

    const zoomBtn = document.getElementById("zoom-box");
    const boxModeActive = zoomBtn && zoomBtn.style.background === "rgb(208, 224, 255)";
    if (boxModeActive) return;

    isDragging = true;
    startX = getSvgX(evt, svg);
    svg.style.cursor = "grabbing";
  });

  svg.addEventListener("mousemove", evt => {
    if (!isDragging) return;

    const curX = getSvgX(evt, svg);
    const dx = curX - startX;

    const { domainLeft, domainRight, totalAbate } = state.scales;
    const domainRange = domainRight - domainLeft;
    const { innerW } = state.layout;

    const moveWorld = (dx / innerW) * domainRange;

    let newLeft  = domainLeft - moveWorld;
    let newRight = domainRight - moveWorld;

    // Clamp to boundaries
    if (newLeft < 0) {
      newRight += -newLeft;
      newLeft = 0;
    }
    if (newRight > totalAbate) {
      const excess = newRight - totalAbate;
      newLeft -= excess;
      newRight = totalAbate;
    }

    state.scales.domainLeft  = newLeft;
    state.scales.domainRight = newRight;

    startX = curX;
    render();
  });

  svg.addEventListener("mouseup", () => stopPan(svg));
  svg.addEventListener("mouseleave", () => stopPan(svg));
}

function stopPan(svg) {
  svg.style.cursor = "default";
  svg.dispatchEvent(new Event("mouseup", { bubbles: false }));
}

function getSvgX(evt, svg) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse()).x;
}
