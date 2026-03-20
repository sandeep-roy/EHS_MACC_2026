export const state = {
  // ---------------------------
  // Raw SAC dataset (dimensions + measures)
  // ---------------------------
  raw: null,

  // ---------------------------
  // Processed row objects (name, cat, abate, mac, etc.)
  // ---------------------------
  rows: [],

  // ---------------------------
  // DOM references
  // ---------------------------
  svg: null,
  tooltip: null,

  // ---------------------------
  // Layout & drawing area
  // Populated inside layout.js
  // ---------------------------
  layout: {
    margin: { top: 60, right: 80, bottom: 150, left: 200 },
    W: 0,
    H: 0,
    innerW: 0,
    innerH: 0
  },

  // ---------------------------
  // Scales and domain
  // domainLeft/domainRight = visible abatement range
  // totalAbate = full MACC width
  // ---------------------------
  scales: {
    x: null,            // x(value) → pixel
    y: null,            // y(mac) → pixel
    y0: 0,              // pixel position of MAC = 0

    totalAbate: 0,      // sum of all abatement
    minMAC: 0,          // min MAC across dataset
    maxMAC: 0,          // max MAC across dataset

    domainLeft: 0,      // left bound of visible abatement range
    domainRight: null   // right bound of visible abatement range
  }
};
