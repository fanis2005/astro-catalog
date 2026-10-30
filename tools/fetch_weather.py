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
        try:
            n = night_avg(fetch(lat, lon))
            if n:
                out["locations"].append({"name": name, "lat": lat, "lon": lon, **n})
                print("ok", name)
            else:
                print("empty", name)
        except Exception as e:
            print("skip", name, type(e).__name__, str(e)[:120])

    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(base, "data", "weather.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("locations:", len(out["locations"]), "->", path)


if __name__ == "__main__":
    main()
