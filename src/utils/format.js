export function formatShortNumber(num) {
  let rounded = Math.round(num / 10000) * 10000;
  if (rounded >= 1000) return (rounded / 1000) + "k";
  return rounded.toString();
}
