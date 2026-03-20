import { state } from "../state.js";
import { clampTransform, applyTransform } from "../utils/math.js";

export function initZoomButtons() {
  const zoomIn = document.getElementById("zoom-in");
  const zoomOut = document.getElementById("zoom-out");
  const zoomReset = document.getElementById("zoom-reset");

  const svg = state.svg;

  zoomIn.onclick = () => {
    const mx = svg.clientWidth / 2;
    const oldScale = state.scale;

    state.scale = Math.min(5, state.scale + 0.2);
    state.translateX = mx - ((mx - state.translateX) * (state.scale / oldScale));

    clampTransform();
    applyTransform();
  };

  zoomOut.onclick = () => {
    const mx = svg.clientWidth / 2;
    const oldScale = state.scale;

    state.scale = Math.max(0.3, state.scale - 0.2);
    state.translateX = mx - ((mx - state.translateX) * (state.scale / oldScale));

    clampTransform();
    applyTransform();
  };

  zoomReset.onclick = () => {
    state.scale = 1;
    state.translateX = 0;
    clampTransform();
    applyTransform();
  };
}
