import { LENGTHS, STATUSES } from '../config.js';

// h('a', { href: '#/' }, 'text', child...)  文字列は textContent で入る
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'value') el.value = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  add(el, children);
  // select は option を入れてからでないと value が効かない
  if (tag === 'select' && props?.value != null) el.value = props.value;
  return el;
}

function add(el, children) {
  for (const c of children) {
    if (c == null || c === false || c === '') continue;
    if (Array.isArray(c)) add(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

const ICONS = {
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  comment: 'M5 5h14v10H9l-4 4z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
};
export function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon icon--${name}`);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

const pad = (n) => String(n).padStart(2, '0');
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${fmtDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fmtSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function lengthText(s) {
  const len = LENGTHS[s.length_category]?.label ?? '';
  return s.runtime_minutes ? `${len} ${s.runtime_minutes}分` : len;
}

// ホチキス留めの台本。縦書き・右綴じ
export function cover(s, { large = false } = {}) {
  const st = STATUSES[s.status];
  return h('div', { class: `cover${large ? ' cover--large' : ''}`, 'aria-hidden': 'true' },
    h('span', { class: 'cover__len' }, LENGTHS[s.length_category]?.label ?? ''),
    h('span', { class: 'cover__title' }, s.title),
    h('span', { class: 'cover__author' }, s.author_name),
    st?.tape ? h('span', { class: 'cover__tape' }, st.label) : null,
  );
}

let toastTimer;
export function toast(message, kind = 'info') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast toast--${kind} is-visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), kind === 'error' ? 7000 : 3500);
}

export function errText(err) {
  const msg = String(err?.message ?? err ?? '');
  const table = [
    [/Invalid login credentials/i, 'メールアドレスかパスワードが違います'],
    [/Email not confirmed/i, 'メールの確認がまだです。届いたメールのリンクを開いてください'],
    [/User already registered/i, 'このメールアドレスはもう登録されています'],
    [/Password should be at least/i, 'パスワードが短すぎます'],
    [/rate limit|too many requests/i, '操作が多すぎます。少し待ってからもう一度'],
    [/Failed to fetch|NetworkError|Load failed/i, '通信できませんでした'],
    [/duplicate key/i, 'もう登録されています'],
    [/row-level security|permission denied/i, '権限がありません。ログインし直すと直るかも'],
    [/exceeded the maximum allowed size|Payload too large/i, 'ファイルが大きすぎます'],
    [/mime type/i, 'PDF以外はアップロードできません'],
    [/JWT expired/i, 'ログインが切れました。もう一度ログインしてください'],
  ];
  for (const [re, text] of table) if (re.test(msg)) return text;
  return msg || 'うまくいきませんでした';
}

let seq = 0;
export function field(label, control, { help } = {}) {
  control.id ||= `f${++seq}`;
  if (help) control.setAttribute('aria-describedby', `${control.id}-help`);
  return h('div', { class: 'field' },
    h('label', { class: 'field__label', for: control.id }, label),
    control,
    help ? h('p', { class: 'field__help', id: `${control.id}-help` }, help) : null,
  );
}

export function radioGroup(name, legend, options, current) {
  return h('fieldset', { class: 'field' },
    h('legend', { class: 'field__label' }, legend),
    h('div', { class: 'choices' },
      ...options.map(([value, label, desc]) =>
        h('label', { class: 'choice' },
          h('input', { type: 'radio', name, value, checked: value === current }),
          h('span', {}, h('b', {}, label), desc ? h('small', {}, desc) : null),
        )),
    ),
  );
}

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

// kind: info / warn / error / ok
export function notice(kind, ...children) {
  return h('div', { class: `note note--${kind}` }, ...children);
}
