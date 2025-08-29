// ==UserScript==
// @name         Dedbit: TMDb Ratings + Posters (catpic, multi-fix)
// @namespace    yourname.dedbit.tmdb
// @version      0.3
// @description  แสดงโปสเตอร์ TMDb ในช่อง catpic + คะแนนบน dedbit.com
// @author       you
// @match        https://www.dedbit.com/*
// @match        http://www.dedbit.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.themoviedb.org
// @connect      image.tmdb.org
// ==/UserScript==

(function () {
    'use strict';

    // ---------- CONFIG ----------
    // วิธี A: ฮาร์ดโค้ดคีย์ (ใส่คีย์คุณแทน XXX)
    const HARDCODED_TMDB_KEY = 'XXX_YOUR_TMDB_API_KEY_XXX';

    // วิธี B: เก็บคีย์ใน storage แล้วกด Ctrl+Alt+D เพื่อกรอก
    const USE_STORAGE = true;
    const API_KEY_STORAGE = 'tmdb_api_key';

    const IMAGE_BASE = 'https://image.tmdb.org/t/p/w92';
    const FETCH_DELAY_MS = 700;  // ช้าลงนิดกัน rate-limit
    const MAX_ITEMS = 200;
    // ----------------------------

    // Hotkey ใส่คีย์
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'd') {
            const current = GM_getValue(API_KEY_STORAGE, '');
            const input = prompt('ใส่ TMDb API Key:', current || '');
            if (input !== null) {
                GM_setValue(API_KEY_STORAGE, input.trim());
                alert('บันทึกแล้ว! รีเฟรชหน้าเพื่อเริ่มดึงข้อมูล');
            }
        }
    });

    const TMDB_KEY = (USE_STORAGE ? GM_getValue(API_KEY_STORAGE, '').trim() : HARDCODED_TMDB_KEY).trim();
    if (!TMDB_KEY) {
        console.warn('[Dedbit TMDb] ยังไม่ตั้งค่า TMDb API Key (กด Ctrl+Alt+D หรือฮาร์ดโค้ดในไฟล์)');
    }

    // สไตล์
    GM_addStyle(`
    .tmdb-poster {
      width: 90px; height: 120px; object-fit: cover;
      border-radius: 4px; border: 1px solid rgba(255,255,255,.2);
      display: block; margin: auto;
    }
    .tmdb-badge {
      display: inline-block; padding: 2px 6px; border-radius: 6px;
      font-size: 12px; font-weight: 600; background: #232324; color: #fff;
      line-height: 1; border: 1px solid rgba(255,255,255,.12);
    }
    .tmdb-badge--good { background: #1e7c39; }
    .tmdb-badge--ok   { background: #6b6f1b; }
    .tmdb-badge--bad  { background: #7c1e1e; }
    .tmdb-muted { opacity: .6; }
    td.catpic { position: relative; }
    .tmdb-badge {
      display:inline-block; padding:2px 6px; border-radius:6px;
      font-size:12px; font-weight:600; background:#232324; color:#fff;
      line-height:1; border:1px solid rgba(255,255,255,.12);
    }
    .tmdb-badge--good { background:#1e7c39; }
    .tmdb-badge--ok   { background:#6b6f1b; }
    .tmdb-badge--bad  { background:#7c1e1e; }
    .tmdb-badge-overlay {
      position:absolute; right:4px; bottom:4px;
      opacity:.95;
    }
  `);

    // ====== เลือก anchor ของชื่อเรื่องจาก layout dedbit ======
    function findTitleLinks() {
        return Array.from(document.querySelectorAll(
            'table.torrenttable tr td[align="left"] a[href*="details.php?id="]'
        )).slice(0, MAX_ITEMS);
    }

    // ทำความสะอาดชื่อ
    function cleanNoise(s) {
        return s
            .replace(/\[[^\]]+\]/g, ' ')
            .replace(/\((?:BluRay|WEB[- ]?DL|WEBRip|HDRip|DVDRip|UHD|HEVC|x264|x265|H\.?264|H\.?265|AV1|IMAX|Extended|Director'?s Cut|1080p|2160p|720p|480p|Thai|Eng|Sub|Dublado|Dual Audio|Atmos|AAC|DTS|DDP?|TRUEHD|Remux|HC|DS4K|Mini|HYBRID\+?|AMZN|WEBRip|WEB\-DL|MA)\)/ig, ' ')
            .replace(/\b(1080p|2160p|720p|480p|4K|8K|WEB[- ]?DL|WEBRip|BluRay|BRRip|HDRip|DVDRip|HEVC|x264|x265|AV1|H\.?264|H\.?265|UHD|IMAX|Remux|Extended|Director'?s\sCut|Atmos|AAC|DTS|DDP?|TRUEHD|Dual\sAudio|THAI|Thai|ENG|EN|Sub|Subs|MULTI|HC|CAM|TS|R5|SDR|DS4K|Mini|HYBRID\+?|AMZN|IMAX)\b/ig, ' ')
            .replace(/[._]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ดึงหลายตัวเลือก (ซ้าย|ขวา / ตัดก่อนวงเล็บ / มีปี)
    function parseTitleAndYearMulti(raw) {
        const parts = raw.split('|').map(s => s.trim());
        const seeds = parts.length >= 2 ? [parts[0], parts[1]] : [raw];

        const yearMatch = raw.match(/\b(19[3-9]\d|20[0-4]\d|2050)\b/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

        const out = [];
        for (const c of seeds) {
            let t = cleanNoise(c);
            if (year) t = t.replace(new RegExp(`\\b${year}\\b`), ' ');
            t = t
                .replace(/\bS\d{1,2}E\d{1,3}\b/ig, ' ')
                .replace(/\bS\d{1,2}\b/ig, ' ')
                .replace(/\bSeason\s?\d+\b/ig, ' ')
                .replace(/\bEpisode\s?\d+\b/ig, ' ')
                .replace(/\s+/g, ' ').trim();
            if (!t || t.length < 2) t = c.trim();
            out.push({ title: t, year });
            // เวอร์ชันไม่ใส่ปีด้วย
            out.push({ title: t, year: undefined });
        }

        const beforeParen = raw.split('(')[0].trim();
        if (beforeParen && beforeParen.length > 1) {
            const t = cleanNoise(beforeParen);
            out.push({ title: t, year });
            out.push({ title: t, year: undefined });
        }

        // เอาของซ้ำออก
        const dedup = [];
        const seen = new Set();
        for (const v of out) {
            const k = v.title + '|' + (v.year || '');
            if (!seen.has(k)) { seen.add(k); dedup.push(v); }
        }
        return dedup;
    }

    // คิวกัน rate-limit
    const queue = [];
    let busy = false;
    function enqueue(fn) { queue.push(fn); if (!busy) runQueue(); }
    function runQueue() {
        if (!queue.length) { busy = false; return; }
        busy = true;
        const job = queue.shift();
        Promise.resolve().then(job).finally(() => setTimeout(runQueue, FETCH_DELAY_MS));
    }

    function ratingClass(score) {
        if (score >= 7.0) return 'tmdb-badge tmdb-badge--good';
        if (score >= 5.5) return 'tmdb-badge tmdb-badge--ok';
        return 'tmdb-badge tmdb-badge--bad';
    }

    function gmFetchJson(url) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                onload: (res) => { try { resolve(JSON.parse(res.responseText)); } catch { resolve(null); } },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null),
            });
        });
    }

    async function tmdbSearch(q, params = {}) {
        const url = new URL('https://api.themoviedb.org/3/search/multi');
        url.searchParams.set('api_key', TMDB_KEY);
        url.searchParams.set('query', q);
        url.searchParams.set('include_adult', 'true');
        // ถ้าชอบผลภาษาไทย เปิดบรรทัดนี้
        // url.searchParams.set('language', 'th-TH');
        if (params.year) url.searchParams.set('year', params.year);
        if (params.first_air_date_year) url.searchParams.set('first_air_date_year', params.first_air_date_year);
        const data = await gmFetchJson(url.toString());
        return data?.results?.filter(r => r.media_type === 'movie' || r.media_type === 'tv') || [];
    }

    function scoreResult(r) {
        let s = (r.vote_average || 0);
        if (r.poster_path) s += 0.2;
        return s;
    }

    // >>> ฟังก์ชันที่ขาดหาย — ใส่มาให้แล้ว <<<
    async function fetchTMDbBestMatchMulti(cands) {
        let best = null;

        for (const c of cands) {
            // ลองแบบ movie (year) + no year + tv (first_air_date_year)
            const tries = [
                { q: c.title, params: { year: c.year } },
                { q: c.title, params: {} },
                { q: c.title, params: { first_air_date_year: c.year } },
            ];

            for (const t of tries) {
                const results = await tmdbSearch(t.q, t.params);
                if (results.length) {
                    const pick = results.sort((a,b) => scoreResult(b) - scoreResult(a))[0];
                    if (!best || scoreResult(pick) > scoreResult(best)) best = pick;
                    if (best && (best.vote_average || 0) >= 7.5) return best; // ดีพอ ตัดจบเร็ว
                }
            }
        }
        return best;
    }

    function injectPosterToCatpic(row, result) {
        const td = row.querySelector('td.catpic');
        if (!td) return;
        td.innerHTML = '';
        td.style.position = 'relative'; // เผื่อธีมบางแบบไม่ได้กำหนด

        if (result?.poster_path) {
            const img = document.createElement('img');
            img.className = 'tmdb-poster';
            img.src = `${IMAGE_BASE}${result.poster_path}`;
            img.loading = 'lazy';
            img.decoding = 'async';
            td.appendChild(img);
        } else {
            const span = document.createElement('span');
            span.textContent = 'N/A';
            span.style.cssText = 'font-size:12px;color:#aaa;';
            td.appendChild(span);
        }

        // ---- ใส่ป้ายคะแนน ----
        const badge = document.createElement('span');
        const v = (typeof result?.vote_average === 'number') ? Number(result.vote_average) : null;
        if (v !== null && !Number.isNaN(v) && v > 0) {
            const txt = (Math.round(v * 10) / 10).toFixed(1);
            badge.className = ratingClass(v) + ' tmdb-badge-overlay';
            badge.textContent = txt;
        } else {
            badge.className = 'tmdb-badge tmdb-badge-overlay';
            badge.textContent = 'N/A';
        }
        td.appendChild(badge);
    }

    // ====== main ======
    const links = findTitleLinks();
    if (!links.length) return;

    links.forEach((a) => {
        const row = a.closest('tr');
        if (!row) return;

        // placeholder
        injectPosterToCatpic(row, null);

        if (!TMDB_KEY) return;

        const rawName = (a.textContent || a.title || '').trim();
        const variants = parseTitleAndYearMulti(rawName);

        enqueue(async () => {
            try {
                const res = await fetchTMDbBestMatchMulti(variants);
                injectPosterToCatpic(row, res);
            } catch (e) {
                injectPosterToCatpic(row, null);
                console.debug('[Dedbit TMDb] error for:', rawName, e);
            }
        });
    });

})();
