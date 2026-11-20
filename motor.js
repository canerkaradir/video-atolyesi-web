// Video Atölyesi — işlem motoru (ffmpeg.wasm). Tarayıcıda ve APK'daki WebView'da aynı çalışır.
import { FFmpeg } from './ffmpeg/lib/index.js';

const CORE_JS = new URL('./ffmpeg/core/ffmpeg-core.js', import.meta.url).href;
const WASM_PARCALARI = ['ffmpeg-core.1.wasm', 'ffmpeg-core.2.wasm'];

let ff = null;
let hazirSoz = null;
let wasmBlobURL = null;
let gunluk = [];
let ilerlemeFn = null;
let toplamSn = 0;
let sayac = 0;

async function wasmHazirla() {
  if (wasmBlobURL) return wasmBlobURL;
  const parcalar = [];
  for (const ad of WASM_PARCALARI) {
    const r = await fetch(new URL('./ffmpeg/core/' + ad, import.meta.url));
    if (!r.ok) throw new Error('Motor dosyası yüklenemedi: ' + ad);
    parcalar.push(await r.blob());
  }
  wasmBlobURL = URL.createObjectURL(new Blob(parcalar, { type: 'application/wasm' }));
  return wasmBlobURL;
}

export function hazirla() {
  if (hazirSoz) return hazirSoz;
  hazirSoz = (async () => {
    const wasmURL = await wasmHazirla();
    ff = new FFmpeg();
    ff.on('log', ({ message }) => {
      gunluk.push(message);
      if (gunluk.length > 4000) gunluk.splice(0, 2000);
      if (ilerlemeFn && toplamSn > 0) {
        const m = /time=\s*(-?\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message);
        if (m) {
          const t = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
          ilerlemeFn(Math.max(0, Math.min(0.99, t / toplamSn)));
        }
      }
    });
    await ff.load({ coreURL: CORE_JS, wasmURL });
    return true;
  })();
  hazirSoz.catch(() => { hazirSoz = null; });
  return hazirSoz;
}

export function hazirMi() { return !!ff && ff.loaded; }

// Çalışan işlemi durdurur; motor yeniden yüklenir.
export async function iptal() {
  try { ff && ff.terminate(); } catch (e) { /* yok say */ }
  ff = null; hazirSoz = null;
  hazirla().catch(() => {});
}

async function calistir(args, sure = 0, ilerleme = null) {
  gunluk = [];
  toplamSn = sure;
  ilerlemeFn = ilerleme;
  try {
    const ret = await ff.exec(args);
    return { ret, gunluk: gunluk.join('\n') };
  } finally {
    ilerlemeFn = null; toplamSn = 0;
  }
}

function uzanti(ad) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(ad || '');
  return m ? m[1].toLowerCase() : '';
}

// Dosyaları motora bağlar (kopyalamadan, WORKERFS). Olmazsa belleğe yazar.
async function bagla(dosyalar) {
  const dizin = '/g' + (++sayac);
  const yeniler = dosyalar.map((f, i) => new File([f], `d${i}.${uzanti(f.name) || 'bin'}`));
  await ff.createDir(dizin);
  try {
    await ff.mount('WORKERFS', { files: yeniler }, dizin);
    return { dizin, yollar: yeniler.map(f => `${dizin}/${f.name}`), bagli: true };
  } catch (e) {
    const yollar = [];
    for (const f of yeniler) {
      const p = `${dizin}/${f.name}`;
      await ff.writeFile(p, new Uint8Array(await f.arrayBuffer()));
      yollar.push(p);
    }
    return { dizin, yollar, bagli: false };
  }
}

async function coz(b) {
  try {
    if (b.bagli) await ff.unmount(b.dizin);
    else for (const p of b.yollar) { try { await ff.deleteFile(p); } catch (e) {} }
    await ff.deleteDir(b.dizin);
  } catch (e) { /* yok say */ }
}

async function sonucuAl(yol, mime) {
  const veri = await ff.readFile(yol);
  try { await ff.deleteFile(yol); } catch (e) {}
  if (!veri || !veri.length) throw new Error('Çıktı dosyası boş çıktı.');
  return new Blob([veri.buffer], { type: mime });
}

async function sil(yol) { try { await ff.deleteFile(yol); } catch (e) {} }

// ---------- Dosya bilgisi ----------
function bilgiCoz(log) {
  const b = { sure: 0, video: null, ses: null };
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log);
  if (d) b.sure = (+d[1]) * 3600 + (+d[2]) * 60 + parseFloat(d[3]);
  for (const satir of log.split('\n')) {
    if (!b.video && /Stream #.*Video:/.test(satir) && !/attached pic|mjpeg|png/.test(satir)) {
      const k = /Video:\s*(\w+)/.exec(satir);
      const o = /,\s*(\d{2,5})x(\d{2,5})/.exec(satir);
      const fps = /([\d.]+)\s*fps/.exec(satir);
      b.video = { kodek: k ? k[1] : '?', g: o ? +o[1] : 0, y: o ? +o[2] : 0, fps: fps ? parseFloat(fps[1]) : 0, donme: 0 };
    } else if (!b.ses && /Stream #.*Audio:/.test(satir)) {
      const k = /Audio:\s*(\w+)/.exec(satir);
      const hz = /(\d+)\s*Hz/.exec(satir);
      const kanal = /Hz,\s*([^,]+)/.exec(satir);
      b.ses = { kodek: k ? k[1] : '?', hz: hz ? +hz[1] : 0, kanal: kanal ? kanal[1].trim() : '' };
    }
  }
  const r1 = /rotate\s*:\s*(-?\d+)/.exec(log);
  const r2 = /rotation of (-?[\d.]+) degrees/.exec(log);
  if (b.video) {
    let r = r1 ? +r1[1] : r2 ? Math.round(parseFloat(r2[1])) : 0;
    r = ((r % 360) + 360) % 360;
    b.video.donme = r;
  }
  return b;
}

async function bilgiYol(yol) {
  const { gunluk: log } = await calistir(['-hide_banner', '-i', yol]);
  return bilgiCoz(log);
}

export async function bilgi(dosya) {
  await hazirla();
  const b = await bagla([dosya]);
  try { return await bilgiYol(b.yollar[0]); }
  finally { await coz(b); }
}

// ---------- Ayarlar ----------
const H264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p'];
const AAC = ['-c:a', 'aac', '-b:a', '128k'];

export const VIDEO_BICIMLERI = {
  mp4: { ad: 'MP4', mime: 'video/mp4' },
  '3gp': { ad: '3GP', mime: 'video/3gpp' },
  avi: { ad: 'AVI', mime: 'video/x-msvideo' },
  mkv: { ad: 'MKV', mime: 'video/x-matroska' },
  mov: { ad: 'MOV', mime: 'video/quicktime' },
};
export const SES_BICIMLERI = {
  mp3: { ad: 'MP3', mime: 'audio/mpeg' },
  m4a: { ad: 'M4A', mime: 'audio/mp4' },
  wav: { ad: 'WAV', mime: 'audio/wav' },
  ogg: { ad: 'OGG', mime: 'audio/ogg' },
};
function mimeBul(ext) {
  return (VIDEO_BICIMLERI[ext] || SES_BICIMLERI[ext] || {}).mime ||
    ({ webm: 'video/webm', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/ogg' })[ext] || 'application/octet-stream';
}

function sesKodlayici(ext) {
  switch (ext) {
    case 'mp3': return ['-c:a', 'libmp3lame', '-b:a', '192k'];
    case 'wav': return ['-c:a', 'pcm_s16le'];
    case 'ogg': return ['-c:a', 'libvorbis', '-q:a', '5'];
    case 'm4a': default: return ['-c:a', 'aac', '-b:a', '192k'];
  }
}

function hata(log, varsayilan) {
  const e = new Error(varsayilan);
  e.gunluk = log;
  return e;
}

// ---------- Video birleştirme ----------
function ayniMi(a, b) {
  if (!a.video || !b.video) return false;
  const v = a.video, w = b.video;
  if (v.kodek !== w.kodek || v.g !== w.g || v.y !== w.y || v.donme !== w.donme) return false;
  if (v.fps && w.fps && Math.abs(v.fps - w.fps) / v.fps > 0.1) return false;
  if (!!a.ses !== !!b.ses) return false;
  if (a.ses && (a.ses.kodek !== b.ses.kodek || a.ses.hz !== b.ses.hz || a.ses.kanal !== b.ses.kanal)) return false;
  return true;
}

const KOPYA_KAP = ['mp4', 'mov', 'mkv', '3gp', 'avi', 'webm'];

export async function videoBirlestir(dosyalar, ilerleme) {
  await hazirla();
  const b = await bagla(dosyalar);
  try {
    const bilgiler = [];
    for (const y of b.yollar) bilgiler.push(await bilgiYol(y));
    bilgiler.forEach((x, i) => { if (!x.video) throw new Error(`${dosyalar[i].name} bir video gibi görünmüyor.`); });
    const toplam = bilgiler.reduce((s, x) => s + x.sure, 0);
    const hizli = bilgiler.every(x => ayniMi(bilgiler[0], x));

    if (hizli) {
      let ext = uzanti(dosyalar[0].name);
      if (!KOPYA_KAP.includes(ext)) ext = 'mp4';
      const liste = b.yollar.map(y => `file '${y}'`).join('\n');
      await ff.writeFile('/liste.txt', new TextEncoder().encode(liste));
      const cikti = '/birlesik.' + ext;
      const { ret, gunluk: log } = await calistir(
        ['-hide_banner', '-f', 'concat', '-safe', '0', '-i', '/liste.txt', '-c', 'copy', '-map', '0', '-ignore_unknown', cikti], toplam, ilerleme);
      await sil('/liste.txt');
      if (ret === 0) return { blob: await sonucuAl(cikti, mimeBul(ext)), ext, hizli: true };
      await sil(cikti);
    }

    // Farklı videolar: ortak ölçüye getirip yeniden kodla.
    const ilk = bilgiler[0].video;
    let G = ilk.g, Y = ilk.y;
    if (ilk.donme === 90 || ilk.donme === 270) [G, Y] = [Y, G];
    const enUzun = Math.max(G, Y);
    if (enUzun > 1280) { const k = 1280 / enUzun; G *= k; Y *= k; }
    G = Math.max(2, Math.round(G / 2) * 2); Y = Math.max(2, Math.round(Y / 2) * 2);
    const args = ['-hide_banner'];
    b.yollar.forEach(y => args.push('-i', y));
    const parcalar = [];
    let etiketler = '';
    bilgiler.forEach((x, i) => {
      parcalar.push(`[${i}:v:0]scale=${G}:${Y}:force_original_aspect_ratio=decrease,pad=${G}:${Y}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`);
      if (x.ses) parcalar.push(`[${i}:a:0]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
      else parcalar.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${x.sure.toFixed(3)},aformat=sample_fmts=fltp[a${i}]`);
      etiketler += `[v${i}][a${i}]`;
    });
    parcalar.push(`${etiketler}concat=n=${bilgiler.length}:v=1:a=1[vo][ao]`);
    args.push('-filter_complex', parcalar.join(';'), '-map', '[vo]', '-map', '[ao]', ...H264, ...AAC, '-movflags', '+faststart', '/birlesik.mp4');
    const { ret, gunluk: log } = await calistir(args, toplam, ilerleme);
    if (ret !== 0) { await sil('/birlesik.mp4'); throw hata(log, 'Videolar birleştirilemedi.'); }
    return { blob: await sonucuAl('/birlesik.mp4', 'video/mp4'), ext: 'mp4', hizli: false };
  } finally {
    await coz(b);
  }
}

// ---------- Kesme (video ve ses) ----------
// mod: 'al' = seçili kısmı tut, 'at' = seçili kısmı çıkar (baş ve sonu birleştir)
// hassas: true ise kare kare doğru keser (yeniden kodlar, yavaş)
export async function kes(dosya, bas, son, { mod = 'al', hassas = false, ses = false } = {}, ilerleme) {
  await hazirla();
  const b = await bagla([dosya]);
  const girdi = b.yollar[0];
  try {
    const bl = await bilgiYol(girdi);
    const sure = bl.sure || son;
    let ext = uzanti(dosya.name);
    if (ses) { if (!ext || !mimeBul(ext).startsWith('audio')) ext = bl.video ? 'm4a' : (ext || 'mp3'); }
    else if (!KOPYA_KAP.includes(ext)) ext = 'mp4';
    if (hassas && !ses) ext = 'mp4';
    const kodlama = ses
      ? (ext === uzanti(dosya.name) && !bl.video ? ['-c', 'copy'] : ['-vn', ...sesKodlayici(ext)])
      : hassas ? [...H264, ...AAC] : ['-c', 'copy', '-map', '0:v:0?', '-map', '0:a:0?'];
    const sesMap = ses ? ['-map', '0:a:0'] : [];

    const parca = async (a, z, cikti, ilr) => {
      const args = ['-hide_banner', '-ss', a.toFixed(3), '-i', girdi, '-t', Math.max(0.05, z - a).toFixed(3), ...sesMap, ...kodlama, '-avoid_negative_ts', 'make_zero', cikti];
      const r = await calistir(args, z - a, ilr);
      if (r.ret !== 0) { await sil(cikti); throw hata(r.gunluk, 'Kesme işlemi başarısız oldu.'); }
    };

    const cikti = '/kesik.' + ext;
    if (mod === 'al') {
      await parca(bas, son, cikti, ilerleme);
    } else {
      const parcalar = [];
      const kalan = (bas > 0.05 ? bas : 0) + (sure - son > 0.05 ? sure - son : 0);
      if (kalan <= 0) throw new Error('Geriye bir şey kalmıyor: dosyanın tamamı seçili.');
      let biten = 0;
      const ilr = (oran, uzun) => p => ilerleme && ilerleme(Math.min(0.99, (biten + p * uzun) / kalan));
      if (bas > 0.05) { await parca(0, bas, '/p1.' + ext, ilr(0, bas)); parcalar.push('/p1.' + ext); biten += bas; }
      if (sure - son > 0.05) { await parca(son, sure, '/p2.' + ext, ilr(0, sure - son)); parcalar.push('/p2.' + ext); }
      if (parcalar.length === 1) {
        const veri = await ff.readFile(parcalar[0]);
        await sil(parcalar[0]);
        return { blob: new Blob([veri.buffer], { type: mimeBul(ext) }), ext };
      }
      await ff.writeFile('/liste.txt', new TextEncoder().encode(parcalar.map(p => `file '${p}'`).join('\n')));
      const r = await calistir(['-hide_banner', '-f', 'concat', '-safe', '0', '-i', '/liste.txt', '-c', 'copy', cikti]);
      await sil('/liste.txt'); for (const p of parcalar) await sil(p);
      if (r.ret !== 0) { await sil(cikti); throw hata(r.gunluk, 'Parçalar birleştirilemedi.'); }
    }
    return { blob: await sonucuAl(cikti, mimeBul(ext)), ext };
  } finally {
    await coz(b);
  }
}

// ---------- Format değiştirme ----------
export async function donustur(dosya, hedef, ilerleme) {
  await hazirla();
  const b = await bagla([dosya]);
  const girdi = b.yollar[0];
  try {
    const bl = await bilgiYol(girdi);
    const cikti = '/donusmus.' + hedef;
    const sesHedef = !!SES_BICIMLERI[hedef];
    if (!sesHedef && !bl.video) throw new Error('Bu dosyada görüntü yok; videoya çevrilemez. Ses biçimlerinden birini seçin.');
    if (sesHedef && !bl.ses) throw new Error('Bu dosyada ses yok.');
    const denemeler = [];
    if (sesHedef) {
      denemeler.push(['-vn', '-map', '0:a:0', ...sesKodlayici(hedef)]);
    } else {
      const v = bl.video.kodek, a = bl.ses ? bl.ses.kodek : '';
      const uygunSes = !a || ['aac', 'mp3'].includes(a);
      if (['mp4', 'mov', 'mkv'].includes(hedef) && ['h264', 'hevc'].includes(v) && uygunSes)
        denemeler.push(['-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', ...(hedef !== 'mkv' ? ['-movflags', '+faststart'] : [])]);
      if (hedef === '3gp') {
        denemeler.push(['-map', '0:v:0', '-map', '0:a:0?', '-vf', "scale='min(640,iw)':-2,format=yuv420p",
          '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0', '-preset', 'ultrafast', '-crf', '26',
          '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-ar', '44100']);
      } else if (hedef === 'avi') {
        denemeler.push(['-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'libmp3lame', '-b:a', '192k']);
      } else {
        denemeler.push(['-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', ...H264, ...AAC, ...(hedef !== 'mkv' ? ['-movflags', '+faststart'] : [])]);
      }
    }
    let son = '';
    for (const ayar of denemeler) {
      const r = await calistir(['-hide_banner', '-i', girdi, ...ayar, cikti], bl.sure, ilerleme);
      if (r.ret === 0) return { blob: await sonucuAl(cikti, mimeBul(hedef)), ext: hedef };
      son = r.gunluk; await sil(cikti);
    }
    throw hata(son, 'Dönüştürme başarısız oldu.');
  } finally {
    await coz(b);
  }
}

// ---------- Ses birleştirme ----------
export async function sesBirlestir(dosyalar, hedef, ilerleme) {
  await hazirla();
  const b = await bagla(dosyalar);
  try {
    const bilgiler = [];
    for (const y of b.yollar) bilgiler.push(await bilgiYol(y));
    bilgiler.forEach((x, i) => { if (!x.ses) throw new Error(`${dosyalar[i].name} dosyasında ses yok.`); });
    const toplam = bilgiler.reduce((s, x) => s + x.sure, 0);
    const args = ['-hide_banner'];
    b.yollar.forEach(y => args.push('-i', y));
    const f = bilgiler.map((x, i) => `[${i}:a:0]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
    f.push(bilgiler.map((x, i) => `[a${i}]`).join('') + `concat=n=${bilgiler.length}:v=0:a=1[ao]`);
    const cikti = '/sesler.' + hedef;
    args.push('-filter_complex', f.join(';'), '-map', '[ao]', ...sesKodlayici(hedef), cikti);
    const { ret, gunluk: log } = await calistir(args, toplam, ilerleme);
    if (ret !== 0) { await sil(cikti); throw hata(log, 'Ses dosyaları birleştirilemedi.'); }
    return { blob: await sonucuAl(cikti, mimeBul(hedef)), ext: hedef };
  } finally {
    await coz(b);
  }
}
