// ======================================================================
// zoomButtons.js — Domain-based zoom in/out/reset with safety
// ======================================================================

import { state } from "../state.js";
import { render } from "../main.js";

export function initZoomButtons() {
  const btnIn = document.getElementById("zoom-in");
  const btnOut = document.getElementById("zoom-out");
  const btnReset = document.getElementById("zoom-reset");

  btnIn.onclick = () => zoomDomain(0.8);    // zoom IN
  btnOut.onclick = () => zoomDomain(1.25);  // zoom OUT
  btnReset.onclick = () => resetDomain();
}

function zoomDomain(factor) {
  let { domainLeft, domainRight, totalAbate } = state.scales;

  const range = domainRight - domainLeft;
  if (range < 5) return;     // prevent collapse

  const mid = domainLeft + range / 2;
  let newRange = range * factor;

  // Limit zoom in/out
  newRange = Math.max(5, Math.min(newRange, totalAbate));

  state.scales.domainLeft  = mid - newRange / 2;
  state.scales.domainRight = mid + newRange / 2;

  render();
}

function resetDomain() {
  state.scales.domainLeft = 0;
  state.scales.domainRight = state.scales.totalAbate;
  render();
}
