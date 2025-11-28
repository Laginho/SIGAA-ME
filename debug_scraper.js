
import fs from 'fs';
import * as cheerio from 'cheerio';

const filePath = 'c:\\Users\\Bruno Lage\\Desktop\\Pastinha\\Programas\\Projects\\SIGAA-ME\\context_files\\extracted.html';

try {
    const content = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(content);

    console.log('Scanning for "Conteúdo" link...');

    let conteudoLink = null;
    $('.itemMenu').each((i, el) => {
        const text = $(el).text().trim();
        console.log(`Item ${i}: "${text}"`);

        if (text.includes('Conteúdo') || text.includes('Conte\u00FAdo')) {
            console.log('MATCH FOUND!');
            conteudoLink = $(el).parent('a');
            return false;
        }
    });

    if (conteudoLink) {
        console.log('Link found.');
        const onclick = conteudoLink.attr('onclick');
        console.log('Onclick:', onclick);

        const match = onclick?.match(/jsfcljs\(document\.forms\['([^']+)'\],'([^']+)'/);
        if (match) {
            console.log('Regex MATCH!');
            console.log('Form Name:', match[1]);
            console.log('Params:', match[2]);
        } else {
            console.log('Regex FAILED.');
        }
    } else {
        console.log('Link NOT found.');
    }

} catch (error) {
    console.error('Error:', error);
}
