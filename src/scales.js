// ======================================================================
// scales.js — MAC scale (left) + cumulative scale (right)
// ======================================================================

import { state } from "./state.js";

export function applyScales() {
  const rows = state.rows;
  if (!rows || rows.length === 0) return;

  const { margin, innerW, innerH } = state.layout;

  // ------------------ DOMAIN HANDLING ------------------
  let domainLeft  = state.scales.domainLeft;
  let domainRight = state.scales.domainRight;
  const totalAb   = state.scales.totalAbate;

  if (domainLeft == null || domainRight == null) {
    domainLeft = 0;
    domainRight = totalAb;
  }

  if (!isFinite(domainLeft)) domainLeft = 0;
  if (!isFinite(domainRight)) domainRight = totalAb;

  // enforce minimum zoom range
  const MIN_RANGE = 500;
  if (domainRight - domainLeft < MIN_RANGE) {
    const mid = (domainLeft + domainRight) / 2;
    domainLeft  = mid - MIN_RANGE/2;
    domainRight = mid + MIN_RANGE/2;
  }

  domainLeft  = Math.max(0, domainLeft);
  domainRight = Math.min(totalAb, domainRight);

  state.scales.domainLeft  = domainLeft;
  state.scales.domainRight = domainRight;

  const domainRange = domainRight - domainLeft;

  // ------------------ X SCALE (shared) ------------------
  const x = v => margin.left + ((v - domainLeft) / domainRange) * innerW;

  // ------------------ Y SCALE (MAC - left axis) ------------------
  const minMAC = state.scales.minMAC;
  const maxMAC = state.scales.maxMAC;
  const y = v => margin.top + (1 - (v - minMAC)/(maxMAC-minMAC)) * innerH;
  const y0 = y(0);

  // ------------------ Y SCALE (CUMULATIVE - right axis) ------------------
  const maxCUM = Math.max(...rows.map(r => r.cum));
  const yCum = v => margin.top + (1 - v/maxCUM) * innerH;

  // save all scales
  state.scales.x = x;
  state.scales.y = y;
  state.scales.y0 = y0;
  state.scales.yCum = yCum;
  state.scales.maxCUM = maxCUM;
}
