import * as M from './motor.js';

const $ = (s, k = document) => k.querySelector(s);
const $$ = (s, k = document) => [...k.querySelectorAll(s)];
const kopru = window.AndroidKopru || null;

// ---------- Yardımcılar ----------
function sureYaz(sn, ondalik = false) {
  if (!isFinite(sn) || sn < 0) sn = 0;
  const s = Math.floor(sn / 3600), d = Math.floor((sn % 3600) / 60), sa = sn % 60;
  const san = ondalik ? sa.toFixed(1).padStart(4, '0') : String(Math.floor(sa)).padStart(2, '0');
  return s ? `${s}:${String(d).padStart(2, '0')}:${san}` : `${d}:${san}`;
}
function boyutYaz(b) {
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
  return (b / 1024 / 1024 / 1024).toFixed(2).replace('.', ',') + ' GB';
}
function kokAd(ad) { return (ad || 'dosya').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80); }
function damga() {
  const t = new Date(), p = n => String(n).padStart(2, '0');
  return `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}`;
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
let toastZ;
function toast(m, ms = 3500) {
  const t = $('#toast'); t.textContent = m; t.classList.add('acik');
  clearTimeout(toastZ); toastZ = setTimeout(() => t.classList.remove('acik'), ms);
}
const IKON = {
  yukari: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  asagi: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  sil: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

function dosyaSec(accept, coklu = false) {
  return new Promise(coz => {
    const eski = $('#dosyaGirdi');
    const g = eski.cloneNode();
    eski.replaceWith(g);
    g.accept = accept; g.multiple = coklu; g.value = '';
    g.addEventListener('change', () => coz([...(g.files || [])]), { once: true });
    g.click();
  });
}

// Medya süresini tarayıcıdan hızlıca al (olmazsa motordan).
function medyaSuresi(dosya) {
  return new Promise(coz => {
    const el = document.createElement(dosya.type.startsWith('audio') ? 'audio' : 'video');
    const url = URL.createObjectURL(dosya);
    let bitti = false;
    const son = v => { if (bitti) return; bitti = true; URL.revokeObjectURL(url); el.removeAttribute('src'); coz(v); };
    el.preload = 'metadata';
    el.onloadedmetadata = () => son(isFinite(el.duration) ? el.duration : null);
    el.onerror = () => son(null);
    setTimeout(() => son(null), 6000);
    el.src = url;
  });
}
async function sureBul(dosya) {
  const s = await medyaSuresi(dosya);
  if (s) return s;
  try { return (await M.bilgi(dosya)).sure || null; } catch (e) { return null; }
}

// ---------- Ekranlar ----------
let simdiki = 'ana';
let sonuctanOnce = 'ana';
function git(ad) {
  if (ad === 'sonuc' && simdiki !== 'sonuc') sonuctanOnce = simdiki;
  $$('[data-ekran]').forEach(e => { e.hidden = e.dataset.ekran !== ad; });
  $$('[data-ekran] video, [data-ekran] audio').forEach(m => { if (!m.closest(`[data-ekran="${ad}"]`)) m.pause(); });
  simdiki = ad;
  window.scrollTo(0, 0);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-git]');
  if (b) git(b.dataset.git);
});
window.geriTusu = () => {
  if ($('#katman').classList.contains('acik')) return true;
  if (simdiki === 'ana') return false;
  git(simdiki === 'sonuc' ? sonuctanOnce : 'ana');
  return true;
};

// ---------- İşlem katmanı ----------
let islemNo = 0;
async function isle(baslik, fn, sonucBilgi) {
  const no = ++islemNo;
  const k = $('#katman');
  $('#kBaslik').textContent = baslik;
  $('#kYuzde').innerHTML = '&nbsp;';
  $('#kAlt').textContent = 'Uygulamayı açık tut. Uzun videolar birkaç dakika sürebilir.';
  $('#kHata').hidden = true; $('#kHata').innerHTML = '';
  $('#kIptal').textContent = 'İptal';
  const cubuk = $('#kCubuk'); cubuk.classList.add('belirsiz'); cubuk.firstElementChild.style.width = '';
  k.classList.add('acik');
  ekranAcik(true);
  if (!M.hazirMi()) $('#kAlt').textContent = 'Motor hazırlanıyor, ilk seferde biraz bekletebilir…';
  const ilerleme = o => {
    if (no !== islemNo) return;
    cubuk.classList.remove('belirsiz');
    cubuk.firstElementChild.style.width = (o * 100).toFixed(1) + '%';
    $('#kYuzde').textContent = '%' + Math.round(o * 100);
  };
  try {
    await M.hazirla();
    $('#kAlt').textContent = 'Uygulamayı açık tut. Uzun videolar birkaç dakika sürebilir.';
    const r = await fn(ilerleme);
    if (no !== islemNo) return;
    k.classList.remove('acik');
    sonucGoster(r, sonucBilgi);
  } catch (e) {
    if (no !== islemNo) return;
    console.error(e);
    $('#kBaslik').textContent = 'Olmadı';
    cubuk.classList.remove('belirsiz'); cubuk.firstElementChild.style.width = '0';
    $('#kYuzde').innerHTML = '&nbsp;';
    $('#kAlt').textContent = e.message || 'Beklenmeyen bir hata oldu.';
    if (e.gunluk) {
      $('#kHata').hidden = false;
      $('#kHata').innerHTML = `<details><summary class="alt">Teknik ayrıntı</summary><div class="hata-detay">${esc(e.gunluk.split('\n').slice(-25).join('\n'))}</div></details>`;
    }
    $('#kIptal').textContent = 'Tamam';
  } finally {
    if (no === islemNo) ekranAcik(false);
  }
}
$('#kIptal').addEventListener('click', () => {
  const k = $('#katman');
  if ($('#kIptal').textContent === 'İptal') { islemNo++; M.iptal(); toast('İşlem iptal edildi'); ekranAcik(false); }
  k.classList.remove('acik');
});

let kilit = null;
async function ekranAcik(acik) {
  try {
    if (kopru && kopru.ekranAcik) { kopru.ekranAcik(acik); return; }
    if (acik && navigator.wakeLock) kilit = await navigator.wakeLock.request('screen');
    else if (kilit) { await kilit.release(); kilit = null; }
  } catch (e) { /* yok say */ }
}

// ---------- Sonuç ----------
let sonuc = null;
let sonucURL = null;
function sonucGoster(r, { ad }) {
  if (sonucURL) URL.revokeObjectURL(sonucURL);
  sonuc = { blob: r.blob, ad: `${ad}.${r.ext}`, ext: r.ext };
  sonucURL = URL.createObjectURL(r.blob);
  const ses = r.blob.type.startsWith('audio');
  $('#rOynatici').innerHTML = ses
    ? `<audio class="oynatici" controls src="${sonucURL}"></audio>`
    : `<video class="oynatici" controls playsinline src="${sonucURL}"></video>`;
  const el = $('#rOynatici').firstElementChild;
  const rozetler = () => {
    const sure = isFinite(el.duration) && el.duration > 0 ? `<span class="rozet">${sureYaz(el.duration)}</span>` : '';
    $('#rBilgi').innerHTML = `<span class="rozet">${r.ext.toUpperCase()}</span><span class="rozet">${boyutYaz(r.blob.size)}</span>${sure}`;
  };
  rozetler();
  el.addEventListener('loadedmetadata', rozetler);
  el.addEventListener('error', () => {
    $('#rOynatici').innerHTML = `<p class="bos">Bu biçim burada önizlenemiyor ama dosya hazır.</p>`;
  });
  const not = [];
  if (r.hizli === false) not.push('Videolar farklı ölçülerde olduğu için ortak boyuta getirildi.');
  if (r.not) not.push(r.not);
  $('#rNot').hidden = !not.length; $('#rNot').textContent = not.join(' ');
  $('#rKaydet').disabled = false; $('#rKaydet').textContent = 'Kaydet';
  git('sonuc');
}
$('#rTekrar').addEventListener('click', () => git(sonuctanOnce));
$('#rKaydet').addEventListener('click', async () => {
  if (!sonuc) return;
  const d = $('#rKaydet');
  d.disabled = true; d.textContent = 'Kaydediliyor…';
  try {
    const yer = await kaydet(sonuc.blob, sonuc.ad);
    d.textContent = 'Kaydedildi ✓';
    if (yer) toast(yer, 5000);
  } catch (e) {
    d.disabled = false; d.textContent = 'Kaydet';
    toast(e.message || 'Kaydedilemedi');
  }
});

// ---------- Kaydetme (APK, Claude sayfası, normal tarayıcı) ----------
let indirmeSoz = null;
try { if (window.claude && window.claude.use) indirmeSoz = window.claude.use('downloads').catch(() => null); } catch (e) { indirmeSoz = null; }

function blobBase64(b) {
  return new Promise((coz, red) => {
    const r = new FileReader();
    r.onload = () => coz(String(r.result).split(',')[1] || '');
    r.onerror = () => red(r.error);
    r.readAsDataURL(b);
  });
}

async function kaydet(blob, ad) {
  if (kopru) {
    const id = kopru.baslat(ad, blob.type || 'application/octet-stream');
    if (!id) throw new Error('Kaydetme başlatılamadı.');
    const PARCA = 3 * 1024 * 1024;
    for (let i = 0; i < blob.size; i += PARCA) {
      const b64 = await blobBase64(blob.slice(i, i + PARCA));
      if (!kopru.parca(id, b64)) throw new Error('Kaydederken hata oldu.');
      $('#rKaydet').textContent = `Kaydediliyor… %${Math.round(Math.min(1, (i + PARCA) / blob.size) * 100)}`;
    }
    const yer = kopru.bitir(id);
    if (!yer) throw new Error('Dosya kaydedilemedi.');
    return 'Kaydedildi: ' + yer;
  }
  const indir = indirmeSoz ? await indirmeSoz : null;
  if (indir) {
    const ext = (ad.split('.').pop() || '').toLowerCase();
    let veri = blob, isim = ad, not = '';
    if (!['mp4', 'webm', 'mov'].includes(ext)) {
      veri = await zipYap(ad, blob); isim = ad + '.zip';
      not = ' (zip içinde — açınca dosya çıkar)';
    }
    try {
      await indir.save({ filename: isim, data: veri });
      return 'İndirildi: ' + isim + not;
    } catch (e) {
      if (e && e.code === 'declined') throw new Error('Kaydetme iptal edildi.');
      throw new Error('Bu ekranda kaydedilemedi.');
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = ad;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return 'İndirildi: ' + ad;
}

// Sıkıştırmasız tek dosyalık zip
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
async function zipYap(ad, blob) {
  const veri = new Uint8Array(await blob.arrayBuffer());
  let c = 0xFFFFFFFF; for (let i = 0; i < veri.length; i++) c = CRC[(c ^ veri[i]) & 0xFF] ^ (c >>> 8);
  const crc = (c ^ 0xFFFFFFFF) >>> 0;
  const isim = new TextEncoder().encode(ad);
  const yerel = new DataView(new ArrayBuffer(30));
  yerel.setUint32(0, 0x04034b50, true); yerel.setUint16(4, 20, true); yerel.setUint16(6, 0x0800, true);
  yerel.setUint32(14, crc, true); yerel.setUint32(18, veri.length, true); yerel.setUint32(22, veri.length, true); yerel.setUint16(26, isim.length, true);
  const merkez = new DataView(new ArrayBuffer(46));
  merkez.setUint32(0, 0x02014b50, true); merkez.setUint16(4, 20, true); merkez.setUint16(6, 20, true); merkez.setUint16(8, 0x0800, true);
  merkez.setUint32(16, crc, true); merkez.setUint32(20, veri.length, true); merkez.setUint32(24, veri.length, true); merkez.setUint16(28, isim.length, true);
  const merkezYeri = 30 + isim.length + veri.length;
  const son = new DataView(new ArrayBuffer(22));
  son.setUint32(0, 0x06054b50, true); son.setUint16(8, 1, true); son.setUint16(10, 1, true);
  son.setUint32(12, 46 + isim.length, true); son.setUint32(16, merkezYeri, true);
  return new Blob([yerel, isim, veri, merkez, isim, son], { type: 'application/zip' });
}

// ---------- Sıralı liste (video birleştir, ses birleştir) ----------
function listeKur({ liste, ekle, basla, accept, ad, not }) {
  const ogeler = [];
  const ciz = () => {
    liste.innerHTML = ogeler.length ? ogeler.map((o, i) => `
      <li><span class="no">${i + 1}</span>
        <span class="ad">${esc(o.dosya.name)}<small>${o.sure ? sureYaz(o.sure) : '…'} · ${boyutYaz(o.dosya.size)}</small></span>
        <button class="kucuk" data-i="${i}" data-is="yukari" aria-label="Yukarı" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>${IKON.yukari}</button>
        <button class="kucuk" data-i="${i}" data-is="asagi" aria-label="Aşağı" ${i === ogeler.length - 1 ? 'disabled style="opacity:.3"' : ''}>${IKON.asagi}</button>
        <button class="kucuk" data-i="${i}" data-is="sil" aria-label="Çıkar">${IKON.sil}</button>
      </li>`).join('') : `<li class="bos" style="background:none;justify-content:center">Henüz ${ad} eklenmedi</li>`;
    basla.disabled = ogeler.length < 2;
    const toplam = ogeler.reduce((s, o) => s + (o.sure || 0), 0);
    basla.textContent = ogeler.length < 2 ? `En az 2 ${ad} ekle` : `Birleştir (${ogeler.length} dosya${toplam ? ', ' + sureYaz(toplam) : ''})`;
    if (not) not(ogeler);
  };
  liste.addEventListener('click', e => {
    const b = e.target.closest('button[data-is]'); if (!b) return;
    const i = +b.dataset.i;
    if (b.dataset.is === 'sil') ogeler.splice(i, 1);
    else { const j = b.dataset.is === 'yukari' ? i - 1 : i + 1; if (j < 0 || j >= ogeler.length) return; [ogeler[i], ogeler[j]] = [ogeler[j], ogeler[i]]; }
    ciz();
  });
  ekle.addEventListener('click', async () => {
    const d = await dosyaSec(accept, true);
    for (const f of d) {
      const o = { dosya: f, sure: null }; ogeler.push(o);
      sureBul(f).then(s => { o.sure = s; ciz(); });
    }
    ciz();
  });
  ciz();
  return ogeler;
}

const bOgeler = listeKur({ liste: $('#bListe'), ekle: $('#bEkle'), basla: $('#bBasla'), accept: 'video/*', ad: 'video',
  not: o => { const n = $('#bNot'); n.hidden = o.length < 2; n.textContent = 'Aynı telefonla çekilmiş videolar saniyeler içinde birleşir. Farklı boyuttaki videolar ortak ölçüye getirilir; bu biraz uzun sürer.'; } });
$('#bBasla').addEventListener('click', () => isle('Videolar birleştiriliyor', il => M.videoBirlestir(bOgeler.map(o => o.dosya), il), { ad: 'birlesik-' + damga() }));

const sOgeler = listeKur({ liste: $('#sListe'), ekle: $('#sEkle'), basla: $('#sBasla'), accept: 'audio/*,video/*', ad: 'ses' });
let sBicim = 'mp3';
bicimDugmeleri($('#sBicim'), { mp3: 'MP3', m4a: 'M4A', wav: 'WAV' }, 'mp3', v => { sBicim = v; });
$('#sBasla').addEventListener('click', () => isle('Sesler birleştiriliyor', il => M.sesBirlestir(sOgeler.map(o => o.dosya), sBicim, il), { ad: 'birlesik-ses-' + damga() }));

function bicimDugmeleri(kap, secenekler, varsayilan, degisti) {
  kap.innerHTML = Object.entries(secenekler).map(([k, v]) => `<button data-b="${k}" aria-pressed="${k === varsayilan}">${v}</button>`).join('');
  kap.addEventListener('click', e => {
    const b = e.target.closest('button[data-b]'); if (!b) return;
    $$('button', kap.closest('section')).forEach(x => { if (x.dataset.b) x.setAttribute('aria-pressed', 'false'); });
    b.setAttribute('aria-pressed', 'true');
    degisti(b.dataset.b);
  });
}

// ---------- Biçim değiştir ----------
let fDosya = null, fHedef = null;
const fDegisti = v => {
  fHedef = v;
  $('#fBasla').disabled = !v;
  $('#fBasla').textContent = v ? `${v.toUpperCase()} olarak dönüştür` : 'Bir biçim seç';
  const notlar = { '3gp': '3GP eski telefonlar için küçük boyutlu videodur; görüntü en çok 640 piksel genişliğe indirilir.', avi: 'AVI eski bilgisayar ve DVD oynatıcılar içindir.', mp3: 'Videonun sesi MP3 olarak çıkarılır.', wav: 'WAV kayıpsızdır ama dosya büyük olur.' };
  $('#fNot').hidden = !notlar[v]; $('#fNot').textContent = notlar[v] || '';
};
bicimDugmeleri($('#fVideo'), Object.fromEntries(Object.entries(M.VIDEO_BICIMLERI).map(([k, v]) => [k, v.ad])), null, fDegisti);
bicimDugmeleri($('#fSes'), Object.fromEntries(Object.entries(M.SES_BICIMLERI).map(([k, v]) => [k, v.ad])), null, fDegisti);
$('#fSec').addEventListener('click', async () => {
  const [f] = await dosyaSec('video/*,audio/*,.3gp,.avi,.mkv,.mov,.mp3,.wav,.m4a,.ogg,.aac,.flac');
  if (!f) return;
  fDosya = f;
  $('#fAd').hidden = false; $('#fAd').textContent = f.name + ' · ' + boyutYaz(f.size);
  $('#fSecenek').hidden = false;
  $$('#fSecenek button[data-b]').forEach(x => x.setAttribute('aria-pressed', 'false'));
  fDegisti(null);
  $('#fSec').textContent = 'Başka dosya seç';
  try {
    const b = await M.bilgi(f);
    if (fDosya !== f) return;
    const parcalar = [f.name];
    if (b.sure) parcalar.push(sureYaz(b.sure));
    if (b.video) parcalar.push(`${b.video.g}×${b.video.y}`);
    else parcalar.push('yalnızca ses');
    $('#fAd').textContent = parcalar.join(' · ');
    $('#fVideo').previousElementSibling.hidden = $('#fVideo').hidden = !b.video;
  } catch (e) { /* bilgi alınamadı, hepsini göster */ }
});
$('#fBasla').addEventListener('click', () => {
  if (!fDosya || !fHedef) return;
  isle(`${fHedef.toUpperCase()} biçimine çevriliyor`, il => M.donustur(fDosya, fHedef, il), { ad: kokAd(fDosya.name) });
});

// ---------- Kesici (video ve ses) ----------
function kesiciKur(kap, ses) {
  kap.innerHTML = `
    <button class="dugme ekle" data-r="sec">+ ${ses ? 'Ses dosyası' : 'Video'} seç</button>
    <div data-r="icerik" hidden>
      <p class="dosya-adi" data-r="ad"></p>
      <div data-r="oyn"></div>
      <div class="cizelge" data-r="cz">
        <div class="zemin"></div><div class="secim" data-r="secim"></div><div class="imlec" data-r="imlec"></div>
        <div class="tutamak" data-r="t0" tabindex="0" role="slider" aria-label="Başlangıç"></div>
        <div class="tutamak" data-r="t1" tabindex="0" role="slider" aria-label="Bitiş"></div>
      </div>
      <div class="zamanlar">
        <div class="zaman"><div class="etiket">Başlangıç</div><div class="deger" data-r="d0">0:00.0</div>
          <div class="satir"><button data-z="0:-1">−1 sn</button><button data-z="0:simdi">Şu an</button><button data-z="0:1">+1 sn</button></div></div>
        <div class="zaman"><div class="etiket">Bitiş</div><div class="deger" data-r="d1">0:00.0</div>
          <div class="satir"><button data-z="1:-1">−1 sn</button><button data-z="1:simdi">Şu an</button><button data-z="1:1">+1 sn</button></div></div>
      </div>
      <div class="sec" data-r="mod">
        <label><input type="radio" name="mod-${ses ? 's' : 'v'}" value="al" checked><span><b>Seçili kısmı al</b>Yalnız kırmızı bölüm kalır</span></label>
        <label><input type="radio" name="mod-${ses ? 's' : 'v'}" value="at"><span><b>Seçili kısmı çıkar</b>Kırmızı bölüm silinir, kalanı birleşir</span></label>
      </div>
      ${ses ? '' : `<div class="sec" data-r="hiz">
        <label><input type="radio" name="hiz" value="hizli" checked><span><b>Hızlı</b>Kalite bozulmaz; kesim noktası yarım saniye kayabilir</span></label>
        <label><input type="radio" name="hiz" value="hassas"><span><b>Tam isabet</b>Tam saniyesinden keser; daha yavaş</span></label>
      </div>`}
      <button class="dugme tam ${ses ? 'sesrenk' : ''}" data-r="kes">Kes</button>
    </div>`;
  const r = n => $(`[data-r="${n}"]`, kap);
  let dosya = null, url = null, el = null, sure = 0, bas = 0, son = 0;

  const guncelle = () => {
    const y0 = sure ? bas / sure * 100 : 0, y1 = sure ? son / sure * 100 : 100;
    r('t0').style.left = y0 + '%'; r('t1').style.left = y1 + '%';
    r('secim').style.left = y0 + '%'; r('secim').style.width = (y1 - y0) + '%';
    r('d0').textContent = sureYaz(bas, true); r('d1').textContent = sureYaz(son, true);
    const at = $('input:checked', r('mod')).value === 'at';
    r('cz').classList.toggle('at', at);
    const kalan = at ? sure - (son - bas) : son - bas;
    r('kes').textContent = `Kes (${at ? 'kalan' : 'seçili'}: ${sureYaz(kalan, true)})`;
    r('kes').disabled = !(son - bas > 0.1) || kalan < 0.1;
    r('t0').setAttribute('aria-valuetext', sureYaz(bas, true)); r('t1').setAttribute('aria-valuetext', sureYaz(son, true));
  };
  const imlec = () => { if (el && sure) r('imlec').style.left = Math.min(100, el.currentTime / sure * 100) + '%'; };
  const ayarla = (hangi, t, atla = true) => {
    t = Math.max(0, Math.min(sure, t));
    if (hangi === 0) bas = Math.min(t, son - 0.1); else son = Math.max(t, bas + 0.1);
    bas = Math.max(0, bas); son = Math.min(sure, son);
    if (atla && el) { el.pause(); try { el.currentTime = hangi === 0 ? bas : son; } catch (e) {} }
    guncelle(); imlec();
  };

  r('sec').addEventListener('click', async () => {
    const [f] = await dosyaSec(ses ? 'audio/*,video/*' : 'video/*');
    if (!f) return;
    dosya = f;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(f);
    r('sec').textContent = 'Başka dosya seç';
    r('icerik').hidden = false;
    r('ad').textContent = f.name + ' · ' + boyutYaz(f.size);
    r('oyn').innerHTML = ses ? `<audio class="oynatici" controls preload="metadata"></audio>` : `<video class="oynatici" controls playsinline preload="metadata"></video>`;
    el = r('oyn').firstElementChild;
    sure = 0; bas = 0; son = 0; guncelle();
    const sureyiKur = s => { if (!s || sure) return; sure = s; bas = 0; son = s; guncelle(); };
    el.addEventListener('loadedmetadata', () => sureyiKur(isFinite(el.duration) ? el.duration : 0));
    el.addEventListener('timeupdate', imlec);
    el.addEventListener('seeked', imlec);
    el.addEventListener('error', async () => {
      r('oyn').innerHTML = `<p class="bos">Bu biçim önizlenemiyor; yine de kesebilirsin.</p>`; el = null;
      try { sureyiKur((await M.bilgi(f)).sure); } catch (e) {}
    });
    el.src = url;
    setTimeout(async () => { if (!sure && dosya === f) { try { sureyiKur((await M.bilgi(f)).sure); } catch (e) {} } }, 3000);
  });

  // Çizelgede sürükleme
  let surukle = null;
  const zamanAl = e => { const k = r('cz').getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - k.left) / k.width)) * sure; };
  r('cz').addEventListener('pointerdown', e => {
    if (!sure) return;
    const t = e.target.dataset.r;
    if (t === 't0' || t === 't1') { surukle = t === 't0' ? 0 : 1; e.target.setPointerCapture(e.pointerId); e.preventDefault(); }
    else if (el) { el.pause(); el.currentTime = zamanAl(e); imlec(); }
  });
  r('cz').addEventListener('pointermove', e => { if (surukle !== null) ayarla(surukle, zamanAl(e)); });
  const birak = () => { surukle = null; };
  r('cz').addEventListener('pointerup', birak); r('cz').addEventListener('pointercancel', birak);
  ['t0', 't1'].forEach((t, i) => r(t).addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { ayarla(i, (i ? son : bas) - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { ayarla(i, (i ? son : bas) + 1); e.preventDefault(); }
  }));
  kap.addEventListener('click', e => {
    const b = e.target.closest('button[data-z]'); if (!b || !sure) return;
    const [h, z] = b.dataset.z.split(':');
    const i = +h;
    if (z === 'simdi') { if (el) ayarla(i, el.currentTime, false); }
    else ayarla(i, (i ? son : bas) + (+z));
  });
  r('mod').addEventListener('change', guncelle);
  r('kes').addEventListener('click', () => {
    if (!dosya) return;
    const mod = $('input:checked', r('mod')).value;
    const hassas = !ses && $('input:checked', r('hiz')).value === 'hassas';
    if (el) el.pause();
    isle(ses ? 'Ses kesiliyor' : 'Video kesiliyor', il => M.kes(dosya, bas, son, { mod, hassas, ses }, il),
      { ad: kokAd(dosya.name) + '-kesik' });
  });
}
kesiciKur($('[data-kesici="video"]'), false);
kesiciKur($('[data-kesici="ses"]'), true);

// ---------- Motoru arka planda hazırla ----------
M.hazirla().then(() => { $('#motorDurum').textContent = 'Hazır. Bir işlem seç.'; })
  .catch(e => { console.error(e); $('#motorDurum').textContent = 'Motor yüklenemedi: ' + (e && e.message || e) + '. Sayfayı yenileyip tekrar dene.'; });
