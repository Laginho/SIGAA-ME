import axios from 'axios';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import type { Page } from 'playwright';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
vi.mock('electron', () => ({ app: { isPackaged: true, getPath: () => os.tmpdir() } }));
vi.mock('../../electron/services/logger.service', () => ({
    logger: { scope: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { DownloadService } from '../../electron/services/download.service';
import { HttpScraperService } from '../../electron/services/http-scraper.service';
import { resolveDownloadTarget } from '../../electron/services/download-path';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
const HTML = Buffer.from('<!DOCTYPE html><html><body>Server error</body></html>');
const COURSE = 'Matemática';
const SCRIPT = "jsfcljs(document.forms['formAva'],'formAva:download,formAva:download,id,10','');";
type Transport = 'HTTP' | 'direct' | 'popup' | 'reload';
let destination: string;

beforeEach(() => {
    vi.clearAllMocks();
    destination = mkdtempSync(path.join(os.tmpdir(), 'sigaa-part-collision-'));
});
afterEach(() => { rmSync(destination, { recursive: true, force: true }); });

function setup(transport: Transport, body: Buffer, failSave = false) {
    const dir = transport === 'HTTP' ? destination : resolveDownloadTarget(destination, COURSE, 'notes').dir;
    mkdirSync(dir, { recursive: true });
    const saveAs = vi.fn(async (target: string) => {
        if (failSave) throw new Error('saveAs interrupted');
        writeFileSync(target, body);
    });
    const download = { suggestedFilename: () => 'notes', saveAs };
    const popup = {
        url: () => 'https://si3.ufc.br/sigaa/ava/download.jsf',
        route: vi.fn(async () => {}),
        reload: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
        waitForEvent: vi.fn().mockResolvedValue(download),
    };
    if (transport === 'reload') popup.waitForEvent.mockRejectedValueOnce(new Error('download timeout'));
    const page = {
        url: () => 'https://si3.ufc.br/sigaa/ava/index.jsf',
        route: vi.fn(async () => {}),
        unroute: vi.fn(async () => {}),
        evaluate: vi.fn(async () => null),
        waitForEvent: (event: string) => {
            if (transport === 'direct' && event === 'download') return Promise.resolve(download);
            if (transport !== 'direct' && event === 'popup') return Promise.resolve(popup);
            return new Promise(() => {});
        },
    } as unknown as Page;
    const run = async () => {
        if (transport !== 'HTTP') {
            return new DownloadService().downloadFile(page, 'notes', COURSE, destination, '10', SCRIPT);
        }
        const service = new HttpScraperService();
        const session = service as unknown as {
            courseData: Map<string, { viewState: string; action: string; formName: string; inputs: Record<string, string> }>;
        };
        session.courseData.set('course', { viewState: 'view', action: '/sigaa/ava/index.jsf', formName: 'formAva', inputs: {} });
        vi.mocked(axios.post).mockResolvedValue({ data: Readable.from([body]), headers: {} });
        return service.downloadFile('course', '10', 'notes', destination, SCRIPT);
    };
    return { dir, run, saveAs };
}

describe.each<Transport>(['HTTP', 'direct', 'popup', 'reload'])('DL-012: %s temporary path ownership', transport => {
    it('preserves existing .part files and removes its own temporary file after success', async () => {
        const { dir, run } = setup(transport, PDF);
        writeFileSync(path.join(dir, 'notes.part'), 'A');
        writeFileSync(path.join(dir, 'notes (1).part'), 'B');

        expect(await run()).toMatchObject({ success: true, filePath: path.join(dir, 'notes.pdf') });

        expect(readFileSync(path.join(dir, 'notes.part'), 'utf8')).toBe('A');
        expect(readFileSync(path.join(dir, 'notes (1).part'), 'utf8')).toBe('B');
        expect(readFileSync(path.join(dir, 'notes.pdf'))).toEqual(PDF);
        expect(readdirSync(dir).sort()).toEqual(['notes (1).part', 'notes.part', 'notes.pdf']);
    });

    it('rejects HTML without deleting a preexisting .part or leaving its own temporary file', async () => {
        const { dir, run } = setup(transport, HTML);
        writeFileSync(path.join(dir, 'notes.part'), 'A');

        expect(await run()).toMatchObject({ success: false });

        expect(readdirSync(dir)).toEqual(['notes.part']);
        expect(readFileSync(path.join(dir, 'notes.part'), 'utf8')).toBe('A');
    });
});

it.each<Exclude<Transport, 'HTTP'>>(['direct', 'popup', 'reload'])('%s cleans reserved placeholders when saveAs fails before writing', async transport => {
    const { dir, run } = setup(transport, PDF, true);
    writeFileSync(path.join(dir, 'notes.part'), 'A');

    expect(await run()).toMatchObject({ success: false });

    expect(readdirSync(dir)).toEqual(['notes.part']);
    expect(readFileSync(path.join(dir, 'notes.part'), 'utf8')).toBe('A');
});

it('keeps the conventional temporary name when it is unoccupied', async () => {
    const { dir, run, saveAs } = setup('direct', PDF);

    expect(await run()).toMatchObject({ success: true, filePath: path.join(dir, 'notes.pdf') });

    expect(saveAs).toHaveBeenCalledWith(path.join(dir, 'notes.part'));
    expect(readdirSync(dir)).toEqual(['notes.pdf']);
});

it('cleans the failed popup reservation when the reload download succeeds', async () => {
    const { dir, run, saveAs } = setup('popup', PDF);
    writeFileSync(path.join(dir, 'notes.part'), 'A');
    saveAs.mockRejectedValueOnce(new Error('first saveAs interrupted'));

    expect(await run()).toMatchObject({ success: true, filePath: path.join(dir, 'notes.pdf') });

    expect(saveAs).toHaveBeenCalledTimes(2);
    expect(readFileSync(path.join(dir, 'notes.part'), 'utf8')).toBe('A');
    expect(readFileSync(path.join(dir, 'notes.pdf'))).toEqual(PDF);
    expect(readdirSync(dir).sort()).toEqual(['notes.part', 'notes.pdf']);
});
