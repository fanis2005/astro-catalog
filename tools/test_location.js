// Проверка смены локации: пересчёт видимости, сохранение, поведение для юга.
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const site = path.join(__dirname, "..");

function makeEl(tag = "div") {
  return {
    tag, children: [], style: {}, className: "", value: "", textContent: "", innerHTML: "",
    append(...kids) { this.children.push(...kids); },
    appendChild(k) { this.children.push(k); },
    setAttribute() {}, addEventListener() {}, remove() {},
    classList: { toggle() {}, add() {}, remove() {} },
    click() {},
  };
}

const store = {};
const sandbox = {
  window: {},
  document: {
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    getElementById: () => makeEl(),
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
const cat = sandbox.window.CATALOG.objects;
let failed = 0;

function check(name, cond, extra = "") {
  console.log(`${cond ? "OK " : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failed++;
}

// 1. Клиентский расчёт для 55.8N совпадает с предрассчитанным каталогом.
let maxAltDiff = 0, maxHoursDiff = 0, worst = "";
for (const o of cat) {
  const calc = A.monthsFor(o);
  o.months.forEach((ref, i) => {
    const dAlt = Math.abs(calc[i].max_alt - ref.max_alt);
    const dH = Math.abs(calc[i].hours30 - ref.hours30);
    if (dAlt > maxAltDiff) { maxAltDiff = dAlt; worst = `${o.id} m${i + 1}`; }
    if (dH > maxHoursDiff) maxHoursDiff = dH;
  });
}
check("совпадение с каталогом (max_alt)", maxAltDiff <= 0.2, `макс. расхождение ${maxAltDiff.toFixed(2)}° (${worst})`);
check("совпадение с каталогом (hours30)", maxHoursDiff <= 0.2, `макс. расхождение ${maxHoursDiff.toFixed(2)} ч`);

// 2. M42 зимой южнее становится выше.
const m42 = cat.find((o) => o.id === "m42");
const decMoscow = A.monthsFor(m42).find((m) => m.m === 12).max_alt;

const okApply = A.applyLocation({ name: "Сочи", lat: 43.5855, lon: 39.7231 });
check("applyLocation вернул true", okApply === true);
check("локация применилась", A.getLocation().name === "Сочи" && Math.abs(A.getLocation().lat - 43.5855) < 1e-6);
check("локация сохранена в localStorage", !!store["astro-location"] && JSON.parse(store["astro-location"]).name === "Сочи");

const decSochi = A.monthsFor(m42).find((m) => m.m === 12).max_alt;
check("M42 в декабре в Сочи выше, чем в Москве", decSochi > decMoscow, `${decMoscow}° → ${decSochi}°`);

// 3. Севернее — ниже (проверка, что LAT реально участвует).
A.applyLocation({ name: "Мурманск", lat: 68.9585, lon: 33.0827 });
const decMurmansk = A.monthsFor(m42).find((m) => m.m === 12).max_alt;
check("M42 в декабре в Мурманске ниже, чем в Сочи", decMurmansk < decSochi, `${decSochi}° → ${decMurmansk}°`);

// 4. Некорректные координаты отклоняются, локация не меняется.
const before = A.getLocation();
const bad = A.applyLocation({ name: "битая", lat: "нет", lon: 10 });
check("нечисловая широта отклонена", bad === false);
check("локация не изменилась после ошибки", A.getLocation().lat === before.lat && A.getLocation().lon === before.lon);

// 5. Сброс к локации по умолчанию.
A.applyLocation({ name: "Москва/Подмосковье", lat: sandbox.window.CATALOG.lat, lon: sandbox.window.CATALOG.lon });
const def = A.getLocation();
check("сброс к умолчанию", Math.abs(def.lat - 55.8) < 1e-6 && Math.abs(def.lon - 38.2166667) < 1e-6);

console.log(failed ? `\nПРОВАЛЕНО: ${failed}` : "\nВсе проверки локации пройдены");
process.exit(failed ? 1 : 0);
