// ======================================================================
// drawSVG.js — builds SVG layers including cumulative curve layer
// ======================================================================

import { state } from "../state.js";

export function drawSVGBase() {
  const svg = state.svg;

  svg.innerHTML = `
    <defs>
      <clipPath id="plotClip">
        <rect id="clipRect"></rect>
      </clipPath>
    </defs>

    <g id="gridLayer"></g>
    <g id="yAxisLayer"></g>
    <g id="axisLayer"></g>

    <g id="barLayer" clip-path="url(#plotClip)"></g>

    <g id="curveLayer" clip-path="url(#plotClip)"></g>  <!-- NEW -->

    <g id="xTickTextLayer"></g>
    <g id="xAxisLabelLayer"></g>

    <g id="overlayLayer" style="pointer-events:none;"></g>
  `;
}
``
