# SIGAA-ME Release Guide

Use these commands to version the app, generate changelogs, and trigger the GitHub Actions build workflow.

## 🚀 Stable Releases
Use these when you are moving from a beta to a finished version, or bumping a stable version.

| Command | Result (from 1.1.0) | Description |
| :--- | :--- | :--- |
| `npm run release:patch` | `1.1.1` | Bug fixes and minor tweaks. |
| `npm run release:minor` | `1.2.0` | New features (like the Notification system). |
| `npm run release:major` | `2.0.0` | Breaking changes or massive UI overhauls. |

---

## 🧪 Beta Releases
Use these for testing new features before the official launch.

| Command | Result (from 1.1.0) | Description |
| :--- | :--- | :--- |
| `npm run release:patch:beta` | `1.1.1-beta.0` | Start/Bump a beta for a patch fix. |
| `npm run release:minor:beta` | `1.2.0-beta.0` | Start/Bump a beta for a new feature. |
| `npm run release:major:beta` | `2.0.0-beta.0` | Start/Bump a beta for a major version. |
| `npm run release:beta` | `1.2.0-beta.1` | Increments the existing beta (e.g. .0 -> .1). |

---

## 🛠️ How it works
1. **Automatic Versioning**: It updates `package.json`.
2. **Changelog**: It automatically appends to `CHANGELOG.md`.
3. **Git Tagging**: It creates a tag (e.g., `v1.2.0-beta.0`).
4. **Trigger**: The command automatically pushes to GitHub, which starts the **GitHub Actions** build.

> [!TIP]
> Always make sure your working directory is clean (`git status`) before running a release command!
