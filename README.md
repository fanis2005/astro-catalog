# Каталог объектов для съёмок (SV545 / SV605CC)

Статический сайт: каталог 40 объектов, видимость для 55.8N, Луна, план ночи и экспорт серии NINA.

## Локальный запуск
Открыть `index.html` в браузере (file:// работает, данные подключены как JS).

## Пароль

Сайт закрыт паролем: **AstroBanda@2026**

Проверка выполняется в браузере (JS), пароль хранится в `sessionStorage` после ввода.
Это защита «от случайных посетителей», а не криптографическая: исходник `app.js` доступен,
и технически подкованный человек может её обойти. Для настоящей защиты нужен серверный вариант:
Cloudflare Access (бесплатно до 50 пользователей) или пароль-защита Netlify Pro.

## Публикация

### Вариант 1 — Netlify Drop (без git, 2 минуты)
1. Открыть https://app.netlify.com/drop
2. Перетащить `astro-site.zip` (или папку `site` целиком).
3. Получить адрес вида https://<random>.netlify.app.
   Пароль уже встроен в страницу — дополнительных настроек не нужно.

### Вариант 2 — GitHub Pages
```bash
cd site
git init
git add .
git commit -m "astro catalog"
# создать репозиторий на github.com, затем:
git remote add origin https://github.com/<user>/astro-catalog.git
git push -u origin master
```
Затем: Settings → Pages → Branch `master`, папка `/ (root)`.
Адрес: https://<user>.github.io/astro-catalog/
GitHub Pages не умеет пароль — остаётся встроенный в страницу.

### Вариант 3 — Cloudflare Pages
Pages → Create project → Direct upload → перетащить папку `site`.
Для настоящего пароля: Zero Trust → Access → Application → добавить домен Pages, политика «bypass» с паролем/OTP.

## Обновление данных
```bash
python tools/build_catalog.py   # каталог и видимость
python tools/scan_shots.py      # что уже снято (папки Телескоп\Снимки с телескопа)
```
После этого — закоммитить `data/catalog.js` и `data/shots.js` и обновить хостинг.

## Источники превью
Изображения объектов — Wikipedia/Wikimedia Commons (свободные лицензии), часть — собственные снимки.
