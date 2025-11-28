$file = "electron\services\http-scraper.service.ts"
$content = Get-Content $file -Raw

# Find the section where it tries to navigate to Conteúdo and wrap it in a check
$pattern = "(\s+const \$ = cheerio\.load\(coursePageData\);\r\n\s+let filesPageData = coursePageData;\r\n\s+let conteudoLink: any = null;\r\n)\r\n(\s+\$\('\.itemMenu'\))"

$replacement = @'
$1
            // Skip navigation if using pre-fetched HTML (Playwright already navigated)
            if (!preFetchedHtml) {
$2
'@

# First, wrap the conteudo link finding logic
$newContent = $content -replace $pattern, $replacement

# Now find where we use filesPageData and close the if block
$pattern2 = "(\s+} else \{\r\n\s+this\.log\('\[HttpScraper\] \"Conteúdo\" link not found in sidebar\. Scanning current page\.\.\.'\);\r\n\s+}\r\n)\r\n(\s+const \$files = cheerio\.load\(filesPageData\);)"

$replacement2 = @'
$1            } else {
                this.log('[HttpScraper] Using pre-fetched HTML directly (Playwright already navigated).');
            }

$2
'@

$newContent = $newContent -replace $pattern2, $replacement2

# Write back
Set-Content -Path $file -Value $newContent -NoNewline

Write-Host "HTTP Scraper fixed to skip POST when using Playwright HTML!"
