import { state } from "./state.js";

export function prepareData() {
  const D = state.raw;

  const rows = D.project.map((p, i) => ({
    name: p,
    cat: D.category[i],
    abate: +D.abatement[i] || 0,
    mac: +D.mac[i] || 0,
    cum: +D.cumulative[i] || 0,
    npv: +D.npv[i] || 0,
    capex: +D.capex[i] || 0,
    opex: +D.opex[i] || 0
  })).filter(r => isFinite(r.abate) && isFinite(r.mac));

  rows.sort((a, b) => a.mac - b.mac);

  let cum = 0;
  rows.forEach(r => {
    r.x0 = cum;
    cum += r.abate;
    r.x1 = cum;
  });

  state.rows = rows;
}
