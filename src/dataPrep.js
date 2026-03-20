// ======================================================================
// dataPrep.js — Transforms SAC binding data into chart-ready structure
// ======================================================================
// Responsibilities:
//   1) Convert SAC-formatted structure (arrays of dimensions/measures)
//      into a clean row-per-bar format.
//   2) Compute cumulative abatement to determine bar x0/x1 placement.
//   3) Determine total abatement, min MAC, max MAC.
//   4) Initialize zoom domain (domainLeft, domainRight).
// ======================================================================

import { state } from "./state.js";

export function prepareData() {

  const D = state.raw;
  if (!D) return;

  const rows = [];

  // ------------------------------------------------------------------
  // Convert raw SAC binding into internal row objects
  // ------------------------------------------------------------------
  for (let i = 0; i < D.project.length; i++) {
    rows.push({
      name: D.project[i],
      cat: D.category[i],
      abate: +D.abatement[i] || 0,
      mac: +D.mac[i] || 0,
      cum: +D.cumulative[i] || 0,
      npv: +D.npv[i] || 0,
      capex: +D.capex[i] || 0,
      opex: +D.opex[i] || 0
    });
  }

  // Filter out invalid rows (NaN or undefined)
  const clean = rows.filter(r => isFinite(r.abate) && isFinite(r.mac));

  // Sort by MAC (x-axis order for MACC visualization)
  clean.sort((a, b) => a.mac - b.mac);

  // ------------------------------------------------------------------
  // Calculate cumulative abatement (x0, x1)
  // ------------------------------------------------------------------
  let cum = 0;
  for (const r of clean) {
    r.x0 = cum;
    cum += r.abate;
    r.x1 = cum;
  }

  const totalAbate = cum;
  state.rows = clean;
  state.scales.totalAbate = totalAbate;

  // ------------------------------------------------------------------
  // Determine min and max MAC values
  // ------------------------------------------------------------------
  const macValues = clean.map(r => r.mac);
  let minMAC = Math.min(...macValues);
  let maxMAC = Math.max(...macValues);

  // Add Y-padding (15% of range)
  const pad = (maxMAC - minMAC) * 0.15;
  minMAC -= pad;
  maxMAC += pad;

  state.scales.minMAC = minMAC;
  state.scales.maxMAC = maxMAC;

  // ------------------------------------------------------------------
  // INITIAL DOMAIN SETUP (critical for domain-based zoom)
  // ------------------------------------------------------------------
  state.scales.domainLeft = 0;
  state.scales.domainRight = totalAbate;
}
