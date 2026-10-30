# -*- coding: utf-8 -*-
"""Ночной прогноз Open-Meteo для локаций каталога -> data/weather.json.

Запускается GitHub Actions раз в час; сайт читает готовый JSON с того же домена,
поэтому погода не зависит от CORS и доступности Open-Meteo из браузера.
"""
import datetime as dt
import json
import os
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

TZ = "Europe/Moscow"
LOCATIONS = [
    ("Москва/Подмосковье", 55.8, 38.2167),
    ("Москва (центр)", 55.7558, 37.6173),
    ("Санкт-Петербург", 59.9343, 30.3351),
    ("Нижний Новгород", 56.3269, 44.0059),
    ("Крым (Симеиз)", 44.4, 34.0),
    ("Сочи", 43.5855, 39.7231),
]
FIELDS = [
    "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high",
    "relative_humidity_2m", "dew_point_2m", "temperature_2m",
    "visibility", "wind_speed_10m", "wind_speed_120m",
]


def fetch(lat, lon):
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join(FIELDS),
        "timezone": TZ,
        "forecast_days": 2,
    }
    url = "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read().decode())


def fetch_7timer(lat, lon):
    params = {
        "lon": lon,
        "lat": lat,
        "ac": 0,
        "unit": "metric",
        "output": "json",
        "tzshift": 0,
    }
    url = "https://www.7timer.info/bin/astro.php?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read().decode())


def night_scores_7timer(j):
    """Средние seeing/transparency (1 — отлично, 8 — плохо) на ближайшую ночь."""
    try:
        init = dt.datetime.strptime(j.get("init", ""), "%Y%m%d%H").replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return None
    now = dt.datetime.now(dt.timezone.utc)
    start = now.replace(hour=15, minute=0, second=0, microsecond=0)
    if now.hour < 3:
        start -= dt.timedelta(days=1)
    end = start + dt.timedelta(hours=12)
    pts = []
    for d in j.get("dataseries", []):
        try:
            t = init + dt.timedelta(hours=int(d.get("timepoint", 0)))
        except (TypeError, ValueError):
            continue
        if start <= t <= end:
            pts.append(d)
    if not pts:
        return None

    def avg(key):
        vals = [p[key] for p in pts if isinstance(p.get(key), (int, float))]
        return round(sum(vals) / len(vals), 2) if vals else None

    return {"seeing": avg("seeing"), "transparency": avg("transparency"), "cloud_7timer": avg("cloudcover")}



def night_avg(j):
    h = j.get("hourly", {})
    times = h.get("time", [])
    now = dt.datetime.now(ZoneInfo(TZ)).replace(tzinfo=None)
    start = now.replace(hour=18, minute=0, second=0, microsecond=0)
    if now.hour < 6:
        start -= dt.timedelta(days=1)
    end = start + dt.timedelta(hours=12)
    idx = []
    for i, t in enumerate(times):
        try:
            d = dt.datetime.fromisoformat(t)
        except ValueError:
            continue
        if start <= d <= end:
            idx.append(i)
    if not idx:
        return None

    def avg(key):
        arr = h.get(key) or []
        vals = [arr[i] for i in idx if i < len(arr) and arr[i] is not None]
        return round(sum(vals) / len(vals), 2) if vals else None

    return {k: avg(k) for k in FIELDS}


def main():
    out = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "timezone": TZ,
        "locations": [],
    }
    for name, lat, lon in LOCATIONS:
        entry = None
        try:
            n = night_avg(fetch(lat, lon))
            if n:
                entry = {"name": name, "lat": lat, "lon": lon, **n}
        except Exception as e:
            print("open-meteo skip", name, type(e).__name__, str(e)[:100])
        try:
            s = night_scores_7timer(fetch_7timer(lat, lon))
            if s:
                if entry is None:
                    entry = {"name": name, "lat": lat, "lon": lon}
                entry.update(s)
        except Exception as e:
            print("7timer skip", name, type(e).__name__, str(e)[:100])
        if entry:
            if entry.get("cloud_cover") is None and entry.get("cloud_7timer") is not None:
                entry["cloud_cover"] = round((entry["cloud_7timer"] - 1) / 8 * 100, 1)
            out["locations"].append(entry)
            print("ok", name, "seeing", entry.get("seeing"), "transparency", entry.get("transparency"))
        else:
            print("empty", name)

    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(base, "data", "weather.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("locations:", len(out["locations"]), "->", path)


if __name__ == "__main__":
    main()
