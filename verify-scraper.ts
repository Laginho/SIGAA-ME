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
    let filesForCourse = null;

    console.log('\n[3/4] Searching for course "CÁLCULO FUNDAMENTAL II"...');

    // Prioritize the specific course
    courseWithFiles = coursesResult.courses.find((c: any) => c.name.includes('CÁLCULO FUNDAMENTAL II'));

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
        // 4. Download ALL files
        console.log(`\n[4/4] Attempting to download ALL ${filesForCourse.length} files...`);
        const downloadDir = path.join(process.cwd(), 'downloads_test');
        if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

        let successCount = 0;
        let failCount = 0;

        for (const file of filesForCourse) {
            if (file.type !== 'file') continue;

            console.log(`\nDownloading: ${file.name}`);

            const downloadResult = await sigaa.downloadFile(
                courseWithFiles.id,
                courseWithFiles.name,
                file.name,
                file.url || '',
                downloadDir,
                {},
                file.script
            );

            if (downloadResult.success && downloadResult.filePath) {
                console.log('Download successful!', downloadResult.filePath);

                // Verify file integrity
                try {
                    const stats = fs.statSync(downloadResult.filePath);
                    console.log(`File size: ${stats.size} bytes`);

                    if (stats.size < 2000) { // Increased threshold slightly
                        console.warn('WARNING: File is very small (< 2KB), likely an error page.');

                        // Read content to see if it's HTML
                        const content = fs.readFileSync(downloadResult.filePath, 'utf8');
                        if (content.includes('<html') || content.includes('<!DOCTYPE')) {
                            console.error('ERROR: File is an HTML page!');
                            failCount++;
                            continue;
                        }
                    }

                    const buffer = Buffer.alloc(5);
                    const fd = fs.openSync(downloadResult.filePath, 'r');
                    fs.readSync(fd, buffer, 0, 5, 0);
                    fs.closeSync(fd);

                    const header = buffer.toString('utf8');
                    console.log(`File header: ${header}`);
                    successCount++;

                } catch (e) {
                    console.error('Error verifying file:', e);
                    failCount++;
                }

            } else {
                console.error('Download failed:', downloadResult.message);
                failCount++;
            }
        }

        console.log(`\nDownload Summary: ${successCount} successful, ${failCount} failed.`);
    } else {
        console.log('No downloadable files found in the selected course.');
    }

    // 5. Test News Fetching
    console.log('\n[5/5] Testing News Fetching...');

    let courseWithNews = null;
    let newsItems = null;

    // First check the current course
    if (courseWithFiles) {
        const result = await sigaa.getCourseFiles(courseWithFiles.id, courseWithFiles.name);
        if (result.success && result.news && result.news.length > 0) {
            courseWithNews = courseWithFiles;
            newsItems = result.news;
        }
    }

    // If not found, search other courses
    if (!courseWithNews) {
        console.log('Target course has no news. Searching others...');
        for (const course of coursesResult.courses) {
            if (course.id === courseWithFiles?.id) continue; // Skip already checked

            console.log(`Checking for news in: ${course.code} - ${course.name}...`);
            const result = await sigaa.getCourseFiles(course.id, course.name);
            if (result.success && result.news && result.news.length > 0) {
                console.log(`Found ${result.news.length} news items in this course.`);
                courseWithNews = course;
                newsItems = result.news;
                break;
            }
        }
    }

    if (courseWithNews && newsItems && newsItems.length > 0) {
        console.log(`\nTesting news fetch for course: ${courseWithNews.name}`);
        const newsItem = newsItems[0];
        console.log(`Attempting to fetch details for news: "${newsItem.title}" (ID: ${newsItem.id})`);

        const newsResult = await sigaa.getNewsDetail(courseWithNews.id, newsItem.id);
        if (newsResult.success && newsResult.news) {
            console.log('News detail fetched successfully!');
            console.log('Title:', newsResult.news.title);
            console.log('Date:', newsResult.news.date);
            console.log('Content Preview:', newsResult.news.content?.substring(0, 100) + '...');
        } else {
            console.error('Failed to fetch news detail:', newsResult.message);
        }
    } else {
        console.log('No news items found in ANY course.');
    }

    console.log('\nVerification complete.');
    process.exit(0);
}

main().catch(console.error);
