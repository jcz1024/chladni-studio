const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const palettePatch=process.argv.includes('--palette-patch');
const name = `Chladni-Studio-${version}-Windows-x64`;
const downloads = path.join(root, 'release/downloads');
const stage = path.join(downloads, name);
const zip = path.join(downloads, `${name}.zip`);
const exe = path.join(root, 'release', `${name}.exe`);
if (!fs.existsSync(exe)) throw new Error('Build the portable executable first.');
if (fs.existsSync(stage) || fs.existsSync(zip)) throw new Error('A release bundle already exists; refusing to overwrite it.');
fs.mkdirSync(stage, { recursive: true });

const copy = (from, to) => fs.cpSync(path.join(root, from), path.join(stage, to), { recursive: true });
copy(`release/${name}.exe`, `${name}.exe`);
copy('release/使用说明.txt', '使用说明.txt');
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md']) copy(file, file);
for (const file of ['README.md', 'RESEARCH.md', 'VALIDATION.md', 'PHYSICS.md']) copy(file, `docs/${file}`);
for (const file of ['LICENSE.electron.txt', 'LICENSES.chromium.html']) copy(`release/win-unpacked/${file}`, `docs/${file}`);
copy('output/portable-smoke-report.json', 'docs/portable-smoke-report.json');
copy('output/portable-preview.png', 'docs/preview.png');
const fullscreenReport=path.join(root,'output/packaged-fullscreen-report.json');
if(fs.existsSync(fullscreenReport)&&JSON.parse(fs.readFileSync(fullscreenReport,'utf8')).version===version){
  copy('output/packaged-fullscreen-report.json','docs/fullscreen-report.json');
  copy('output/fullscreen-preview.png','docs/fullscreen-preview.png');
  copy('output/fullscreen-button.png','docs/fullscreen-button.png');
}
if(palettePatch){
  copy('output/packaged-smoke-report.json','docs/desktop-smoke-report.json');
  copy('output/packaged-palette-report.json','docs/palette-report.json');
  if(!JSON.parse(fs.readFileSync(fullscreenReport,'utf8')).taskbarHitVerified)copy('output/fullscreen-report.json','docs/fullscreen-environment-baseline9.json');
  for(const palette of ['sand','ice','iris','silver'])copy(`output/palette-${palette}.png`,`docs/palette-${palette}.png`);
  const baseline='release/downloads/Chladni-Studio-1.0.0-alpha.9-Windows-x64/docs';
  for(const file of ['VALIDATION.md','realtime-report.json','grain-regression-report.json','music-visual-report.json','experience-report.json','physical-quality-report.json','lab-report.json'])copy(`${baseline}/${file}`,`docs/baseline-alpha.9/${file}`);
}else{
copy('output/packaged-realtime-report.json', 'docs/realtime-report.json');
copy('output/packaged-smoke-report.json', 'docs/desktop-smoke-report.json');
copy('output/packaged-grain-report.json', 'docs/grain-regression-report.json');
copy('output/packaged-music-visual-report.json', 'docs/music-visual-report.json');
copy('output/packaged-experience-report.json','docs/experience-report.json');
copy('output/packaged-physical-quality-report.json','docs/physical-quality-report.json');
copy('output/packaged-lab-report.json','docs/lab-report.json');
for(const name of ['lab-sweep-preview','lab-controls-preview'])copy(`output/${name}.png`,`docs/${name}.png`);
for(const name of ['physical-contact-comparison','physical-long-square','physical-long-circle'])copy(`output/${name}.png`,`docs/${name}.png`);
for(const preset of ['geometry','beat','calm','detail'])copy(`output/preset-${preset}.png`,`docs/preset-${preset}.png`);
for(const seconds of [4,8,12,16])copy(`output/music-comparison-${seconds}s.png`,`docs/music-comparison-${seconds}s.png`);
copy('output/free-plate-tone.png', 'docs/free-plate-tone.png');
copy('output/free-square-nodes.png', 'docs/free-square-nodes.png');
copy('output/free-circle-nodes.png', 'docs/free-circle-nodes.png');
copy('output/sustained-physical.png', 'docs/sustained-physical.png');
}
copy('output/多模态节奏示例.wav', '示例音频/多模态节奏示例.wav');
for(const fixture of require('./make-resonance-fixtures.cjs').makeResonanceFixtures())copy(path.relative(root,fixture.file),`示例音频/${fixture.name}`);
for (const directory of ['electron', 'src', 'assets', 'scripts', 'tests']) copy(directory, `source/${directory}`);
for (const file of ['package.json', 'package-lock.json', '.npmrc', '.gitignore', 'README.md', 'RESEARCH.md', 'VALIDATION.md', 'PHYSICS.md', 'CHANGELOG.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) copy(file, `source/${file}`);

function filesIn(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesIn(full) : [full];
  });
}
const entries = filesIn(stage).sort().map(file => ({
  name: path.relative(stage, file).replaceAll('\\', '/'),
  sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}));
fs.writeFileSync(path.join(stage, 'SHA256SUMS.txt'), entries.map(entry => `${entry.sha256}  ${entry.name}`).join('\r\n') + '\r\n', 'utf8');

const command = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($env:CHLADNI_PACKAGE_STAGE,$env:CHLADNI_PACKAGE_ZIP,[IO.Compression.CompressionLevel]::Optimal,$true)
$archive=[IO.Compression.ZipFile]::OpenRead($env:CHLADNI_PACKAGE_ZIP)
try {
  $count=0
  foreach($entry in $archive.Entries) {
    if($entry.FullName.EndsWith('/')) { continue }
    $original=Join-Path $env:CHLADNI_PACKAGE_PARENT $entry.FullName
    $originalStream=[IO.File]::OpenRead($original)
    $originalSha=[Security.Cryptography.SHA256]::Create()
    try { $expected=([BitConverter]::ToString($originalSha.ComputeHash($originalStream))).Replace('-','') }
    finally { $originalStream.Dispose(); $originalSha.Dispose() }
    $stream=$entry.Open()
    $sha=[Security.Cryptography.SHA256]::Create()
    try { $actual=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','') }
    finally { $stream.Dispose(); $sha.Dispose() }
    if($actual -ne $expected) { throw ('ZIP verification failed: '+$entry.FullName) }
    $count++
  }
  Write-Output ('ZIP content verified: '+$count+' files')
} finally { $archive.Dispose() }
`;
execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
  windowsHide: true, stdio: 'inherit',
  env: { ...process.env, CHLADNI_PACKAGE_STAGE: stage, CHLADNI_PACKAGE_ZIP: zip, CHLADNI_PACKAGE_PARENT: downloads }
});
const zipHash = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
fs.writeFileSync(`${zip}.sha256`, `${zipHash}  ${path.basename(zip)}\r\n`);
console.log(JSON.stringify({ version, zip, bytes: fs.statSync(zip).size, files: entries.length + 1, sha256: zipHash }, null, 2));
