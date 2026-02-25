const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
    try {
        console.log('Launching browser to generate Store assets...');
        const browser = await chromium.launch();
        const page = await browser.newPage();

        const svgPath = path.join(__dirname, '..', 'docs', 'favicon.svg');
        const outDir = path.join(__dirname, '..', 'store_logos');

        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir);
        }

        const svgContent = fs.readFileSync(svgPath, 'utf8');
        const bgColor = '#0f111a'; // Premium dark theme background

        // 1. Render 1080x1080 (1:1 Box Art)
        console.log('Rendering 1080x1080 Box Art...');
        await page.setViewportSize({ width: 1080, height: 1080 });
        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { margin: 0; padding: 0; background: ${bgColor}; display: flex; align-items: center; justify-content: center; width: 1080px; height: 1080px; }
                    svg { width: 700px; height: 700px; filter: drop-shadow(0 20px 40px rgba(0,0,0,0.5)); }
                </style>
            </head>
            <body>
                ${svgContent}
            </body>
            </html>
        `);
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: path.join(outDir, 'box_art_1080x1080.png') });

        // 2. Render 720x1080 (2:3 Poster Art)
        console.log('Rendering 720x1080 Poster Art...');
        await page.setViewportSize({ width: 720, height: 1080 });
        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { margin: 0; padding: 0; background: ${bgColor}; display: flex; align-items: center; justify-content: center; flex-direction: column; width: 720px; height: 1080px; font-family: system-ui, sans-serif; }
                    svg { width: 400px; height: 400px; filter: drop-shadow(0 20px 40px rgba(0,0,0,0.5)); margin-bottom: 40px; }
                    h1 { color: white; font-size: 64px; font-weight: 800; letter-spacing: -2px; margin: 0; }
                    p { color: #8b5cf6; font-size: 32px; font-weight: 500; margin: 10px 0 0 0; }
                </style>
            </head>
            <body>
                ${svgContent}
                <h1>ClipVault</h1>
                <p>Clipboard Manager</p>
            </body>
            </html>
        `);
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: path.join(outDir, 'poster_art_720x1080.png') });

        console.log('Successfully generated store_logos/box_art_1080x1080.png');
        console.log('Successfully generated store_logos/poster_art_720x1080.png');

        await browser.close();
    } catch (error) {
        console.error('Failed to generate store logos:', error);
        process.exit(1);
    }
})();
