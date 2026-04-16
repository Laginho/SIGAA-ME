# SIGAA-ME

Aplicativo desktop para o SIGAA da UFC, que visa proporcionar uma experiência melhor do que o site oficial em funcionalidades específicas e amigáveis para o estudante.

![Electron](https://img.shields.io/badge/Electron-30-47848F?logo=electron)
![TypeScript](https://img.shields.io/badge/TypeScript-5.2-3178C6?logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ O que ele faz

- Faz login no SIGAA usando suas credenciais da UFC (armazenadas com segurança)
- Sincroniza suas disciplinas ativas, arquivos e notícias
- Armazena tudo localmente para **leitura offline**
- Baixa arquivos em lote, automaticamente
- Mantém uma sessão persistente para que você não precise fazer login toda vez

---

## 📥 Instalação

> **Requisito:** Ter o [Google Chrome](https://www.google.com/chrome/) instalado na sua máquina.

1. Vá para a página de [**Releases**](https://github.com/Laginho/SIGAA-ME/releases).
2. Baixe o arquivo mais recente `SIGAA-ME-Windows-X.X.X-Setup.exe`.
3. Execute o instalador.
4. Se o Windows mostrar o aviso "O Windows protegeu seu computador", clique em **"Mais informações"** → **"Executar assim mesmo"**. Isso é normal para apps que ainda não possuem um certificado pago.
5. O app abrirá. Insira suas credenciais do SIGAA UFC e pronto.

> O app irá **se atualizar automaticamente** em segundo plano quando uma nova versão for lançada.

---

## 📸 Prints

![Sync](docs/images/sync_menu.png)
![Dashboard](docs/images/dashboard.png)
![Course](docs/images/course.png)

---

## ⚠️ Limitações Conhecidas

- Atualmente funciona apenas com a instância do SIGAA da UFC (`si3.ufc.br`)
- A sincronização inicial é lenta, pois precisa imitar um usuário real navegando no site
- Alguns arquivos podem falhar no download se a sessão do SIGAA expirar durante a sincronização

---

## 🛠️ Rodando Localmente (Para Desenvolvedores)

**Pré-requisitos:** Node.js, npm, Google Chrome

```bash
git clone https://github.com/Laginho/SIGAA-ME.git
cd SIGAA-ME
npm install
npm run dev
```

### Rodando os Testes

```bash
# Apenas testes unitários (sem credenciais, roda em ~1s)
npx vitest run tests/unit

# Todos os testes, incluindo integração real com o SIGAA (requer .env)
cp .env.example .env   # depois preencha suas credenciais
npm test
```

---

## 🏗️ Tecnologias Utilizadas

| Camada | Tecnologia |
|---|---|
| UI | Vanilla TypeScript + Vite |
| Backend | Electron (Node.js) |
| Scraping | Playwright (Chrome) + Axios |
| Armazenamento | SQLite + localStorage |
| Build | electron-builder |
| CI/CD | GitHub Actions |

Veja o [ARCHITECTURE.md](ARCHITECTURE.md) para um detalhamento da abordagem híbrida Playwright/HTTP.

---

## 🗺️ Roadmap

Veja o [ROADMAP.md](ROADMAP.md).

---

## 🐛 Encontrou um bug?

Abra uma [issue](https://github.com/Laginho/SIGAA-ME/issues) descrevendo o que aconteceu, o que você esperava e (se possível) um print.

---

## 📄 Licença

MIT — veja [LICENSE](LICENSE).
