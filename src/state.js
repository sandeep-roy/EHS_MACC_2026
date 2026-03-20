export const state = {
  raw: null,
  rows: [],

  svg: null,
  tooltip: null,

  scale: 1,
  translateX: 0,

  layout: {
    margin: { top: 60, right: 80, bottom: 150, left: 200 },
    W: 0,
    H: 0,
    innerW: 0,
    innerH: 0
  },

  scales: {
    x: null,
    y: null,
    y0: 0,
    totalAbate: 0,
    minMAC: 0,
    maxMAC: 0,
    domainLeft: 0,
    domainRight: null
  }
};
