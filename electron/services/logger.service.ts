import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export class LoggerService {
    private logPath: string;

    constructor() {
        // Use userData directory for logs
        const userDataPath = app.getPath('userData');
        this.logPath = path.join(userDataPath, 'sigaa-me.log');

        // Ensure log file exists
        if (!fs.existsSync(this.logPath)) {
            fs.writeFileSync(this.logPath, '');
        }
    }

    private formatMessage(level: string, message: string, ...args: any[]): string {
        const timestamp = new Date().toISOString();
        const argsStr = args.length ? ' ' + args.map(a =>
            typeof a === 'object' ? JSON.stringify(a) : String(a)
        ).join(' ') : '';
        return `[${timestamp}] [${level}] ${message}${argsStr}\n`;
    }

    private write(text: string) {
        try {
            fs.appendFileSync(this.logPath, text);
            // Also log to console for development
            console.log(text.trim());
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    info(message: string, ...args: any[]) {
        this.write(this.formatMessage('INFO', message, ...args));
    }

    warn(message: string, ...args: any[]) {
        this.write(this.formatMessage('WARN', message, ...args));
    }

    error(message: string, ...args: any[]) {
        this.write(this.formatMessage('ERROR', message, ...args));
    }

    getLogPath(): string {
        return this.logPath;
    }

    clear() {
        try {
            fs.writeFileSync(this.logPath, '');
        } catch (error) {
            console.error('Failed to clear log file:', error);
        }
    }
}

export const logger = new LoggerService();
