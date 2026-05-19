// build.js — runs at Netlify deploy time
// Reads all markdown files from _entries/ and writes entries.json

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

// Markdown to HTML converter
function markdownToHtml(md) {
  // Inline formatting helper
  function inlineFormat(text) {
    return text
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>');
  }

  const blocks = md.split(/\n\n+/);
  const html = [];

  for (let block of blocks) {
    block = block.trim();
    if (!block) continue;

    // Headers
    if (/^### /.test(block)) {
      html.push(`<h3>${inlineFormat(block.replace(/^### /, ''))}</h3>`);
      continue;
    }
    if (/^## /.test(block)) {
      html.push(`<h2>${inlineFormat(block.replace(/^## /, ''))}</h2>`);
      continue;
    }
    if (/^# /.test(block)) {
      html.push(`<h2>${inlineFormat(block.replace(/^# /, ''))}</h2>`);
      continue;
    }

    // Strip trailing backslash line breaks (Decap CMS soft line break encoding)
    block = block.replace(/\\\s*$/gm, '').trim();

    // Blockquote — lines starting with >
    if (/^> /.test(block)) {
      const lines = block.split('\n');
      const inner = lines
        .map(l => l.replace(/^> ?/, '').trim())
        .filter(l => l.length > 0)
        .map(l => inlineFormat(l));
      html.push(`<blockquote>${inner.join('<br/>')}</blockquote>`);
      continue;
    }

    // Ordered list — lines starting with 1. 2. etc.
    if (/^\d+\. /.test(block)) {
      const items = block.split('\n')
        .filter(l => /^\d+\. /.test(l.trim()))
        .map(l => `<li>${inlineFormat(l.replace(/^\d+\. /, '').trim())}</li>`);
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Unordered list — lines starting with - or *
    if (/^[-*] /.test(block)) {
      const items = block.split('\n')
        .filter(l => /^[-*] /.test(l.trim()))
        .map(l => `<li>${inlineFormat(l.replace(/^[-*] /, '').trim())}</li>`);
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Plain paragraph
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    html.push(`<p>${inlineFormat(lines.join(' '))}</p>`);
  }

  return html.join('\n');
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
