import re

# Read the file
with open('electron/services/playwright-login.service.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# We need to replace the entire block we added previously
# The block starts with: // Click on "Conteúdo" link to load files section
# And ends with: // Get HTML and Cookies

start_marker = '            // Click on "Conteúdo" link to load files section'
end_marker = '            // Get HTML and Cookies'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    new_logic = """            // Click on "Conteúdo" link to load files section
            console.log('Playwright: Attempting to click "Conteúdo" link using native locator...');
            
            try {
                // Wait for the menu to be visible
                await page.waitForSelector('.itemMenu', { timeout: 5000 });
                
                // Find the link containing "Conteúdo"
                // We use a broad locator and filter by text to be safe
                const conteudoLink = page.locator('.itemMenu').filter({ hasText: 'Conteúdo' }).first();
                
                if (await conteudoLink.isVisible()) {
                    console.log('Playwright: Found "Conteúdo" link, clicking...');
                    await conteudoLink.click();
                    
                    // Wait for navigation/reload
                    // JSF usually reloads the page or updates a large part of it
                    await page.waitForLoadState('networkidle');
                    await page.waitForTimeout(2000); // Extra safety wait for JSF
                    
                    console.log('Playwright: Click processed, current URL:', page.url());
                } else {
                    console.log('Playwright: "Conteúdo" link not visible');
                }
            } catch (e) {
                console.error('Playwright: Error clicking Conteúdo:', e);
            }
"""
    
    # Replace the old block
    content = content[:start_idx] + new_logic + "\n" + content[end_idx:]
    
    # Write back
    with open('electron/services/playwright-login.service.ts', 'w', encoding='utf-8') as f:
        f.write(content)
    
    print('✅ Playwright navigation logic updated!')
else:
    print('❌ Could not find the code block to replace.')
