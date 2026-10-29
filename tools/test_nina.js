// Проверка генератора NINA-серии вне браузера: мок DOM, вызов ninaBuild, валидация $id/$ref.
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const site = path.join(__dirname, "..");
const catalog = fs.readFileSync(path.join(site, "data", "catalog.js"), "utf8");
const shots = fs.readFileSync(path.join(site, "data", "shots.js"), "utf8");

function makeEl() {
  const el = {
    innerHTML: "", value: "", className: "", style: {},
    children: [],
    append() {}, appendChild() {}, setAttribute() {}, addEventListener() {}, remove() {},
    classList: { toggle() {}, add() {}, remove() {} },
    click() {},
  };
  return el;
}

const store = {};
const sandbox = {
  window: {},
  document: {
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    getElementById: () => makeEl(),
    createElement: () => makeEl(),
    addEventListener() {},
  },
  sessionStorage: {
    getItem: () => "ok",
    setItem() {},
  },
  localStorage: {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = v; },
  },
  Blob: class { constructor() {} },
  URL: { createObjectURL: () => "blob:", revokeObjectURL() {} },
  setInterval: () => 0,
  console,
  FileReader: class {},
  alert: () => {},
  Date,
  Math,
  JSON,
  Object,
  Array,
  String,
  Number,
  parseInt,
  parseFloat,
  isNaN,
  Error,
};

sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(catalog, sandbox);
vm.runInContext(shots, sandbox);
vm.runInContext(fs.readFileSync(path.join(site, "app.js"), "utf8"), sandbox);

const A = sandbox.window.__astro;
if (!A) { console.error("__astro не найден"); process.exit(1); }

const cat = sandbox.window.CATALOG.objects;
const pick = (id) => cat.find((o) => o.id === id);
const now = new Date();
const mk = (h, m) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);

const slots = [
  { o: pick("ngc281"), start: mk(21, 0), end: mk(1, 0), maxAlt: 60 },
  { o: pick("ngc2403"), start: mk(1, 10), end: mk(4, 30), maxAlt: 70 },
];

const seq = A.ninaBuild(slots);
const json = JSON.stringify(seq);

// проверка id/ref
const ids = new Set();
const refs = [];
(function walk(o) {
  if (o && typeof o === "object") {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    for (const [k, v] of Object.entries(o)) {
      if (k === "$id") ids.add(v);
      if (k === "$ref") refs.push(v);
      walk(v);
    }
  }
})(seq);

const missing = refs.filter((r) => !ids.has(r));
console.log("размер JSON:", json.length, "байт");
console.log("$id:", ids.size, "$ref:", refs.length, "битых ref:", missing.length);
console.log("целей:", slots.length);
console.log("корневой тип:", seq.$type);
console.log("Parent root:", seq.Parent);

// проверка, что каждый Parent указывает на контейнер
let badParents = 0;
(function check(n, parentId) {
  if (!n || typeof n !== "object") return;
  if (Array.isArray(n)) { n.forEach((x) => check(x, parentId)); return; }
  if (n.$type && n.$id && n.Parent !== undefined && n.Parent !== null) {
    if (n.Parent.$ref && !ids.has(n.Parent.$ref)) badParents++;
  }
  for (const key of ["Items", "Conditions", "Triggers"]) {
    const coll = n[key];
    if (coll && Array.isArray(coll.$values)) coll.$values.forEach((c) => check(c, n.$id));
  }
  if (n.TriggerRunner) check(n.TriggerRunner, null);
})(seq, null);
console.log("битых Parent:", badParents);

const types = {};
(function count(n) {
  if (!n || typeof n !== "object") return;
  if (Array.isArray(n)) { n.forEach(count); return; }
  if (n.$type) types[n.$type.split(",")[0]] = (types[n.$type.split(",")[0]] || 0) + 1;
  for (const v of Object.values(n)) count(v);
})(seq);
console.log("типы:", Object.keys(types).length);
console.log(Object.entries(types).map(([k, v]) => `${v}× ${k.split(".").pop()}`).join(", "));

fs.writeFileSync(path.join(site, "_tmp_plan.json"), JSON.stringify(seq, null, 2), "utf8");
console.log("сохранено в _tmp_plan.json");

// проверка триггеров
const trigs = { dither: 0, afTime: 0, afTemp: 0, runnerDither: 0, runnerAf: 0, badError: 0 };
(function scan(o) {
  if (!o || typeof o !== "object") return;
  if (Array.isArray(o)) { o.forEach(scan); return; }
  const t = o.$type || "";
  if (t.includes("DitherAfterExposures")) trigs.dither++;
  if (t.includes("AutofocusAfterTimeTrigger")) trigs.afTime++;
  if (t.includes("AutofocusAfterTemperatureChangeTrigger")) trigs.afTemp++;
  if (t.includes("SequenceItem.Guider.Dither,")) trigs.runnerDither++;
  if (t.includes("SequenceItem.Autofocus.RunAutofocus,")) trigs.runnerAf++;
  if ((t.includes(".Trigger.") || t.includes(".Conditions.")) && ("ErrorBehavior" in o)) trigs.badError++;
  for (const v of Object.values(o)) scan(v);
})(seq);
console.log("триггеры:", JSON.stringify(trigs));
if (trigs.dither !== 2 || trigs.afTime !== 2 || trigs.afTemp !== 2 || trigs.badError !== 0) {
  console.error("ПРОБЛЕМА С ТРИГГЕРАМИ");
  process.exit(1);
}
