# КолледжПортал

## Запуск локально

```bash
npm install
node server.js
```

Откроется на http://localhost:3000

Тестовые аккаунты:
- admin / admin — Администратор
- teacher1 / pass — Преподаватель
- student1 / pass — Студент

## Деплой на Render.com

1. Загрузи эти файлы (server.js, package.json, папку public) в репозиторий на GitHub
   - НЕ загружай: node_modules, database.db, package-lock.json (необязательно)

2. На render.com:
   - New → Web Service
   - Подключи репозиторий
   - Environment: Node
   - Build Command: npm install
   - Start Command: node server.js
   - Instance Type: Free
   - Create Web Service

3. Дождись деплоя, получишь ссылку вида:
   https://college-portal-xxxx.onrender.com

Готово — сайт работает постоянно (бесплатный план "засыпает"
после 15 минут без запросов, первый заход после простоя
грузится дольше).
