import re

# Read the file
with open('electron/services/http-scraper.service.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Update the parsing logic
# We need to change how we extract the ID from the onclick attribute
# Current: const idMatch = onclick.match(/'id':'([^']+)'/);
# New: Support both formats or specifically the SIGAA one

old_logic = "const idMatch = onclick.match(/'id':'([^']+)'/);"
new_logic = """// Try to match standard SIGAA jsfcljs format: id,12345,key,...
                        let idMatch = onclick.match(/,id,([^,]+)/);
                        
                        // Fallback to JSON-like format if that fails
                        if (!idMatch) {
                            idMatch = onclick.match(/'id':'([^']+)'/);
                        }"""

if old_logic in content:
    content = content.replace(old_logic, new_logic)
    print('✅ Parsing logic updated!')
else:
    print('❌ Could not find the parsing logic to replace.')

# Write back
with open('electron/services/http-scraper.service.ts', 'w', encoding='utf-8') as f:
    f.write(content)
