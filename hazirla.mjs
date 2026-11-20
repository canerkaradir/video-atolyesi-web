// ffmpeg.wasm dosyalarını web/ffmpeg altına kopyalar (wasm iki parçaya bölünür).
// Kullanım: node hazirla.mjs [hedef_klasor]   (varsayılan: web)
import fs from 'node:fs';
import path from 'node:path';

const hedef = path.resolve(process.argv[2] || 'web');
const lib = path.join(hedef, 'ffmpeg', 'lib');
const core = path.join(hedef, 'ffmpeg', 'core');
fs.mkdirSync(lib, { recursive: true });
fs.mkdirSync(core, { recursive: true });

const esm = 'node_modules/@ffmpeg/ffmpeg/dist/esm';
for (const f of fs.readdirSync(esm)) if (f.endsWith('.js')) fs.copyFileSync(path.join(esm, f), path.join(lib, f));

fs.copyFileSync('node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js', path.join(core, 'ffmpeg-core.js'));
const wasm = fs.readFileSync('node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm');
const yari = Math.ceil(wasm.length / 2);
fs.writeFileSync(path.join(core, 'ffmpeg-core.1.wasm'), wasm.subarray(0, yari));
fs.writeFileSync(path.join(core, 'ffmpeg-core.2.wasm'), wasm.subarray(yari));
console.log('Hazır:', hedef);
