# Лендинг + приём заявок в Telegram

Статический лендинг (`landing.html`) с формой заявки, которая отправляет данные на небольшой Node.js-сервер (`server/`), а тот пересылает их в Telegram через бота.

## Структура репозитория

```
.
├── landing.html        # сам сайт (один самодостаточный HTML-файл)
├── server/
│   ├── server.js        # API-сервер, принимает заявки и шлёт их в Telegram
│   ├── package.json
│   └── .env.example     # пример переменных окружения
└── README.md
```

## Как это работает

1. Посетитель заполняет форму на сайте и жмёт "Отправить".
2. Браузер отправляет `POST` на `/api/lead` (у себя же на домене).
3. Nginx проксирует этот путь на Node.js-сервер (`localhost:3000`).
4. Сервер проверяет данные и отправляет сообщение в Telegram через Bot API, используя токен из `.env` — токен никогда не попадает в код страницы и не виден в браузере.

---

## 1. Создать Telegram-бота

1. Напиши [@BotFather](https://t.me/BotFather) в Telegram, отправь `/newbot`, задай имя и username.
2. Скопируй токен вида `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.
3. Напиши созданному боту любое сообщение (иначе он не будет знать, куда отвечать).
4. Открой в браузере:
   ```
   https://api.telegram.org/bot<ТВОЙ_ТОКЕН>/getUpdates
   ```
   В ответе найди `"chat":{"id": ... }` — это твой `chat_id`.

---

## 2. Подготовить сервер (VPS)

Предполагается чистый Ubuntu/Debian сервер.

```bash
ssh root@IP_сервера
sudo apt update && sudo apt upgrade -y
```

### Установить Nginx

```bash
sudo apt install nginx -y
```

### Установить Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # должно быть v20.x
```

> Если на сервере уже был старый Node.js (например v12 из репозиториев Ubuntu), установка может упасть с конфликтом из-за пакета `libnode-dev`. В этом случае сначала удали старое:
> ```bash
> sudo apt remove --purge -y nodejs libnode-dev libnode72
> sudo apt autoremove -y
> sudo apt update
> sudo apt install -y nodejs
> ```

### Установить pm2 (чтобы сервер работал в фоне и поднимался после перезагрузки)

```bash
sudo npm install -g pm2
```

---

## 3. Разместить сайт

```bash
sudo mkdir -p /var/www/plrtp.ru
```

Скопируй `landing.html` на сервер под именем `index.html`:

```bash
scp landing.html root@IP_сервера:/var/www/plrtp.ru/index.html
```

Рядом положи `og.png` — это картинка, которую соцсети и мессенджеры
показывают в карточке при репосте ссылки. Она единственный внешний файл:
всё остальное (стили, шрифтовые вызовы, фотография) лежит внутри html.

```bash
scp og.png root@IP_сервера:/var/www/plrtp.ru/og.png
```

Проверить карточку после выкладки: https://t.me/WebpageBot — отправь ему
ссылку, он покажет, что увидят в Telegram, и сбросит свой кэш.

---

## 4. Развернуть API-сервер

```bash
sudo mkdir -p /opt/lead-server
```

Скопируй туда `server/server.js` и `server/package.json`:

```bash
scp server/server.js server/package.json root@IP_сервера:/opt/lead-server/
```

На сервере создай `.env` (по образцу `server/.env.example`):

```bash
cd /opt/lead-server
nano .env
```

```env
BOT_TOKEN=<токен бота из шага 1>
CHAT_ID=<chat_id из шага 1>
ALLOWED_ORIGIN=https://plrtp.ru
PORT=3000
```

Установи зависимости и запусти через pm2:

```bash
npm install
pm2 start server.js --name lead-server
pm2 save
pm2 startup   # выполни команду, которую pm2 выведет в ответ
```

Полезные команды:

```bash
pm2 logs lead-server     # логи сервера
pm2 restart lead-server  # перезапуск после изменений
```

---

## 5. Настроить Nginx

Создай `/etc/nginx/sites-available/plrtp.ru`:

```nginx
server {
    server_name plrtp.ru www.plrtp.ru;
    root /var/www/plrtp.ru;
    index index.html;

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ =404;
    }

    listen 80;
}
```

> Важно: `proxy_pass http://localhost:3000;` — без пути и без слэша на конце. Так Nginx передаёт на сервер полный путь запроса (`/api/lead`), который и ожидает Express-роут. Слэш на конце (`http://localhost:3000/`) обрежет префикс `/api/`, и запрос до сервера не дойдёт.

Активируй конфиг:

```bash
sudo ln -s /etc/nginx/sites-available/plrtp.ru /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## 6. Получить HTTPS

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d plrtp.ru -d www.plrtp.ru
```

Certbot сам допишет в конфиг блок для 443 порта и подключит сертификаты.

---

## 7. Обновить адрес API в лендинге

В `landing.html` найди строку:

```js
var LEAD_API_URL = 'https://plrtp.ru/api/lead';
```

Убедись, что домен совпадает с тем, что настроен в Nginx. Если меняешь домен — поменяй и здесь.

---

## 8. Проверить

```bash
curl https://plrtp.ru/api/lead -X POST \
  -H "Content-Type: application/json" \
  -d '{"name":"Тест","contact":"@test"}'
```

Если в ответе `{"ok":true}` и в Telegram пришло сообщение — всё работает. Дальше можно открывать сайт в браузере и пробовать форму вживую.

---

## Устранение неполадок

| Симптом | Причина | Решение |
|---|---|---|
| `Cannot GET /api/lead` при открытии ссылки в браузере | Это нормально — GET-запрос на маршрут, который принимает только POST | Проверяй через `curl -X POST`, а не через открытие ссылки |
| `{"ok":false,"error":"Failed to reach Telegram"}` + в логах `fetch is not defined` | Node.js старше 18 версии, глобального `fetch` нет | Обнови Node до 20 LTS (см. раздел 2) |
| 404 при обращении к `/api/lead` через основной домен | Домен в запросе не совпадает с `server_name` в Nginx, либо `location /api/` не добавлен в нужный server-блок | Проверь, что `location /api/` есть именно в блоке с `listen 443 ssl` для нужного домена |
| Ошибка `dpkg: trying to overwrite '.../common.gypi'` при установке Node.js | Конфликт со старым пакетом `libnode-dev` | `sudo apt remove --purge -y nodejs libnode-dev libnode72 && sudo apt autoremove -y && sudo apt install -y nodejs` |
| Форма не отправляется, в консоли браузера ошибка CORS | `ALLOWED_ORIGIN` в `.env` не совпадает с доменом сайта | Пропиши точный домен сайта (с `https://`) в `ALLOWED_ORIGIN` и перезапусти сервер |

## Безопасность

- `.env` никогда не должен попадать в git — он уже добавлен в `.gitignore`.
- Если токен бота случайно "утёк" (например, засветился в коде на клиенте) — просто получи новый через `/token` у [@BotFather](https://t.me/BotFather), старый сразу перестанет работать.
