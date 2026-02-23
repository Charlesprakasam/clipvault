/**
 * ClipVault — Unit Tests for Utility Functions
 *
 * Tests the pure helper functions extracted from app.js.
 * Since app.js is an IIFE, we re-implement the functions here for testing.
 * In a production refactor, these would be in a separate module.
 */

// ---- Re-implement utility functions for unit testing ----
// These mirror the exact implementations in app.js

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function timeAgo(date) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function highlightText(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escaped.replace(regex, '<span class="highlight">$1</span>');
}

function truncate(str, max = 300) {
    if (str.length <= max) return str;
    return str.slice(0, max) + '…';
}

// ---- Tests ----

describe('generateId', () => {
    test('returns a non-empty string', () => {
        const id = generateId();
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
    });

    test('generates unique IDs', () => {
        const ids = new Set(Array.from({ length: 100 }, () => generateId()));
        expect(ids.size).toBe(100);
    });
});

describe('timeAgo', () => {
    test('returns "just now" for very recent dates', () => {
        const now = new Date().toISOString();
        expect(timeAgo(now)).toBe('just now');
    });

    test('returns seconds for times under a minute', () => {
        const date = new Date(Date.now() - 30 * 1000).toISOString();
        expect(timeAgo(date)).toMatch(/^\d+s ago$/);
    });

    test('returns minutes for times under an hour', () => {
        const date = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        expect(timeAgo(date)).toMatch(/^\d+m ago$/);
    });

    test('returns hours for times under a day', () => {
        const date = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
        expect(timeAgo(date)).toMatch(/^\d+h ago$/);
    });

    test('returns days for times under a week', () => {
        const date = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        expect(timeAgo(date)).toMatch(/^\d+d ago$/);
    });

    test('returns formatted date for times over a week', () => {
        const date = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const result = timeAgo(date);
        // Should be something like "Feb 9" or "Jan 31"
        expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    });
});

describe('escapeHtml', () => {
    test('escapes angle brackets', () => {
        expect(escapeHtml('<script>alert("xss")</script>')).not.toContain('<script>');
    });

    test('escapes ampersands', () => {
        expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    test('handles quotes without breaking', () => {
        const result = escapeHtml('"hello"');
        // jsdom textContent/innerHTML doesn't entity-encode double quotes
        // but the function should handle them without error
        expect(result).toContain('hello');
        expect(typeof result).toBe('string');
    });

    test('leaves plain text unchanged', () => {
        expect(escapeHtml('hello world')).toBe('hello world');
    });

    test('handles empty string', () => {
        expect(escapeHtml('')).toBe('');
    });
});

describe('highlightText', () => {
    test('returns escaped text when no query', () => {
        expect(highlightText('hello world', '')).toBe('hello world');
    });

    test('wraps matching text in highlight span', () => {
        const result = highlightText('hello world', 'world');
        expect(result).toContain('<span class="highlight">world</span>');
    });

    test('is case-insensitive', () => {
        const result = highlightText('Hello World', 'hello');
        expect(result).toContain('<span class="highlight">Hello</span>');
    });

    test('highlights multiple occurrences', () => {
        const result = highlightText('foo bar foo', 'foo');
        const matches = result.match(/<span class="highlight">/g);
        expect(matches.length).toBe(2);
    });

    test('escapes HTML in text before highlighting', () => {
        const result = highlightText('<b>bold</b>', 'bold');
        expect(result).not.toContain('<b>');
        expect(result).toContain('<span class="highlight">bold</span>');
    });
});

describe('truncate', () => {
    test('returns short strings unchanged', () => {
        expect(truncate('hello')).toBe('hello');
    });

    test('truncates strings over 300 chars', () => {
        const long = 'a'.repeat(500);
        const result = truncate(long);
        expect(result.length).toBe(301); // 300 + '…'
        expect(result.endsWith('…')).toBe(true);
    });

    test('respects custom max length', () => {
        const result = truncate('hello world', 5);
        expect(result).toBe('hello…');
    });

    test('does not truncate at exactly max length', () => {
        const result = truncate('12345', 5);
        expect(result).toBe('12345');
    });
});
