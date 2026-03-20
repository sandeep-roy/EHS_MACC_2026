// ======================================================================
// zoomButtons.js — Zoom-in, Zoom-out, Reset (Domain-Based)
// ======================================================================

import { state } from "../state.js";
import { render } from "../main.js";

export function initZoomButtons() {
  const btnIn = document.getElementById("zoom-in");
  const btnOut = document.getElementById("zoom-out");
  const btnReset = document.getElementById("zoom-reset");

  btnIn.onclick = () => zoomDomain(0.8);     // zoom in
  btnOut.onclick = () => zoomDomain(1.25);   // zoom out
  btnReset.onclick = () => resetDomain();
}

// Zoom by factor
function zoomDomain(factor) {
  let { domainLeft, domainRight } = state.scales;
  const { margin, innerW } = state.layout;

  const domainRange = domainRight - domainLeft;
  const newRange = domainRange * factor;

  const mid = domainLeft + domainRange / 2;

  state.scales.domainLeft = mid - newRange / 2;
  state.scales.domainRight = mid + newRange / 2;

  // Re-render
  render();
}

// Reset full domain
function resetDomain() {
  state.scales.domainLeft = 0;
  state.scales.domainRight = state.scales.totalAbate;
  render();
}
