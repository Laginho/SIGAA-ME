// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderLoadingPage, stopLoadingInterval } from '../../src/pages/loading';
afterEach(() => { stopLoadingInterval(); vi.useRealTimers(); });
it('cleans both the loading interval and pending fade on navigation', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="app"></div>';
    renderLoadingPage(document.querySelector<HTMLDivElement>('#app')!);
    vi.advanceTimersByTime(3000);
    expect(vi.getTimerCount()).toBe(2);
    stopLoadingInterval();
    expect(vi.getTimerCount()).toBe(0);
});
