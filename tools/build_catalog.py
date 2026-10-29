# -*- coding: utf-8 -*-
"""Каталог объектов для съёмок: расчёт видимости для 55.8N / 38.2E и генерация data/catalog.js."""
import json
import math
import datetime as dt
import os

LAT, LON = 55.8, 38.2166667
SITE = "55.8N, 38.2E (Москва/Подмосковье)"

# id, имя, созвездие, тип, RA (deg), Dec (deg), размер (arcmin), mag, рекомендуемый фильтр, сложность (1-3), заметка
OBJECTS = [
    ("m31", "M 31 Андромеда", "And", "галактика", 10.68, 41.27, 178, 3.4, "UV/IR", 1, "Крупная спираль, нужен широкий кадр"),
    ("m33", "M 33 Треугольник", "Tri", "галактика", 23.46, 30.66, 62, 5.7, "UV/IR", 2, "Низкая поверхностная яркость"),
    ("m42", "M 42 Орион", "Ori", "эмиссионная", 83.82, -5.39, 85, 4.0, "Ha-OIII", 1, "Зимой низко, ядро пересвечивается"),
    ("m45", "M 45 Плеяды", "Tau", "рассеянное", 56.85, 24.12, 110, 1.6, "UV/IR", 1, "Длинные лучи, поле 3.2° влезает"),
    ("m13", "M 13 Геркулес", "Her", "шаровое", 250.42, 36.46, 20, 5.8, "UV/IR", 1, "Лучше короткими выдержками"),
    ("m51", "M 51 Водоворот", "CVn", "галактика", 202.47, 47.20, 11, 8.4, "SV260", 2, "Взаимодействующая пара"),
    ("m81", "M 81 Боде", "UMa", "галактика", 148.88, 69.07, 26, 6.9, "SV260", 1, "Вместе с M82 в одном поле"),
    ("m82", "M 82 Сигара", "UMa", "галактика", 148.96, 69.68, 11, 8.4, "SV260", 1, "Яркие пылевые выбросы"),
    ("m101", "M 101 Цевочное", "UMa", "галактика", 210.80, 54.35, 28, 7.9, "SV260", 2, "Крупная, низкий контраст"),
    ("m57", "M 57 Кольцо", "Lyr", "планетарная", 283.40, 33.03, 1.4, 8.8, "UV/IR", 2, "Мелкая, нужен кроп"),
    ("m27", "M 27 Гантель", "Vul", "планетарная", 299.90, 22.72, 8, 7.4, "Ha-OIII", 1, "Яркая, хорошо идёт в OIII"),
    ("ngc7000", "NGC 7000 Северная Америка", "Cyg", "эмиссионная", 314.75, 44.33, 120, 4.0, "Ha-OIII", 1, "В поле 3.2° почти вся"),
    ("ic5070", "IC 5070 Пеликан", "Cyg", "эмиссионная", 312.70, 44.36, 60, 8.0, "Ha-OIII", 1, "Рядом с NGC 7000"),
    ("ngc6960", "NGC 6960 Вуаль (Метла)", "Cyg", "остаток сверхновой", 311.41, 30.71, 70, 7.0, "Ha-OIII", 1, "Длинная дуга, Ha/OIII"),
    ("ngc6992", "NGC 6992 Вуаль (восток)", "Cyg", "остаток сверхновой", 314.01, 31.72, 60, 7.0, "Ha-OIII", 1, "Вторая дуга Вуали"),
    ("ngc6888", "NGC 6888 Полумесяц", "Cyg", "эмиссионная", 303.00, 38.35, 18, 10.0, "Ha-OIII", 2, "Ha-оболочка, OIII слабее"),
    ("ic1396", "IC 1396 Хобот", "Cep", "эмиссионная", 324.75, 57.50, 170, 3.5, "Ha-OIII", 1, "Уже снят: Ha-OIII, SII-OIII"),
    ("ngc7023", "NGC 7023 Ирис", "Cep", "отражательная", 315.40, 68.17, 10, 6.8, "SV260", 1, "Пылевая отражательная"),
    ("sh2155", "Sh2-155 Пещера", "Cep", "эмиссионная", 344.19, 62.62, 50, 7.7, "Ha-OIII", 2, "Слабая Ha-структура"),
    ("ngc7635", "NGC 7635 Пузырь", "Cas", "эмиссионная", 350.20, 61.20, 15, 10.0, "Ha-OIII", 2, "Пузырь вокруг SAO 20575"),
    ("ngc281", "NGC 281 Пакман", "Cas", "эмиссионная", 13.19, 56.63, 35, 7.0, "Ha-OIII", 1, "Снят 20.10, Ha и SV260"),
    ("ic1805", "IC 1805 Сердце", "Cas", "эмиссионная", 38.18, 61.45, 60, 6.5, "Ha-OIII", 1, "С IC 1848 в одном поле"),
    ("ic1848", "IC 1848 Душа", "Cas", "эмиссионная", 36.50, 60.43, 60, 6.5, "Ha-OIII", 1, "Пара к Сердцу"),
    ("ngc1499", "NGC 1499 Калифорния", "Per", "эмиссионная", 60.80, 36.37, 145, 6.0, "Ha-OIII", 1, "Огромная, влезает в поле"),
    ("ngc1491", "NGC 1491 Пещера", "Per", "эмиссионная", 60.75, 51.30, 3, 10.5, "Ha-OIII", 2, "Редкий объект, мелкая"),
    ("ngc869", "NGC 869/884 Хи-Аш", "Per", "рассеянное", 34.75, 57.15, 18, 4.0, "UV/IR", 1, "Двойное скопление"),
    ("ngc891", "NGC 891 Веретено", "And", "галактика", 35.57, 42.35, 13.5, 10.8, "SV260", 1, "Edge-on с пылевой полосой"),
    ("ngc7331", "NGC 7331", "Peg", "галактика", 339.27, 34.42, 10, 9.5, "SV260", 2, "С группой «Блохи»"),
    ("steph", "Stephan's Quintet", "Peg", "группа галактик", 338.99, 33.96, 4, 13.5, "SV260", 3, "Компактная группа, вызов"),
    ("ngc6946", "NGC 6946 Фейерверк", "Cep", "галактика", 308.72, 60.15, 11, 9.0, "SV260", 2, "Много сверхновых"),
    ("ic342", "IC 342 Скрытая", "Cam", "галактика", 56.70, 68.10, 21, 9.0, "SV260", 2, "За пылью Млечного Пути"),
    ("ngc2403", "NGC 2403", "Cam", "галактика", 114.21, 65.60, 18, 8.5, "SV260", 1, "Крупная спираль"),
    ("ngc6543", "NGC 6543 Кошачий глаз", "Dra", "планетарная", 269.65, 66.63, 0.4, 8.1, "UV/IR", 2, "Мелкая, яркая"),
    ("ngc7662", "NGC 7662 Голубой снежок", "And", "планетарная", 351.48, 42.54, 0.5, 8.3, "UV/IR", 2, "Мелкая планетарная"),
    ("arp273", "Arp 273 Роза", "And", "взаимодействующие", 35.37, 39.37, 1.5, 13.5, "SV260", 3, "Две галактики, вызов"),
    ("ic434", "IC 434 Конская голова", "Ori", "эмиссионная", 85.25, -2.46, 60, 7.0, "Ha-OIII", 2, "Низко, зимой"),
    ("ngc2024", "NGC 2024 Пламя", "Ori", "эмиссионная", 85.28, -1.85, 30, 8.0, "Ha-OIII", 1, "Рядом с Конской головой"),
    ("ngc2237", "NGC 2237 Розетка", "Mon", "эмиссионная", 98.00, 4.95, 80, 6.0, "Ha-OIII", 1, "Крупная Ha-структура"),
    ("ngc2264", "NGC 2264 Ёлка", "Mon", "эмиссионная", 100.25, 9.90, 20, 3.9, "Ha-OIII", 1, "Скопление + туманность"),
    ("ngc4565", "NGC 4565 Игла", "Com", "галактика", 189.10, 25.99, 16, 9.6, "SV260", 1, "Edge-on"),
]


ALIASES = {
    "m31": "M 31", "m33": "M 33", "m42": "M 42", "m45": "M 45", "m13": "M 13",
    "m51": "M 51", "m81": "M 81", "m82": "M 82", "m101": "M 101", "m57": "M 57", "m27": "M 27",
    "ngc7000": "NGC 7000", "ic5070": "IC 5070", "ngc6960": "NGC 6960", "ngc6992": "NGC 6992",
    "ngc6888": "NGC 6888", "ic1396": "IC 1396", "ngc7023": "NGC 7023", "sh2155": "Sh2-155",
    "ngc7635": "NGC 7635", "ngc281": "NGC 281", "ic1805": "IC 1805", "ic1848": "IC 1848",
    "ngc1499": "NGC 1499", "ngc1491": "NGC 1491", "ngc869": "NGC 869", "ngc891": "NGC 891",
    "ngc7331": "NGC 7331", "steph": "Stephan", "ngc6946": "NGC 6946", "ic342": "IC 342",
    "ngc2403": "NGC 2403", "ngc6543": "NGC 6543", "ngc7662": "NGC 7662", "arp273": "Arp 273",
    "ic434": "IC 434", "ngc2024": "NGC 2024", "ngc2237": "NGC 2237", "ngc2264": "NGC 2264",
    "ngc4565": "NGC 4565",
}


def julian(d):
    y, m = d.year, d.month
    day = d.day + (d.hour + d.minute / 60 + d.second / 3600) / 24
    if m <= 2:
        y -= 1
        m += 12
    a = int(y / 100)
    b = 2 - a + int(a / 4)
    return int(365.25 * (y + 4716)) + int(30.6001 * (m + 1)) + day + b - 1524.5


def sun_pos(d):
    n = julian(d) - 2451545.0
    L = (280.460 + 0.9856474 * n) % 360
    g = math.radians((357.528 + 0.9856003 * n) % 360)
    lam = math.radians((L + 1.915 * math.sin(g) + 0.020 * math.sin(2 * g)) % 360)
    eps = math.radians(23.439 - 0.0000004 * n)
    ra = math.atan2(math.cos(eps) * math.sin(lam), math.cos(lam))
    dec = math.asin(math.sin(eps) * math.sin(lam))
    return math.degrees(dec), math.degrees(ra), (L - math.degrees(ra)) / 15.0


def lst_deg(d):
    j = julian(d)
    T = (j - 2451545.0) / 36525.0
    g = (280.46061837 + 360.98564736629 * (j - 2451545.0) + 0.000387933 * T * T - T * T * T / 38710000) % 360
    return (g + LON) % 360


def altitude(ra_deg, dec_deg, d):
    lst = lst_deg(d)
    H = math.radians(lst - ra_deg)
    p = math.radians(LAT)
    dd = math.radians(dec_deg)
    return math.degrees(math.asin(math.sin(p) * math.sin(dd) + math.cos(p) * math.cos(dd) * math.cos(H)))


def sun_alt(d):
    dec, ra, _ = sun_pos(d)
    return altitude(ra, dec, d)


def month_window(ra, dec, year, month):
    """Максимальная высота в астрономическую ночь и число тёмных часов, когда объект >30°."""
    best = -90.0
    hours = 0.0
    day = dt.datetime(year, month, 15)
    for minute in range(0, 24 * 60, 10):
        d = day + dt.timedelta(minutes=minute)
        sa = sun_alt(d)
        if sa > -18.0:
            continue
        alt = altitude(ra, dec, d)
        if alt > best:
            best = alt
        if alt > 30.0:
            hours += 10 / 60.0
    return best, hours


def build():
    months_ru = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
    out = []
    for (oid, name, con, typ, ra, dec, size, mag, filt, diff, note) in OBJECTS:
        per_month = []
        for m in range(1, 13):
            alt, hours = month_window(ra, dec, 2026, m)
            per_month.append({"m": m, "max_alt": round(alt, 1), "hours30": round(hours, 1)})
        best_months = [p["m"] for p in per_month if p["max_alt"] >= 25]
        suited = size <= 190 and mag <= 13.0
        out.append({
            "id": oid, "name": name, "constellation": con, "type": typ,
            "ra": ra, "dec": dec, "size": size, "mag": mag,
            "filter": filt, "difficulty": diff, "note": note,
            "alias": ALIASES.get(oid, name),
            "suited": suited, "best_months": best_months,
            "months": per_month,
        })
    data = {
        "site": SITE, "lat": LAT, "lon": LON,
        "generated": dt.datetime.now().isoformat(timespec="seconds"),
        "months_ru": months_ru,
        "objects": out,
    }
    return data


def main():
    data = build()
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base, "data")
    os.makedirs(data_dir, exist_ok=True)
    with open(os.path.join(data_dir, "catalog.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    with open(os.path.join(data_dir, "catalog.js"), "w", encoding="utf-8") as f:
        f.write("window.CATALOG = ")
        json.dump(data, f, ensure_ascii=False)
        f.write(";\n")
    print("objects:", len(data["objects"]),
          "| JSON:", os.path.getsize(os.path.join(data_dir, "catalog.json")), "bytes")


if __name__ == "__main__":
    main()
