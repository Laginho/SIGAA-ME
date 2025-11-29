import { SigaaService } from './electron/services/sigaa.service';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';

async function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function main() {
    console.log('--- SIGAA Scraper Verification ---');

    const username = process.env.SIGAA_USER || await askQuestion('Enter SIGAA Username: ');
    const password = process.env.SIGAA_PASS || await askQuestion('Enter SIGAA Password: ');

    if (!username || !password) {
        console.error('Credentials required.');
        return;
    }

    const sigaa = new SigaaService();

    // 1. Login
    console.log('\n[1/4] Logging in...');
    const loginResult = await sigaa.login(username, password);
    if (!loginResult.success) {
        console.error('Login failed:', loginResult.message);
        return;
    }
    console.log('Login successful! User:', loginResult.account?.name);

    // 2. Get Courses
    console.log('\n[2/4] Fetching courses...');
    const coursesResult = await sigaa.getCourses();
    if (!coursesResult.success || !coursesResult.courses || coursesResult.courses.length === 0) {
        console.error('Failed to get courses:', coursesResult.message);
        return;
    }
    console.log(`Found ${coursesResult.courses.length} courses.`);

    // Select first course
    const course = coursesResult.courses[0];
    console.log(`Selected course: ${course.code} - ${course.name}`);

    // 3. Get Files
    console.log('\n[3/4] Fetching files...');
    const filesResult = await sigaa.getCourseFiles(course.id, course.name);
    if (!filesResult.success) {
        console.error('Failed to get files:', filesResult.message);
        return;
    }

    console.log(`Found ${filesResult.files?.length || 0} files and ${filesResult.news?.length || 0} news items.`);

    if (filesResult.files && filesResult.files.length > 0) {
        // 4. Download first file
        const fileToDownload = filesResult.files.find(f => f.type === 'file');

        if (fileToDownload) {
            console.log(`\n[4/4] Attempting to download: ${fileToDownload.name}`);
            const downloadDir = path.join(process.cwd(), 'downloads_test');
            if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

            const downloadResult = await sigaa.downloadFile(
                course.id,
                course.name,
                fileToDownload.name,
                fileToDownload.url || '', // URL might be empty for script-based downloads
                downloadDir,
                {}, // No previously downloaded files
                fileToDownload.script
            );

            if (downloadResult.success) {
                console.log('Download successful!', downloadResult.filePath);
            } else {
                console.error('Download failed:', downloadResult.message);
            }
        } else {
            console.log('No downloadable files found in this course.');
        }
    } else {
        console.log('No files found in this course.');
    }

    console.log('\nVerification complete.');
    process.exit(0);
}

main().catch(console.error);
