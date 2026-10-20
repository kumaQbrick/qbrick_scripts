import { h } from './ui.js';

// pdf.js はサイト内の vendor/pdfjs に同梱している（外部サービスに依存しないため）
const BASE = new URL('../../vendor/pdfjs/', import.meta.url).href;

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(BASE + 'pdf.min.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.min.mjs';
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

// PDF をページごとに canvas へ描く。スマホでもそのまま読めるよう、画面の幅に合わせる。
// 返り値: { el, destroy }
export function pdfViewer(url) {
  const status = h('p', { class: 'pdf__status' }, 'PDFを読み込み中…');
  const pages = h('div', { class: 'pdf__pages' });
  const el = h('div', { class: 'pdf' }, status, pages);

  let doc = null;
  let observer = null;
  let destroyed = false;

  (async () => {
    try {
      const pdfjs = await loadPdfjs();
      doc = await pdfjs.getDocument({
        url,
        cMapUrl: BASE + 'cmaps/',
        cMapPacked: true,
        standardFontDataUrl: BASE + 'standard_fonts/',
        wasmUrl: BASE + 'wasm/',
        iccUrl: BASE + 'iccs/',
        isEvalSupported: false,
      }).promise;
      if (destroyed) return doc.destroy();

      status.textContent = `全${doc.numPages}ページ`;

      // 1ページ目の縦横比を仮の大きさに使う
      const first = await doc.getPage(1);
      const v = first.getViewport({ scale: 1 });
      const ratio = `${v.width} / ${v.height}`;

      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          renderPage(doc, Number(entry.target.dataset.page), entry.target);
        }
      }, { rootMargin: '800px 0px' });

      for (let n = 1; n <= doc.numPages; n++) {
        const page = h('div', {
          class: 'pdf__page',
          dataset: { page: String(n) },
          style: { aspectRatio: ratio },
          role: 'img',
          'aria-label': `${n}ページ目`,
        });
        pages.appendChild(page);
        observer.observe(page);
      }
    } catch (err) {
      console.error(err);
      status.textContent = 'このブラウザではPDFを表示できませんでした。「新しいタブで開く」から読んでください。';
      status.classList.add('is-error');
    }
  })();

  return {
    el,
    destroy() {
      destroyed = true;
      observer?.disconnect();
      doc?.destroy();
    },
  };
}

async function renderPage(doc, n, container) {
  try {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    container.style.aspectRatio = `${base.width} / ${base.height}`;
    const cssWidth = container.clientWidth || 800;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    container.replaceChildren(canvas);
    page.cleanup();
  } catch (err) {
    if (err?.name === 'RenderingCancelledException') return;
    console.error(err);
    container.replaceChildren(h('p', { class: 'pdf__page-error' }, `${n}ページ目を表示できませんでした`));
  }
}
