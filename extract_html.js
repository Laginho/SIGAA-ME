
import fs from 'fs';
import * as cheerio from 'cheerio';
import path from 'path';

const filePath = 'c:\\Users\\Bruno Lage\\Desktop\\Pastinha\\Programas\\Projects\\SIGAA-ME\\context_files\\view-source_https___si3.ufc.br_sigaa_ava_NoticiaTurma_listar.jsf.html';
const outputPath = 'c:\\Users\\Bruno Lage\\Desktop\\Pastinha\\Programas\\Projects\\SIGAA-ME\\context_files\\extracted.html';

try {
    const content = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(content);

    let extractedHtml = '';
    $('.line-content').each((i, el) => {
        extractedHtml += $(el).text() + '\n';
    });

    fs.writeFileSync(outputPath, extractedHtml);
    console.log('Extracted HTML saved to ' + outputPath);
} catch (error) {
    console.error('Error extracting HTML:', error);
}
