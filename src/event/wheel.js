import { state } from "../state.js";
import { applyTransform, clampTransform } from "../utils/math.js";

export function initWheelZoom() {
  const svg = state.svg;

  svg.addEventListener("wheel", evt => {
    evt.preventDefault();

    const mx = evt.offsetX;
    const oldScale = state.scale;
    const factor = evt.deltaY < 0 ? 1.2 : 0.8;

    state.scale = Math.max(0.3, Math.min(5, state.scale * factor));

    state.translateX = mx - ((mx - state.translateX) * (state.scale / oldScale));

    clampTransform();
    applyTransform();
  });
}
