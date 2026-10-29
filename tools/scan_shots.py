# -*- coding: utf-8 -*-
"""Сканирует папки съёмок и генерирует data/shots.js и data/shots.json.

Структура: <корень>\SV545_<ЦЕЛЬ>[_фильтр]\LIGHT\*.fits
Имя файла: 2026-10-20_21-15-01_SV260_-20.10_90.00s_0000.fits
"""
import json
import os
import re
from collections import defaultdict

ROOTS = [
    r"C:\Users\fanis\Documents\Телескоп\Снимки с телескопа",
    r"C:\Users\fanis\Documents\N.I.N.A",
]

NAME_RE = re.compile(
    r"^(?P<date>\d{4}-\d{2}-\d{2})_(?P<time>\d{2}-\d{2}-\d{2})_(?P<filter>.+?)_(?P<temp>-?\d+\.\d+)_(?P<exp>\d+(?:\.\d+)?)s_(?P<nr>\d+)\.fits?$"
)


def target_from_dir(name):
    name = name.replace("SV545_", "", 1)
    for cut in ("_LAIDA", "_SV260", "_Ha", "_SII"):
        if cut in name:
            name = name.split(cut)[0]
    return name.strip()


def scan():
    targets = defaultdict(lambda: {"light": {"count": 0, "seconds": 0.0, "filters": {}, "last": ""},
                                   "flat": {"count": 0, "filters": {}},
                                   "dark": {"count": 0, "seconds": 0.0},
                                   "bias": {"count": 0}})
    for root in ROOTS:
        if not os.path.isdir(root):
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            base = os.path.basename(dirpath).upper()
            if base not in ("LIGHT", "FLAT", "DARK", "BIAS"):
                continue
            # цель — папка уровнем выше (или ещё выше, если между ними слой)
            parent = os.path.basename(os.path.dirname(dirpath))
            target = target_from_dir(parent)
            kind = {"LIGHT": "light", "FLAT": "flat", "DARK": "dark", "BIAS": "bias"}[base]
            for fn in filenames:
                m = NAME_RE.match(fn)
                if not m:
                    continue
                exp = float(m.group("exp"))
                filt = m.group("filter").strip()
                date = m.group("date")
                t = targets[target][kind]
                t["count"] += 1
                if kind in ("light", "dark"):
                    t["seconds"] += exp
                if kind == "light":
                    f = t["filters"].setdefault(filt, {"count": 0, "seconds": 0.0, "last": ""})
                    f["count"] += 1
                    f["seconds"] += exp
                    f["last"] = max(f["last"], date)
                    t["last"] = max(t["last"], date)
                elif kind == "flat":
                    f = t["filters"].setdefault(filt, {"count": 0, "seconds": 0.0, "last": ""})
                    f["count"] += 1
    out = {}
    for name, t in sorted(targets.items()):
        light = t["light"]
        out[name] = {
            "light_frames": light["count"],
            "light_hours": round(light["seconds"] / 3600.0, 2),
            "filters": {k: {"frames": v["count"], "hours": round(v["seconds"] / 3600.0, 2), "last": v["last"]}
                        for k, v in sorted(light["filters"].items())},
            "last_night": light["last"],
            "flat_frames": t["flat"]["count"],
            "dark_frames": t["dark"]["count"],
            "dark_hours": round(t["dark"]["seconds"] / 3600.0, 2),
            "bias_frames": t["bias"]["count"],
        }
    return out


def main():
    data = scan()
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(base, "data")
    os.makedirs(data_dir, exist_ok=True)
    with open(os.path.join(data_dir, "shots.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    with open(os.path.join(data_dir, "shots.js"), "w", encoding="utf-8") as f:
        f.write("window.SHOTS = ")
        json.dump(data, f, ensure_ascii=False)
        f.write(";\n")
    total = sum(v["light_frames"] for v in data.values())
    hours = sum(v["light_hours"] for v in data.values())
    print("целей:", len(data), "| кадров LIGHT:", total, "| часов:", round(hours, 1))
    for k, v in data.items():
        print(f"  {k:20s} {v['light_frames']:4d} кадров, {v['light_hours']:5.1f} ч, "
              f"фильтры: {', '.join(f'{fk} ({fv['frames']})' for fk, fv in v['filters'].items())}")


if __name__ == "__main__":
    main()
