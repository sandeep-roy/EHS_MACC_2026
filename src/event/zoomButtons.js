// ======================================================================
// zoomButtons.js — FINAL STABLE VERSION
// ======================================================================

import { state } from "../state.js";
import { render } from "../main.js";

const MIN_RANGE = 500;  // ensures bars stay visible

export function initZoomButtons() {
  const btnIn = document.getElementById("zoom-in");
  const btnOut = document.getElementById("zoom-out");
  const btnReset = document.getElementById("zoom-reset");

  btnIn.onclick = () => zoomDomain(0.8);
  btnOut.onclick = () => zoomDomain(1.25);
  btnReset.onclick = () => resetDomain();
}

function zoomDomain(factor) {
  let { domainLeft, domainRight, totalAbate } = state.scales;

  const range = domainRight - domainLeft;
  if (range <= 0) return;

  const mid = domainLeft + range / 2;
  let newRange = range * factor;

  newRange = Math.max(MIN_RANGE, Math.min(newRange, totalAbate));

  state.scales.domainLeft = mid - newRange / 2;
  state.scales.domainRight = mid + newRange / 2;

  render();
}

function resetDomain() {
  state.scales.domainLeft = 0;
  state.scales.domainRight = state.scales.totalAbate;
  render();
}
