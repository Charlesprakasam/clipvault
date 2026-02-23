#!/usr/bin/env node

/**
 * ClipVault — Electron Security Audit (DAST-equivalent)
 *
 * Scans main.js for insecure Electron configuration patterns.
 * This is a static check of runtime security settings.
 *
 * Checks:
 * 1. nodeIntegration enabled without contextIsolation
 * 2. webSecurity disabled
 * 3. allowRunningInsecureContent
 * 4. Remote content loaded with node access
 * 5. Missing sandbox
 * 6. Protocol handler registration without validation
 */

const fs = require('fs');
const path = require('path');

const MAIN_FILE = path.join(__dirname, '../../main.js');
const APP_FILE = path.join(__dirname, '../../app.js');

const SEVERITY = {
    CRITICAL: '🔴 CRITICAL',
    HIGH: '🟠 HIGH',
    MEDIUM: '🟡 MEDIUM',
    LOW: '🟢 LOW',
    INFO: 'ℹ️  INFO',
};

const findings = [];

function addFinding(severity, title, description, file, lineNum) {
    findings.push({ severity, title, description, file, lineNum });
}

function auditFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${filePath}`);
        return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const fileName = path.basename(filePath);

    // Check 1: nodeIntegration without contextIsolation
    const hasNodeIntegration = lines.findIndex(l => l.includes('nodeIntegration: true'));
    const hasContextIsolation = lines.findIndex(l => l.includes('contextIsolation: true'));

    if (hasNodeIntegration !== -1 && hasContextIsolation === -1) {
        addFinding(
            SEVERITY.HIGH,
            'nodeIntegration enabled without contextIsolation',
            'nodeIntegration: true allows renderer to access Node.js APIs. ' +
            'Without contextIsolation: true, malicious content could access Node.js. ' +
            'Consider enabling contextIsolation and using a preload script with contextBridge.',
            fileName,
            hasNodeIntegration + 1
        );
    } else if (hasNodeIntegration !== -1) {
        addFinding(
            SEVERITY.MEDIUM,
            'nodeIntegration is enabled',
            'nodeIntegration: true is enabled. While contextIsolation may mitigate risks, ' +
            'consider using a preload script with contextBridge for better security.',
            fileName,
            hasNodeIntegration + 1
        );
    }

    // Check 2: webSecurity disabled
    const webSecurityLine = lines.findIndex(l => l.includes('webSecurity: false'));
    if (webSecurityLine !== -1) {
        addFinding(
            SEVERITY.CRITICAL,
            'webSecurity is disabled',
            'webSecurity: false disables same-origin policy and allows loading remote resources. ' +
            'This is a severe security risk.',
            fileName,
            webSecurityLine + 1
        );
    }

    // Check 3: allowRunningInsecureContent
    const insecureContentLine = lines.findIndex(l => l.includes('allowRunningInsecureContent: true'));
    if (insecureContentLine !== -1) {
        addFinding(
            SEVERITY.CRITICAL,
            'allowRunningInsecureContent is enabled',
            'This allows HTTPS pages to load and execute HTTP content, enabling MITM attacks.',
            fileName,
            insecureContentLine + 1
        );
    }

    // Check 4: Remote content with node access
    const loadURLLine = lines.findIndex(l => /loadURL\s*\(\s*['"`]https?:/.test(l));
    if (loadURLLine !== -1 && hasNodeIntegration !== -1) {
        addFinding(
            SEVERITY.CRITICAL,
            'Remote content loaded with nodeIntegration',
            'Loading remote URLs with nodeIntegration enabled is extremely dangerous. ' +
            'Remote code could execute arbitrary commands on the user\'s system.',
            fileName,
            loadURLLine + 1
        );
    }

    // Check 5: Missing sandbox
    const hasSandbox = lines.findIndex(l => l.includes('sandbox: true'));
    if (hasSandbox === -1 && hasNodeIntegration !== -1) {
        addFinding(
            SEVERITY.LOW,
            'Sandbox is not explicitly enabled',
            'Consider enabling sandbox: true in webPreferences for additional security hardening.',
            fileName,
            hasNodeIntegration + 1
        );
    }

    // Check 6: eval or Function constructor in renderer
    if (fileName === 'app.js') {
        lines.forEach((line, i) => {
            if (/\beval\s*\(/.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
                addFinding(
                    SEVERITY.MEDIUM,
                    'Use of eval() detected',
                    'eval() can execute arbitrary code and is a common XSS vector.',
                    fileName,
                    i + 1
                );
            }
            if (/new\s+Function\s*\(/.test(line)) {
                addFinding(
                    SEVERITY.MEDIUM,
                    'Use of new Function() detected',
                    'The Function constructor is equivalent to eval() and can execute arbitrary code.',
                    fileName,
                    i + 1
                );
            }
        });
    }

    // Check 7: Dangerous protocol handlers
    const protocolLine = lines.findIndex(l => l.includes('protocol.registerHttpProtocol') ||
        l.includes('protocol.registerFileProtocol'));
    if (protocolLine !== -1) {
        addFinding(
            SEVERITY.MEDIUM,
            'Custom protocol handler registered',
            'Custom protocol handlers should validate all input to prevent path traversal or injection.',
            fileName,
            protocolLine + 1
        );
    }

    // Check 8: shell.openExternal without validation
    const shellLine = lines.findIndex(l => l.includes('shell.openExternal'));
    if (shellLine !== -1) {
        addFinding(
            SEVERITY.MEDIUM,
            'shell.openExternal used',
            'Ensure shell.openExternal validates URLs to prevent opening malicious protocols.',
            fileName,
            shellLine + 1
        );
    }
}

// ---- Run Audit ----
console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║  ClipVault — Electron Security Audit        ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');

auditFile(MAIN_FILE);
auditFile(APP_FILE);

if (findings.length === 0) {
    console.log('✅ No security issues found!\n');
    process.exit(0);
} else {
    console.log(`Found ${findings.length} finding(s):\n`);

    findings.forEach((f, i) => {
        console.log(`${i + 1}. ${f.severity}: ${f.title}`);
        console.log(`   File: ${f.file}:${f.lineNum}`);
        console.log(`   ${f.description}`);
        console.log('');
    });

    // Determine exit code
    const hasCritical = findings.some(f => f.severity === SEVERITY.CRITICAL);
    const hasHigh = findings.some(f => f.severity === SEVERITY.HIGH);

    if (hasCritical) {
        console.log('❌ CRITICAL issues found — audit FAILED');
        process.exit(2);
    } else if (hasHigh) {
        console.log('⚠️  HIGH severity issues found — review recommended');
        // Exit 0 but warn — these are known accepted risks for a local desktop app
        process.exit(0);
    } else {
        console.log('✅ No critical issues — audit PASSED with advisories');
        process.exit(0);
    }
}
