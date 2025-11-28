import re

# Read the file
with open('electron/services/http-scraper.service.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Add debug saving logic
content = content.replace(
    "            if (!preFetchedHtml) {",
    "            // DEBUG: Save Playwright HTML\n            if (preFetchedHtml) {\n                try { require('fs').writeFileSync('debug_playwright.html', preFetchedHtml); this.log('[HttpScraper] Saved Playwright HTML to debug_playwright.html'); } catch (e) { this.log('[HttpScraper] Failed to save debug file'); }\n            }\n            if (!preFetchedHtml) {"
)

# Write back
with open('electron/services/http-scraper.service.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ Debug logging added!')
