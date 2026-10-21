import { GENRES, LENGTHS, STATUSES, PERMISSIONS, VISIBILITIES, MAX_PDF_MB } from '../config.js';
import { sb, BUCKET } from '../lib/supabase.js';
import { state, isLoggedIn, isMember, isAdmin, myId } from '../lib/state.js';
import { h, field, radioGroup, errText, toast, notice, fmtSize } from '../lib/ui.js';

const MAX_GENRES = 3; // 多すぎると一覧で読めないので

export async function formView({ params, go }) {
  const editId = params[0] ?? null;

  if (!isLoggedIn()) return gate('投稿にはログインが必要です。', h('a', { class: 'btn btn--ink', href: '#/login' }, 'ログイン'));
  if (!isMember()) return gate('投稿はメンバーだけです。', h('a', { class: 'btn btn--ink', href: '#/account' }, '招待コードを入れる'));

  // 編集のときは今のを読み込む
  let s = null;
  if (editId) {
    const { data, error } = await sb.from('scripts').select('*').eq('id', editId).maybeSingle();
    if (error) throw error;
    if (data) {
      if (data.owner_id === myId() || isAdmin()) {
        s = data;
      } else {
        return gate('編集できるのは投稿した本人と管理者だけです。');
      }
    } else {
      return gate('脚本が見つかりません。');
    }
  }

  const v = s ?? {
    title: '', author_name: state.profile?.display_name ?? '', synopsis: '', genres: [],
    length_category: 'short', runtime_minutes: null, status: 'open',
    usage_permission: 'ask', visibility: 'members',
  };

  const title = h('input', { type: 'text', value: v.title, maxlength: 100, required: true });
  const author = h('input', { type: 'text', value: v.author_name, maxlength: 50, required: true });
  const synopsis = h('textarea', { rows: 4, maxlength: 2000, value: v.synopsis });
  const runtime = h('input', { type: 'number', min: 1, max: 600, inputmode: 'numeric', value: v.runtime_minutes ?? '', class: 'input--short' });
  const status = h('select', { value: v.status }, ...Object.entries(STATUSES).map(([k, x]) => h('option', { value: k }, x.label)));

  // configから消したジャンルが付いてる脚本は、そのジャンルも残して表示する
  // （じゃないと編集して保存したときに勝手に消える）
  const genreNames = [...GENRES, ...v.genres.filter((g) => !GENRES.includes(g))];
  const genreBoxes = genreNames.map((g) => h('input', { type: 'checkbox', value: g, checked: v.genres.includes(g) }));
  const limitGenres = () => {
      var n = 0;
      for (var i = 0; i < genreBoxes.length; i++) {
          if (genreBoxes[i].checked) n++;
      }
      genreBoxes.forEach((b) => { b.disabled = !b.checked && n >= MAX_GENRES; });
  };
  genreBoxes.forEach((b) => b.addEventListener('change', limitGenres));
  limitGenres();

  const pdf = h('input', { type: 'file', id: 'pdf-input', accept: 'application/pdf,.pdf', required: !s });
  const pdfInfo = h('p', { class: 'field__help' }, s ? `今のファイル: ${s.pdf_filename}` : `${MAX_PDF_MB}MBまで`);
  pdf.addEventListener('change', () => {
    const file = pdf.files[0];
    if (file) pdfInfo.textContent = `${file.name} (${fmtSize(file.size)})`;
  });

  const errorBox = h('div', { class: 'form-error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--ink' }, s ? '保存' : '投稿する');

  const form = h('form', { class: 'script-form', novalidate: true, onsubmit },
    field('タイトル', title),
    field('筆者', author),
    field('あらすじ', synopsis),
    h('fieldset', { class: 'field' },
      h('legend', { class: 'field__label' }, `ジャンル（${MAX_GENRES}つまで）`),
      h('div', { class: 'chips' }, ...genreBoxes.map((box) => h('label', {}, box, box.value))),
    ),
    radioGroup('length_category', '長さ', Object.entries(LENGTHS).map(([k, x]) => [k, x.label]), v.length_category),
    field('上映時間（分）', runtime),
    field('状態', status),
    radioGroup('usage_permission', '他の人が使っていい？', Object.entries(PERMISSIONS).map(([k, x]) => [k, x.label]), v.usage_permission),
    radioGroup('visibility', '公開範囲', Object.entries(VISIBILITIES).map(([k, x]) => [k, x.label]), v.visibility),
    h('div', { class: 'field' },
      h('label', { class: 'field__label', for: 'pdf-input' }, s ? 'PDFを差し替える' : 'PDF'),
      pdf,
      pdfInfo,
    ),
    errorBox,
    h('div', { class: 'form-actions' },
      submit,
      h('a', { href: s ? `#/s/${s.id}` : '#/' }, 'やめる'),
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

    // チェック
    const problems = [];
    if (!values.title) problems.push('タイトルが空です');
    if (!values.author_name) problems.push('筆者が空です');
    if (!values.genres.length) problems.push('ジャンルを1つ以上選んでください');
    const rt = values.runtime_minutes;
    if (rt != null) {
      if (!(Number.isInteger(rt) && rt >= 1 && rt <= 600)) {
        problems.push('上映時間は1〜600の整数で');
      }
    }
    if (!s && !file) problems.push('PDFを選んでください');
    if (file) {
      const p = await checkPdf(file);
      if (p) problems.push(p);
    }
    if (problems.length) {
      errorBox.replaceChildren(notice('error', h('ul', {}, ...problems.map((p) => h('li', {}, p)))));
      errorBox.scrollIntoView({ block: 'center' });   // スマホだとエラーが見えないので
      return;
    }

    submit.disabled = true;
    const label = submit.textContent;
    let uploaded = null;
    try {
      if (file) {
        submit.textContent = 'アップロード中…';
        uploaded = `${myId()}/${crypto.randomUUID()}.pdf`;
        // file.typeが空になるブラウザがある
        // バケットはapplication/pdfしか通さないので作り直す
        const body = file.type === 'application/pdf' ? file : new File([file], file.name, { type: 'application/pdf' });
        const up = await sb.storage.from(BUCKET).upload(uploaded, body, { contentType: 'application/pdf', upsert: false });
        if (up.error) throw up.error;
        values.pdf_path = uploaded;
        values.pdf_filename = safeFilename(file.name);
        values.pdf_size = file.size;
      }

      submit.textContent = '保存中…';
      let id = s?.id;
      if (s) {
        const { error } = await sb.from('scripts').update(values).eq('id', s.id);
        if (!error) {
          if (uploaded) {
            // 差し替えたら前のPDFは消す
            const { error: rmErr } = await sb.storage.from(BUCKET).remove([s.pdf_path]);
            if (rmErr) {
              console.warn(rmErr); // 消せなくて残ったファイルはbackup.pyが一覧にしてくれる
            }
          }
        } else {
          throw error;
        }
      } else {
        const { data, error } = await sb.from('scripts').insert(values).select('id').single();
        if (error) throw error;
        id = data.id;
      }
      uploaded = null;
      toast(s ? '保存しました' : '投稿しました');
      go(`/s/${id}`);
    } catch (err) {
      console.error(err);
      // 途中で失敗したら上げたPDFを消しとく
      if (uploaded) await sb.storage.from(BUCKET).remove([uploaded]);
      errorBox.replaceChildren(notice('error', errText(err)));
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  }

  return h('section', { class: 'page narrow' },
    h('h1', {}, s ? '編集' : '投稿'),
    s && isAdmin() && s.owner_id !== myId() && notice('warn', '管理者として他の人の脚本を編集しています'),
    form,
  );
}

// 中身がPDFか確認（拡張子だけ.pdfにしたWordとかを弾く）
// PDFはふつう先頭が %PDF- になってる
async function checkPdf(file) {
  if (file.size > MAX_PDF_MB * 1024 * 1024) return `PDFが大きすぎます（${fmtSize(file.size)}）。${MAX_PDF_MB}MBまで`;
  const head = String.fromCharCode(...new Uint8Array(await file.slice(0, 5).arrayBuffer()));
  if (head !== '%PDF-') return 'PDFじゃないみたいです。Wordなどは「PDFで保存」してから';
  return null;
}

// ファイル名に使えない文字を_にする
function safeFilename(name) {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'script.pdf';
  const withExt = /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
  return withExt.slice(-200);
}

function gate(message, action) {
  return h('section', { class: 'page narrow' },
    h('h1', {}, '投稿'),
    h('p', {}, message),
    action && h('p', {}, action),
  );
}
