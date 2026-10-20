import { LENGTHS, STATUSES } from '../config.js';

// ---------------------------------------------------------------------
// 要素を作る小さなヘルパー
//   h('a', { href: '#/', class: 'btn' }, 'テキスト', 子要素...)
// 文字列はすべて textContent として入るので、HTML として解釈されることはない。
// ---------------------------------------------------------------------
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'value') el.value = value;  // select は子要素のあとで設定し直す（下の append 後）
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  if (tag === 'select' && props?.value != null) el.value = props.value;
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child == null || child === false || child === '') continue;
    if (Array.isArray(child)) append(el, child);
    else if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }
}

// SVG アイコン（線のみ・currentColor）
const ICONS = {
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  comment: 'M5 5h14v10H9l-4 4z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
  file: 'M7 3h7l4 4v14H7zM14 3v4h4',
};
export function icon(name, label) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon icon--${name}`);
  svg.setAttribute('aria-hidden', label ? 'false' : 'true');
  if (label) svg.setAttribute('aria-label', label);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name]);
  svg.appendChild(path);
  return svg;
}

// ---------------------------------------------------------------------
// 表示用
// ---------------------------------------------------------------------
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${fmtDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function lengthText(script) {
  const len = LENGTHS[script.length_category]?.label ?? '';
  return script.runtime_minutes ? `${len}（約${script.runtime_minutes}分）` : len;
}

// 台本の表紙（縦書き）。一覧と詳細で使う
export function cover(script, { size = 'normal' } = {}) {
  const len = LENGTHS[script.length_category];
  const stamp = STATUSES[script.status]?.stamp;
  return h('div', { class: `cover cover--${script.length_category} cover--${size}`, 'aria-hidden': 'true' },
    h('span', { class: 'cover__spine' }, len?.label ?? ''),
    h('span', { class: 'cover__title' }, script.title),
    h('span', { class: 'cover__author' }, script.author_name),
    stamp ? h('span', { class: 'cover__stamp' }, stamp) : null,
  );
}

// ---------------------------------------------------------------------
// 通知
// ---------------------------------------------------------------------
let toastTimer;
export function toast(message, kind = 'info') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast toast--${kind} is-visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), kind === 'error' ? 7000 : 4000);
}

// Supabase のエラーを、利用者に分かる日本語にする
export function errText(err) {
  const msg = String(err?.message ?? err ?? '');
  const table = [
    [/Invalid login credentials/i, 'メールアドレスかパスワードが違います。'],
    [/Email not confirmed/i, 'メールアドレスの確認がまだです。届いたメールのリンクを開いてください。'],
    [/User already registered/i, 'このメールアドレスはすでに登録されています。ログインしてください。'],
    [/Password should be at least/i, 'パスワードが短すぎます。'],
    [/rate limit|too many requests/i, '短い時間に操作が集中しました。しばらく待ってからもう一度試してください。'],
    [/Failed to fetch|NetworkError|Load failed/i, '通信できませんでした。ネットにつながっているか確認してください。'],
    [/duplicate key/i, 'すでに登録されています。'],
    [/row-level security|permission denied/i, 'この操作をする権限がありません。ログインし直すと直ることがあります。'],
    [/exceeded the maximum allowed size|Payload too large/i, 'ファイルが大きすぎます。'],
    [/mime type/i, 'PDF以外のファイルはアップロードできません。'],
    [/JWT expired/i, 'ログインの有効期限が切れました。もう一度ログインしてください。'],
  ];
  for (const [re, text] of table) if (re.test(msg)) return text;
  return msg || 'うまくいきませんでした。もう一度試してください。';
}

// ---------------------------------------------------------------------
// フォーム部品
// ---------------------------------------------------------------------
let fieldSeq = 0;
export function field(labelText, control, { help, required } = {}) {
  const id = control.id || `f${++fieldSeq}`;
  control.id = id;
  const helpId = help ? `${id}-help` : null;
  if (helpId) control.setAttribute('aria-describedby', helpId);
  return h('div', { class: 'field' },
    h('label', { class: 'field__label', for: id }, labelText, required ? h('span', { class: 'field__req' }, '必須') : null),
    control,
    help ? h('p', { class: 'field__help', id: helpId }, help) : null,
  );
}

// ラジオボタンのまとまり
export function radioGroup(name, legend, options, current, { help } = {}) {
  return h('fieldset', { class: 'field choice' },
    h('legend', { class: 'field__label' }, legend),
    help ? h('p', { class: 'field__help' }, help) : null,
    ...options.map(([value, label, desc]) =>
      h('label', { class: 'choice__item' },
        h('input', { type: 'radio', name, value, checked: value === current }),
        h('span', { class: 'choice__text' },
          h('span', { class: 'choice__label' }, label),
          desc ? h('span', { class: 'choice__desc' }, desc) : null,
        ),
      )),
  );
}

export function button(text, props = {}) {
  return h('button', { type: 'button', class: 'btn', ...props }, text);
}

// 処理中はボタンを押せなくする
export async function busy(btn, text, fn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = text;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

export function notice(kind, ...children) {
  return h('div', { class: `notice notice--${kind}` }, ...children);
}
