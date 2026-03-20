import { state } from "../state.js";
import { applyTransform, clampTransform } from "../utils/math.js";

export function initPan() {
  const svg = state.svg;

  let dragging = false;
  let startX = 0;

  svg.addEventListener("mousedown", evt => {
    dragging = true;
    startX = evt.clientX - state.translateX;
  });

  svg.addEventListener("mousemove", evt => {
    if (dragging) {
      state.translateX = evt.clientX - startX;
      clampTransform();
      applyTransform();
    }
  });

  svg.addEventListener("mouseup", () => {
    dragging = false;
  });
}
