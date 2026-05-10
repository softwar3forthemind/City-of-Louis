// build.js — runs at Netlify deploy time
// Reads all markdown files from _entries/ and writes entries.json

const fs   = require('fs');
const path = require('path');

const CATEGORIES = ['new-adam', 'capital', 'law', 'technology'];

// Map folder names to the category keys used in index.html
const CATEGORY_MAP = {
  'new-adam':   'newadам',
  'capital':    'capital',
  'law':        'law',
  'technology': 'technology'
};

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

// Very simple markdown to HTML converter
function markdownToHtml(md) {
  return md
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // Bold / italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Paragraphs — split on blank lines
    .split(/\n\n+/)
    .map(block => {
      block = block.trim();
      if (!block) return '';
      if (block.startsWith('<h')) return block;
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
      body:     markdownToHtml(body)
    });
  });
});

// Sort newest first
allEntries.sort((a, b) => b.date.localeCompare(a.date));

fs.writeFileSync('entries.json', JSON.stringify(allEntries, null, 2));
console.log(`Built entries.json — ${allEntries.length} entries.`);
