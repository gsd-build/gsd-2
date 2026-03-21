/**
 * GSD Welcome Screen
 *
 * Two-panel box layout: logo left (fixed width), info right (fills terminal).
 * Falls back to simple text on narrow terminals (<70 cols) or non-TTY.
 */
import os from 'node:os';
import chalk from 'chalk';
import { GSD_LOGO } from './logo.js';
function getShortCwd() {
    const cwd = process.cwd();
    const home = os.homedir();
    return cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;
}
/** Visible length — strips ANSI escape codes before measuring. */
function visLen(s) {
    return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}
/** Right-pad a string to the given visible width. */
function rpad(s, w) {
    return s + ' '.repeat(Math.max(0, w - visLen(s)));
}
export function printWelcomeScreen(opts) {
    if (!process.stderr.isTTY)
        return;
    const { version, modelName, provider } = opts;
    const shortCwd = getShortCwd();
    const termWidth = Math.min((process.stderr.columns || 80) - 1, 200);
    // Narrow terminal fallback
    if (termWidth < 70) {
        process.stderr.write(`\n  Get Shit Done v${version}\n  ${shortCwd}\n\n`);
        return;
    }
    // ── Panel widths ────────────────────────────────────────────────────────────
    // Left panel holds the 28-char logo + padding. Right panel fills the rest.
    // Total cols: (LEFT_INNER + 2) + (RIGHT_INNER + 2) = termWidth
    const LEFT_INNER = 34;
    const RIGHT_INNER = termWidth - LEFT_INNER - 4;
    // ── Box drawing ─────────────────────────────────────────────────────────────
    const TL = '╭', TR = '╮', BL = '╰', BR = '╯';
    const H = '─', V = '│', ML = '├', MR = '┤';
    // ── Left rows: blank + 6 logo lines + blank (8 total) ───────────────────────
    const leftRows = ['', ...GSD_LOGO, ''];
    // ── Right rows (8 total, null = divider) ────────────────────────────────────
    const titleLeft = `  ${chalk.bold('Get Shit Done')}`;
    const titleRight = chalk.dim(`v${version}  `);
    const titleFill = RIGHT_INNER - visLen(titleLeft) - visLen(titleRight);
    const titleRow = titleLeft + ' '.repeat(Math.max(1, titleFill)) + titleRight;
    const toolParts = [];
    if (process.env.BRAVE_API_KEY)
        toolParts.push('Brave ✓');
    if (process.env.BRAVE_ANSWERS_KEY)
        toolParts.push('Answers ✓');
    if (process.env.JINA_API_KEY)
        toolParts.push('Jina ✓');
    if (process.env.TAVILY_API_KEY)
        toolParts.push('Tavily ✓');
    if (process.env.CONTEXT7_API_KEY)
        toolParts.push('Context7 ✓');
    // Tools left, hint right-aligned on the same row
    const toolsLeft = toolParts.length > 0 ? chalk.dim('  ' + toolParts.join('  ·  ')) : '';
    const hintRight = chalk.dim('/gsd to begin  ·  /gsd help  ');
    const footerFill = RIGHT_INNER - visLen(toolsLeft) - visLen(hintRight);
    const footerRow = toolsLeft + ' '.repeat(Math.max(1, footerFill)) + hintRight;
    const DIVIDER = null;
    const rightRows = [
        titleRow,
        DIVIDER,
        modelName ? `  Model      ${chalk.dim(modelName)}` : '',
        provider ? `  Provider   ${chalk.dim(provider)}` : '',
        `  Directory  ${chalk.dim(shortCwd)}`,
        DIVIDER,
        footerRow,
        '',
    ];
    // ── Render ──────────────────────────────────────────────────────────────────
    const out = [''];
    out.push(TL + H.repeat(LEFT_INNER) + TR + TL + H.repeat(RIGHT_INNER) + TR);
    for (let i = 0; i < 8; i++) {
        const row = leftRows[i] ?? '';
        const lContent = rpad(row ? chalk.cyan(row) : '', LEFT_INNER);
        const rRow = rightRows[i];
        if (rRow === null) {
            out.push(V + lContent + V + ML + H.repeat(RIGHT_INNER) + MR);
        }
        else {
            out.push(V + lContent + V + V + rpad(rRow, RIGHT_INNER) + V);
        }
    }
    out.push(BL + H.repeat(LEFT_INNER) + BR + BL + H.repeat(RIGHT_INNER) + BR);
    out.push('');
    process.stderr.write(out.join('\n') + '\n');
}
