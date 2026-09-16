import * as fs from 'fs';

/**
 * Grava em `<path>.tmp` no mesmo diretório e faz `renameSync` por cima do
 * destino. Uma queda de energia ou crash no meio de um `writeFileSync` direto
 * no arquivo vivo deixa JSON truncado; a troca por `rename` é atômica no
 * sistema de arquivos (no Windows, `MoveFileEx` com replace).
 */
export function writeJsonAtomicSync(filePath: string, value: unknown): void {
    const tmpPath = `${filePath}.tmp`;
    try {
        fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2));
        fs.renameSync(tmpPath, filePath);
    } catch (error) {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        throw error;
    }
}
