# QR Code Generator (Frontend + Backend)

Мини‑проект «Генератор QR‑кодов» с превью на фронтенде и серверной генерацией (PNG с логотипом) на бэкенде.

## Содержание
- [Функционал](#функционал)
- [Стек](#стек)
- [Структура проекта](#структура-проекта)
- [Быстрый старт](#быстрый-старт)
- [API](#api)
- [Где хранится история](#где-хранится-история)
- [Проверка и отладка](#проверка-и-отладка)
- [Деплой (кратко)](#деплой-кратко)
- [Технические детали](#технические-детали)
- [Roadmap](#roadmap)
- [Лицензия](#лицензия)

---

## Функционал
- Ввод текста/URL → превью QR на странице.
- Настройки: цвет, размер, фон, формат (PNG/SVG).
- Логотип в центре QR (через загрузку файла).  
  - На фронтенде — превью.
  - На бэкенде — качественная склейка PNG с использованием `sharp`.
- Скачивание PNG/SVG.
- История генераций:
  - На фронтенде: LocalStorage (мини‑превью + кнопки «Повторить/Удалить/Скачать»).
  - На бэкенде: SQLite (параметры и дата, без хранения изображений).

## Стек
- **Frontend:** статическая страница `index.html`, библиотека [`qr-code-styling`](https://github.com/kozakdenys/qr-code-styling).
- **Backend:** Node.js 18+, Express, `qrcode`, `sharp`, `better-sqlite3`.
- **DB:** SQLite (файл `qr-history.db`).

## Структура проекта
```
qr-generator/
├─ index.html          # фронтенд (работает локально из файла)
└─ api/
   ├─ server.js        # сервер Express (POST /generate, GET /history)
   ├─ package.json
   └─ qr-history.db    # создаётся автоматически при первом запуске
```

> При необходимости можно вынести фронтенд в отдельный SPA (Vite/React) — текущая версия минимальная и автономная.

## Быстрый старт

### 1) Запуск бэкенда
```bash
cd api
npm install
npm start   # или: node server.js
```
Ожидаемый вывод: `API listening on http://localhost:5174`

### 2) Запуск фронтенда
Откройте `index.html` двойным кликом в браузере.  
Фронт будет рендерить превью локально, а при нажатии **Скачать** попытается обратиться к API (если запущен).

> Альтернатива: запустить локальный статический сервер (например, расширение VS Code **Live Server**, `npx serve`, `python -m http.server` и т.п.)

## API

### `POST /generate`
Собирает QR и возвращает Data URL (PNG/SVG). Для PNG возможно наложение логотипа.

**Тело запроса (JSON):**
```json
{
  "text": "https://example.com",
  "color": "#111111",
  "size": 300,
  "format": "png",          // "png" | "svg"
  "bg": "transparent",      // "transparent" | "#ffffff"
  "logoDataUrl": "data:image/png;base64,..."  // опционально (только для PNG на бэке)
}
```

**Ответ:**
```json
{ "dataUrl": "data:image/png;base64,..." }
```

Примеры:
```bash
# PNG без логотипа
curl -X POST http://localhost:5174/generate   -H "Content-Type: application/json"   -d '{"text":"Hello","color":"#000000","size":300,"format":"png","bg":"transparent"}'

# PNG с логотипом (dataURL вашим изображением)
curl -X POST http://localhost:5174/generate   -H "Content-Type: application/json"   -d '{"text":"Weekend","color":"#000000","size":300,"format":"png","bg":"#ffffff","logoDataUrl":"data:image/png;base64,...."}'

# SVG (логотип не вставляется на бэке)
curl -X POST http://localhost:5174/generate   -H "Content-Type: application/json"   -d '{"text":"Hello","format":"svg"}'
```

### `GET /history`
Возвращает последние 50 записей истории (параметры + дата). Изображения на сервере не хранятся.
```bash
curl http://localhost:5174/history
```

> (Опционально можно добавить `DELETE /history` для очистки — см. раздел «Проверка и отладка».)

## Где хранится история
- **Фронтенд:** LocalStorage браузера под ключом `qr_history_v1` (локально у пользователя).
- **Бэкенд:** база **SQLite** `api/qr-history.db`, таблица `history`:
  - `id, text, color, size, bg, format, with_logo, created_at`.

## Проверка и отладка

### Открыть историю сервера в SQLite
- GUI: [DB Browser for SQLite](https://sqlitebrowser.org/) → открыть файл `api/qr-history.db` → таблица `history`.
- CLI:
  ```bash
  cd api
  sqlite3 qr-history.db
  .tables
  .schema history
  SELECT * FROM history ORDER BY id DESC LIMIT 10;
  .quit
  ```

### Очистить историю сервера
- CLI:
  ```bash
  cd api
  sqlite3 qr-history.db "DELETE FROM history;"
  ```
- (Опционально) добавить endpoint в `server.js`:
  ```js
  app.delete("/history", (req, res) => {
    db.prepare("DELETE FROM history").run();
    res.json({ ok: true });
  });
  ```

### Типичные проблемы
- **`sharp` не ставится/ругается на бинарники**: установите инструменты сборки:
  - Windows: «Desktop development with C++» (Visual Studio Build Tools), перезапустите установку.
  - macOS: `xcode-select --install`.
  - Linux: `apt-get install -y build-essential python3 make gcc g++` (дистрибутив-зависимо).
- **CORS** в продакшене: ограничьте `cors()` конкретным доменом, если API/фронт разнесены по разным хостам.
- **Большие логотипы**: библиотека автоматически ресайзит до ~25% стороны QR, но лучше загружать квадратные PNG/JPG до ~500×500.

## Деплой (кратко)
- **Фронтенд:** статический хостинг (Netlify, Vercel, GitHub Pages). Достаточно загрузить `index.html` и ассеты.
- **Бэкенд:** Render, Railway, Fly.io или VPS (Docker / PM2).  
  - Откройте порт (по умолчанию `5174`) и укажите его в `API_URL` на фронтенде.
  - Позаботьтесь о лимитах тела запроса (у нас `express.json({ limit: "10mb" })`).

## Технические детали
- Превью QR на фронтенде: `qr-code-styling` (мгновенно, офлайн).
- Серверная генерация:
  - `qrcode` → PNG/SVG.
  - `sharp` → компоновка логотипа (PNG) с мягкой белой подложкой для контраста.
- Валидация размеров: 128…1024 px с «clamp».
- Уровень коррекции ошибок: **H** (устойчивее к логотипам).
- Безопасность: сервер не хранит изображений, лишь параметры истории.

## Лицензия
MIT — используйте и модифицируйте свободно.
