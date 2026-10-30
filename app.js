/* Каталог объектов: высоты, Луна, учёт снятого, план ночи и экспорт NINA-серии. */
(() => {
  "use strict";

  const data = window.CATALOG;
  const obj = data.objects;
  const SHOTS = window.SHOTS || {};
  const MONTHS = data.months_ru;

  // ---------- локация ----------
  const LOC_KEY = "astro-location";
  const DEFAULT_LOCATION = { name: "Москва/Подмосковье", lat: data.lat, lon: data.lon };
  const PRESETS = [
    { name: "Москва/Подмосковье", lat: 55.8, lon: 38.2167 },
    { name: "Москва (центр)", lat: 55.7558, lon: 37.6173 },
    { name: "Санкт-Петербург", lat: 59.9343, lon: 30.3351 },
    { name: "Нижний Новгород", lat: 56.3269, lon: 44.0059 },
    { name: "Крым (Симеиз)", lat: 44.4, lon: 34.0 },
    { name: "Сочи", lat: 43.5855, lon: 39.7231 },
  ];

  function readLocation() {
    try {
      const v = JSON.parse(localStorage.getItem(LOC_KEY) || "null");
      if (v && Number.isFinite(+v.lat) && Number.isFinite(+v.lon)) {
        return { name: String(v.name || "").trim() || DEFAULT_LOCATION.name, lat: +v.lat, lon: +v.lon };
      }
    } catch { /* повреждённое значение — берём локацию по умолчанию */ }
    return { ...DEFAULT_LOCATION };
  }

  let LOC = readLocation();
  let LAT = LOC.lat, LON = LOC.lon;
  let monthCache = { key: "", map: new Map() };

  const locationKey = () => `${LAT.toFixed(4)},${LON.toFixed(4)}`;

  function fmtLat(v) {
    return `${Math.abs(v).toFixed(1).replace(".", ",")}° ${v >= 0 ? "N" : "S"}`;
  }

  function fmtLon(v) {
    return `${Math.abs(v).toFixed(1).replace(".", ",")}° ${v >= 0 ? "E" : "W"}`;
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k === "text") n.textContent = v;
      else if (k === "onerror") n.setAttribute("onerror", v);
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const k of kids) n.append(k);
    return n;
  };

  // ---------- хранилище ----------
  const store = {
    get() { try { return JSON.parse(localStorage.getItem("astro-status") || "{}"); } catch { return {}; } },
    set(all) { localStorage.setItem("astro-status", JSON.stringify(all)); },
    one(id) { return this.get()[id] || { status: "planned", note: "" }; },
    put(id, patch) {
      const all = this.get();
      all[id] = Object.assign({ status: "planned", note: "" }, all[id] || {}, patch);
      this.set(all);
    },
  };

  const planStore = {
    get() { try { return JSON.parse(localStorage.getItem("astro-plan") || "[]"); } catch { return []; } },
    set(v) { localStorage.setItem("astro-plan", JSON.stringify(v)); },
    toggle(id) {
      const p = this.get();
      const i = p.indexOf(id);
      if (i >= 0) p.splice(i, 1); else p.push(id);
      this.set(p);
    },
    has(id) { return this.get().includes(id); },
  };

  // ---------- астрономия ----------
  const rad = (x) => (x * Math.PI) / 180;
  const deg = (x) => (x * 180) / Math.PI;

  function julian(d) {
    let y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    const day = d.getUTCDate() + (d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600) / 24;
    if (m <= 2) { y -= 1; m += 12; }
    const a = Math.floor(y / 100), b = 2 - a + Math.floor(a / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
  }

  function lstDeg(d) {
    const j = julian(d);
    const T = (j - 2451545.0) / 36525.0;
    return ((280.46061837 + 360.98564736629 * (j - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000) + LON) % 360;
  }

  function altAz(ra, dec, d) {
    const H = rad(lstDeg(d) - ra);
    const p = rad(LAT), dd = rad(dec);
    const alt = deg(Math.asin(Math.sin(p) * Math.sin(dd) + Math.cos(p) * Math.cos(dd) * Math.cos(H)));
    let az = deg(Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(p) - Math.tan(dd) * Math.cos(p))) + 180;
    az = (az + 360) % 360;
    return { alt, az };
  }

  function sunEq(d) {
    const n = julian(d) - 2451545.0;
    const L = (280.460 + 0.9856474 * n) % 360;
    const g = rad((357.528 + 0.9856003 * n) % 360);
    const lam = rad((L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) % 360);
    const eps = rad(23.439 - 0.0000004 * n);
    const ra = deg(Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)));
    const dec = deg(Math.asin(Math.sin(eps) * Math.sin(lam)));
    return { ra, dec };
  }

  function moonEq(d) {
    const j = julian(d) - 2451545.0;
    const L = (218.316 + 13.176396 * j) % 360;
    const M = (134.963 + 13.064993 * j) % 360;
    const F = (93.272 + 13.229350 * j) % 360;
    const lam = rad(L + 6.289 * Math.sin(rad(M)));
    const beta = rad(5.128 * Math.sin(rad(F)));
    const eps = rad(23.4397);
    const ra = deg(Math.atan2(Math.sin(lam) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps), Math.cos(lam)));
    const dec = deg(Math.asin(Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lam)));
    return { ra, dec };
  }

  function moonInfo(d) {
    const m = moonEq(d), s = sunEq(d);
    const cosEl = Math.sin(rad(m.dec)) * Math.sin(rad(s.dec)) +
      Math.cos(rad(m.dec)) * Math.cos(rad(s.dec)) * Math.cos(rad(m.ra - s.ra));
    const illum = Math.max(0, Math.min(1, (1 - cosEl) / 2));
    const age = ((julian(d) - 2451550.1) % 29.530588853 + 29.530588853) % 29.530588853;
    const { alt, az } = altAz(m.ra, m.dec, d);
    return { ra: m.ra, dec: m.dec, alt, az, illum, age };
  }

  function angularSep(a1, d1, a2, d2) {
    const c = Math.sin(rad(d1)) * Math.sin(rad(d2)) +
      Math.cos(rad(d1)) * Math.cos(rad(d2)) * Math.cos(rad(a1 - a2));
    return deg(Math.acos(Math.max(-1, Math.min(1, c))));
  }

  function sunAlt(d) { const s = sunEq(d); return altAz(s.ra, s.dec, d).alt; }

  // ---------- видимость по месяцам для выбранной локации ----------
  // Повторяет расчёт build_catalog.py: 15-е число, шаг 10 мин, только тёмное время
  // (Солнце ниже −18°), максимальная высота и часы выше 30°.
  function monthStats(o, month) {
    const year = new Date().getFullYear();
    let best = -90, hours = 0;
    for (let min = 0; min < 24 * 60; min += 10) {
      const d = new Date(Date.UTC(year, month - 1, 15, 0, min));
      if (sunAlt(d) > -18) continue;
      const alt = altAz(o.ra, o.dec, d).alt;
      if (alt > best) best = alt;
      if (alt > 30) hours += 10 / 60;
    }
    return { m: month, max_alt: Math.round(best * 10) / 10, hours30: Math.round(hours * 10) / 10 };
  }

  function monthsFor(o) {
    const key = locationKey();
    if (monthCache.key !== key) monthCache = { key, map: new Map() };
    let rows = monthCache.map.get(o.id);
    if (!rows) {
      rows = [];
      for (let m = 1; m <= 12; m++) rows.push(monthStats(o, m));
      monthCache.map.set(o.id, rows);
    }
    return rows;
  }

  function applyLocation(loc, persist = true) {
    let lat = Number(loc.lat), lon = Number(loc.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    lat = Math.max(-90, Math.min(90, lat));
    lon = (((lon + 180) % 360) + 360) % 360 - 180;
    const name = String(loc.name || "").trim() || `${fmtLat(lat)}, ${fmtLon(lon)}`;
    LOC = { name, lat, lon };
    LAT = lat;
    LON = lon;
    monthCache = { key: "", map: new Map() };
    if (persist) {
      try { localStorage.setItem(LOC_KEY, JSON.stringify(LOC)); } catch { /* приватный режим */ }
    }
    updateSiteText();
    renderMoon();
    render();
    return true;
  }

  function updateSiteText() {
    const coords = `${fmtLat(LAT)}, ${fmtLon(LON)}`;
    const info = document.getElementById("site-info");
    if (info) info.innerHTML = `Локация: <b>${esc(LOC.name)}</b> · ${coords}`;
    const foot = document.getElementById("foot-site");
    if (foot) foot.textContent = `${LOC.name} (${coords})`;
  }

  // ---------- снятое ----------
  function shotsFor(o) {
    const alias = (o.alias || "").toLowerCase();
    for (const [target, info] of Object.entries(SHOTS)) {
      if (target.toLowerCase().includes(alias) || alias.includes(target.toLowerCase())) return info;
    }
    return null;
  }

  function shotsLine(info) {
    if (!info) return null;
    const parts = [];
    if (info.light_frames) parts.push(`${info.light_frames} кадров, ${info.light_hours} ч`);
    const fl = Object.entries(info.filters || {}).map(([k, v]) => `${k} ${v.frames}`).join(", ");
    if (fl) parts.push(fl);
    if (info.last_night) parts.push(`последняя ${info.last_night.split("-").reverse().join(".")}`);
    return parts.join(" · ");
  }

  // ---------- UI ----------
  const state = { tab: "now", month: new Date().getMonth() + 1, type: "", filter: "", fill: 0, suited: false, q: "" };

  function fmtAlt(a) {
    const cls = a >= 40 ? "good" : a >= 20 ? "mid" : "bad";
    return `<span class="alt ${cls}">${a >= 0 ? "+" : ""}${a.toFixed(0)}°</span>`;
  }

  function thumb(o) {
    return el("div", { class: "thumb", title: "открыть детали", onclick: () => openDetail(o) },
      el("img", { src: `img/${o.id}.jpg`, alt: o.name, onerror: "this.remove()" }),
      el("div", { class: "ph", html: `${o.type}<br>${o.constellation}` }),
      el("div", { class: "badge", html: `${o.size}′ · ${o.mag}ᵐ` })
    );
  }

  // ---------- схема кадрирования ----------
  const FOV_DEG = 3.19; // поле SV545 (203 мм) + SV605CC, квадратный сенсор

  function frameFill(o) {
    return (o.size / (FOV_DEG * 60)) * 100;
  }

  function fillLabel(o) {
    const v = frameFill(o);
    return v < 1 ? "<1 %" : `${v.toFixed(0)} %`;
  }

  function fovBlock(o) {
    const SIZE = 180, PAD = 10, C = PAD + SIZE / 2;
    const r = Math.max(2, (frameFill(o) / 100) * (SIZE / 2));
    const pct = frameFill(o);
    const step = SIZE / FOV_DEG;
    const grid = [-1, 0, 1].map((d) => {
      const x = (C + d * step).toFixed(1);
      const y = PAD;
      const e = PAD + SIZE;
      return `<line x1="${x}" y1="${y}" x2="${x}" y2="${e}"/>` +
        `<line x1="${PAD}" y1="${x}" x2="${e}" y2="${x}"/>`;
    }).join("");
    const svg = `<svg viewBox="0 0 200 200" width="${SIZE}" height="${SIZE}" role="img" aria-label="Поле зрения">` +
      `<rect class="fov-field" x="${PAD}" y="${PAD}" width="${SIZE}" height="${SIZE}" rx="2"/>` +
      `<g class="fov-grid">${grid}</g>` +
      `<circle class="fov-object" cx="${C}" cy="${C}" r="${r.toFixed(1)}"/>` +
      `<text class="fov-label" x="${C}" y="7" text-anchor="middle">N</text>` +
      `<text class="fov-label" x="7" y="${C + 3}" text-anchor="middle">E</text>` +
      `</svg>`;
    const sizeTxt = String(o.size).replace(".", ",");
    const pctTxt = pct < 1 ? "<1" : pct.toFixed(0);
    return el("div", { class: "fov" },
      el("div", { class: "fov-svg", html: svg }),
      el("div", { class: "meta" }, `поле ${FOV_DEG.toFixed(2).replace(".", ",")}° × ${FOV_DEG.toFixed(2).replace(".", ",")}° (SV545 + SV605CC) · объект ${sizeTxt}′ — ${pctTxt} % кадра`)
    );
  }

  // ---------- детальное окно ----------
  function closeModal() {
    const m = document.getElementById("modal-backdrop");
    if (m) m.remove();
  }

  function openDetail(o) {
    closeModal();
    const now = new Date();
    const { alt, az } = altAz(o.ra, o.dec, now);
    const moon = moonInfo(now);
    const sep = angularSep(o.ra, o.dec, moon.ra, moon.dec);
    const info = shotsFor(o);

    const raH = Math.floor(o.ra / 15);
    const raM = Math.floor(((o.ra / 15) % 1) * 60);
    const raS = Math.round(((((o.ra / 15) % 1) * 60) % 1) * 60);
    const dd = Math.floor(Math.abs(o.dec));
    const dm = Math.floor((Math.abs(o.dec) % 1) * 60);
    const raStr = `${raH}h ${String(raM).padStart(2, "0")}m ${String(raS).padStart(2, "0")}s`;
    const decStr = `${o.dec < 0 ? "−" : "+"}${dd}° ${String(dm).padStart(2, "0")}′`;

    const months = monthsFor(o).map((mm) => {
      const h = Math.max(1, Math.min(100, ((mm.max_alt + 20) / 110) * 100));
      const cls = mm.max_alt >= 60 ? "good" : mm.max_alt >= 30 ? "mid" : "bad";
      return el("div", { class: "mbar", title: `${MONTHS[mm.m - 1]}: ${mm.max_alt}°, ${mm.hours30} ч` },
        el("i", { class: cls, style: `height:${h}%` }),
        el("span", {}, MONTHS[mm.m - 1].slice(0, 1)));
    });

    const inPlan = planStore.has(o.id);
    const planBtn = el("button", {
      class: "tab" + (inPlan ? " active" : ""),
      onclick: (e) => {
        planStore.toggle(o.id);
        e.target.classList.toggle("active");
        e.target.textContent = planStore.has(o.id) ? "в плане ✓" : "+ в план";
      },
    }, inPlan ? "в плане ✓" : "+ в план");

    const statusSel = el("select", { onchange: (e) => store.put(o.id, { status: e.target.value }) });
    for (const s of ["planned", "todo", "done"]) {
      const st = store.one(o.id);
      const op = el("option", { value: s }, { planned: "в плане", todo: "хочу снять", done: "снято" }[s]);
      if (st.status === s) op.selected = true;
      statusSel.append(op);
    }

    const note = el("textarea", { class: "note", rows: "3", placeholder: "заметка: фильтр, выдержка, ссылка на папку…" });
    note.value = store.one(o.id).note || "";
    note.addEventListener("change", (e) => store.put(o.id, { note: e.target.value }));

    const backdrop = el("div", { class: "modal-backdrop", id: "modal-backdrop" });
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });

    const img = el("img", { src: `img/${o.id}.jpg`, alt: o.name, onerror: "this.style.display='none'" });

    const modal = el("div", { class: "modal" },
      el("div", { class: "modal-head" },
        el("div", { class: "name" }, o.name),
        el("span", { class: "pill" }, o.constellation),
        el("span", { class: "pill" }, o.type),
        el("button", { class: "modal-x", onclick: closeModal }, "✕")
      ),
      el("div", { class: "modal-body" },
        el("div", { class: "modal-img" }, img),
        el("div", { class: "modal-info" },
          el("div", { class: "row" },
            el("span", { class: "pill" }, `${o.size}′`),
            el("span", { class: "pill" }, `${o.mag}ᵐ`),
            el("span", { class: "pill" }, `фильтр ${o.filter}`),
            el("span", { class: "pill" }, `сложность ${"★".repeat(o.difficulty)}${"☆".repeat(3 - o.difficulty)}`)
          ),
          el("div", { class: "meta", html: `RA ${raStr} · Dec ${decStr} (J2000)` }),
          el("div", { class: "meta", html: `сейчас: ${fmtAlt(alt)} · азимут ${az.toFixed(0)}° · Луна ${(moon.illum * 100).toFixed(0)}% на ${moon.alt >= 0 ? "+" : ""}${moon.alt.toFixed(0)}°, до объекта ${sep.toFixed(0)}°` }),
          info ? el("div", { class: "meta done", html: "✔ снято: " + shotsLine(info) }) : el("div", { class: "meta" }, "ещё не снималось"),
          el("div", { class: "section-title" }, "Кадрирование"),
          fovBlock(o),
          el("div", { class: "section-title" }, "Видимость по месяцам"),
          el("div", { class: "months" }, ...months),
          el("div", { class: "meta" }, o.note),
          el("div", { class: "row" }, planBtn, statusSel),
          note,
          el("div", { class: "row" },
            el("a", { href: `https://www.legacysurvey.org/viewer?ra=${o.ra.toFixed(3)}&dec=${o.dec.toFixed(3)}&zoom=12`, target: "_blank", rel: "noopener" }, "Aladin/LS"),
            el("a", { href: `https://simbad.u-strasbg.fr/simbad/sim-coo?Coord=${o.ra.toFixed(3)}%20${o.dec.toFixed(3)}`, target: "_blank", rel: "noopener" }, "SIMBAD"),
            el("a", { href: `https://telescopius.com/deep-sky/search?ra=${o.ra.toFixed(3)}&de=${o.dec.toFixed(3)}`, target: "_blank", rel: "noopener" }, "Telescopius")
          )
        )
      )
    );

    backdrop.append(modal);
    document.body.append(backdrop);
  }

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  function card(o, alt, az) {
    const st = store.one(o.id);
    const info = shotsFor(o);
    const moon = moonInfo(new Date());
    const sep = angularSep(o.ra, o.dec, moon.ra, moon.dec);
    const nearMoon = moon.alt > 0 && sep < 45 && moon.illum > 0.4;

    const statusSel = el("select", { onchange: (e) => store.put(o.id, { status: e.target.value }) });
    for (const s of ["planned", "todo", "done"]) {
      const op = el("option", { value: s }, { planned: "в плане", todo: "хочу снять", done: "снято" }[s]);
      if (st.status === s) op.selected = true;
      statusSel.append(op);
    }

    const note = el("textarea", { class: "note", rows: "2", placeholder: "заметка: фильтр, выдержка, ссылка на папку…" });
    note.value = st.note || "";
    note.addEventListener("change", (e) => store.put(o.id, { note: e.target.value }));

    const inPlan = planStore.has(o.id);
    const planBtn = el("button", {
      class: "tab" + (inPlan ? " active" : ""),
      onclick: (e) => {
        planStore.toggle(o.id);
        e.target.classList.toggle("active");
        if (state.tab === "plan") render();
      },
    }, inPlan ? "в плане ✓" : "+ в план");

    return el("article", { class: "card" },
      thumb(o),
      el("div", { class: "body" },
        el("div", { class: "row" }, el("div", { class: "name" }, o.name), el("span", { class: "pill" }, o.constellation)),
        el("div", { class: "meta", html: `${o.type} · ${o.size}′ · ${o.mag}<sup>m</sup> · фильтр <b>${o.filter}</b>` }),
        el("div", { class: "row" },
          el("span", { class: "pill" }, `сложность ${"★".repeat(o.difficulty)}${"☆".repeat(3 - o.difficulty)}`),
          el("span", { class: "pill" }, `${fillLabel(o)} кадра`),
          alt !== null ? el("span", { class: "meta", html: `сейчас ${fmtAlt(alt)} (${az.toFixed(0)}°)` }) : null,
          nearMoon ? el("span", { class: "pill bad-pill" }, "рядом Луна") : null
        ),
        info ? el("div", { class: "meta done", html: "✔ снято: " + shotsLine(info) }) : null,
        el("div", { class: "meta" }, o.note),
        el("div", { class: "row" }, planBtn, statusSel),
        note
      )
    );
  }

  // ---------- виды ----------
  function renderNow() {
    const now = new Date();
    const rows = obj.map((o) => { const { alt, az } = altAz(o.ra, o.dec, now); return { o, alt, az }; })
      .filter((r) => pass(r.o) && r.alt > 25)
      .sort((a, b) => b.alt - a.alt);
    if (!rows.length) return [el("div", { class: "empty", html: "Сейчас выше 25° нет объектов под выбранные фильтры." })];
    return [el("div", { class: "grid" }, ...rows.map((r) => card(r.o, r.alt, r.az)))];
  }

  function pass(o) {
    if (state.suited && !o.suited) return false;
    if (state.type && o.type !== state.type) return false;
    if (state.filter && o.filter !== state.filter) return false;
    if (state.fill && frameFill(o) < state.fill) return false;
    if (state.q) {
      const q = state.q.toLowerCase();
      if (!(o.name + " " + o.constellation + " " + o.type + " " + o.note).toLowerCase().includes(q)) return false;
    }
    return true;
  }

  function renderMonth() {
    const rows = obj.filter(pass).map((o) => {
      const mon = monthsFor(o).find((x) => x.m === state.month);
      return { o, maxAlt: mon.max_alt, hours: mon.hours30 };
    }).filter((r) => r.maxAlt >= 25).sort((a, b) => b.hours - a.hours || b.maxAlt - a.maxAlt);
    if (!rows.length) return [el("div", { class: "empty", html: "В этом месяце ничего не поднимается выше 25°." })];
    return [el("table", {},
      el("thead", {}, el("tr", {}, ...["объект", "тип", "созвездие", "макс. высота", "часов > 30°", "заполнение", "фильтр", "снято"].map((h) => el("th", {}, h)))),
      el("tbody", {}, ...rows.map((r) => {
        const info = shotsFor(r.o);
        return el("tr", {},
          el("td", { html: `<b>${r.o.name}</b>` }),
          el("td", {}, r.o.type),
          el("td", {}, r.o.constellation),
          el("td", { html: fmtAlt(r.maxAlt) }),
          el("td", { class: "hours" }, r.hours.toFixed(1)),
          el("td", { class: "hours" }, fillLabel(r.o)),
          el("td", {}, r.o.filter),
          el("td", { class: "meta" }, info ? `${info.light_frames} кадр.` : "—")
        );
      }))
    )];
  }

  function renderAll() {
    const now = new Date();
    const rows = obj.filter(pass).map((o) => { const { alt, az } = altAz(o.ra, o.dec, now); return { o, alt, az }; })
      .sort((a, b) => b.alt - a.alt);
    return [el("div", { class: "grid" }, ...rows.map((r) => card(r.o, r.alt, r.az)))];
  }

  // ---------- план ночи ----------
  function nightWindow(date) {
    const base = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
    let start = null, end = null;
    for (let m = 0; m < 24 * 60; m += 5) {
      const t = new Date(base.getTime() + m * 60000);
      if (sunAlt(t) < -18) { if (!start) start = t; end = t; }
    }
    return { start, end };
  }

  function objectWindow(o, night) {
    let start = null, end = null, best = -90, bestT = null;
    for (let t = new Date(night.start); t <= night.end; t = new Date(t.getTime() + 5 * 60000)) {
      if (sunAlt(t) >= -18) continue;
      const { alt } = altAz(o.ra, o.dec, t);
      if (alt > 30) { if (!start) start = t; end = t; }
      if (alt > best) { best = alt; bestT = new Date(t); }
    }
    return { start, end, maxAlt: best, bestT };
  }

  function buildSchedule() {
    const night = nightWindow(new Date());
    const ids = planStore.get();
    const items = ids.map((id) => obj.find((o) => o.id === id)).filter(Boolean)
      .map((o) => ({ o, w: objectWindow(o, night) }))
      .filter((x) => x.w.start && x.w.end);
    if (!night.start || !items.length) return { night, items: [], slots: [] };

    const slots = [];
    let cursor = new Date(night.start);
    const total = items.length;
    // поровну, но в пределах окна каждого объекта
    const share = (night.end - night.start) / total;
    for (const it of items) {
      let s = new Date(Math.max(cursor.getTime(), it.w.start.getTime()));
      let e = new Date(Math.min(it.w.end.getTime(), s.getTime() + share));
      if (e <= s) { s = new Date(it.w.start); e = new Date(it.w.end); }
      slots.push({ o: it.o, start: s, end: e, maxAlt: it.w.maxAlt, bestT: it.w.bestT });
      cursor = new Date(e.getTime() + 5 * 60000);
    }
    return { night, items, slots };
  }

  function fmtHM(d) { return d ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "—"; }

  function renderPlan() {
    const { night, slots } = buildSchedule();
    if (!night.start) return [el("div", { class: "empty", html: "Нет данных по сумеркам." })];
    if (!planStore.get().length) {
      return [el("div", { class: "empty", html: "План пуст. Нажмите «+ в план» на карточках объектов." })];
    }
    if (!slots.length) {
      return [el("div", { class: "empty", html: "Выбранные объекты не поднимаются выше 30° в эту ночь." })];
    }

    const rows = slots.map((s) => el("tr", {},
      el("td", { html: `<b>${s.o.name}</b>` }),
      el("td", {}, `${fmtHM(s.start)}–${fmtHM(s.end)}`),
      el("td", { html: fmtAlt(s.maxAlt) }),
      el("td", {}, s.o.filter),
      el("td", {}, ((s.end - s.start) / 3600000).toFixed(1) + " ч")
    ));

    return [
      el("div", { class: "sub", html: `Ночь: тёмное окно <b>${fmtHM(night.start)}–${fmtHM(night.end)}</b>, объектов в плане: ${slots.length}.` }),
      el("table", {},
        el("thead", {}, el("tr", {}, ...["объект", "слот", "макс. высота", "фильтр", "длительность"].map((h) => el("th", {}, h)))),
        el("tbody", {}, ...rows)),
      el("div", { class: "row", style: "margin-top:14px" },
        el("button", { class: "tab active", onclick: () => downloadNina(slots) }, "скачать серию NINA (JSON)"),
        el("button", { class: "tab", onclick: () => { planStore.set([]); render(); } }, "очистить план")
      )
    ];
  }

  // ---------- NINA ----------
  const COL_ITEMS = "System.Collections.ObjectModel.ObservableCollection`1[[NINA.Sequencer.SequenceItem.ISequenceItem, NINA.Sequencer]], System.ObjectModel";
  const COL_COND = "System.Collections.ObjectModel.ObservableCollection`1[[NINA.Sequencer.Conditions.ISequenceCondition, NINA.Sequencer]], System.ObjectModel";
  const COL_TRIG = "System.Collections.ObjectModel.ObservableCollection`1[[NINA.Sequencer.Trigger.ISequenceTrigger, NINA.Sequencer]], System.ObjectModel";
  const STRAT_SEQ = "NINA.Sequencer.Container.ExecutionStrategy.SequentialStrategy, NINA.Sequencer";
  const STRAT_PAR = "NINA.Sequencer.Container.ExecutionStrategy.ParallelStrategy, NINA.Sequencer";

  const FILTER_POS = { "SV260": 0, "LAIDA SII-OIII": 1, "LAIDA Ha-OIII": 2, "UI/IR": 3 };
  const FILTER_EXP = { "SV260": 120, "LAIDA Ha-OIII": 300, "LAIDA SII-OIII": 300, "UI/IR": 60 };
  const FILTER_NAME = { "SV260": "SV260", "Ha-OIII": "LAIDA Ha-OIII", "SII-OIII": "LAIDA SII-OIII", "UV/IR": "UI/IR" };

  function ninaBuild(slots) {
    let c = 0;
    const nid = () => String(++c);
    let tpId = null;
    const timeProvider = () => {
      if (tpId) return { "$ref": tpId };
      tpId = nid();
      return { "$id": tpId, "$type": "NINA.Sequencer.Utility.DateTimeProvider.TimeProvider, NINA.Sequencer" };
    };
    const binning = () => ({ "$id": nid(), "$type": "NINA.Core.Model.Equipment.BinningMode, NINA.Core", X: 1, Y: 1 });
    const filterInfo = (name, pos) => ({
      "$id": nid(), "$type": "NINA.Core.Model.Equipment.FilterInfo, NINA.Core",
      _name: name, _focusOffset: 0, _position: pos, _autoFocusExposureTime: -1.0, _autoFocusFilter: false,
      FlatWizardFilterSettings: {
        "$id": nid(), "$type": "NINA.Core.Model.Equipment.FlatWizardFilterSettings, NINA.Core",
        FlatWizardMode: 0, HistogramMeanTarget: 0.5, HistogramTolerance: 0.1, MaxFlatExposureTime: 30.0,
        MinFlatExposureTime: 0.01, MaxAbsoluteFlatDeviceBrightness: 255, MinAbsoluteFlatDeviceBrightness: 0,
        Gain: -1, Offset: -1, Binning: binning(),
      },
      _autoFocusBinning: binning(), _autoFocusGain: -1, _autoFocusOffset: -1,
    });
    const coords = (o) => ({
      "$id": nid(), "$type": "NINA.Astrometry.InputCoordinates, NINA.Astrometry",
      RAHours: Math.floor(o.ra / 15), RAMinutes: Math.floor((o.ra / 15 % 1) * 60),
      RASeconds: Math.round((((o.ra / 15) % 1) * 60 % 1) * 60 * 100) / 100,
      NegativeDec: o.dec < 0, DecDegrees: Math.floor(Math.abs(o.dec)),
      DecMinutes: Math.floor((Math.abs(o.dec) % 1) * 60),
      DecSeconds: Math.round(((Math.abs(o.dec) * 60) % 1) * 60 * 100) / 100,
    });

    function node(tp, props, opts) {
      const id = nid();
      const d = { "$id": id, "$type": tp, ...props };
      if (opts.strategy) d.Strategy = { "$type": opts.strategy };
      if (opts.name !== undefined) d.Name = opts.name;
      if (opts.conditions) d.Conditions = { "$id": nid(), "$type": COL_COND, "$values": opts.conditions.map((f) => f(id)) };
      if (opts.items) d.Items = { "$id": nid(), "$type": COL_ITEMS, "$values": opts.items.map((f) => f(id)) };
      if (opts.triggers) d.Triggers = { "$id": nid(), "$type": COL_TRIG, "$values": opts.triggers.map((f) => f(id)) };
      if (opts.container) d.IsExpanded = opts.expanded !== false;
      if (!opts.condTrigger) { d.ErrorBehavior = 0; d.Attempts = 1; }
      return d;
    }

    const instr = (tp, props) => () => node(tp, props || {}, { parent: true });
    const takeExp = (exp, filter) => (pid) => node("NINA.Sequencer.SequenceItem.Imaging.TakeExposure, NINA.Sequencer",
      { ExposureTime: exp, Gain: 120, Offset: 20, Binning: binning(), ImageType: "LIGHT", ExposureCount: 0 },
      { parent: pid, name: null });

    // триггеры серии: дитеринг каждые 3 кадра, автофокус по времени и по ΔT
    const triggerRunner = (inner) => node("NINA.Sequencer.Container.SequentialContainer, NINA.Sequencer", {}, {
      strategy: STRAT_SEQ, name: null, parent: false, container: true,
      conditions: [], triggers: [], items: [inner],
    });
    const ditherTrigger = (pid) => node("NINA.Sequencer.Trigger.Guider.DitherAfterExposures, NINA.Sequencer",
      {
        AfterExposures: 3,
        TriggerRunner: triggerRunner(() => node("NINA.Sequencer.SequenceItem.Guider.Dither, NINA.Sequencer", {}, { parent: true })),
      },
      { parent: pid, condTrigger: true });
    const afTimeTrigger = (pid) => node("NINA.Sequencer.Trigger.Autofocus.AutofocusAfterTimeTrigger, NINA.Sequencer",
      {
        Amount: 60.0,
        TriggerRunner: triggerRunner(() => node("NINA.Sequencer.SequenceItem.Autofocus.RunAutofocus, NINA.Sequencer", {}, { parent: true })),
      },
      { parent: pid, condTrigger: true });
    const afTempTrigger = (pid) => node("NINA.Sequencer.Trigger.Autofocus.AutofocusAfterTemperatureChangeTrigger, NINA.Sequencer",
      {
        Amount: 1.0,
        TriggerRunner: triggerRunner(() => node("NINA.Sequencer.SequenceItem.Autofocus.RunAutofocus, NINA.Sequencer", {}, { parent: true })),
      },
      { parent: pid, condTrigger: true });


    const startup = node("NINA.Sequencer.Container.ParallelContainer, NINA.Sequencer", {}, {
      strategy: STRAT_PAR, name: "Startup", parent: true, container: true, conditions: [], triggers: [],
      items: [
        () => node("NINA.Sequencer.SequenceItem.Camera.CoolCamera, NINA.Sequencer", { Temperature: -20.0, Duration: 10.0 }, { parent: true }),
        () => node("NINA.Sequencer.SequenceItem.Telescope.UnparkScope, NINA.Sequencer", {}, { parent: true }),
      ],
    });
    const startArea = node("NINA.Sequencer.Container.StartAreaContainer, NINA.Sequencer", {}, {
      strategy: STRAT_SEQ, name: "Начало", parent: true, container: true, conditions: [], triggers: [], items: [() => startup],
    });

    const targetItems = [];
    for (const s of slots) {
      const o = s.o;
      const fname = FILTER_NAME[o.filter] || "SV260";
      const pos = FILTER_POS[fname] ?? 0;
      const exp = FILTER_EXP[fname] || 120;
      const endH = s.end.getHours(), endM = s.end.getMinutes();

      const series = node("NINA.Sequencer.Container.SequentialContainer, NINA.Sequencer", {}, {
        strategy: STRAT_SEQ, name: `${o.name}: ${fname}, ${exp} s — до ${fmtHM(s.end)}`,
        parent: true, container: true, triggers: [ditherTrigger, afTimeTrigger, afTempTrigger],
        conditions: [(pid) => node("NINA.Sequencer.Conditions.TimeCondition, NINA.Sequencer",
          { Hours: endH, Minutes: endM, MinutesOffset: 0, Seconds: 0, SelectedProvider: timeProvider() },
          { parent: pid, condTrigger: true })],
        items: [takeExp(exp, fname)],
      });

      targetItems.push(() => node("NINA.Sequencer.Container.DeepSkyObjectContainer, NINA.Sequencer", {
        Target: {
          "$id": nid(), "$type": "NINA.Astrometry.InputTarget, NINA.Astrometry",
          Expanded: true, TargetName: o.alias || o.name, PositionAngle: 0.0, InputCoordinates: coords(o),
        },
        ExposureInfoListExpanded: false,
        ExposureInfoList: { "$id": nid(), "$type": "NINA.Core.Utility.AsyncObservableCollection`1[[NINA.Sequencer.Utility.ExposureInfo, NINA.Sequencer]], NINA.Core", "$values": [] },
      }, {
        strategy: STRAT_SEQ, name: o.alias || o.name, parent: true, container: true, conditions: [], triggers: [],
        items: [
          () => node("NINA.Sequencer.SequenceItem.FilterWheel.SwitchFilter, NINA.Sequencer", { Filter: filterInfo(fname, pos) }, { parent: true }),
          () => node("NINA.Sequencer.SequenceItem.Autofocus.RunAutofocus, NINA.Sequencer", {}, { parent: true }),
          () => node("NINA.Sequencer.SequenceItem.Platesolving.Center, NINA.Sequencer", { Inherited: true, Coordinates: coords(o) }, { parent: true }),
          () => node("NINA.Sequencer.SequenceItem.Guider.StartGuiding, NINA.Sequencer", { ForceCalibration: false }, { parent: true }),
          () => series,
        ],
      }));
    }

    // ---------- калибровка ----------
    const FLAT_COUNT = 30;
    const DARK_COUNT = 20;
    const usedFilters = [...new Set(slots.map((s) => FILTER_NAME[s.o.filter] || "SV260"))];
    const usedExps = [...new Set(slots.map((s) => FILTER_EXP[FILTER_NAME[s.o.filter] || "SV260"] || 120))];

    const autoFlat = (fname) => node("NINA.Sequencer.SequenceItem.FlatDevice.AutoExposureFlat, NINA.Sequencer",
      {
        KeepPanelClosed: true, MinExposure: 0.0, MaxExposure: 15.0,
        HistogramTargetPercentage: 0.5, HistogramTolerancePercentage: 0.1,
      },
      {
        name: `Флэты ${fname}`, strategy: STRAT_SEQ, parent: true, container: true, expanded: false,
        conditions: [], triggers: [],
        items: [
          () => node("NINA.Sequencer.SequenceItem.FlatDevice.CloseCover, NINA.Sequencer", {}, { parent: true }),
          () => node("NINA.Sequencer.SequenceItem.FlatDevice.ToggleLight, NINA.Sequencer", { OnOff: true }, { parent: true }),
          () => node("NINA.Sequencer.SequenceItem.FilterWheel.SwitchFilter, NINA.Sequencer",
            { Filter: filterInfo(fname, FILTER_POS[fname] ?? 0) }, { parent: true }),
          () => node("NINA.Sequencer.SequenceItem.FlatDevice.SetBrightness, NINA.Sequencer", { Brightness: 100 }, { parent: true }),
          () => node("NINA.Sequencer.Container.SequentialContainer, NINA.Sequencer", {}, {
            strategy: STRAT_SEQ, name: null, parent: true, container: true, triggers: [],
            conditions: [(pid) => node("NINA.Sequencer.Conditions.LoopCondition, NINA.Sequencer",
              { CompletedIterations: 0, Iterations: FLAT_COUNT }, { parent: pid, condTrigger: true })],
            items: [() => node("NINA.Sequencer.SequenceItem.Imaging.TakeExposure, NINA.Sequencer",
              { ExposureTime: 0.0, Gain: -1, Offset: -1, Binning: binning(), ImageType: "FLAT", ExposureCount: 0 }, { parent: true })],
          }),
          () => node("NINA.Sequencer.SequenceItem.FlatDevice.ToggleLight, NINA.Sequencer", { OnOff: false }, { parent: true }),
          () => node("NINA.Sequencer.SequenceItem.FlatDevice.OpenCover, NINA.Sequencer", {}, { parent: true }),
        ],
      });

    const darkSeries = (exp) => node("NINA.Sequencer.Container.SequentialContainer, NINA.Sequencer", {}, {
      strategy: STRAT_SEQ, name: `Дарки: ${exp} s × ${DARK_COUNT}`, parent: true, container: true, triggers: [],
      conditions: [(pid) => node("NINA.Sequencer.Conditions.LoopCondition, NINA.Sequencer",
        { CompletedIterations: 0, Iterations: DARK_COUNT }, { parent: pid, condTrigger: true })],
      items: [() => node("NINA.Sequencer.SequenceItem.Imaging.TakeExposure, NINA.Sequencer",
        { ExposureTime: exp, Gain: 120, Offset: 20, Binning: binning(), ImageType: "DARK", ExposureCount: 0 }, { parent: true })],
    });

    const calib = node("NINA.Sequencer.Container.SequentialContainer, NINA.Sequencer", {}, {
      strategy: STRAT_SEQ, name: "Калибровка: флэты и дарки", parent: true, container: true, conditions: [], triggers: [],
      items: [
        () => node("NINA.Sequencer.SequenceItem.Guider.StopGuiding, NINA.Sequencer", {}, { parent: true }),
        () => node("NINA.Sequencer.SequenceItem.FlatDevice.CloseCover, NINA.Sequencer", {}, { parent: true }),
        () => node("NINA.Sequencer.SequenceItem.FlatDevice.SetBrightness, NINA.Sequencer", { Brightness: 100 }, { parent: true }),
        ...usedFilters.map((f) => () => autoFlat(f)),
        () => node("NINA.Sequencer.SequenceItem.FlatDevice.ToggleLight, NINA.Sequencer", { OnOff: false }, { parent: true }),
        () => node("NINA.Sequencer.SequenceItem.FlatDevice.SetBrightness, NINA.Sequencer", { Brightness: 0 }, { parent: true }),
        () => node("NINA.Sequencer.SequenceItem.FlatDevice.CloseCover, NINA.Sequencer", {}, { parent: true }),
        ...usedExps.map((e) => () => darkSeries(e)),
      ],
    });

    const targetArea = node("NINA.Sequencer.Container.TargetAreaContainer, NINA.Sequencer", {}, {
      strategy: STRAT_SEQ, name: "Цели", parent: true, container: true, conditions: [], triggers: [],
      items: [...targetItems, () => calib],
    });

    const endArea = node("NINA.Sequencer.Container.EndAreaContainer, NINA.Sequencer", {}, {
      strategy: STRAT_SEQ, name: "Конец", parent: true, container: true, conditions: [], triggers: [],
      items: [
        () => node("NINA.Sequencer.SequenceItem.Guider.StopGuiding, NINA.Sequencer", {}, { parent: true }),
        () => node("NINA.Sequencer.SequenceItem.Telescope.ParkScope, NINA.Sequencer", {}, { parent: true }),
        () => node("NINA.Sequencer.SequenceItem.Camera.WarmCamera, NINA.Sequencer", { Duration: 20.0 }, { parent: true }),
        () => node("NINA.Sequencer.SequenceItem.Connect.DisconnectAllEquipment, NINA.Sequencer", {}, { parent: true }),
      ],
    });

    const root = node("NINA.Sequencer.Container.SequenceRootContainer, NINA.Sequencer", {}, {
      strategy: STRAT_SEQ, name: "План на ночь: " + slots.map((s) => s.o.alias || s.o.name).join(", "),
      parent: false, container: true, conditions: [], triggers: [], items: [() => startArea, () => targetArea, () => endArea],
    });
    root.Parent = null;

    // расставить Parent по фактической вложенности
    (function fixParents(n) {
      for (const key of ["Items", "Conditions", "Triggers"]) {
        const coll = n[key];
        if (coll && Array.isArray(coll["$values"])) {
          for (const ch of coll["$values"]) {
            ch.Parent = { "$ref": n["$id"] };
            fixParents(ch);
          }
        }
      }
      if (n.TriggerRunner) { n.TriggerRunner.Parent = null; fixParents(n.TriggerRunner); }
    })(root);

    return root;
  }

  function downloadNina(slots) {
    const seq = ninaBuild(slots);
    const blob = new Blob([JSON.stringify(seq, null, 2)], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: "План ночи NINA.json" });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- init ----------
  function renderMoon() {
    const m = moonInfo(new Date());
    const pct = Math.round(m.illum * 100);
    const phase = pct > 95 ? "полнолуние" : pct < 5 ? "новолуние" : m.age < 14.7 ? "растёт" : "убывает";
    $("#moon").innerHTML = `Луна: <b>${pct}%</b> (${phase}, ${m.age.toFixed(1)} дн) · высота ${m.alt >= 0 ? "+" : ""}${m.alt.toFixed(0)}° · азимут ${m.az.toFixed(0)}°`;
  }

  function render() {
    const main = $("#view");
    main.innerHTML = "";
    const nodes = state.tab === "now" ? renderNow() : state.tab === "month" ? renderMonth() : state.tab === "plan" ? renderPlan() : renderAll();
    nodes.forEach((n) => main.append(n));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === state.tab));
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(store.get(), null, 2)], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: "astro-status.json" });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJson(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try { const all = JSON.parse(fr.result); if (all && typeof all === "object") { store.set(all); render(); } }
      catch { alert("Не удалось прочитать JSON"); }
    };
    fr.readAsText(file);
  }

  function syncLocationFields() {
    const name = document.getElementById("loc-name");
    const lat = document.getElementById("loc-lat");
    const lon = document.getElementById("loc-lon");
    const preset = document.getElementById("loc-preset");
    if (name) name.value = LOC.name;
    if (lat) lat.value = String(Math.round(LOC.lat * 1000) / 1000);
    if (lon) lon.value = String(Math.round(LOC.lon * 1000) / 1000);
    if (preset) {
      const i = PRESETS.findIndex((p) =>
        Math.abs(p.lat - LOC.lat) < 0.0005 && Math.abs(p.lon - LOC.lon) < 0.0005);
      preset.value = i >= 0 ? String(i) : "custom";
    }
  }

  function initLocationUI() {
    const panel = document.getElementById("loc-panel");
    if (!panel) return;
    const edit = document.getElementById("loc-edit");
    const preset = document.getElementById("loc-preset");
    const name = document.getElementById("loc-name");
    const lat = document.getElementById("loc-lat");
    const lon = document.getElementById("loc-lon");
    const hint = document.getElementById("loc-hint");
    const HINT = hint ? hint.textContent : "";
    let opened = false;

    if (preset) {
      PRESETS.forEach((p, i) => preset.append(
        el("option", { value: String(i) }, `${p.name} — ${fmtLat(p.lat)}, ${fmtLon(p.lon)}`)));
      preset.append(el("option", { value: "custom" }, "другая точка"));
    }
    syncLocationFields();

    const show = () => { opened = true; panel.classList.remove("hidden"); syncLocationFields(); };
    const hide = () => { opened = false; panel.classList.add("hidden"); };

    if (edit) edit.addEventListener("click", () => { if (opened) hide(); else show(); });

    const closeBtn = document.getElementById("loc-close");
    if (closeBtn) closeBtn.addEventListener("click", hide);

    if (preset) preset.addEventListener("change", () => {
      if (preset.value === "custom") return;
      const p = PRESETS[Number(preset.value)];
      if (!p) return;
      if (name) name.value = p.name;
      if (lat) lat.value = String(p.lat);
      if (lon) lon.value = String(p.lon);
      if (hint) hint.textContent = HINT;
    });

    const apply = () => {
      const la = parseFloat(String(lat ? lat.value : "").replace(",", "."));
      const lo = parseFloat(String(lon ? lon.value : "").replace(",", "."));
      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        if (hint) hint.textContent = "Введите широту и долготу числами — например, 55,8 и 38,2.";
        return;
      }
      if (applyLocation({ name: name ? name.value : "", lat: la, lon: lo })) {
        if (hint) hint.textContent = HINT;
        syncLocationFields();
        hide();
      }
    };

    const applyBtn = document.getElementById("loc-apply");
    if (applyBtn) applyBtn.addEventListener("click", apply);
    const resetBtn = document.getElementById("loc-reset");
    if (resetBtn) resetBtn.addEventListener("click", () => {
      applyLocation({ ...DEFAULT_LOCATION });
      syncLocationFields();
      if (hint) hint.textContent = HINT;
    });

    for (const inp of [name, lat, lon]) {
      if (inp) inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } });
    }
  }

  const gate = document.getElementById("gate");
  const gateForm = document.getElementById("gate-form");
  const gatePass = document.getElementById("gate-pass");
  const gateErr = document.getElementById("gate-err");
  const AUTH_KEY = "astro-auth";
  const PASSWORD = "AstroBanda@2026";

  function unlock() {
    if (gate) gate.classList.add("hidden");
    updateSiteText();
    renderMoon();
    render();
  }

  if (sessionStorage.getItem(AUTH_KEY) === "ok") {
    unlock();
  } else if (gate) {
    gate.classList.remove("hidden");
  }

  if (gateForm) {
    gateForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (gatePass.value === PASSWORD) {
        sessionStorage.setItem(AUTH_KEY, "ok");
        unlock();
      } else {
        if (gateErr) gateErr.textContent = "Неверный пароль";
        gatePass.value = "";
      }
    });
  }

  $("#month").value = state.month;

  document.querySelectorAll(".tab[data-tab]").forEach((t) => t.addEventListener("click", () => { state.tab = t.dataset.tab; render(); }));
  $("#month").addEventListener("change", (e) => { state.month = +e.target.value; render(); });
  $("#type").addEventListener("change", (e) => { state.type = e.target.value; render(); });
  $("#filter").addEventListener("change", (e) => { state.filter = e.target.value; render(); });
  $("#fill").addEventListener("change", (e) => { state.fill = +e.target.value; render(); });
  $("#suited").addEventListener("change", (e) => { state.suited = e.target.checked; render(); });
  $("#q").addEventListener("input", (e) => { state.q = e.target.value; render(); });
  $("#export").addEventListener("click", exportJson);
  $("#import").addEventListener("change", (e) => e.target.files[0] && importJson(e.target.files[0]));

  setInterval(() => { renderMoon(); if (state.tab === "now") render(); }, 60000);

  initLocationUI();

  window.__astro = {
    ninaBuild, moonInfo, sunAlt, nightWindow, objectWindow, planStore, openDetail,
    applyLocation, monthsFor, frameFill, getLocation: () => ({ ...LOC }),
  };
})();
