/**
 * Política de remetente do IPC (SEC-002).
 *
 * O único remetente legítimo é o frame principal da nossa janela, carregado
 * da origem que nós carregamos. Função pura: recebe os primitivos, sem
 * `webContents` real no teste.
 */

export interface SenderPolicy {
  windowWebContentsId: number | null;
  allowedOrigin: string;
}

export interface SenderFrame {
  url: string;
  parent: unknown | null;
}

function senderOrigin(u: string): string | null {
  try {
    const url = new URL(u);
    return url.protocol === 'file:' ? 'file:' : url.origin;
  } catch {
    return null;
  }
}

export function isTrustedSender(
  frame: SenderFrame | null,
  senderId: number,
  policy: SenderPolicy,
): boolean {
  if (policy.windowWebContentsId === null) return false;
  if (senderId !== policy.windowWebContentsId) return false;
  if (frame === null) return false;
  if (frame.parent !== null) return false;
  const origin = senderOrigin(frame.url);
  if (origin === null) return false;
  return origin === policy.allowedOrigin;
}
