import { sb, isConfigured } from './lib/supabase.js';
import { state, setUser, onStateChange } from './lib/state.js';
import { h, notice } from './lib/ui.js'

import { loginView, signupView } from './views/auth.js';
import { accountView } from './views/account.js';

// GitHub Pagesだとサーバー側でパスを振り分けられないので#で画面を切り替える
// （最初普通のURLでやってて全部404になった）
const routes = [
  [/^\/$/, homeView, '一覧'],
  [/^\/login$/,  loginView, 'ログイン'],
  [/^\/signup$/, signupView, '登録'],
  [/^\/account$/, accountView, 'アカウント'],
];

const main = document.getElementById('main');
let ready = false;

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

function homeView() {
  return simplePage('脚本棚', h('p', {}, '一覧はこれから'));
}

async function render() {
  const { path, query } = parseHash();
  const route = routes.find(([re]) => re.test(path));

  if (route) {
      const [re, view, title] = route;

      let result;
      try {
        result = await view({ params: path.match(re).slice(1), query, go, rerender: render });
      } catch (err) {
        console.error(err);
        result = simplePage('表示できませんでした', notice('error', String(err?.message ?? err)), h('p', {}, h('a', { href: '#/' }, '一覧へ')));
      }
      console.log('render', path, result)

      mount(result, title);
  } else {
    mount(simplePage('ページがありません', h('p', {}, h('a', { href: '#/' }, '一覧へ'))), 'ページがありません');
  }
}

function mount(el, title) {
  main.replaceChildren(el)
  document.title = `${title} | 脚本棚`;
  window.scrollTo(0, 0);
}

function renderNav() {
  var links = [
    h('a', { href: '#/' }, '一覧'),
    state.user ? h('a', { href: '#/account', class: 'nav-me' }, state.profile?.display_name ?? 'アカウント')
               : h('a', { href: '#/login' }, 'ログイン'),
  ];
  document.getElementById('site-nav').replaceChildren(...links.filter(Boolean));
}

async function init() {
  if (!isConfigured) {
    main.replaceChildren(simplePage('セットアップがまだです', h('p', {}, 'js/config.js に Supabase の URL と publishable key を書いてください。')));
    return;
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    const changed = (session?.user?.id ?? null) !== (state.user?.id ?? null);
    if (changed || event === 'USER_UPDATED') {
      await setUser(session?.user ?? null);
    }
    if (changed) {
      if (ready) {
        render();
      }
    }
  });

  const { data } = await sb.auth.getSession();
  await setUser(data.session?.user ?? null);

  onStateChange(renderNav);
  renderNav();
  window.addEventListener('hashchange', render);
  ready = true;
  render();
}

init();
