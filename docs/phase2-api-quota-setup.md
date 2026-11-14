# Fasa 2: implementasi, keselamatan dan persediaan Cloudflare

Status: kod untuk semakan sahaja. Tiada Worker, namespace, binding, secret,
migrasi atau deployment telah diaktifkan oleh perubahan ini.

## Kontrak dan seni bina

- GET `/api/football?endpoint=fixtures&date=YYYY-MM-DD` sahaja. Tepat satu
  `endpoint` dan `date`; tarikh mesti wujud. Penolakan berlaku sebelum binding.
- Pages menggunakan binding `FOOTBALL_QUOTA` dan nama singleton tetap
  `api-football-global-v1`. Tiada direct-fetch fallback atau Cache API per colo.
- Worker berasingan mengeksport `FootballQuota`; handler Worker awam sentiasa
  404. `workers_dev` dan preview URL dimatikan; tiada route ditetapkan.
- Secret `API_FOOTBALL_KEY` hanya berada pada Worker coordinator, bukan Pages,
  browser, vars TOML, respons atau log. Kod tidak mencetak ralat upstream.
- Semua hostname, region dan deployment yang menggunakan credential pembekal
  sama MESTI menggunakan namespace dan singleton yang sama. Namespace preview
  berasingan hanya sesuai dengan credential ujian/akaun pembekal berasingan.
  Jangan tukar nama objek/namespace atau padam storage untuk reset kuota.

## Bajet global, transaksi dan restart

- Bajet `API_FOOTBALL_DAILY_BUDGET` mesti integer positif yang dipersetujui
  pemilik; contoh konfigurasi **0 (disabled)**. Nilai kosong/salah, secret tiada
  atau binding tiada menghasilkan 503 tanpa upstream.
- Hari bermula **00:00 UTC** (08:00 Malaysia). Pastikan sempadan pembekal sama
  sebelum pengaktifan. Jika berlainan, ubah polisi terlebih dahulu; jangan
  anggap had UTC melindungi window pembekal yang berbeza atau rolling window.
- `storage.transaction()` mereservasi `used + 1` dan lease 30 saat sebelum
  fetch. Callback transaksi tidak membuat network call dan selamat diulang.
- Kegagalan, timeout, 429 dan respons rosak tetap menggunakan satu reservasi;
  tiada refund atau retry automatik. Penggunaan manual/servis lain di luar
  coordinator perlu ditolak daripada bajet yang ditetapkan.
- Permintaan tarikh sama berkongsi Promise aktif. Cache berjaya dan lease
  berada dalam storage, jadi restart tidak menghapuskan deduplikasi tersimpan.
  Lease aktif selepas restart memberi 503 + Retry-After, bukannya fetch kedua.
- Jika proses mati selepas upstream menerima permintaan tetapi sebelum hasil
  disimpan, kejayaan itu tidak boleh diketahui dengan pasti. Selepas lease
  tamat, percubaan baharu boleh berlaku, tetapi memerlukan reservasi baharu.
  Ini bukan jaminan exactly-once pihak pembekal; bajet masih tidak dilangkaui.
- Kegagalan transaksi sebelum reservasi: 503, sifar upstream. Kegagalan commit
  cache selepas fetch: 503, slot kekal digunakan dan lease kekal aktif. Tiada
  fallback atau pembukaan kuota apabila storage gagal.

## Cache, abuse dan privasi

- Cache storage global sejam; key `fixtures:YYYY-MM-DD` tidak mengandungi
  origin atau susunan query. Maksimum 32 cache entries dan 32 lease aktif.
  Cache hit tidak menggunakan bajet, tetapi masih melalui kawalan klien.
- Respons mempunyai `updatedAt` dan `freshnessSeconds: 3600`. Ini data cache,
  bukan live score. Tiada stale fallback; data tamat tempoh perlu reservasi.
- Respons browser `Cache-Control: no-store`, supaya cache browser/proxy tidak
  memintas kawalan klien dan tiada lapisan cache lama yang disalah anggap live.
- Maksimum 10 permintaan per klien bagi window 60 saat; maksimum 256 klien
  aktif dalam storage. Jadual penuh memberi 429, bukan evict limiter aktif.
- `CF-Connecting-IP` ialah isyarat lemah, BUKAN identiti/auth. Pages di belakang
  Cloudflare menghantar nilai ini melalui binding sahaja; bukan X-Forwarded-For.
  Klien tanpa header berkongsi bucket `unknown`. NAT boleh berkongsi had; bot
  berbilang IP masih boleh menghabiskan bajet yang dibenarkan.
- Storage hanya memegang digest SHA-256 yang bertukar setiap hari; digest IP
  bukan anonimisasi kukuh dan boleh diteka. Rekod expired dibersihkan pada
  permintaan berikutnya; kapasiti storage tetap dibatasi walaupun idle.
- WAF/Turnstile dan pemantauan kos boleh ditambah selepas kelulusan. CORS
  bukan pencegahan bot. Had API tidak membatasi jumlah request/caj Cloudflare.

## Upstream dan keserasian UI

- Host/endpoint tetap, redirect ditolak, timeout keseluruhan 9 saat termasuk
  body. Body JSON maksimum 96 KiB; data besar ditolak dan tidak dipotong sebagai
  kejayaan. Had ini boleh menolak sesetengah hari yang mempunyai banyak fixture.
- Fetch menggunakan `redirect: 'manual'` yang disokong workerd. Semua status
  300–399 ditolak sebagai 502 dan body dibatalkan sebelum parsing/cache;
  `Location` tidak dipulangkan atau diikuti. `redirect: 'error'` tidak disokong
  workerd walaupun mock Node menerimanya.
- Validasi bentuk respons, bilangan hasil, ID, nama, tarikh dan skor. Hanya
  medan yang digunakan UI dipulangkan. Respons rosak/provider error tidak
  disimpan sebagai kejayaan. Payload yang mengandungi credential juga ditolak.
- HTTP 429 dan rate-limit dalam JSON dipetakan kepada 429 dengan Retry-After
  integer/date yang disanitasi (default 60 saat, maksimum sehari). Cooldown
  global dipersist. Cache sah masih boleh dilayan semasa cooldown.
- Provider restriction: 422; kegagalan network/JSON/HTTP lain: 502; timeout:
  504; konfigurasi/storage: 503. Mesej tidak mengandungi detail pembekal.
- Medan `response`, `results`, `paging`, `updatedAt` kekal; fixture menyertakan
  `teams`, `goals`, `fixture.status.short` dan `league.name`. UI Fasa 1 kekal.

## Konfigurasi yang perlu disemak SEBELUM pengaktifan

1. Dapatkan kelulusan berasingan sebelum deploy. Semak akaun, pelan, quota
   API sebenar, reset window, penggunaan luar sistem dan tetapan GitHub Pages
   preview autobuild. Jangan push dengan andaian preview tidak akan deploy.
2. Worker template: `workers/football-quota/wrangler.example.toml`.
   `new_sqlite_classes = ["FootballQuota"]` diperlukan untuk namespace SQLite
   baharu. Nama Worker boleh ditetapkan sebelum penciptaan pertama sahaja;
   namespace/nama singleton tidak boleh diubah sewenang-wenangnya selepas live.
3. Letakkan secret pada Worker melalui mekanisme secrets Cloudflare selepas
   kelulusan; tiada nilai dalam Git. Tetapkan bajet konservatif lebih rendah
   daripada baki quota sebenar. Buang secret Pages lama hanya selepas pelan
   migrasi diluluskan. Tiada fallback ke credential Pages.
4. Pages tidak mengehoskan kelas DO sendiri. Ikat `FOOTBALL_QUOTA` kepada kelas
   dalam Worker berasingan melalui dashboard persekitaran yang betul. Template
   `docs/cloudflare-pages.phase2.example.toml` menunjukkan binding preview
   sahaja; produksi tidak mempunyai binding dalam contoh ini.
5. Template Pages mengandaikan output `public/` yang BELUM dicipta. Sahkan
   output sedia ada dan sediakan allowlist aset sahaja: index.html, images/,
   icon.svg dan manifest.webmanifest. Jangan hidangkan workers/, tests/, docs/
   atau fail konfigurasi sebagai aset awam. Pages `functions/` kekal di root
   projek untuk kompilasi. Jangan guna template terus tanpa semakan build.
6. Tiada Wrangler dipasang dalam sesi ini. Semakan konfigurasi/schema dan
   smoke test local Workers runtime/SQLite masih diperlukan dengan versi
   Wrangler yang dipinkan sebelum sebarang deployment. Mock Node tidak
   membuktikan konfigurasi akaun/binding sebenar atau tingkah laku platform.

## Pelan percuma dan kos (semakan dokumentasi 13 November 2026)

SQLite Durable Objects tersedia pada Workers Free; backend KV lama bukan
pilihan Free. Pages memerlukan Worker DO berasingan, bukan semestinya Paid.
Had Free yang didokumenkan: 100,000 request DO/hari, 13,000 GB-s/hari,
5 juta row read/hari, 100,000 row write/hari dan 5 GB storage. Had akaun
dikongsi dengan penggunaan lain; melebihi had boleh menyebabkan operasi gagal.

Contoh anggaran, BUKAN jaminan: 1,000 semakan/hari dengan 10 cache miss
menghasilkan kira-kira 1,000 request DO dan sekitar 1,030 operasi write
sebelum eviction; read, CPU, duration, Pages invocations dan indeks SQLite
perlu dipantau berasingan. Kos tambahan boleh $0 dalam had Free jika semua
penggunaan akaun kekal dalam had. Paid mempunyai caj asas dan metering lain;
tiada upgrade/billing diaktifkan atau dianggap perlu oleh implementasi ini.

Sumber rasmi:
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/pages/functions/bindings/#durable-objects
- https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/

## Ujian tanpa API sebenar

`node --test tests/phase1.test.mjs tests/phase2.test.mjs`

Untuk persekitaran yang merumuskan output child process sebagai satu fail:
`node --test --test-isolation=none tests/phase1.test.mjs tests/phase2.test.mjs`

Semua upstream dimock. Storage mock melaksanakan transaksi bersiri, rollback
dan replay; masa dikawal. Ujian turut menggunakan handler tarikh sebenar UI.
Tiada token production diperlukan. Ujian bukan pengganti semakan platform
Cloudflare serta pengesahan setup selepas kelulusan.

### Ujian runtime tempatan (tanpa deploy)

Gunakan toolchain dipinkan `wrangler@4.162.0`, termasuk Miniflare
`5.20261113.0-beta` dan workerd `1.20261113.1` yang dibekalkan bersamanya.
Pasang alat di direktori sementara berasingan, bukan projek atau global:

```sh
npm install --prefix /tmp/plus-football-phase2-runtime --no-audit --no-fund wrangler@4.162.0
PHASE2_RUNTIME_TOOLS=/tmp/plus-football-phase2-runtime node --test --test-isolation=none tests/phase2.runtime.mjs
```

Harness memuatkan kod Worker dan Pages sebenar, membina binding DO tempatan
dan storage SQLite di direktori sementara, kemudian membersihkannya. Semua
outbound fetch dipintas; destinasi tidak dijangka ditolak tanpa network
fallback. Ia hanya menggunakan credential palsu dan bajet ujian sementara;
template Worker kekal 0. Tiada login atau deployment diperlukan. Sediakan
cache npm di direktori writable jika persekitaran memerlukannya.

Ujian merangkumi kejayaan/0–0, concurrency, cache, bajet 0, restart SQLite dan
301/302/303/307/308 dengan Location ke origin berbeza serta JSON yang nampak
sah. Ini tidak membuktikan tetapan binding atau bil akaun Cloudflare sebenar.
