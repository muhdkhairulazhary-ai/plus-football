# Semakan redesign plus+ Football

Branch asas: `main`, commit `fdb99a9`. Tiada dependency baharu diperlukan.

```sh
node --test --test-isolation=none tests/redesign.test.mjs
python tests/redesign_browser.py
```

Ujian browser menggunakan Python Playwright dan Chromium yang tersedia dalam
persekitaran Codex. Semua URL dipintas: HTML/CSS/JS/imej dibaca daripada fail
lokal, respons API ialah mock, dan URL lain dibatalkan. Tiada server production
atau API bola sepak sebenar dihubungi. Fixture MOCK hanya wujud dalam ujian.

Screenshot disimpan di `/tmp/plus-football-redesign-screenshots/`. Semakan
375px, 390px dan 430px ialah emulasi viewport/touch Chromium, bukan pengesahan
Safari pada iPhone fizikal. Desktop diuji pada 1280px.

Tiada suite ujian sedia ada pada commit asas main. Suite di atas memeriksa
pemeliharaan berita/aset/API, navigasi, carian, modal/fokus, panel liga, skor
0–0, skeleton, retry, respons async lama, fallback Liga Super dan overflow.

Foto berita 14–16 kini turut diuji: versi WebP lokal/srcset, alt text, kredit
dan lesen, gambar featured/modal, fallback apabila kedua-dua versi imej gagal,
serta pembersihan media modal ketika bertukar artikel. Fakta artikel dibandingkan
dengan baseline; hanya medan media bagi tiga rekod itu dibenarkan berubah.
Semua aset asal diperiksa byte demi byte, walaupun aset foto baharu ditambah.
Provenance dan syarat penggunaan foto: `images/PHOTO-LICENSES.md` dan
`images/photo-credits.json`. Browser suite memintas WebP lokal tanpa hotlink.

Skor sedia ada masih menggunakan TheSportsDB dan semakan tarikh API-Football
memerlukan klik. Homepage tidak membuat panggilan API bola sepak automatik.
Kedudukan liga ialah snapshot sedia ada bertarikh, bukan data langsung.

PWA tests and cache-release instructions are in `docs/PWA.md`:

```sh
node scripts/update-pwa-cache.mjs --check
node --test --test-isolation=none tests/pwa.test.mjs
python tests/pwa_browser.py
```
