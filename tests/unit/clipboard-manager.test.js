/**
 * ClipVault — Unit Tests for ClipboardManager
 *
 * Tests the core clipboard manager logic: CRUD, pinning, filtering, storage.
 * Uses a minimal DOM from jsdom and mocks localStorage.
 */

const fs = require('fs');
const path = require('path');

// Load the HTML so jsdom has the right DOM structure
const html = fs.readFileSync(path.join(__dirname, '../../src/index.html'), 'utf8');

beforeEach(() => {
    // Reset DOM
    document.documentElement.innerHTML = html;
    // Clear localStorage
    localStorage.clear();
    // Reset any global state
    delete window.clipVault;
});

// Helper: load app.js in the current jsdom context
function loadApp() {
    const appCode = fs.readFileSync(path.join(__dirname, '../../src/app.js'), 'utf8');
    // Execute app.js — it attaches window.clipVault on DOMContentLoaded
    eval(appCode);
    // Manually fire DOMContentLoaded since jsdom doesn't auto-fire it after eval
    document.dispatchEvent(new Event('DOMContentLoaded'));
    return window.clipVault;
}

describe('ClipboardManager initialization', () => {
    test('creates a ClipboardManager instance', () => {
        const cm = loadApp();
        expect(cm).toBeDefined();
    });

    test('starts with empty clips array', () => {
        const cm = loadApp();
        expect(cm.clips).toEqual([]);
    });

    test('applies default settings', () => {
        const cm = loadApp();
        expect(cm.settings.maxClips).toBe(100);
        expect(cm.settings.pollInterval).toBe(1000);
        expect(cm.settings.showTimestamps).toBe(true);
        expect(cm.settings.enableSound).toBe(false);
    });
});

describe('Clip CRUD Operations', () => {
    let cm;
    beforeEach(() => {
        cm = loadApp();
    });

    test('addClip adds a clip to the list', () => {
        cm.addClip('hello world');
        expect(cm.clips.length).toBe(1);
        expect(cm.clips[0].text).toBe('hello world');
    });

    test('addClip prevents duplicate of most recent clip', () => {
        cm.addClip('hello');
        cm.addClip('hello');
        expect(cm.clips.length).toBe(1);
    });

    test('addClip allows same text if not the most recent', () => {
        cm.addClip('first');
        cm.addClip('second');
        cm.addClip('first');
        expect(cm.clips.length).toBe(3);
    });

    test('addClip assigns unique IDs', () => {
        cm.addClip('clip1');
        cm.addClip('clip2');
        expect(cm.clips[0].id).not.toBe(cm.clips[1].id);
    });

    test('addClip adds timestamps', () => {
        cm.addClip('timestamped');
        expect(cm.clips[0].timestamp).toBeDefined();
        const ts = new Date(cm.clips[0].timestamp);
        expect(ts.getTime()).not.toBeNaN();
    });

    test('addClip adds clips to the front (newest first)', () => {
        cm.addClip('older');
        cm.addClip('newer');
        expect(cm.clips[0].text).toBe('newer');
        expect(cm.clips[1].text).toBe('older');
    });

    test('deleteClip removes a clip by ID', () => {
        cm.addClip('to delete');
        const id = cm.clips[0].id;
        jest.useFakeTimers();
        cm.deleteClip(id);
        jest.advanceTimersByTime(300);
        expect(cm.clips.length).toBe(0);
        jest.useRealTimers();
    });

    test('togglePin switches pin state', () => {
        cm.addClip('pinnable');
        const id = cm.clips[0].id;
        expect(cm.clips[0].pinned).toBe(false);
        cm.togglePin(id);
        expect(cm.clips[0].pinned).toBe(true);
        cm.togglePin(id);
        expect(cm.clips[0].pinned).toBe(false);
    });
});

describe('enforceMaxClips', () => {
    let cm;
    beforeEach(() => {
        cm = loadApp();
        cm.settings.maxClips = 5;
    });

    test('trims unpinned clips beyond max', () => {
        for (let i = 0; i < 8; i++) {
            cm.addClip(`clip ${i}`);
        }
        expect(cm.clips.length).toBe(5);
    });

    test('preserves pinned clips even beyond max', () => {
        for (let i = 0; i < 5; i++) {
            cm.addClip(`clip ${i}`);
        }
        cm.togglePin(cm.clips[0].id);
        cm.togglePin(cm.clips[1].id);
        // Add more to push total past max
        cm.addClip('extra1');
        cm.addClip('extra2');
        cm.addClip('extra3');
        const pinnedCount = cm.clips.filter(c => c.pinned).length;
        expect(pinnedCount).toBe(2);
        expect(cm.clips.length).toBeLessThanOrEqual(cm.settings.maxClips);
    });
});

describe('clearAll', () => {
    let cm;
    beforeEach(() => {
        cm = loadApp();
        // Mock confirm
        window.confirm = jest.fn(() => true);
    });

    test('removes all unpinned clips', () => {
        cm.addClip('clip1');
        cm.addClip('clip2');
        cm.addClip('clip3');
        cm.togglePin(cm.clips[0].id); // pin the newest
        cm.clearAll();
        expect(cm.clips.length).toBe(1);
        expect(cm.clips[0].pinned).toBe(true);
    });

    test('does nothing if all clips are pinned', () => {
        cm.addClip('pinned1');
        cm.togglePin(cm.clips[0].id);
        cm.clearAll();
        expect(cm.clips.length).toBe(1);
    });
});

describe('Filtering', () => {
    let cm;
    beforeEach(() => {
        cm = loadApp();
        cm.addClip('alpha one');
        cm.addClip('beta two');
        cm.addClip('gamma three');
        cm.togglePin(cm.clips[0].id); // pin gamma (newest = first)
    });

    test('getFilteredClips returns all by default', () => {
        cm.filter = 'all';
        cm.searchQuery = '';
        const filtered = cm.getFilteredClips();
        expect(filtered.length).toBe(3);
    });

    test('getFilteredClips filters by pinned', () => {
        cm.filter = 'pinned';
        cm.searchQuery = '';
        const filtered = cm.getFilteredClips();
        expect(filtered.length).toBe(1);
        expect(filtered[0].pinned).toBe(true);
    });

    test('getFilteredClips searches by text', () => {
        cm.filter = 'all';
        cm.searchQuery = 'beta';
        const filtered = cm.getFilteredClips();
        expect(filtered.length).toBe(1);
        expect(filtered[0].text).toBe('beta two');
    });

    test('getFilteredClips search is case-insensitive', () => {
        cm.filter = 'all';
        cm.searchQuery = 'ALPHA';
        const filtered = cm.getFilteredClips();
        expect(filtered.length).toBe(1);
    });

    test('pinned clips sort first', () => {
        cm.filter = 'all';
        cm.searchQuery = '';
        const filtered = cm.getFilteredClips();
        expect(filtered[0].pinned).toBe(true);
    });
});

describe('Persistence', () => {
    test('clips persist across instances', () => {
        const cm1 = loadApp();
        cm1.addClip('persisted clip');
        cm1.saveClips();

        // Simulate re-init
        delete window.clipVault;
        document.documentElement.innerHTML = html;
        const cm2 = loadApp();
        expect(cm2.clips.length).toBe(1);
        expect(cm2.clips[0].text).toBe('persisted clip');
    });

    test('settings persist across instances', () => {
        const cm1 = loadApp();
        cm1.settings.maxClips = 42;
        cm1.saveSettings();

        delete window.clipVault;
        document.documentElement.innerHTML = html;
        const cm2 = loadApp();
        expect(cm2.settings.maxClips).toBe(42);
    });
});
