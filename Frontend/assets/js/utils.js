export function plateColor(plate) {
  let h = 0;
  const str = (plate || "").toUpperCase();
  for (let i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i)) >>> 0;
  return `hsl(${h%360} 70% 25% / 0.35)`;
}
export function fmt(dtStr) {
  const d = new Date(dtStr);
  return d.toLocaleString();
}
export function upper(el) {
  el.addEventListener("input", () => { el.value = el.value.toUpperCase(); });
}
