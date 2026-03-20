// ======================================================================
// scales.js — Domain-based X/Y scaling with full safety
// ======================================================================

import { state } from "./state.js";

export function applyScales() {
  const { rows } = state;
  if (!rows || rows.length === 0) return;

  const { margin, innerW, innerH } = state.layout;

  let domainLeft  = state.scales.domainLeft;
  let domainRight = state.scales.domainRight;
  const totalAb   = state.scales.totalAbate;

  // -------------------------------------------------------------
  // DOMAIN SAFETY — critical to prevent NaN and Infinity errors
  // -------------------------------------------------------------

  // Uninitialized domain handling
  if (domainLeft == null || domainRight == null) {
    domainLeft = 0;
    domainRight = totalAb;
  }

  // Replace invalid values
  if (!isFinite(domainLeft))  domainLeft = 0;
  if (!isFinite(domainRight)) domainRight = totalAb;

  // Protect against collapse to zero width
  if (domainRight - domainLeft < 1) {
    const mid = (domainLeft + domainRight) / 2;
    domainLeft  = mid - 0.5;
    domainRight = mid + 0.5;
  }

  // Clamp domain boundaries
  domainLeft  = Math.max(0, domainLeft);
  domainRight = Math.min(totalAb, domainRight);

  // Save cleaned domain
  state.scales.domainLeft  = domainLeft;
  state.scales.domainRight = domainRight;

  const domainRange = domainRight - domainLeft;
  if (domainRange <= 0) return;

  // -------------------------------------------------------------
  // X SCALE — domain to pixel
  // -------------------------------------------------------------
  const x = v =>
    margin.left + ((v - domainLeft) / domainRange) * innerW;

  // -------------------------------------------------------------
  // Y SCALE — MAC value to pixel
  // -------------------------------------------------------------
  const minMAC = state.scales.minMAC;
  const maxMAC = state.scales.maxMAC;

  const y = val =>
    margin.top +
    (1 - (val - minMAC) / (maxMAC - minMAC)) * innerH;

  const y0 = y(0);

  // Save scales
  state.scales.x = x;
  state.scales.y = y;
  state.scales.y0 = y0;
}
