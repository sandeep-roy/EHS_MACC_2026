// ======================================================================
// scales.js — MAC scale (left axis) + cumulative scale (right axis)
// ======================================================================

import { state } from "./state.js";

export function applyScales() {
  const rows = state.rows;
  if (!rows || rows.length === 0) return;

  const { margin, innerW, innerH } = state.layout;

  let domainLeft = state.scales.domainLeft;
  let domainRight = state.scales.domainRight;
  const totalAb = state.scales.totalAbate;

  // ------------------ DOMAIN SAFETY ------------------
  if (domainLeft == null || domainRight == null) {
    domainLeft = 0;
    domainRight = totalAb;
  }

  if (!isFinite(domainLeft))  domainLeft = 0;
  if (!isFinite(domainRight)) domainRight = totalAb;

  if (domainRight - domainLeft < 500) {
    const mid = (domainLeft + domainRight) / 2;
    domainLeft  = mid - 250;
    domainRight = mid + 250;
  }

  domainLeft  = Math.max(0, domainLeft);
  domainRight = Math.min(totalAb, domainRight);

  state.scales.domainLeft  = domainLeft;
  state.scales.domainRight = domainRight;

  const domainRange = domainRight - domainLeft;

  // ------------------ X SCALE ------------------------
  const x = v =>
    margin.left + ((v - domainLeft) / domainRange) * innerW;

  // ------------------ MAC Y-SCALE (LEFT AXIS) --------
  const minMAC = state.scales.minMAC;
  const maxMAC = state.scales.maxMAC;

  const y = val =>
    margin.top +
    (1 - (val - minMAC) / (maxMAC - minMAC)) * innerH;

  const y0 = y(0);

  // ------------------ CUMULATIVE Y-SCALE (RIGHT AXIS) ----------
  const maxCUM = Math.max(...rows.map(r => r.cum));
  const minCUM = 0;

  const yCum = val =>
    margin.top +
    (1 - (val - minCUM) / (maxCUM - minCUM)) * innerH;

  // Store results
  state.scales.x = x;
  state.scales.y = y;
  state.scales.y0 = y0;
  state.scales.yCum = yCum;
  state.scales.maxCUM = maxCUM;
}
