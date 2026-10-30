import '@testing-library/jest-dom/vitest';
import {cleanup} from '@testing-library/react';
import {afterEach, beforeEach, vi} from 'vitest';
import {api} from '../api/client';
// Existing page fixtures predate imported runs; each test can override this
// empty history when exercising the upload/task panel.
beforeEach(()=>{vi.spyOn(api,'stageRuns').mockResolvedValue({items:[]});});
afterEach(() => {cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
Element.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};
// jsdom does not implement ResizeObserver; needed by ai-status/react-use-measure and future components.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
}

// jsdom has no matchMedia; used by motion's useReducedMotion (rare-ui ai-status).
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() { return false; },
  })) as unknown as typeof window.matchMedia;
}
