// ======================================================================
// scales.js — FINAL FULL VERSION
// Domain-based X scale + MAC Y scale (percentile) + Cumulative Y axis
// ======================================================================

import { state } from "./state.js";

export function applyScales() {
  const rows = state.rows;
  if (!rows || rows.length === 0) return;

  const { margin, innerW, innerH } = state.layout;

  // --------------------------------------------------------------------
  // 1. DOMAIN HANDLING (X‑axis)
  // --------------------------------------------------------------------
  let domainLeft  = state.scales.domainLeft;
  let domainRight = state.scales.domainRight;
  const totalAb   = state.scales.totalAbate;

  if (domainLeft == null || domainRight == null) {
    domainLeft = 0;
    domainRight = totalAb;
  }

  if (!isFinite(domainLeft)) domainLeft = 0;
  if (!isFinite(domainRight)) domainRight = totalAb;

  const MIN_RANGE = 500;
  if (domainRight - domainLeft < MIN_RANGE) {
    const mid = (domainLeft + domainRight) / 2;
    domainLeft  = mid - MIN_RANGE / 2;
    domainRight = mid + MIN_RANGE / 2;
  }

  // Clamp to valid bounds
  domainLeft  = Math.max(0, domainLeft);
  domainRight = Math.min(totalAb, domainRight);

  state.scales.domainLeft  = domainLeft;
  state.scales.domainRight = domainRight;

  const domainRange = domainRight - domainLeft;

  // --------------------------------------------------------------------
  // 2. X SCALE (shared by bars + curve)
  // --------------------------------------------------------------------
  const x = v =>
    margin.left + ((v - domainLeft) / domainRange) * innerW;


  // ====================================================================
  // 3. MAC Y‑SCALE (LEFT AXIS) — SAFE PERCENTILE SCALING (Option A)
  // ====================================================================
  let macValues = rows.map(r => r.mac).filter(v => isFinite(v));

  // Fallback: if list empty or only 1 element
  if (macValues.length === 0) macValues = [0];
  if (macValues.length === 1) macValues = [macValues[0] - 1, macValues[0] + 1];

  macValues.sort((a, b) => a - b);

  const idx05 = Math.floor(macValues.length * 0.05);
  const idx95 = Math.floor(macValues.length * 0.95);

  let minMAC = macValues[idx05];
  let maxMAC = macValues[idx95];

  // Ensure non-zero vertical range
  if (maxMAC === minMAC) {
    maxMAC += 1;
    minMAC -= 1;
  }

  // Add aesthetic padding
  const pad = (maxMAC - minMAC) * 0.15;
  minMAC -= pad;
  maxMAC += pad;

  // Ensure MAC = 0 always visible
  if (minMAC > 0) minMAC = 0;
  if (maxMAC < 0) maxMAC = 0;

  state.scales.minMAC = minMAC;
  state.scales.maxMAC = maxMAC;

  // Final MAC Y scale
  const y = val =>
    margin.top + (1 - (val - minMAC) / (maxMAC - minMAC)) * innerH;

  const y0 = y(0);


  // ====================================================================
  // 4. CUMULATIVE CURVE SCALE (RIGHT AXIS)
  // ====================================================================
  let maxCUM = Math.max(...rows.map(r => r.cum));
  if (!isFinite(maxCUM) || maxCUM <= 0) maxCUM = 1;  // safety

  const yCum = v =>
    margin.top + (1 - (v / maxCUM)) * innerH;


  // ====================================================================
  // 5. Save all scales
  // ====================================================================
  state.scales.x = x;
  state.scales.y = y;
  state.scales.y0 = y0;

  state.scales.yCum = yCum;
  state.scales.maxCUM = maxCUM;
}
