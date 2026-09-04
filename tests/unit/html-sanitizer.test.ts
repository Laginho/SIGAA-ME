// @vitest-environment jsdom
/**
 * SEC-001: sanitizeNewsHtml — allowlist sanitizer for SIGAA news HTML.
 *
 * One `it` per seam from the handoff. All tests call production code
 * (`src/security/html-sanitizer.ts`) which does not exist yet: every
 * test fails with "Cannot find module".
 */

import { describe, it, expect } from 'vitest';
import { sanitizeNewsHtml } from '../../src/security/html-sanitizer';

const MALICIOUS = [
  '<img src=x onerror=alert(1)>',
  '<script>alert(1)</script>',
  '<iframe src="evil.com"></iframe>',
  '<svg onload=alert(1)></svg>',
  '<a href="javascript:alert(1)">click</a>',
].join('');

describe('sanitizeNewsHtml', () => {
  // ── Preserves allowed tags ─────────────────────────────
  it('preserves allowed inline tags: p, b, strong, i, em, u, br', () => {
    const input = '<p>text <b>bold</b> <strong>s</strong> <i>em</i> <em>phasis</em> <u>under</u><br/>rest</p>';
    const out = sanitizeNewsHtml(input);
    expect(out).toContain('<p>');
    expect(out).toContain('<b>');
    expect(out).toContain('<strong>');
    expect(out).toContain('<i>');
    expect(out).toContain('<em>');
    expect(out).toContain('<u>');
    expect(out).toContain('<br');
  });

  it('preserves allowed block tags: ul, ol, li, blockquote, h3, h4, span, div', () => {
    const input = '<ul><li>a</li></ul><ol><li>b</li></ol><blockquote>q</blockquote><h3>t</h3><h4>u</h4><span>s</span><div>d</div>';
    const out = sanitizeNewsHtml(input);
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>');
    expect(out).toContain('<ol>');
    expect(out).toContain('<blockquote>');
    expect(out).toContain('<h3>');
    expect(out).toContain('<h4>');
    expect(out).toContain('<span>');
    expect(out).toContain('<div>');
  });

  it('preserves table tags: table, thead, tbody, tr, th, td', () => {
    const input = '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table>';
    const out = sanitizeNewsHtml(input);
    expect(out).toContain('<table>');
    expect(out).toContain('<thead>');
    expect(out).toContain('<tbody>');
    expect(out).toContain('<tr>');
    expect(out).toContain('<th>');
    expect(out).toContain('<td>');
  });

  it('preserves <a> with https and mailto href, adds rel="noopener noreferrer"', () => {
    const input = '<a href="https://si3.ufc.br/x">link</a><a href="mailto:prof@ufc.br">mail</a>';
    const out = sanitizeNewsHtml(input);
    expect(out).toContain('href="https://si3.ufc.br/x"');
    expect(out).toContain('href="mailto:prof@ufc.br"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  // ── Removes dangerous elements ─────────────────────────
  it('removes script, style, iframe, form, input, button, svg, math, object, embed, img, link, meta, base, template', () => {
    const tags = ['script', 'style', 'iframe', 'form', 'input', 'button', 'svg', 'math', 'object', 'embed', 'img', 'link', 'meta', 'base', 'template'];
    for (const tag of tags) {
      const out = sanitizeNewsHtml(`<${tag}>x</${tag}>`);
      expect(out.toLowerCase()).not.toContain(`<${tag}`);
    }
  });

  // ── Removes dangerous attributes, keeps element ────────
  it('removes onerror, onclick, onload, onmouseover, style, class, id, target, data-x', () => {
    const input = '<a href="https://ok.com" onclick="alert(1)" onerror="alert(1)" onload="alert(1)" onmouseover="alert(1)" style="color:red" class="x" id="y" target="_blank" data-x="z">text</a>';
    const out = sanitizeNewsHtml(input);
    expect(out).not.toMatch(/onclick/i);
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/onload/i);
    expect(out).not.toMatch(/onmouseover/i);
    expect(out).not.toMatch(/style=/i);
    expect(out).not.toMatch(/class=/i);
    expect(out).not.toMatch(/id=/i);
    expect(out).not.toMatch(/target=/i);
    expect(out).not.toMatch(/data-x=/i);
    expect(out).toContain('<a');
    expect(out).toContain('text');
  });

  // ── Removes unsafe hrefs ───────────────────────────────
  it('removes javascript: hrefs (including mixed-case and encoded variants)', () => {
    const variants = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'java\u0000script:alert(1)',
      '&#x6A;avascript:alert(1)',
    ];
    for (const uri of variants) {
      const out = sanitizeNewsHtml(`<a href="${uri}">x</a>`);
      expect(out).not.toMatch(/javascript:/i);
      const aMatch = out.match(/<a[^>]*>/i);
      if (aMatch) {
        expect(aMatch[0]).not.toContain(uri);
      }
    }
  });

  it('removes data: hrefs', () => {
    const out = sanitizeNewsHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>');
    expect(out).not.toMatch(/data:/i);
  });

  it('removes vbscript: hrefs', () => {
    const out = sanitizeNewsHtml('<a href="vbscript:MsgBox(1)">x</a>');
    expect(out).not.toMatch(/vbscript:/i);
  });

  it('removes file: hrefs', () => {
    const out = sanitizeNewsHtml('<a href="file:///etc/passwd">x</a>');
    expect(out).not.toMatch(/file:/i);
  });

  // ── mXSS vectors ───────────────────────────────────────
  it('neutralizes mXSS via svg/noscript nesting', () => {
    const input = '<svg><p><style><img src=x onerror=alert(1)></style></p></svg>';
    const out = sanitizeNewsHtml(input);
    expect(out).not.toContain('<svg');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('<img');
  });

  it('neutralizes mXSS via math/mtext/table/mglyph', () => {
    const input = '<math><mtext><table><mglyph><style><img src=x onerror=1>';
    const out = sanitizeNewsHtml(input);
    expect(out).not.toContain('<math');
    expect(out).not.toContain('<img');
    expect(out).not.toMatch(/onerror/i);
  });

  // ── Idempotency ────────────────────────────────────────
  it('is idempotent: sanitize(sanitize(x)) === sanitize(x)', () => {
    const fixture = '<p>ok</p><script>x</script><a href="javascript:alert(1)">j</a><img src=x onerror=alert(1)>';
    const once = sanitizeNewsHtml(fixture);
    const twice = sanitizeNewsHtml(once);
    expect(twice).toBe(once);
  });

  // ── No executable nodes in output ──────────────────────
  it('produces no executable nodes: no script, iframe, object, embed, form, svg, math, style, img, or event handlers', () => {
    const fixture = [
      '<p>ok</p>',
      '<script>alert(1)</script>',
      '<iframe src="evil.com"></iframe>',
      '<object data="evil.swf"></object>',
      '<embed src="evil.swf">',
      '<form action="evil.com"><input onfocus="alert(1)"></form>',
      '<svg onload="alert(1)"></svg>',
      '<math><mtext>x</mtext></math>',
      '<style>body{background:red}</style>',
      '<img src=x onerror="alert(1)">',
      '<a href="javascript:alert(1)">click</a>',
      '<div onmouseover="alert(1)">hover</div>',
      '<button onclick="alert(1)">btn</button>',
    ].join('');
    const out = sanitizeNewsHtml(fixture);
    const div = document.createElement('div');
    div.innerHTML = out;
    const bad = div.querySelectorAll(
      'script, iframe, object, embed, form, svg, math, style, img, [onerror], [onclick], [onload], [onmouseover], [onfocus], [onblur]'
    );
    expect(bad.length).toBe(0);
  });
});
