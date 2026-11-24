# Сценарій демонстрації (3 хв 55 с)

Перед початком: запустіть локальний стек і Vite, увійдіть як агроном, відкрийте грядку А. У другому PowerShell підготуйте команди. За потреби опублікуйте 45% для нормального початкового стану. Не очищайте робочу БД через `down -v`.

| Час | Дія | Що кажу | Резервний матеріал |
| --- | --- | --- | --- |
| 0:00–0:35 | React: грядка А, 4 картки, графік | Дані з MQTT зберігаються у SQLite | [Дашборд ПР6](img/dashboard.png), [E2E](img/dashboard-e2e.png) |
| 0:35–1:15 | Надіслати 45%, потім 24% через mosquitto_pub | Подія змінює картку без reload, поріг 30% | [Схема потоку](img/flow.png), знімок ПР6; записати live-фрагмент перед захистом |
| 1:15–1:55 | Змінити поріг агрономом на 35%, показати повідомлення про аудит | PUT має рольове обмеження | [Результат перевірок ПР6](img/pr6-1.png) |
| 1:55–2:35 | Виконати PUT з JWT viewer, показати 403 | Сервер перевіряє роль, а не лише кнопку | [Результат тестів ПР6](img/pr6-1.png), збережений вивід після репетиції |
| 2:35–3:10 | Health і `docker compose ps` | SQLite та MQTT — up | [Health ПР8](img/pr8-2.png), [production С8](img/sr8-2.png) |
| 3:10–3:55 | Actions, показники ПР8, docs-CI після push | 71/71, CI і GHCR; docs-CI перевіряє Markdown/OpenAPI | [CI С8](img/sr8-1.png), [тести ПР8](img/pr8-3.png); додати скриншот С9 після push |

## Команди PowerShell

```powershell
'{"metric":"soil_moisture","value":45}' | docker compose exec -T mqtt mosquitto_pub -q 1 -t greenhouse/bed-a/telemetry -s
'{"metric":"soil_moisture","value":24}' | docker compose exec -T mqtt mosquitto_pub -q 1 -t greenhouse/bed-a/telemetry -s
```

Вхід viewer та перевірка заборони (лише демо-обліковий запис):

```powershell
$v = Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/v1/auth/login -ContentType 'application/json' -Body (@{username='viewer1';password='View#2026'} | ConvertTo-Json)
try {
  Invoke-RestMethod -Method Put -Uri http://localhost:4000/api/v1/devices/bed-a/threshold -Headers @{Authorization="Bearer $($v.accessToken)"} -ContentType 'application/json' -Body (@{metric='soil_moisture';value=40} | ConvertTo-Json)
} catch { Write-Host "HTTP $([int]$_.Exception.Response.StatusCode)" }
Invoke-RestMethod http://localhost:4000/api/v1/health
docker compose ps
```

Мобільні матеріали ПР5 показувати як попередній етап; не заявляти про live-запуск Flutter із поточним JWT або FCM push. Історія фактичних поливів не реалізована.

## Репетиції

| Спроба | Фактичний час | Проблема / правка |
| --- | --- | --- |
| 1 | заповнити після виконання | заповнити |
| 2 | заповнити після виконання | заповнити |

Доповідь: до 10 хв (демо ≤ 4 хв), питання — до 5 хв. Фактичні репетиції не проведено в межах підготовки файлів.
