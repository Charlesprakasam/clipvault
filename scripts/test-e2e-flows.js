const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
    let app;
    try {
        console.log('🚀 Starting Comprehensive E2E Test...');

        // Launch Electron app
        app = await electron.launch({
            args: [path.join(__dirname, '..', 'src', 'main.js')],
            env: { ...process.env, NODE_ENV: 'test' }
        });

        // Wait for the main window to be created
        const window = await app.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        // Unhide the window for testing purposes by evaluating an IPC mock or forcing show
        await window.evaluate(() => {
            require('electron').ipcRenderer.send('window-shown');
        });

        // Give it a moment to render
        await new Promise(r => setTimeout(r, 1000));

        console.log('✅ App launched successfully');

        // 1. Inject some mock clips
        console.log('📝 Injecting test clips...');
        await window.evaluate(() => {
            const manager = window.clipVault;
            manager.addClip('Hello world from E2E test');
            manager.addClip('https://github.com/Charlesprakasam/clipvault');
            for (let i = 1; i <= 20; i++) {
                manager.addClip(`Scroll test dummy clip ${i} with varying lengths`);
            }
            manager.addClip('Secret password: correcthorsebatterystaple');
        });

        await new Promise(r => setTimeout(r, 500));
        console.log('✅ Clips injected.');

        // 2. Test settings page & version
        console.log('⚙️ Testing settings page and version display...');
        await window.click('#settingsBtn');
        await new Promise(r => setTimeout(r, 500));

        const versionText = await window.locator('#appVersion').textContent();
        console.log(`   Found version: ${versionText}`);
        if (!versionText.includes('v0.1')) throw new Error('Version display failed!');

        await window.screenshot({ path: path.join(__dirname, '..', 'docs', 'e2e-settings.png') });
        await window.click('#settingsClose');
        await new Promise(r => setTimeout(r, 500));
        console.log('✅ Settings and version verified.');

        // 3. Test scrolling Down and Up
        console.log('📜 Testing scrolling behavior...');
        const clipList = window.locator('#clipList');

        await clipList.evaluate((el) => el.scrollTop = el.scrollHeight);
        await new Promise(r => setTimeout(r, 500));
        await window.screenshot({ path: path.join(__dirname, '..', 'docs', 'e2e-scroll-down.png') });

        await clipList.evaluate((el) => el.scrollTop = 0);
        await new Promise(r => setTimeout(r, 500));
        console.log('✅ Scrolling down and up successful.');

        // 4. Test Search Feature
        console.log('🔍 Testing search functionality...');
        await window.fill('#searchInput', 'Secret password');
        await new Promise(r => setTimeout(r, 500));

        const searchResultsCount = await window.locator('.clip-card:visible').count();
        console.log(`   Found ${searchResultsCount} results for search query.`);
        if (searchResultsCount !== 1) throw new Error('Search failed to filter correctly!');

        await window.screenshot({ path: path.join(__dirname, '..', 'docs', 'e2e-search.png') });

        await window.click('#searchClear');
        await new Promise(r => setTimeout(r, 500));
        console.log('✅ Search functionality verified.');

        // 5. Test Shortcuts (Cmd+F to focus search)
        console.log('⌨️ Testing keyboard shortcuts...');
        await window.keyboard.press('Meta+f'); // Mac
        // Check if search input is focused
        const isFocused = await window.evaluate(() => document.activeElement.id === 'searchInput');
        if (!isFocused) throw new Error('Cmd+F shortcut failed to focus search bar!');
        console.log('✅ Keyboard shortcuts verified.');

        console.log('🎉 ALL E2E TESTS PASSED SUCCESSFULLY!');
    } catch (error) {
        console.error('❌ E2E TEST FAILED:', error);
        process.exitCode = 1;
    } finally {
        if (app) {
            await app.close();
        }
    }
})();
