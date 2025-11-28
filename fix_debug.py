import re

# Read the file
with open('electron/services/http-scraper.service.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the debug saving logic to use 'fs' directly
content = content.replace(
    "require('fs').writeFileSync('debug_playwright.html', preFetchedHtml);",
    "fs.writeFileSync('debug_playwright.html', preFetchedHtml);"
)

# Write back
with open('electron/services/http-scraper.service.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ Debug logging fixed!')
