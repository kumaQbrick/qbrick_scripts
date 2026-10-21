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

// GitHub Pages はサーバー側でパスを振り分けられないので # で画面を切り替える
const routes = [
  [/^\/$/, listView, '一覧'],
  [new RegExp(`^/s/${UUID}$`), detailView, '脚本'],
  [/^\/new$/, formView, '投稿'],
  [new RegExp(`^/edit/${UUID}$`), formView, '編集'],
  [/^\/login$/, loginView, 'ログイン'],
  [/^\/signup$/, signupView, '登録'],
  [/^\/reset$/, resetView, 'パスワード再設定'],
  [/^\/new-password$/, newPasswordView, '新しいパスワード'],
  [/^\/account$/, accountView, 'アカウント'],
  [/^\/admin$/, adminView, '管理'],
  [/^\/about$/, aboutView, 'ルール'],
];

const main = document.getElementById('main');
let renderToken = 0;
let destroyCurrent = null;
let ready = false;
let recoveryPending = false;

export function go(path) {
  if (location.hash === `#${path}`) render();
  else location.hash = path;
}

function parseHash() {
  const [path, qs = ''] = (location.hash.replace(/^#/, '') || '/').split('?');
  return { path: path || '/', query: new URLSearchParams(qs) };
}

const simplePage = (title, ...body) =>
  h('section', { class: 'page narrow' }, h('h1', {}, title), ...body);

async function render() {
  const token = ++renderToken;
  const { path, query } = parseHash();
  const route = routes.find(([re]) => re.test(path));

  // 前の画面の後片付けで失敗しても、画面の切り替えは止めない
  try { destroyCurrent?.(); } catch (err) { console.error(err); }
  destroyCurrent = null;

  if (!route) {
    mount(simplePage('ページがありません', h('p', {}, h('a', { href: '#/' }, '一覧へ'))), 'ページがありません');
    return;
  }
  const [re, view, title] = route;

  let result;
  try {
    result = await view({ params: path.match(re).slice(1), query, go, rerender: render });
  } catch (err) {
    console.error(err);
    result = simplePage('表示できませんでした', notice('error', String(err?.message ?? err)), h('p', {}, h('a', { href: '#/' }, '一覧へ')));
  }
  // 読み込み中に別の画面へ移っていたら捨てる
  if (token !== renderToken) {
    try { result?.destroy?.(); } catch (err) { console.error(err); }
    return;
  }
  destroyCurrent = result?.destroy ?? null;
  mount(result instanceof Node ? result : result.el, result?.title ?? title);
}

function mount(el, title) {
  main.replaceChildren(el);
  document.title = `${title} | 脚本棚`;
  window.scrollTo(0, 0);
}

function renderNav() {
  document.getElementById('site-nav').replaceChildren(...[
    h('a', { href: '#/' }, '一覧'),
    isMember() && h('a', { href: '#/new', class: 'nav-post' }, '投稿する'),
    isAdmin() && h('a', { href: '#/admin' }, '管理'),
    state.user
      ? h('a', { href: '#/account', class: 'nav-me' }, state.profile?.display_name ?? 'アカウント')
      : h('a', { href: '#/login' }, 'ログイン'),
  ].filter(Boolean));
}

async function init() {
  document.querySelector('[data-skip]').addEventListener('click', (e) => {
    e.preventDefault();
    main.focus();
  });

  if (!isConfigured) {
    main.replaceChildren(simplePage('セットアップがまだです', h('p', {}, 'js/config.js に Supabase の URL と publishable key を書いてください。')));
    return;
  }

  // メールのリンクが期限切れなど
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (hashParams.has('error_description')) {
    toast(`リンクが使えませんでした（${hashParams.get('error_description')}）`, 'error');
    history.replaceState(null, '', location.pathname + '#/');
  }

  sb.auth.onAuthStateChange((event, session) => {
    // このコールバック内で supabase の処理を await すると固まるので外に出す
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

  // メールのリンクで付いてきたトークンを URL から消す
  if (/access_token=|refresh_token=|type=recovery/.test(location.hash)) {
    if (/type=recovery/.test(location.hash)) recoveryPending = true;
    history.replaceState(null, '', location.pathname + '#/');
  }
  if (recoveryPending) history.replaceState(null, '', location.pathname + '#/new-password');

  onStateChange(renderNav);
  renderNav();
  window.addEventListener('hashchange', render);
  ready = true;
  render();
}

init();
