import re

# Read the file
with open('electron/services/http-scraper.service.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Update the debug saving logic to use unique filenames
# Find the line: fs.writeFileSync('debug_playwright.html', preFetchedHtml);
# Replace with: fs.writeFileSync(`debug_playwright_${courseId}.html`, preFetchedHtml);

content = content.replace(
    "fs.writeFileSync('debug_playwright.html', preFetchedHtml);",
    "fs.writeFileSync(`debug_playwright_${courseId}.html`, preFetchedHtml);"
)

# Write back
with open('electron/services/http-scraper.service.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ Unique debug logging added!')
