// ======================================================================
// toggleCurve.js — Show / Hide MACC Envelope Curve (final version)
// ======================================================================

import { state } from "../state.js";
import { render } from "../main.js";

let curveVisible = true; // default: curve is ON

export function initToggleCurve() {
  const btn = document.getElementById("toggle-curve");
  if (!btn) return;

  btn.onclick = () => {
    curveVisible = !curveVisible;
    state.curveVisible = curveVisible;

    // Update button icon
    btn.textContent = curveVisible ? "👁" : "🚫";

    // Re-render MACC with or without curve
    render();
  };
}
