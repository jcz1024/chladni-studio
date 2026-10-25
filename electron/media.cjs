const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { randomUUID } = require('node:crypto');

const MIME = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.opus': 'audio/ogg', '.webm': 'audio/webm' };

function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) throw new Error('Invalid range');
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) throw new Error('Unsatisfiable range');
  return { start, end };
}

class MediaLibrary {
  constructor() { this.files = new Map(); this.paths = new Map(); }
  async add(filePaths) {
    const tracks = [];
    for (const filePath of filePaths.slice(0, 500)) {
      const full = path.resolve(filePath);
      if (!MIME[path.extname(full).toLowerCase()]) continue;
      try {
        const stat = await fs.promises.stat(full);
        if (!stat.isFile() || !stat.size) continue;
        let id = this.paths.get(full);
        if (!id) { id = randomUUID(); this.files.set(id, full); this.paths.set(full, id); }
        tracks.push({ id, name: path.basename(full, path.extname(full)), extension: path.extname(full).slice(1).toUpperCase(), size: stat.size, url: `chladni-media://audio/${id}` });
      } catch { /* A missing or unreadable dropped file is skipped. */ }
    }
    return tracks;
  }
  async respond(request) {
    const url = new URL(request.url);
    const full = url.hostname === 'audio' && this.files.get(url.pathname.slice(1));
    if (!full) return new Response('Not found', { status: 404 });
    try {
      const stat = await fs.promises.stat(full);
      let range;
      try { range = parseRange(request.headers.get('range'), stat.size); }
      catch { return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } }); }
      const { start, end } = range || { start: 0, end: stat.size - 1 };
      const headers = { 'Content-Type': MIME[path.extname(full).toLowerCase()], 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
      if (range) headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });
      return new Response(Readable.toWeb(fs.createReadStream(full, { start, end })), { status: range ? 206 : 200, headers });
    } catch { return new Response('File unavailable', { status: 404 }); }
  }
}

module.exports = { MediaLibrary, parseRange };
