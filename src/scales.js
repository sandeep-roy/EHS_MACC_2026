import { state } from "./state.js";

export function applyScales() {
  const { rows } = state;

  const totalAb = rows.reduce((s, r) => s + r.abate, 0);
  state.scales.totalAbate = totalAb;

  let minMAC = Math.min(...rows.map(r => r.mac));
  let maxMAC = Math.max(...rows.map(r => r.mac));
  const PAD = (maxMAC - minMAC) * 0.15;

  minMAC -= PAD;
  maxMAC += PAD;

  state.scales.minMAC = minMAC;
  state.scales.maxMAC = maxMAC;

  const { innerW, innerH, margin } = state.layout;

  const scaleX = innerW / totalAb;
  const x = v => margin.left + v * scaleX;

  const y = val =>
    margin.top + (1 - (val - minMAC) / (maxMAC - minMAC)) * innerH;

  state.scales.x = x;
  state.scales.y = y;
  state.scales.y0 = y(0);
}
