// ======================================================================
// scales.js — FINAL FULL VERSION
// Domain-based X scale + MAC percentile Y-scale + cumulative Y scale
// ======================================================================

import { state } from "./state.js";

export function applyScales() {

  const rows = state.rows;
  if (!rows || rows.length === 0) return;

  const { margin, innerW, innerH } = state.layout;

  // --------------------------------------------------------------------
  // 1. DOMAIN (X axis)
  // --------------------------------------------------------------------
  let domainLeft  = state.scales.domainLeft;
  let domainRight = state.scales.domainRight;
  const totalAb   = state.scales.totalAbate;

  if (domainLeft == null || domainRight == null) {
    domainLeft = 0;
    domainRight = totalAb;
  }

  if (!isFinite(domainLeft))  domainLeft = 0;
  if (!isFinite(domainRight)) domainRight = totalAb;

  const MIN_RANGE = 500;
  const width = domainRight - domainLeft;
  if (width < MIN_RANGE) {
    const mid = (domainLeft + domainRight) / 2;
    domainLeft  = mid - MIN_RANGE / 2;
    domainRight = mid + MIN_RANGE / 2;
  }

  // final clamp
  domainLeft  = Math.max(0, domainLeft);
  domainRight = Math.min(totalAb, domainRight);

  state.scales.domainLeft  = domainLeft;
  state.scales.domainRight = domainRight;

  const domainRange = domainRight - domainLeft;

  // ----------------------------
  // 2. X-SCALE (shared)
  // ----------------------------
  const x = v =>
    margin.left + ((v - domainLeft) / domainRange) * innerW;


  // ====================================================================
  // 3. MAC Y-SCALE (LEFT AXIS) — Percentile (Option A)
  // ====================================================================

  let macValues = rows.map(r => r.mac).filter(v => isFinite(v));

  if (macValues.length === 0) macValues = [0];
  if (macValues.length === 1) macValues = [macValues[0] - 1, macValues[0] + 1];

  macValues.sort((a, b) => a - b);

  const idx05 = Math.floor(macValues.length * 0.05);
  const idx95 = Math.floor(macValues.length * 0.95);

  let minMAC = macValues[idx05];
  let maxMAC = macValues[idx95];

  if (minMAC === maxMAC) {
    minMAC -= 1;
    maxMAC += 1;
  }

  const pad = (maxMAC - minMAC) * 0.15;
  minMAC -= pad;
  maxMAC += pad;

  if (minMAC > 0) minMAC = 0;
  if (maxMAC < 0) maxMAC = 0;

  state.scales.minMAC = minMAC;
  state.scales.maxMAC = maxMAC;

  const y = (val) =>
    margin.top + (1 - (val - minMAC) / (maxMAC - minMAC)) * innerH;

  const y0 = y(0);


  // ====================================================================
  // 4. CUMULATIVE RIGHT Y-AXIS
  // ====================================================================

  let maxCUM = Math.max(...rows.map(r => r.cum));
  if (!isFinite(maxCUM) || maxCUM <= 0) maxCUM = 1;

  const yCum = v =>
    margin.top + (1 - (v / maxCUM)) * innerH;


  // --------------------------------------------------------------------
  // 5. SAVE ALL FINAL SCALES
  // --------------------------------------------------------------------
  state.scales.x = x;
  state.scales.y = y;
  state.scales.y0 = y0;
  state.scales.yCum = yCum;
  state.scales.maxCUM = maxCUM;
}
