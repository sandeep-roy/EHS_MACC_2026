// ======================================================================
// drawSVG.js — Initializes SVG layers (grid, axes, bars, overlay)
// ======================================================================
// IMPORTANT:
//   • overlayLayer stays on top and is NOT transformed
//   • This at last makes rectangular zoom visible + accurate
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

    <!-- Bars are clipped & anchored in world-space -->
    <g id="barLayer" clip-path="url(#plotClip)"></g>
    <g id="curveLayer" clip-path="url(#plotClip)"></g>   <!-- NEW -->

    <g id="xTickTextLayer"></g>
    <g id="xAxisLabelLayer"></g>

    <!-- NEW: selection rectangle drawn here -->
    <g id="overlayLayer" style="pointer-events:none;"></g>
  `;
}
