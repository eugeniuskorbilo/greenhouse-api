# Інвентаризація документації

Порівняння наданого ZIP з пакетом С9; стан Git віддаленого репозиторію не перевірено.

| Артефакт | Шлях | До С9 | Підготовлено |
| --- | --- | --- | --- |
| README | README.md | є, без вебстарту | актуалізовано |
| Конфігурація | .env.example, .gitignore | є | доповнено приклад; ignore вже є |
| Діаграми | docs/architecture/ | немає; ПР1 містить текстові місця | DOT, MMD, PNG |
| OpenAPI | docs/openapi.yaml | немає у ZIP | 10 операцій |
| ADR | docs/adr/ | немає | 3 записи |
| Матриця | docs/TRACEABILITY.md | немає | 4 сценарії ПР1 |
| Пояснювальна записка | docs/report/ | немає | Markdown та DOCX |
| CHANGELOG | CHANGELOG.md | немає | підготовлено 1.0.0 |
| CI документації | .github/workflows/docs.yml | немає | підготовлено, потрібен push |
| Демонстрація | docs/DEMO.md | немає | сценарій і резерв |
| Презентація | docs/presentation.pptx | немає | підготовлено |

Перед комітом: `git status --short`, `git ls-files README.md CHANGELOG.md docs/`. Не додавати `.env`, `telemetry.db`, токени, ключі Firebase, кеші або старі копії серверного коду. Тег `v1.0.0` створити після зеленого docs-CI. Час двох репетицій заповнити фактичними результатами.
