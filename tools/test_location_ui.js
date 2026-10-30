// Проверка UI смены локации: открытие панели, пресеты, ручной ввод, сброс.
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const site = path.join(__dirname, "..");

function makeEl(tag = "div") {
  const el = {
    tag, id: "", children: [], style: {}, className: "", value: "", textContent: "", innerHTML: "",
    handlers: {},
    _classes: new Set(),
    append(...kids) { this.children.push(...kids); },
    appendChild(k) { this.children.push(k); },
    setAttribute(k, v) { this[k] = v; },
    addEventListener(ev, fn) { this.handlers[ev] = fn; },
    remove() {},
    classList: {
      add(c) { el._classes.add(c); },
      remove(c) { el._classes.delete(c); },
      toggle(c, force) { if (force === undefined ? !el._classes.has(c) : force) el._classes.add(c); else el._classes.delete(c); },
      contains(c) { return el._classes.has(c); },
    },
    click() {},
  };
  return el;
}

const registry = new Map();
function getEl(key) {
  if (!registry.has(key)) {
    const e = makeEl(key);
    e.id = key;
    registry.set(key, e);
  }
  return registry.get(key);
}

const store = {};
const sandbox = {
  window: {},
  document: {
    querySelector: (s) => getEl(s),
    querySelectorAll: () => [],
    getElementById: (id) => getEl(id),
    createElement: (t) => makeEl(t),
    body: makeEl("body"),
    addEventListener() {},
  },
  sessionStorage: { getItem: () => "ok", setItem() {} },
  localStorage: {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = v; },
  },
  Blob: class {},
  URL: { createObjectURL: () => "blob:", revokeObjectURL() {} },
  setInterval: () => 0,
  console,
  FileReader: class {},
  alert: () => {},
  Date, Math, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN, Error,
  Map, Set,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(site, "data", "catalog.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(site, "data", "shots.js"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(site, "app.js"), "utf8"), sandbox);

const A = sandbox.window.__astro;
const $ = getEl;
let failed = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "OK " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failed++;
}

check("при загрузке локация по умолчанию", A.getLocation().name === "Москва/Подмосковье");
check("шапка заполнена", /Локация:/.test($("site-info").innerHTML) && /55,8° N/.test($("site-info").innerHTML));

// открыть панель
$("loc-edit").handlers.click();
check("панель открылась", !$("loc-panel").classList.contains("hidden"));

// пресет «Сочи» (индекс 5)
$("loc-preset").value = "5";
$("loc-preset").handlers.change();
check("пресет заполнил поля", $("loc-name").value === "Сочи" && $("loc-lat").value === "43.5855" && $("loc-lon").value === "39.7231");
$("loc-apply").handlers.click();
check("пресет применён", A.getLocation().name === "Сочи");
check("панель закрылась после применения", $("loc-panel").classList.contains("hidden"));
check("шапка обновилась", /Сочи/.test($("site-info").innerHTML) && /43,6° N/.test($("site-info").innerHTML));
check("подвал обновился", /Сочи/.test($("foot-site").textContent));

// ручной ввод
$("loc-edit").handlers.click();
$("loc-name").value = "Дача";
$("loc-lat").value = "56,5";
$("loc-lon").value = "44,0";
$("loc-apply").handlers.click();
check("ручной ввод с запятой", A.getLocation().name === "Дача" && Math.abs(A.getLocation().lat - 56.5) < 1e-9);

// неверный ввод
$("loc-edit").handlers.click();
$("loc-lat").value = "abc";
const before = A.getLocation();
$("loc-apply").handlers.click();
check("неверный ввод не применился", A.getLocation().lat === before.lat);
check("показана подсказка об ошибке", /Введите широту/.test($("loc-hint").textContent));

// сброс
$("loc-close").handlers.click();
$("loc-edit").handlers.click();
$("loc-reset").handlers.click();
check("сброс к умолчанию", A.getLocation().name === "Москва/Подмосковье" && Math.abs(A.getLocation().lat - 55.8) < 1e-9);

console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : "\nВсе проверки UI локации пройдены");
process.exit(failed ? 1 : 0);
