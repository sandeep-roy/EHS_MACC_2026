import { state } from "./state.js";

export function applyScales() {
  const { rows } = state;

  if (!rows || rows.length === 0) return;

  const { margin, innerW, innerH } = state.layout;
  let { domainLeft, domainRight, minMAC, maxMAC } = state.scales;

  if (domainRight <= domainLeft) {
    domainLeft = 0;
    domainRight = state.scales.totalAbate || 1;
    state.scales.domainLeft = domainLeft;
    state.scales.domainRight = domainRight;
  }

  const domainRange = domainRight - domainLeft;

  // Avoid division by zero
  if (domainRange <= 0) return;

  const x = v =>
    margin.left + ((v - domainLeft) / domainRange) * innerW;

  const y = val =>
    margin.top +
    (1 - (val - minMAC) / (maxMAC - minMAC)) * innerH;

  // Zero line
  const y0 = y(0);
  state.scales.x = x;
  state.scales.y = y;
  state.scales.y0 = y0;
}
