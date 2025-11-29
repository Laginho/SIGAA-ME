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


    // hardcoded for debugging, make sure to remove before release
    const username = process.env.SIGAA_USER || 'lage041';
    const password = process.env.SIGAA_PASS || '18bq0041';

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

    // Find a course with files
    let courseWithFiles = null;
    let filesForCourse = null;

    console.log('\n[3/4] Searching for course "FUNDAMENTOS MATEMÁTICOS DA COMPUTAÇÃO"...');

    // Prioritize the specific course
    courseWithFiles = coursesResult.courses.find((c: any) => c.name.includes('FUNDAMENTOS MATEMÁTICOS DA COMPUTAÇÃO'));

    if (courseWithFiles) {
        console.log(`Found target course: ${courseWithFiles.code} - ${courseWithFiles.name}`);
        const result = await sigaa.getCourseFiles(courseWithFiles.id, courseWithFiles.name);
        if (result.success && result.files && result.files.length > 0) {
            console.log(`Found ${result.files.length} files in this course.`);
            filesForCourse = result.files;
        } else {
            console.log('Target course found but has no files. Searching others...');
            courseWithFiles = null; // Reset to trigger fallback search
        }
    }

    // Fallback search if target not found or has no files
    if (!courseWithFiles) {
        console.log('Searching other courses for files...');
        for (const course of coursesResult.courses) {
            console.log(`Checking course: ${course.code} - ${course.name}...`);
            const result = await sigaa.getCourseFiles(course.id, course.name);

            if (result.success && result.files && result.files.length > 0) {
                console.log(`Found ${result.files.length} files in this course.`);
                courseWithFiles = course;
                filesForCourse = result.files;
                break;
            } else {
                console.log('No files found.');
            }
        }
    }

    if (courseWithFiles && filesForCourse) {
        // 4. Download first file
        const fileToDownload = filesForCourse.find((f: any) => f.type === 'file');

        if (fileToDownload) {
            console.log(`\n[4/4] Attempting to download: ${fileToDownload.name}`);
            const downloadDir = path.join(process.cwd(), 'downloads_test');
            if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

            const downloadResult = await sigaa.downloadFile(
                courseWithFiles.id,
                courseWithFiles.name,
                fileToDownload.name,
                fileToDownload.url || '',
                downloadDir,
                {},
                fileToDownload.script
            );

            if (downloadResult.success && downloadResult.filePath) {
                console.log('Download successful!', downloadResult.filePath);

                // Verify file integrity
                try {
                    const stats = fs.statSync(downloadResult.filePath);
                    console.log(`File size: ${stats.size} bytes`);

                    if (stats.size < 1000) {
                        console.warn('WARNING: File is very small, might be an empty file or error page.');
                    }

                    const buffer = Buffer.alloc(5);
                    const fd = fs.openSync(downloadResult.filePath, 'r');
                    fs.readSync(fd, buffer, 0, 5, 0);
                    fs.closeSync(fd);

                    const header = buffer.toString('utf8');
                    console.log(`File header (first 5 bytes): ${header}`);

                    if (header.startsWith('%PDF')) {
                        console.log('Verified: File is a PDF.');
                    } else if (header.toLowerCase().startsWith('<html') || header.toLowerCase().startsWith('<!doc')) {
                        console.error('ERROR: File appears to be an HTML page (likely an error page saved as file).');
                    } else {
                        console.log('File type unknown (not PDF or HTML).');
                    }
                } catch (e) {
                    console.error('Error verifying file:', e);
                }

            } else {
                console.error('Download failed:', downloadResult.message);
            }
        } else {
            console.log('No downloadable files found in the selected course.');
        }
    } else {
        console.log('No files found in ANY course.');
    }

    console.log('\nVerification complete.');
    process.exit(0);
}

main().catch(console.error);
