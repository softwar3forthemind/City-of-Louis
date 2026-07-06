// build.js — runs at Netlify deploy time
// Reads all markdown files from _entries/ and writes entries.json
//
// ── EMBEDDED VISUALS WORKFLOW ─────────────────────────────────────────
// To attach a dynamic visual to any entry:
//   1. Drop a self-contained HTML file into  /visuals/  (e.g. visuals/cycle-of-eden.html)
//   2. In the entry's markdown body, on its own line, write:
//        [[visual: cycle-of-eden]]
//      Optional aspect ratio (width/height of the visual's natural stage):
//        [[visual: cycle-of-eden | ratio=1000/1120]]
//   3. Commit. The build validates the name, confirms the file exists,
//      and emits a fully self-styled, sandboxed <iframe>. No index.html
//      changes are ever required — the embed carries its own styling.
//
// Security: names are restricted to [a-z0-9-], the iframe is sandboxed
// (allow-scripts only — no same-origin access to the parent page, no forms,
// no popups), and missing visuals fail loudly in the build log instead of
// shipping a broken embed.
// ──────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

const CATEGORIES = ['new-adam', 'capital', 'law', 'technology'];

// Map folder names to the category keys used in index.html
const CATEGORY_MAP = {
  'new-adam':   'new-adam',
  'capital':    'capital',
  'law':        'law',
  'technology': 'technology'
};

const VISUALS_DIR = 'visuals';

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta = {};
  // Join continuation lines (lines starting with spaces) before parsing
  const normalized = match[1].replace(/\n[ \t]+/g, ' ');
  normalized.split('\n').forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return;
    const key   = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
    meta[key] = value;
  });

  return { meta, body: match[2].trim() };
}

// ── VISUAL SHORTCODE ──
// Matches a whole block consisting only of: [[visual: name]] or
// [[visual: name | ratio=W/H]]. Decap's rich-text editor escapes brackets
// as \[\[...\]\] when saving — unescape before matching so shortcodes
// written through the CMS work identically to hand-written ones.
const VISUAL_RE   = /^\[\[\s*visual\s*:\s*([a-z0-9-]+)\s*(?:\|\s*ratio\s*=\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*)?\]\]$/i;
const SAFE_NAME   = /^[a-z0-9][a-z0-9-]*$/;

function renderVisual(block, entryId) {
  const unescaped = block.replace(/\\+([\[\]|])/g, '$1');
  const m = unescaped.match(VISUAL_RE);
  if (!m) return null;

  const name = m[1].toLowerCase();
  if (!SAFE_NAME.test(name)) {
    console.warn(`⚠  [${entryId}] Invalid visual name "${name}" — skipped.`);
    return '';
  }

  const file = path.join(VISUALS_DIR, name + '.html');
  if (!fs.existsSync(file)) {
    console.warn(`⚠  [${entryId}] Visual "${name}" referenced but ${file} does not exist — skipped.`);
    return '';
  }

  // Aspect ratio of the visual's natural stage (defaults tuned for
  // full-bleed diagram pages like cycle-of-eden: 1000×1120).
  const rw = m[2] ? parseFloat(m[2]) : 1000;
  const rh = m[3] ? parseFloat(m[3]) : 1120;
  const ratio = `${rw} / ${rh}`;

  const title = name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // Fully self-styled: the embed carries every rule it needs inline, so it
  // renders identically under ANY index.html — no stylesheet coupling.
  // Inline declarations also override any legacy .entry-visual CSS rules
  // (position/inset/overflow neutralized explicitly).
  const wrapStyle =
    'display:block;position:relative;width:auto;height:auto;' +
    'aspect-ratio:auto;max-height:none;overflow:visible;line-height:0;' +
    'margin:2.8rem 0 1.2rem;border:0.5px solid #2a2410;background:#060608;';
  const frameStyle =
    'display:block;position:static;inset:auto;width:100%;height:auto;' +
    `aspect-ratio:${ratio};max-height:82vh;border:0;`;

  return (
    `<div class="entry-visual" style="${wrapStyle}">` +
    `<iframe src="/visuals/${name}.html" title="${title}" loading="lazy" ` +
    `sandbox="allow-scripts" referrerpolicy="no-referrer" scrolling="no" ` +
    `style="${frameStyle}"></iframe>` +
    `</div>`
  );
}

// Very simple markdown to HTML converter
function markdownToHtml(md, entryId) {
  return md
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // Bold / italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Blocks — split on blank lines
    .split(/\n\n+/)
    .map(block => {
      block = block.trim();
      if (!block) return '';
      if (block.startsWith('<h')) return block;

      // Embedded visual shortcode → sandboxed iframe (pass-through)
      const visual = renderVisual(block, entryId);
      if (visual !== null) return visual;

      // Blockquote: every line starts with ">"
      if (/^>/.test(block) && block.split('\n').every(l => /^>\s?/.test(l) || l.trim() === '')) {
        const inner = block.split('\n')
          .map(l => l.replace(/^>\s?/, ''))
          .join('\n')
          .split(/\n(?=\S)/)
          .map(p => `<p>${p.replace(/\n/g, ' ').trim()}</p>`)
          .join('');
        return `<blockquote>${inner}</blockquote>`;
      }

      // Unordered list
      if (block.split('\n').every(l => /^[-*]\s+/.test(l))) {
        const items = block.split('\n').map(l => `<li>${l.replace(/^[-*]\s+/, '')}</li>`).join('');
        return `<ul>${items}</ul>`;
      }

      // Ordered list
      if (block.split('\n').every(l => /^\d+\.\s+/.test(l))) {
        const items = block.split('\n').map(l => `<li>${l.replace(/^\d+\.\s+/, '')}</li>`).join('');
        return `<ol>${items}</ol>`;
      }

      // Horizontal rule
      if (/^(---|\*\*\*|___)$/.test(block)) return '<hr/>';

      return `<p>${block.replace(/\n/g, ' ')}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

const allEntries = [];

CATEGORIES.forEach(cat => {
  const dir = path.join('_entries', cat);
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

  files.forEach(file => {
    const raw      = fs.readFileSync(path.join(dir, file), 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    const id       = file.replace(/\.md$/, '');

    allEntries.push({
      id,
      category: CATEGORY_MAP[cat],
      date:     meta.date     || '',
      title:    meta.title    || 'Untitled',
      excerpt:  meta.excerpt  || '',
      body:     markdownToHtml(body, id)
    });
  });
});

// Sort newest first
allEntries.sort((a, b) => b.date.localeCompare(a.date));

fs.writeFileSync('entries.json', JSON.stringify(allEntries, null, 2));
console.log(`Built entries.json — ${allEntries.length} entries.`);
