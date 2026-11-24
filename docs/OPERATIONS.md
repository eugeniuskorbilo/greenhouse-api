# Розгортання та експлуатація

## Локальний запуск вручну

У корені репозиторію виконайте `Copy-Item .env.example .env` лише якщо `.env` ще немає. Відредагуйте секрет на випадковий рядок із щонайменше 32 символів. Команди:

```powershell
docker compose up -d --build
docker compose ps
Invoke-RestMethod http://localhost:4000/api/v1/health
docker compose exec -T api node seed-users.js
docker compose exec -T api mkdir -p /app/scripts
docker compose cp scripts/seed_dashboard.js api:/app/scripts/seed_dashboard.js
docker compose exec -T api node scripts/seed_dashboard.js
npm --prefix client ci
npm --prefix client run dev
```

`seed-users.js` створює навчальні облікові записи; `seed_dashboard.js` заповнює відсутні серії. На вже наповненій БД генератор пропускає наявні серії. Для актуальних показників опублікуйте MQTT-дані.

В іншому терміналі (без запуску генератора на хості):

```powershell
docker compose exec -T mqtt mosquitto_pub -q 1 -t greenhouse/bed-a/telemetry -m '{"metric":"soil_moisture","value":24}'
```

У Windows PowerShell 5.1 аргумент JSON для native-команди може потребувати екранування. Надійний варіант — передати JSON через stdin:

```powershell
'{"metric":"soil_moisture","value":24}' | docker compose exec -T mqtt mosquitto_pub -q 1 -t greenhouse/bed-a/telemetry -s
```

## Production (готовий образ)

Зупиніть локальний стек перед використанням порту 4000. Підготуйте `.env` зі своїм секретом.

```powershell
docker compose down
docker compose -f compose.prod.yml -p greenhouse-prod pull
docker compose -f compose.prod.yml -p greenhouse-prod up -d
Invoke-RestMethod http://localhost:4000/api/v1/health
```

Образ: `ghcr.io/eugeniuskorbilo/greenhouse-api:latest`. На чистому production-томі користувачів потрібно створити окремо (демо — `docker compose -f compose.prod.yml -p greenhouse-prod exec -T api node seed-users.js`). Не використовуйте демо-паролі для зовнішнього доступу. MQTT-порт не опубліковано на хості, тому демонстраційна публікація — через `exec mqtt`. Вебклієнт, як і локально, запускається окремо.

## Операційні перевірки

| Симптом | Дія |
| --- | --- |
| Health 503, MQTT down | `docker compose logs mqtt api`, перевірити MQTT_URL |
| SQLite down | Перевірити volume, права й місце на диску |
| 401 | Повторний вхід; перевірити access token |
| 403 | Перевірити роль, а не вимикати JWT |
| Немає графіка | Перевірити грядку, час і надіслати MQTT-повідомлення |
| Порт зайнятий | `docker compose ps`; зупинити інший стек |

`GET /metrics` повертає `greenhouse_subscribers N`. Це число підключених Socket.IO-клієнтів, а не кількість унікальних користувачів чи датчиків. `docker compose down` залишає volume; `down -v` видаляє дані. Для зупинки Vite — Ctrl+C у відповідному терміналі.

## Безпека середовища

Не публікуйте HTTP або анонімний MQTT у зовнішній мережі. Поточний брокер дозволяє anonymous, TLS і ACL не налаштовані. Для реального впровадження потрібні TLS, MQTT ACL, індивідуальні облікові записи, резервні копії SQLite та керування секретами. Не комітьте `.env`, БД, service account keys або реальні токени.
