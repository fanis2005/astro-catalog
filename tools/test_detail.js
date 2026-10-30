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
if (!okFov || !r || Number(r[1]) < 1) process.exit(1);
