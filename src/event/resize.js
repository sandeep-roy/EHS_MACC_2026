import { render } from "../main.js";

export function initResize() {
  window.addEventListener("resize", () => {
    render();
  });
}
