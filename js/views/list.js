import { GENRES, LENGTHS, STATUSES, PERMISSIONS, PAGE_SIZE } from '../config.js';
import { sb } from '../lib/supabase.js';
import { isLoggedIn, isMember, myId } from '../lib/state.js';
import { h, icon, cover, lengthText, errText, notice, toast } from '../lib/ui.js';

const SORTS = {
  new:      { label: '新しい順',     order: [['created_at', false]] },
  updated:  { label: '更新された順', order: [['updated_at', false]] },
  likes:    { label: 'いいねが多い順', order: [['like_count', false], ['created_at', false]] },
  comments: { label: 'コメントが多い順', order: [['comment_count', false], ['created_at', false]] },
  title:    { label: 'タイトル順',   order: [['title', true]] },
};

const COLUMNS = 'id, title, author_name, genres, length_category, runtime_minutes, status, usage_permission, visibility, like_count, comment_count, created_at, updated_at, owner_id';

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

  // ---- 絞り込みフォーム ----
  const search = h('input', {
    type: 'search', name: 'q', value: f.q, placeholder: 'タイトル・筆者・あらすじで探す',
    'aria-label': 'キーワード',
  });
  const select = (key, label, entries) =>
    h('label', { class: 'filter' },
      h('span', { class: 'filter__label' }, label),
      h('select', {
        value: f[key],
        onchange: (e) => setFilter({ [key]: e.target.value }),
      }, h('option', { value: '' }, 'すべて'), ...entries.map(([v, t]) => h('option', { value: v }, t))),
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
      select('perm', '使用', Object.entries(PERMISSIONS).map(([k, v]) => [k, v.label])),
      h('label', { class: 'filter' },
        h('span', { class: 'filter__label' }, '並び順'),
        h('select', { value: f.sort, onchange: (e) => setFilter({ sort: e.target.value }) },
          ...Object.entries(SORTS).map(([k, v]) => h('option', { value: k }, v.label))),
      ),
    ),
    isLoggedIn() ? h('div', { class: 'filters__toggles' },
      h('label', { class: 'toggle' },
        h('input', { type: 'checkbox', checked: f.mine, onchange: (e) => setFilter({ mine: e.target.checked }) }),
        '自分の投稿だけ'),
      h('label', { class: 'toggle' },
        h('input', { type: 'checkbox', checked: f.liked, onchange: (e) => setFilter({ liked: e.target.checked }) }),
        'いいねした脚本だけ'),
    ) : null,
    filtered ? h('p', { class: 'filters__clear' }, h('a', { href: '#/' }, '条件をすべて外す')) : null,
  );

  // ---- 一覧 ----
  const summary = h('p', { class: 'list-summary' });
  const grid = h('ol', { class: 'shelf' });
  const more = h('button', { type: 'button', class: 'btn btn--ghost shelf-more', hidden: true }, 'もっと見る');

  let likedIds = null;
  if (f.liked) {
    const { data, error } = await sb.from('likes').select('script_id').eq('user_id', myId());
    if (error) throw error;
    likedIds = data.map((r) => r.script_id);
  }

  async function fetchPage(offset) {
    let q = sb.from('scripts').select(COLUMNS, { count: 'exact' });
    if (f.genre) q = q.contains('genres', [f.genre]);
    if (f.length) q = q.eq('length_category', f.length);
    if (f.status) q = q.eq('status', f.status);
    if (f.perm) q = q.eq('usage_permission', f.perm);
    if (f.mine) q = q.eq('owner_id', myId());
    if (likedIds) q = q.in('id', likedIds.length ? likedIds : ['00000000-0000-0000-0000-000000000000']);
    // PostgREST の or() で意味を持つ記号は取り除く
    const words = f.q.replace(/[,()"'\\%*:]/g, ' ').trim();
    if (words) {
      const like = `%${words}%`;
      q = q.or(`title.ilike.${like},author_name.ilike.${like},synopsis.ilike.${like}`);
    }
    for (const [col, asc] of SORTS[f.sort].order) q = q.order(col, { ascending: asc });
    return q.range(offset, offset + PAGE_SIZE - 1);
  }

  let loaded = 0;
  async function loadMore() {
    const { data, error, count } = await fetchPage(loaded);
    if (error) throw error;
    grid.append(...data.map(card));
    loaded += data.length;
    const total = count ?? loaded;
    summary.textContent = total ? `${total}本の脚本` : '';
    more.hidden = count == null ? data.length < PAGE_SIZE : loaded >= count;
    return loaded;
  }

  more.addEventListener('click', async () => {
    more.disabled = true;
    try { await loadMore(); } catch (err) { toast(errText(err), 'error'); }
    more.disabled = false;
  });

  const firstLoaded = await loadMore();

  let empty = null;
  if (firstLoaded === 0) {
    empty = filtered
      ? h('div', { class: 'empty' },
          h('p', {}, '条件に合う脚本はありません。'),
          h('p', {}, h('a', { href: '#/' }, '条件をすべて外す')))
      : h('div', { class: 'empty' },
          h('p', {}, 'まだ脚本がありません。'),
          isMember()
            ? h('p', {}, h('a', { class: 'btn btn--primary', href: '#/new' }, '最初の脚本を投稿する'))
            : null);
  }

  return h('section', { class: 'page' },
    h('div', { class: 'intro' },
      h('h1', { class: 'intro__title' }, '採用されなかった脚本も、ここに残しておく。'),
      h('p', { class: 'intro__text' },
        'Qbrick 制作班に集まった脚本の棚です。読んで、いいねやコメントで感想を伝えてください。'),
    ),
    !isMember()
      ? notice('info',
          isLoggedIn()
            ? 'メンバー限定の脚本は表示されていません。'
            : 'メンバー限定の脚本は、ログインすると表示されます。',
          ' ',
          isLoggedIn()
            ? h('a', { href: '#/account' }, '招待コードを入力する')
            : h('a', { href: '#/login' }, 'ログイン'))
      : null,
    filters,
    summary,
    empty ?? grid,
    more,
  );
}

function card(s) {
  const genres = s.genres.join('／');
  return h('li', { class: 'shelf__item' },
    h('a', { class: 'shelf__link', href: `#/s/${s.id}` },
      cover(s),
      h('span', { class: 'shelf__title' }, s.title),
      h('span', { class: 'shelf__meta' }, `${s.author_name}　${lengthText(s)}`),
      h('span', { class: 'shelf__meta' }, genres),
      h('span', { class: 'shelf__counts' },
        h('span', { class: 'count' }, icon('heart'), h('span', { class: 'sr-only' }, 'いいね'), String(s.like_count)),
        h('span', { class: 'count' }, icon('comment'), h('span', { class: 'sr-only' }, 'コメント'), String(s.comment_count)),
        s.visibility === 'members' ? h('span', { class: 'count count--lock' }, icon('lock'), 'メンバー限定') : null,
      ),
    ),
  );
}
