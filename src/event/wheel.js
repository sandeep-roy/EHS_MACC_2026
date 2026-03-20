// ======================================================================
// wheel.js — Domain-based mouse wheel zoom
// ======================================================================

import { state } from "../state.js";
import { render } from "../main.js";

export function initWheelZoom() {
  const svg = state.svg;

  svg.addEventListener("wheel", evt => {
    evt.preventDefault();

    let { domainLeft, domainRight, totalAbate } = state.scales;
    const { innerW, margin } = state.layout;

    const range = domainRight - domainLeft;
    if (range <= 0) return;

    const factor = evt.deltaY < 0 ? 0.8 : 1.25;

    const svgX = getSvgX(evt, svg);
    const mouseWorld = domainLeft + ((svgX - margin.left) / innerW) * range;

    let newRange = range * factor;

    // Clamp limits
    newRange = Math.max(5, Math.min(newRange, totalAbate));

    state.scales.domainLeft  = mouseWorld - newRange / 2;
    state.scales.domainRight = mouseWorld + newRange / 2;

    render();
  });
}

function getSvgX(evt, svg) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse()).x;
}
