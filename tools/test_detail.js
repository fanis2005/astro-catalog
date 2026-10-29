// Проверка openDetail: мок DOM, вызов для первого объекта, отлов ошибок.
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const site = path.join(__dirname, "..");

function makeEl(tag = "div") {
  const node = {
    tag, children: [], style: {}, className: "", value: "", textContent: "", innerHTML: "",
    append(...kids) { this.children.push(...kids); },
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
