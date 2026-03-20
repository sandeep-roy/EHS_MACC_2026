
export function macColor(v) {
  if (v <= -1000) return "#238b45";
  if (v <= -500) return "#74c476";
  if (v < 0) return "#bae4b3";
  if (v <= 500) return "#fee391";
  if (v <= 1500) return "#fdae6b";
  if (v <= 3000) return "#fd8d3c";
  return "#e31a1c";
}
