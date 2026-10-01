import { h } from './ui.js';

const BASE = new URL('../../vendor/pdfjs/', import.meta.url).href;

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(BASE + 'pdf.min.mjs').then((pdfjs) => {
      // The workerSrc property shall be specified.
      pdfjs.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.min.mjs';
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

// ページを画面幅に合わせてcanvasに描く
export function pdfViewer(url) {
  const status = h('p', { class: 'pdf__status' }, '読み込み中…');
  const pages = h('div', { class: 'pdf__pages' });
  const el = h('div', { class: 'pdf' }, status, pages);

  let doc = null;
  let destroyed = false;

  (async () => {
    try {
      const pdfjs = await loadPdfjs();
      if (!destroyed) {
        doc = await pdfjs.getDocument({
          url,
          cMapUrl: BASE + 'cmaps/',
          cMapPacked: true,   // 日本語のPDFはこれないと文字が出ない
          standardFontDataUrl: BASE + 'standard_fonts/',
          wasmUrl: BASE + 'wasm/',
          iccUrl: BASE + 'iccs/',
          isEvalSupported: false,
        }).promise;
        if (!destroyed) {

          status.textContent = `${doc.numPages}ページ`;

          for (let n = 1; n <= doc.numPages; n++) {
            const page = h('div', {
              class: 'pdf__page',
              role: 'img',
              'aria-label': `${n}ページ目`,
            });
            pages.appendChild(page);
            await renderPage(doc, n, page);
          }
        } else {
          doc.destroy();
        }
      }
    } catch (err) {
      console.error(err);
      status.textContent = 'ここでは表示できませんでした。「別タブで開く」から読んでください';
      status.classList.add('is-error');
    }
  })();

  return {
    el,
    destroy() {
      destroyed = true;
      doc?.destroy();
    },
  };
}

async function renderPage(doc, n, container) {
  try {
    var page = await doc.getPage(n);
    var base = page.getViewport({ scale: 1 });
    container.style.aspectRatio = `${base.width} / ${base.height}`;
    var cssWidth = container.clientWidth || 800;
    var dpr = Math.min(window.devicePixelRatio || 1, 2); // 3倍とかだと重すぎる
    var viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });

    // Prepare canvas using PDF page dimensions
    var canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    // Render PDF page into canvas context
    await page.render({ canvas, viewport }).promise;
    container.replaceChildren(canvas);
    page.cleanup();
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') {
      console.error(err);
      container.replaceChildren(h('p', { class: 'pdf__page-error' }, `${n}ページ目を表示できませんでした`));
    }
  }
}
