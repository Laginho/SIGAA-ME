# SIGAA-ME

Desktop app for UFC's SIGAA, which aims to provide a better experience than the official website on specific, student-friendly, functionalities.

![Electron](https://img.shields.io/badge/Electron-30-47848F?logo=electron)
![TypeScript](https://img.shields.io/badge/TypeScript-5.2-3178C6?logo=typescript)

## What it does

- Logs into SIGAA and syncs your courses
- Caches everything for offline reading
- Displays files and news, which can be downloaded automatically
- Remembers your credentials (securely) and keeps a persistent session

## Screenshots

![Sync](docs/images/sync_menu.png)
![Dashboard](docs/images/dashboard.png)
![Course](docs/images/course.png)

## Dependencies

- Node.js
- npm
- Electron
- Playwright

## Running locally

Having the dependencies installed, you just need to clone the repository and run

```bash
npm install
npm run dev
```

## Tech used

- **Frontend:** Vanilla TypeScript + Vite
- **Backend:** Electron + Playwright (for scraping SIGAA's JSF nightmare)
- **See:** [ARCHITECTURE.md](ARCHITECTURE.md) for the Playwright/HTTP hybrid approach

## Known Limitations

- Currently only works with UFC's SIGAA instance (`si3.ufc.br`)
- It's slow, because it has to mimic a real user at times
- Some files may fail to download if SIGAA's session expires mid-sync

## License

MIT
