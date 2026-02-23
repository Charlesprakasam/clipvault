/**
 * ClipVault — Minimal Functional Test
 *
 * Uses Playwright's Electron support to verify:
 * - App launches without crash
 * - Main window is created (hidden)
 * - App initializes successfully
 */

const { _electron: electron } = require('playwright');
const path = require('path');

describe('ClipVault Electron App', () => {
    let electronApp;

    beforeAll(async () => {
        electronApp = await electron.launch({
            args: [path.join(__dirname, '../../src/main.js')],
            env: {
                ...process.env,
                NODE_ENV: 'test',
            },
        });
    });

    afterAll(async () => {
        if (electronApp) {
            await electronApp.close();
        }
    });

    test('app launches without crash', async () => {
        expect(electronApp).toBeDefined();
        const windows = electronApp.windows();
        // The window exists but may be hidden (tray app)
        // Wait briefly for initialization
        await new Promise(resolve => setTimeout(resolve, 2000));
        expect(electronApp.windows().length).toBeGreaterThanOrEqual(1);
    });

    test('main window loads the correct HTML', async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const window = electronApp.windows()[0];
        expect(window).toBeDefined();
        const title = await window.title();
        expect(title).toContain('ClipVault');
    });

    test('app name is set correctly', async () => {
        const name = await electronApp.evaluate(({ app }) => app.name);
        expect(name).toBe('ClipVault');
    });

    test('clipboard manager initializes in renderer', async () => {
        const window = electronApp.windows()[0];
        const hasClipVault = await window.evaluate(() => {
            return typeof window.clipVault !== 'undefined';
        });
        expect(hasClipVault).toBe(true);
    });

    test('IPC handlers are registered', async () => {
        // Test clipboard-read handler works
        const window = electronApp.windows()[0];
        const result = await window.evaluate(async () => {
            const { ipcRenderer } = require('electron');
            try {
                const text = await ipcRenderer.invoke('clipboard-read');
                return typeof text === 'string';
            } catch (e) {
                return false;
            }
        });
        expect(result).toBe(true);
    });

    test('renderer can add and retrieve clips', async () => {
        const window = electronApp.windows()[0];
        const clipCount = await window.evaluate(() => {
            window.clipVault.addClip('functional test clip');
            return window.clipVault.clips.length;
        });
        expect(clipCount).toBeGreaterThanOrEqual(1);
    });
});
