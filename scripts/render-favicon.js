const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
    try {
        const browser = await chromium.launch();
        const page = await browser.newPage();

        const svgPath = path.join(__dirname, '..', 'docs', 'favicon.svg');
        const pngPath = path.join(__dirname, '..', 'docs', 'favicon.png');

        const svgContent = fs.readFileSync(svgPath, 'utf8');

        // Wrap the SVG so it renders precisely to its viewbox without white margins
        await page.setContent(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { margin: 0; padding: 0; background: transparent; display: flex; align-items: center; justify-content: center; }
                    svg { width: 512px; height: 512px; }
                </style>
            </head>
            <body>
                ${svgContent}
            </body>
            </html>
        `);

        const svgElement = await page.$('svg');
        await svgElement.screenshot({ path: pngPath, omitBackground: true });

        console.log('Successfully generated docs/favicon.png via Playwright');
        await browser.close();
    } catch (error) {
        console.error('Failed to generate PNG:', error);
        process.exit(1);
    }
})();
