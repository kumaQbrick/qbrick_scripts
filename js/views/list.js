import { GENRES, LENGTHS, STATUSES, PERMISSIONS, PAGE_SIZE } from '../config.js';
import { sb } from '../lib/supabase.js';
import { isLoggedIn, isMember, myId } from '../lib/state.js';
import { h, icon, cover, lengthText, errText, notice, toast } from '../lib/ui.js';

const SORTS = {
  new:      { label: '新しい順', order: [['created_at', false]] },
  updated:  { label: '更新順', order: [['updated_at', false]] },
  likes:    { label: 'いいね順', order: [['like_count', false], ['created_at', false]] },
  comments: { label: 'コメント順', order: [['comment_count', false], ['created_at', false]] },
  title:    { label: 'タイトル順', order: [['title', true]] },
};

const COLUMNS = 'id, title, author_name, genres, length_category, runtime_minutes, status, visibility, like_count, comment_count, created_at';

export async function listView({ query, go }) {
  const f = {
    q: query.get('q') ?? '',
    genre: query.get('genre') ?? '',
    length: query.get('length') ?? '',
    status: query.get('status') ?? '',
    perm: query.get('perm') ?? '',
    sort: SORTS[query.get('sort')] ? query.get('sort') : 'new',
    mine: query.get('mine') === '1' && isLoggedIn(),
    liked: query.get('liked') === '1' && isLoggedIn(),
  };
  const filtered = !!(f.q || f.genre || f.length || f.status || f.perm || f.mine || f.liked);

  // 条件は URL に入れる（そのまま共有できるように）
  function setFilter(patch) {
    const next = { ...f, ...patch };
    const p = new URLSearchParams();
    for (const key of ['q', 'genre', 'length', 'status', 'perm']) if (next[key]) p.set(key, next[key]);
    if (next.sort !== 'new') p.set('sort', next.sort);
    if (next.mine) p.set('mine', '1');
    if (next.liked) p.set('liked', '1');
    const qs = p.toString();
    go(qs ? `/?${qs}` : '/');
  }

  const search = h('input', { type: 'search', value: f.q, placeholder: 'タイトル・筆者・あらすじ', 'aria-label': '検索' });
  const select = (key, label, entries) =>
    h('label', { class: 'filter' },
      h('span', {}, label),
      h('select', { value: f[key], onchange: (e) => setFilter({ [key]: e.target.value }) },
        h('option', { value: '' }, 'ぜんぶ'),
        ...entries.map(([v, t]) => h('option', { value: v }, t))),
    );

  const filters = h('form', {
    class: 'filters',
    role: 'search',
    onsubmit: (e) => { e.preventDefault(); setFilter({ q: search.value.trim() }); },
  },
    h('div', { class: 'filters__search' }, search, h('button', { class: 'btn', type: 'submit' }, '検索')),
    h('div', { class: 'filters__row' },
      select('genre', 'ジャンル', GENRES.map((g) => [g, g])),
      select('length', '長さ', Object.entries(LENGTHS).map(([k, v]) => [k, v.label])),
      select('status', '状態', Object.entries(STATUSES).map(([k, v]) => [k, v.label])),
      select('perm', '使っていい？', Object.entries(PERMISSIONS).map(([k, v]) => [k, v.label])),
      h('label', { class: 'filter' },
        h('span', {}, '並び'),
        h('select', { value: f.sort, onchange: (e) => setFilter({ sort: e.target.value }) },
          ...Object.entries(SORTS).map(([k, v]) => h('option', { value: k }, v.label)))),
    ),
    isLoggedIn() && h('div', { class: 'filters__toggles' },
      h('label', {}, h('input', { type: 'checkbox', checked: f.mine, onchange: (e) => setFilter({ mine: e.target.checked }) }), '自分の'),
      h('label', {}, h('input', { type: 'checkbox', checked: f.liked, onchange: (e) => setFilter({ liked: e.target.checked }) }), 'いいねした'),
      filtered && h('a', { href: '#/' }, '条件をリセット'),
    ),
  );

  const summary = h('p', { class: 'count-line' });
  const grid = h('ol', { class: 'shelf' });
  const more = h('button', { type: 'button', class: 'btn shelf-more', hidden: true }, 'もっと見る');

  let likedIds = null;
  if (f.liked) {
    const { data, error } = await sb.from('likes').select('script_id').eq('user_id', myId());
    if (error) throw error;
    likedIds = data.map((r) => r.script_id);
  }

  function fetchPage(offset) {
    let q = sb.from('scripts').select(COLUMNS, { count: 'exact' });
    if (f.genre) q = q.contains('genres', [f.genre]);
    if (f.length) q = q.eq('length_category', f.length);
    if (f.status) q = q.eq('status', f.status);
    if (f.perm) q = q.eq('usage_permission', f.perm);
    if (f.mine) q = q.eq('owner_id', myId());
    if (likedIds) q = q.in('id', likedIds.length ? likedIds : ['00000000-0000-0000-0000-000000000000']);
    // or() の区切り文字になる記号は消しておく
    const words = f.q.replace(/[,()"'\\%*:]/g, ' ').trim();
    if (words) q = q.or(`title.ilike.%${words}%,author_name.ilike.%${words}%,synopsis.ilike.%${words}%`);
    for (const [col, asc] of SORTS[f.sort].order) q = q.order(col, { ascending: asc });
    return q.range(offset, offset + PAGE_SIZE - 1);
  }

  let loaded = 0;
  async function loadMore() {
    const { data, error, count } = await fetchPage(loaded);
    if (error) throw error;
    grid.append(...data.map(card));
    loaded += data.length;
    summary.textContent = loaded ? `${count ?? loaded}本` : '';
    more.hidden = count == null ? data.length < PAGE_SIZE : loaded >= count;
  }

  more.addEventListener('click', async () => {
    more.disabled = true;
    try { await loadMore(); } catch (err) { toast(errText(err), 'error'); }
    more.disabled = false;
  });

  await loadMore();

  let empty = null;
  if (loaded === 0) {
    empty = h('div', { class: 'empty' },
      filtered
        ? h('p', {}, '条件に合う脚本はありません')
        : h('p', {}, 'まだ1本もありません'),
      !filtered && isMember() && h('a', { class: 'btn btn--ink', href: '#/new' }, '投稿する'));
  }

  return h('section', { class: 'page' },
    !isMember() && notice('info',
      isLoggedIn()
        ? ['メンバー限定の脚本は、', h('a', { href: '#/account' }, '招待コード'), 'を入れると読めます']
        : ['メンバー限定の脚本は、', h('a', { href: '#/login' }, 'ログイン'), 'すると読めます']),
    filters,
    summary,
    empty ?? grid,
    more,
  );
}

function card(s) {
  return h('li', {},
    h('a', { class: 'shelf__link', href: `#/s/${s.id}` },
      cover(s),
      h('span', { class: 'shelf__title' }, s.title),
      h('span', { class: 'shelf__meta' }, `${s.author_name} / ${lengthText(s)}`),
      h('span', { class: 'shelf__meta' }, s.genres.join('・')),
      h('span', { class: 'shelf__counts' },
        h('span', { title: 'いいね' }, icon('heart'), h('span', { class: 'sr-only' }, 'いいね'), s.like_count),
        h('span', { title: 'コメント' }, icon('comment'), h('span', { class: 'sr-only' }, 'コメント'), s.comment_count),
        s.visibility === 'members' && h('span', { title: 'メンバー限定' }, icon('lock'), h('span', { class: 'sr-only' }, 'メンバー限定')),
      ),
    ),
  );
}
