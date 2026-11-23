
# Greenhouse API

Навчальний проєкт для роботи з даними IoT-системи моніторингу теплиці.

Серверна частина реалізована на Node.js та Express. Для збереження даних використовується SQLite, а для обміну повідомленнями з пристроями — MQTT (Eclipse Mosquitto).

Проєкт підтримує запуск у Docker. Для автоматичної перевірки та публікації Docker-образу налаштовано GitHub Actions.

## Використані технології

- Node.js
- Express
- SQLite
- MQTT (Eclipse Mosquitto)
- Docker та Docker Compose
- GitHub Actions
- GitHub Container Registry (GHCR)

## Підготовка до запуску

Для локального запуску потрібні Git та Docker Desktop.

Спочатку необхідно клонувати репозиторій:

```bash
git clone https://github.com/eugeniuskorbilo/greenhouse-api.git
cd greenhouse-api
```

У кореневій папці потрібно створити файл `.env` на основі `.env.example` та задати власне значення `JWT_SECRET`.

Приклад для PowerShell:

```powershell
Copy-Item .env.example .env
```

Значення `JWT_SECRET` необхідно замінити на власний секретний рядок. Файл `.env` не додається до репозиторію.

## Локальний запуск через Docker

Для складання образу та запуску контейнерів використовується команда:

```bash
docker compose up -d --build
```

Після запуску мають працювати два сервіси:

- `api` — сервер застосунку на порту 4000;
- `mqtt` — MQTT-брокер Eclipse Mosquitto.

Дані SQLite зберігаються в окремому Docker volume, тому звичайна зупинка контейнерів не призводить до їх видалення.

Переглянути стан контейнерів можна командою:

```bash
docker compose ps
```

Для зупинки:

```bash
docker compose down
```

## Запуск готового образу з GHCR

Окрім локального складання, передбачено запуск production-конфігурації з готовим Docker-образом.

Образ доступний за адресою:

`ghcr.io/eugeniuskorbilo/greenhouse-api:latest`

Для запуску використовується команда:

```bash
docker compose -f compose.prod.yml -p greenhouse-prod up -d
```

У цьому випадку Docker завантажує готовий образ із GitHub Container Registry. Повторне локальне складання API не потрібне.

Production-конфігурація містить автоматичний перезапуск контейнерів, окремий volume для SQLite та внутрішнє MQTT-з'єднання між сервісами.

Перед запуском потрібно налаштувати `.env`. Якщо локальна версія вже працює, її слід зупинити, щоб уникнути конфлікту порту 4000.

Для перевірки стану контейнерів:

```bash
docker compose -f compose.prod.yml -p greenhouse-prod ps
```

Для зупинки:

```bash
docker compose -f compose.prod.yml -p greenhouse-prod down
```

## Перевірка роботи API

Після запуску сервер доступний за адресою:

`http://localhost:4000`

Для перевірки працездатності використовується endpoint:

`GET /api/v1/health`

У PowerShell запит можна виконати так:

```powershell
Invoke-RestMethod http://localhost:4000/api/v1/health
```

У відповіді відображається стан API, бази SQLite та MQTT-з'єднання.

Під час перевірки production-версії отримано такі значення:

```text
ok     sqlite    mqtt
True   up        up
```

Це підтверджує, що сервер запущений і має доступ до бази даних та MQTT-брокера.

## CI/CD

Для автоматизації перевірок використовується GitHub Actions.

Конфігурація workflow розташована у файлі:

`.github/workflows/tests.yml`

Під час виконання workflow проводяться:

1. Перевірка проєкту на Node.js 24.
2. Перевірка проєкту на Node.js 26.
3. Збирання Docker-образу.
4. Публікація образу в GHCR після успішного завершення попередніх етапів.

Для публікації використовується `GITHUB_TOKEN`, який надається GitHub Actions.

Результати запусків можна переглянути у вкладці Actions репозиторію.

## Структура Docker-конфігурації

`Dockerfile` — інструкції для збирання образу API.

`compose.yaml` — локальний запуск API та MQTT.

`compose.prod.yml` — запуск із готового образу GHCR.

`mosquitto.conf` — налаштування MQTT-брокера.

`.env.example` — приклад змінних середовища.

`.github/workflows/tests.yml` — автоматизовані перевірки та публікація образу.

## Примітки

Для локального та production-запуску використовуються окремі Docker Compose-проєкти. Через це їхні Docker volumes не є спільними.

Видалення контейнерів командою `docker compose down` не видаляє збережені дані. Для видалення volumes необхідно окремо використовувати параметр `-v`.

Секретні значення, зокрема `JWT_SECRET`, не повинні зберігатися безпосередньо у файлах Compose або в Git-репозиторії.
