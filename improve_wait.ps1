$file = "electron\services\playwright-login.service.ts"
$content = Get-Content $file -Raw

# Find and replace the conteudo click section to add better waiting logic
$oldBlock = @"
            if \(conteudoClicked\) \{
                console\.log\('Playwright: Clicked "Conteúdo" link, waiting for files to load\.\.\.'\);
                await page\.waitForLoadState\('networkidle'\);
                await page\.waitForTimeout\(1000\);
            \} else \{
                console\.log\('Playwright: Could not find "Conteúdo" link, continuing with current page\.\.\.'\);
            \}
"@

$newBlock = @"
            if (conteudoClicked) {
                console.log('Playwright: Clicked "Conteúdo" link, waiting for files to load...');
                // Wait for the main content area or file listings to appear
                try {
                    await page.waitForSelector('.itemTitulo, .materialApoio, table', { timeout: 5000 });
                    await page.waitForTimeout(1000);
                } catch (e) {
                    console.log('Playwright: Timeout waiting for content, proceeding anyway...');
                }
            } else {
                console.log('Playwright: Could not find "Conteúdo" link, continuing with current page...');
            }
"@

$newContent = $content -replace $oldBlock, $newBlock

# Write back
Set-Content -Path $file -Value $newContent -NoNewline

Write-Host "Updated waiting logic!"
