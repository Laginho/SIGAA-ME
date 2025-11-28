
import fs from 'fs';
import * as cheerio from 'cheerio';

const filePath = 'c:\\Users\\Bruno Lage\\Desktop\\Pastinha\\Programas\\Projects\\SIGAA-ME\\context_files\\extracted.html';

try {
    const content = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(content);

    // Test ViewState Extraction Logic
    console.log('\n--- Testing ViewState Extraction ---');

    // Simulate finding the course entry form (using formTurma as a proxy for dashboard form)
    // In dashboard, it's usually a form wrapping the input[name="idTurma"]
    const courseId = '509238'; // From extracted.html line 471
    const input = $(`input[name="idTurma"][value="${courseId}"]`);

    if (input.length > 0) {
        console.log('Found course input.');
        const form = input.closest('form');
        console.log('Form action:', form.attr('action'));

        const formData = new URLSearchParams();
        form.find('input').each((_, el) => {
            const name = $(el).attr('name');
            const value = $(el).attr('value');
            if (name && value) {
                console.log(`Field: ${name} = ${value}`);
                formData.append(name, value);
            }
        });

        // Check if ViewState is in formData
        if (!formData.has('javax.faces.ViewState')) {
            console.log('ViewState NOT found in form. Attempting global extraction...');
            const viewState = $('input[name="javax.faces.ViewState"]').val();
            if (viewState) {
                console.log('SUCCESS: Found global ViewState:', viewState);
                formData.append('javax.faces.ViewState', viewState);
            } else {
                console.log('FAILURE: Could not find ViewState anywhere!');
            }
        } else {
            console.log('ViewState found in form directly.');
        }

        console.log('Final FormData keys:', Array.from(formData.keys()));

    } else {
        console.log('Course input not found (check courseId).');
    }

} catch (error) {
    console.error('Error:', error);
}
