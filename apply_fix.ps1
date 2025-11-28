$file = "electron\services\playwright-login.service.ts"
$content = Get-Content $file -Raw

# The code to insert
$codeToInsert = @"

            // Click on "Conteúdo" link to load files section
            console.log('Playwright: Attempting to click "Conteúdo" link...');
            const conteudoClicked = await page.evaluate(() => {
                // Strategy 1: Look for sidebar link
                const itemMenus = Array.from(document.querySelectorAll('.itemMenu'));
                for (const item of itemMenus) {
                    const text = item.textContent || '';
                    if (text.includes('Conte') || text.includes('nteúdo')) {
                        const link = item.closest('a') as HTMLElement;
                        if (link) {
                            link.click();
                            return true;
                        }
                    }
                }
                
                // Strategy 2: Look under Materiais header
                const materiaisHeader = document.querySelector('.itemMenuHeaderMateriais');
                if (materiaisHeader) {
                    const contentExterior = materiaisHeader.parentElement?.querySelector('.rich-panelbar-content-exterior');
                    const firstLink = contentExterior?.querySelector('a') as HTMLElement;
                    if (firstLink) {
                        firstLink.click();
                        return true;
                    }
                }
                
                return false;
            });

            if (conteudoClicked) {
                console.log('Playwright: Clicked "Conteúdo" link, waiting for files to load...');
                await page.waitForLoadState('networkidle');
                await page.waitForTimeout(1000);
            } else {
                console.log('Playwright: Could not find "Conteúdo" link, continuing with current page...');
            }
"@

# Replace the section (insert before "// Get HTML and Cookies")
$pattern = "(\s+// Wait for dynamic content\r\n\s+await page\.waitForTimeout\(1000\);\r\n)\r\n(\s+// Get HTML and Cookies)"
$replacement = "`$1$codeToInsert`r`n`$2"

$newContent = $content -replace $pattern, $replacement

# Write back
Set-Content -Path $file -Value $newContent -NoNewline

Write-Host "Fix applied successfully!"
