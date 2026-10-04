import { sb } from '../lib/supabase.js';
import { isLoggedIn } from '../lib/state.js';
import { h, icon, lengthText, notice } from '../lib/ui.js';

// 一覧で使う列だけ（*にするとあらすじまで全部とってきて重い）
const COLUMNS = 'id, title, author_name, genres, length_category, runtime_minutes, status, visibility, like_count, created_at';

// TODO 絞り込みと並び替え
export async function listView() {
  const { data, error } = await sb.from('scripts')
    .select(COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw error;

  let notMember = null;
  if (!isLoggedIn()) {
    notMember = notice('info', 'メンバー限定の脚本は、', h('a', { href: '#/login' }, 'ログイン'), 'すると読めます');
  }

  return h('section', { class: 'page' },
    notMember,
    data.length
      ? h('ol', { class: 'shelf' }, ...data.map(card))
      : h('div', { class: 'empty' }, h('p', {}, 'まだ1本もありません')),
  );
}

function card(s) {
  return h('li', {},
    h('a', { class: 'shelf__link', href: `#/s/${s.id}` },
      h('span', { class: 'shelf__title' }, s.title),
      h('span', { class: 'shelf__meta' }, `${s.author_name} / ${lengthText(s)}`),
      h('span', { class: 'shelf__meta' }, s.genres.join('・')),
      h('span', { class: 'shelf__counts' },
        h('span', { title: 'いいね' }, icon('heart'), s.like_count),
      ),
    ),
  );
}
