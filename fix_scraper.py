import re

# Read the file
with open('electron/services/http-scraper.service.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Add opening if before the itemMenu.each line
content = content.replace(
    "            $('.itemMenu').each((_, el) => {",
    "            // Skip navigation if using Playwright HTML (already navigated)\n            if (!preFetchedHtml) {\n            $('.itemMenu').each((_, el) => {"
)

# Add closing before the $files = cheerio.load line
content = content.replace(
    "            const $files = cheerio.load(filesPageData);",
    "            } else {\n                this.log('[HttpScraper] Using Playwright HTML directly.');\n            }\n\n            const $files = cheerio.load(filesPageData);"
)

# Write back
with open('electron/services/http-scraper.service.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ Fix applied!')
