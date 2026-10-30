// Проверка openDetail: мок DOM, вызов для первого объекта, отлов ошибок.
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const site = path.join(__dirname, "..");

function makeEl(tag = "div") {
  const node = {
    tag, children: [], style: {}, className: "", value: "", textContent: "", innerHTML: "",
    append(...kids) { for (const k of kids) { this.children.push(k); if (typeof k === "string") this.textContent += k; } },
    appendChild(k) { this.children.push(k); },
    setAttribute() {}, addEventListener() {}, remove() {},
    classList: { toggle() {}, add() {}, remove() {} },
    click() {},
  };
  return node;
}

const created = [];
const sandbox = {
  window: {},
  document: {
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    getElementById: () => makeEl("div"),
    createElement: (t) => { const e = makeEl(t); created.push(e); return e; },
    body: makeEl("body"),
    addEventListener() {},
  },
  sessionStorage: { getItem: () => "ok", setItem() {} },
  localStorage: { getItem: () => null, setItem() {} },
  Blob: class {},
  URL: { createObjectURL: () => "blob:", revokeObjectURL() {} },
  setInterval: () => 0,
  console,
  FileReader: class {},
  alert: () => {},
  Date, Math, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN, Error,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(site, "data", "catalog.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(site, "data", "shots.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(site, "app.js"), "utf8"), sandbox);

const A = sandbox.window.__astro;
const cat = sandbox.window.CATALOG.objects;

let ok = 0;
for (const o of cat.slice(0, 5)) {
  try {
    A.openDetail(o);
    ok++;
  } catch (e) {
    console.error("ОШИБКА для", o.id, e.message);
    process.exit(1);
  }
}
console.log("openDetail без ошибок:", ok, "| элементов создано:", created.length);
console.log("modal-backdrop в созданных:", created.some((e) => e.className === "modal-backdrop"));

const fovs = created.filter((e) => e.className === "fov");
const fovSvg = fovs.length && fovs[0].children.find((c) => c.className === "fov-svg");
const okFov = !!fovSvg && /fov-field/.test(fovSvg.innerHTML) && /fov-object/.test(fovSvg.innerHTML);
console.log("схема кадрирования:", okFov, "| схем:", fovs.length);

// мелкий объект: радиус не должен схлопнуться в ноль
const small = cat.find((o) => o.id === "ngc6543");
A.openDetail(small);
const last = created.filter((e) => e.className === "fov").pop();
const lastSvg = last.children.find((c) => c.className === "fov-svg").innerHTML;
const r = /class="fov-object"[^>]*r="([\d.]+)"/.exec(lastSvg);
console.log("NGC 6543: r =", r ? r[1] : "нет", "| подпись:", last.children.find((c) => c.className === "meta").textContent);

const m31 = cat.find((o) => o.id === "m31");
const ngc7331 = cat.find((o) => o.id === "ngc7331");
console.log("заполнение: M31", A.frameFill(m31).toFixed(0) + "%", "| NGC 7331", A.frameFill(ngc7331).toFixed(1) + "%");

const ns = A.nightStats(m31);
console.log("ночь M31: макс.", ns.maxAlt.toFixed(0) + "°", "| окно > 30°:", ns.winStart ? "есть" : "нет");
const mchart = created.find((e) => e.className === "months-chart");
console.log("график месяцев:", !!mchart && /mchart-line/.test(mchart.innerHTML) && /mchart-dot/.test(mchart.innerHTML));
const ev = A.evalObject(m31, ns, { cloud: 0 });
console.log("оценка M31:", JSON.stringify({
  alt: Math.round(ev.altScore), dark: Math.round(ev.darkScore), moon: Math.round(ev.moonScore),
  bortle: Math.round(ev.bortleScore), weather: ev.weatherScore, total: ev.total,
}));
if (!okFov || !r || Number(r[1]) < 1) process.exit(1);
if (Math.abs(A.frameFill(m31) - 93) > 1 || Math.abs(A.frameFill(ngc7331) - 5.2) > 0.3) process.exit(1);
if (!(ev.total >= 0 && ev.total <= 100)) process.exit(1);
