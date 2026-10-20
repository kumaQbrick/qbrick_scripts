import { SITE_NAME } from './config.js';
import { sb, isConfigured } from './lib/supabase.js';
import { state, setUser, onStateChange, isMember, isAdmin } from './lib/state.js';
import { h, toast, notice } from './lib/ui.js';

import { listView } from './views/list.js';
import { detailView } from './views/detail.js';
import { formView } from './views/form.js';
import { loginView, signupView, resetView, newPasswordView } from './views/auth.js';
import { accountView } from './views/account.js';
import { adminView } from './views/admin.js';
import { aboutView } from './views/about.js';

const UUID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';

// URL は「#/パス?クエリ」の形（GitHub Pages でも動くようにハッシュで画面を切り替える）
const routes = [
  [/^\/$/, listView, '脚本一覧'],
  [new RegExp(`^/s/${UUID}$`), detailView, '脚本'],
  [/^\/new$/, formView, '脚本を投稿'],
  [new RegExp(`^/edit/${UUID}$`), formView, '脚本を編集'],
  [/^\/login$/, loginView, 'ログイン'],
  [/^\/signup$/, signupView, 'アカウント登録'],
  [/^\/reset$/, resetView, 'パスワードの再設定'],
  [/^\/new-password$/, newPasswordView, '新しいパスワード'],
  [/^\/account$/, accountView, 'アカウント'],
  [/^\/admin$/, adminView, '管理'],
  [/^\/about$/, aboutView, '使い方とルール'],
];

const main = document.getElementById('main');
let renderToken = 0;
let currentDestroy = null;

export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs) };
}

export function go(path) {
  if (location.hash === `#${path}`) render();
  else location.hash = path;
}

async function render() {
  const token = ++renderToken;
  const { path, query } = parseHash();
  let match = null;
  for (const [re, view, title] of routes) {
    const m = path.match(re);
    if (m) { match = { view, title, params: m.slice(1) }; break; }
  }

  currentDestroy?.();
  currentDestroy = null;

  if (!match) {
    mount(h('section', { class: 'page narrow' },
      h('h1', { class: 'page-title' }, 'ページが見つかりません'),
      h('p', {}, h('a', { href: '#/' }, '脚本一覧に戻る')),
    ), 'ページが見つかりません');
    return;
  }

  let result;
  try {
    result = await match.view({ params: match.params, query, go, rerender: render });
  } catch (err) {
    console.error(err);
    result = h('section', { class: 'page narrow' },
      h('h1', { class: 'page-title' }, '表示できませんでした'),
      notice('error', String(err?.message ?? err)),
      h('p', {}, h('a', { href: '#/' }, '脚本一覧に戻る')),
    );
  }
  if (token !== renderToken) {
    result?.destroy?.();
    return; // 読み込み中に別の画面へ移った
  }
  const el = result instanceof Node ? result : result.el;
  currentDestroy = result?.destroy ?? null;
  mount(el, result?.title ?? match.title);
}

function mount(el, title) {
  main.replaceChildren(el);
  document.title = `${title} | Qbrick ${SITE_NAME}`;
  window.scrollTo(0, 0);
}

function renderNav() {
  const nav = document.getElementById('site-nav');
  const p = state.profile;
  nav.replaceChildren(...[
    h('a', { href: '#/' }, '一覧'),
    isMember() ? h('a', { href: '#/new', class: 'site-nav__post' }, '投稿する') : null,
    isAdmin() ? h('a', { href: '#/admin' }, '管理') : null,
    state.user
      ? h('a', { href: '#/account', class: 'site-nav__me' }, p?.display_name ?? 'アカウント')
      : h('a', { href: '#/login' }, 'ログイン'),
  ].filter(Boolean));
}

async function init() {
  document.getElementById('brand-name').textContent = SITE_NAME;

  // 「本文へ移動」リンクはハッシュを書き換えずにフォーカスだけ移す
  document.querySelector('[data-skip]').addEventListener('click', (e) => {
    e.preventDefault();
    main.focus();
  });

  if (!isConfigured) {
    main.replaceChildren(h('section', { class: 'page narrow' },
      h('h1', { class: 'page-title' }, 'セットアップが必要です'),
      notice('warn', 'js/config.js の SUPABASE_URL と SUPABASE_KEY を、Supabase のプロジェクトの値に書き換えてください。手順は README.md にあります。'),
    ));
    return;
  }

  // メールのリンクから戻ってきたときのエラー（期限切れなど）
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (hashParams.has('error_description')) {
    toast(`リンクを使えませんでした：${hashParams.get('error_description')}。もう一度やり直してください。`, 'error');
    history.replaceState(null, '', location.pathname + '#/');
  }

  sb.auth.onAuthStateChange((event, session) => {
    // コールバックの中で Supabase を待つと固まることがあるので、少し後で処理する
    setTimeout(async () => {
      const changed = (session?.user?.id ?? null) !== (state.user?.id ?? null);
      if (changed || event === 'USER_UPDATED') await setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') {
        if (ready) go('/new-password');
        else recoveryPending = true;
      } else if (changed && ready) {
        render();
      }
    }, 0);
  });

  const { data } = await sb.auth.getSession();
  await setUser(data.session?.user ?? null);

  // 認証用のトークンが URL に残っていたら消す
  if (/access_token=|refresh_token=|type=recovery/.test(location.hash)) {
    if (/type=recovery/.test(location.hash)) recoveryPending = true;
    history.replaceState(null, '', location.pathname + '#/');
  }
  // パスワード再設定メールから来たときは、新しいパスワードの画面へ
  if (recoveryPending) history.replaceState(null, '', location.pathname + '#/new-password');

  onStateChange(renderNav);
  renderNav();
  window.addEventListener('hashchange', render);
  ready = true;
  render();
}

let ready = false;
let recoveryPending = false;
init();
