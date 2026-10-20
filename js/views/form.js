import { GENRES, LENGTHS, STATUSES, PERMISSIONS, VISIBILITIES, MAX_PDF_MB } from '../config.js';
import { sb, BUCKET } from '../lib/supabase.js';
import { state, isLoggedIn, isMember, isAdmin, myId } from '../lib/state.js';
import { h, field, radioGroup, errText, toast, notice, fmtSize } from '../lib/ui.js';

const MAX_GENRES = 3;

export async function formView({ params, go }) {
  const editId = params[0] ?? null;

  if (!isLoggedIn()) {
    return gate('投稿するにはログインしてください。', h('a', { class: 'btn btn--primary', href: '#/login' }, 'ログイン'));
  }
  if (!isMember()) {
    return gate('投稿できるのはサークルメンバーだけです。招待コードを入力するとメンバーになれます。',
      h('a', { class: 'btn btn--primary', href: '#/account' }, '招待コードを入力する'));
  }

  let s = null;
  if (editId) {
    const { data, error } = await sb.from('scripts').select('*').eq('id', editId).maybeSingle();
    if (error) throw error;
    if (!data) return gate('脚本が見つかりません。');
    if (data.owner_id !== myId() && !isAdmin()) return gate('この脚本を編集できるのは投稿した本人と管理者だけです。');
    s = data;
  }

  const v = s ?? {
    title: '', author_name: state.profile?.display_name ?? '', synopsis: '', genres: [],
    length_category: 'short', runtime_minutes: null, status: 'open',
    usage_permission: 'ask', visibility: 'members',
  };

  // ---- 入力欄 ----
  const title = h('input', { type: 'text', name: 'title', value: v.title, maxlength: 100, required: true });
  const author = h('input', { type: 'text', name: 'author_name', value: v.author_name, maxlength: 50, required: true });
  const synopsis = h('textarea', { name: 'synopsis', rows: 5, maxlength: 2000, value: v.synopsis });
  const runtime = h('input', {
    type: 'number', name: 'runtime_minutes', min: 1, max: 600, inputmode: 'numeric',
    value: v.runtime_minutes ?? '', class: 'input--short',
  });
  const status = h('select', { name: 'status', value: v.status },
    ...Object.entries(STATUSES).map(([k, x]) => h('option', { value: k }, x.label)));

  const genreBoxes = GENRES.map((g) => h('input', { type: 'checkbox', name: 'genre', value: g, checked: v.genres.includes(g) }));
  // 設定から消えたジャンルが付いている脚本を編集するとき、消さずに残す
  const legacy = v.genres.filter((g) => !GENRES.includes(g));
  legacy.forEach((g) => genreBoxes.push(h('input', { type: 'checkbox', name: 'genre', value: g, checked: true })));
  const syncGenres = () => {
    const n = genreBoxes.filter((b) => b.checked).length;
    genreBoxes.forEach((b) => { b.disabled = !b.checked && n >= MAX_GENRES; });
  };
  genreBoxes.forEach((b) => b.addEventListener('change', syncGenres));
  syncGenres();

  const pdf = h('input', { type: 'file', name: 'pdf', accept: 'application/pdf,.pdf', required: !s });
  const pdfInfo = h('p', { class: 'field__help' });
  pdf.addEventListener('change', () => {
    const file = pdf.files[0];
    pdfInfo.textContent = file ? `${file.name}（${fmtSize(file.size)}）` : '';
  });

  const errorBox = h('div', { class: 'form-error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, s ? '変更を保存する' : '投稿する');

  const form = h('form', { class: 'script-form', novalidate: true, onsubmit },
    field('タイトル', title, { required: true }),
    field('筆者名', author, { required: true, help: 'ペンネームでもかまいません。共作なら全員の名前を書いてください。' }),
    field('あらすじ', synopsis, { help: '一覧の検索にも使われます（2000文字まで）。' }),

    h('fieldset', { class: 'field' },
      h('legend', { class: 'field__label' }, 'ジャンル', h('span', { class: 'field__req' }, '必須')),
      h('p', { class: 'field__help' }, `${MAX_GENRES}つまで選べます。`),
      h('div', { class: 'checks' },
        ...genreBoxes.map((box) => h('label', { class: 'checks__item' }, box, box.value))),
    ),

    radioGroup('length_category', '長さ',
      Object.entries(LENGTHS).map(([k, x]) => [k, x.label, x.hint]), v.length_category),
    field('想定の上映時間（分）', runtime, { help: '分かる範囲で。空欄でもかまいません。' }),
    field('状態', status),

    radioGroup('usage_permission', 'この脚本をほかの人が使うこと',
      Object.entries(PERMISSIONS).map(([k, x]) => [k, x.label, x.desc]), v.usage_permission),

    radioGroup('visibility', '公開範囲',
      Object.entries(VISIBILITIES).map(([k, x]) => [k, x.label, x.desc]), v.visibility),

    h('div', { class: 'field' },
      h('label', { class: 'field__label', for: 'pdf-input' }, s ? 'PDFを差し替える' : '脚本のPDF', s ? null : h('span', { class: 'field__req' }, '必須')),
      Object.assign(pdf, { id: 'pdf-input' }),
      pdfInfo,
      h('p', { class: 'field__help' },
        s ? `いまのファイル: ${s.pdf_filename}。差し替えるときだけ選んでください（${MAX_PDF_MB}MBまで）。`
          : `${MAX_PDF_MB}MBまでのPDFを選んでください。`),
    ),

    notice('info', '投稿できるのは、自分が書いた脚本か、共作者全員が投稿に同意している脚本だけです。'),
    errorBox,
    h('div', { class: 'form-actions' },
      submit,
      h('a', { class: 'btn btn--ghost', href: s ? `#/s/${s.id}` : '#/' }, 'キャンセル'),
    ),
  );

  async function onsubmit(e) {
    e.preventDefault();
    errorBox.replaceChildren();

    const values = {
      title: title.value.trim(),
      author_name: author.value.trim(),
      synopsis: synopsis.value.trim(),
      genres: genreBoxes.filter((b) => b.checked).map((b) => b.value),
      length_category: form.querySelector('input[name=length_category]:checked')?.value,
      runtime_minutes: runtime.value ? Number(runtime.value) : null,
      status: status.value,
      usage_permission: form.querySelector('input[name=usage_permission]:checked')?.value,
      visibility: form.querySelector('input[name=visibility]:checked')?.value,
    };
    const file = pdf.files[0] ?? null;

    const problems = [];
    if (!values.title) problems.push('タイトルを入力してください。');
    if (!values.author_name) problems.push('筆者名を入力してください。');
    if (!values.genres.length) problems.push('ジャンルを1つ以上選んでください。');
    if (values.runtime_minutes != null && !(Number.isInteger(values.runtime_minutes) && values.runtime_minutes >= 1 && values.runtime_minutes <= 600)) {
      problems.push('上映時間は1〜600の整数で入力してください。');
    }
    if (!s && !file) problems.push('PDFを選んでください。');
    if (file) {
      const problem = await checkPdf(file);
      if (problem) problems.push(problem);
    }
    if (problems.length) {
      errorBox.replaceChildren(notice('error', h('ul', {}, ...problems.map((p) => h('li', {}, p)))));
      errorBox.scrollIntoView({ block: 'center' });
      return;
    }

    submit.disabled = true;
    const label = submit.textContent;
    let uploadedPath = null;
    try {
      if (file) {
        submit.textContent = 'PDFをアップロード中…';
        uploadedPath = `${myId()}/${crypto.randomUUID()}.pdf`;
        // ブラウザによってはPDFの種類が空になるので、明示しておく（バケットはPDFしか受け付けない）
        const body = file.type === 'application/pdf' ? file : new File([file], file.name, { type: 'application/pdf' });
        const up = await sb.storage.from(BUCKET).upload(uploadedPath, body, {
          contentType: 'application/pdf', upsert: false, cacheControl: '3600',
        });
        if (up.error) throw up.error;
        values.pdf_path = uploadedPath;
        values.pdf_filename = safeFilename(file.name);
        values.pdf_size = file.size;
      }

      submit.textContent = '保存中…';
      let id;
      if (s) {
        const { error } = await sb.from('scripts').update(values).eq('id', s.id);
        if (error) throw error;
        id = s.id;
        // 差し替えたら古いPDFを消す（失敗しても脚本自体は保存済み）
        if (uploadedPath && s.pdf_path !== uploadedPath) {
          const { error: rmErr } = await sb.storage.from(BUCKET).remove([s.pdf_path]);
          if (rmErr) console.warn('古いPDFの削除に失敗', rmErr);
        }
      } else {
        const { data, error } = await sb.from('scripts').insert(values).select('id').single();
        if (error) throw error;
        id = data.id;
      }
      uploadedPath = null;
      toast(s ? '変更を保存しました' : '投稿しました');
      go(`/s/${id}`);
    } catch (err) {
      console.error(err);
      if (uploadedPath) await sb.storage.from(BUCKET).remove([uploadedPath]);
      errorBox.replaceChildren(notice('error', errText(err)));
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  }

  return h('section', { class: 'page narrow' },
    h('h1', { class: 'page-title' }, s ? '脚本を編集' : '脚本を投稿'),
    s && isAdmin() && s.owner_id !== myId() ? notice('warn', '管理者として、ほかの人の脚本を編集しています。') : null,
    form,
  );
}

async function checkPdf(file) {
  if (file.size > MAX_PDF_MB * 1024 * 1024) return `PDFが大きすぎます（${fmtSize(file.size)}）。${MAX_PDF_MB}MB以下にしてください。`;
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const magic = String.fromCharCode(...head);
  if (magic !== '%PDF-') return 'PDFファイルを選んでください（Wordなどは「PDFとして保存」してから）。';
  return null;
}

function safeFilename(name) {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'script.pdf';
  const withExt = /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
  return withExt.length > 200 ? withExt.slice(-200) : withExt;
}

function gate(message, action) {
  return h('section', { class: 'page narrow' },
    h('h1', { class: 'page-title' }, '脚本を投稿'),
    h('p', {}, message),
    action ? h('p', {}, action) : null,
    h('p', {}, h('a', { href: '#/' }, '脚本一覧に戻る')),
  );
}
