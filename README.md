# Каталог объектов для съёмок (SV545 / SV605CC)

Статический сайт: каталог 40 объектов, видимость для 55.8N, Луна, план ночи и экспорт серии NINA.

## Локальный запуск
Открыть `index.html` в браузере (file:// работает, данные подключены как JS).

## Публикация

### Вариант 1 — Netlify Drop (без git, 2 минуты)
1. Открыть https://app.netlify.com/drop
2. Перетащить папку `site` целиком.
3. Получить адрес вида https://<random>.netlify.app (для постоянного адреса нужен бесплатный аккаунт).

### Вариант 2 — GitHub Pages
```bash
cd site
git init
git add .
git commit -m "astro catalog"
gh repo create astro-catalog --public --source=. --push   # или создать репозиторий вручную
```
Затем: Settings → Pages → Branch `main`, папка `/ (root)`.
Адрес: https://<user>.github.io/astro-catalog/

### Вариант 3 — Cloudflare Pages
Pages → Create project → Direct upload → перетащить папку `site`.

## Обновление данных
```bash
python tools/build_catalog.py   # каталог и видимость
python tools/scan_shots.py      # что уже снято (папки Телескоп\Снимки с телескопа)
```
После этого — закоммитить `data/catalog.js` и `data/shots.js`.

## Источники превью
Изображения объектов — Wikipedia/Wikimedia Commons (свободные лицензии), часть — собственные снимки.
