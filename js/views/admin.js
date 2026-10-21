import { sb } from '../lib/supabase.js';
import { isAdmin, myId, refreshProfile } from '../lib/state.js';
import { h, field, errText, toast, notice, busy, fmtDate, fmtDateTime } from '../lib/ui.js';

// 管理ページ
// ※画面で隠してるだけじゃなくてDB側（RLS）でも止めてる
export async function adminView({ rerender }) {
  if (!isAdmin()) {
    return h('section', { class: 'page narrow' }, h('h1', {}, '管理'), h('p', {}, '管理者だけのページです。'));
  }
  return h('section', { class: 'page admin' },
    h('h1', {}, '管理'),
    await inviteBlock(),
    await usersBlock(rerender),
    await commentsBlock(),
    h('p', { class: 'muted' }, '引き継ぎ・バックアップ → リポジトリの docs/HANDOVER.md'),
  );
}

async function inviteBlock() {
  let { data: current, error } = await sb.rpc('admin_get_invite_code');
  const shown = h('code', {}, '••••••••');
  let visible = false;
  const toggle = h('button', {
    type: 'button', class: 'link-btn',
    onclick: () => {
      visible = !visible;
      shown.textContent = visible ? (current ?? '（未設定）') : '••••••••';
      toggle.textContent = visible ? '隠す' : '見る';
    },
  }, '見る');

  const input = h('input', { type: 'text', autocomplete: 'off', minlength: 8 });
  const btn = h('button', { type: 'submit', class: 'btn' }, '変更');
  return h('section', { class: 'block' },
    h('h2', {}, '招待コード'),
    error && notice('error', errText(error)),
    h('p', {}, '今のコード: ', shown, ' ', toggle),
    !current && !error && notice('warn', 'まだ設定されていません。設定するまで誰もメンバーになれません'),
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        await busy(btn, '保存中…', async () => {
          const { error: err } = await sb.rpc('admin_set_invite_code', { p_code: input.value });
          if (err) {
            toast(errText(err), 'error');
          } else {
            toast('招待コードを変えました');
            input.value = '';
            // 変えたあと表示を新しいのにする
            ({ data: current } = await sb.rpc('admin_get_invite_code'));
            if (visible) shown.textContent = current;
          }
        });
      },
    },
      field('新しいコード', input, { help: '8文字以上。変えても今のメンバーはそのまま' }),
      h('div', { class: 'form-actions' }, btn),
    ),
  );
}

async function usersBlock(rerender) {
  const { data: users, error } = await sb.rpc('admin_list_users');
  if (error) return h('section', { class: 'block' }, h('h2', {}, 'ユーザー'), notice('error', errText(error)));

  const rows = users.map((u) => {
    // メンバーのチェック
    const member = h('input', {
      type: 'checkbox', checked: u.is_member || u.is_admin, disabled: u.is_admin,
      'aria-label': `${u.display_name} をメンバーにする`,
      onchange: async (e) => {
        const value = e.target.checked;
        if (value || confirm(`${u.display_name} をメンバーから外しますか？`)) {
          const { error: err } = await sb.rpc('admin_set_member', { p_user_id: u.id, p_value: value });
          if (err) {
            toast(errText(err), 'error');
            e.target.checked = !value;
          }
        } else {
          e.target.checked = true;
        }
      },
    });
    // 管理者のチェック
    const admin = h('input', {
      type: 'checkbox', checked: u.is_admin,
      'aria-label': `${u.display_name} を管理者にする`,
      onchange: async (e) => {
        const value = e.target.checked;
        let msg;
        if (value) {
          msg = `${u.display_name} を管理者にしますか？ 匿名コメントの投稿者や全員のメールアドレスが見えるようになります。`;
        } else {
          msg = `${u.display_name} を管理者から外しますか？`;
        }
        if (confirm(msg)) {
          const { error: err } = await sb.rpc('admin_set_admin', { p_user_id: u.id, p_value: value });
          if (!err) {
            if (u.id === myId()) await refreshProfile(); // 自分を外したとき用
            rerender();
          } else {
            toast(errText(err), 'error');
            e.target.checked = !value;
          }
        } else {
          e.target.checked = !value;
        }
      },
    });
    return h('tr', {},
      h('td', {}, u.display_name, u.id === myId() && h('span', { class: 'tag' }, '自分')),
      h('td', { class: 'cell-email' }, u.email ?? ''),
      h('td', {}, fmtDate(u.created_at)),
      h('td', { class: 'cell-check' }, member),
      h('td', { class: 'cell-check' }, admin),
    );
  });

  return h('section', { class: 'block' },
    h('h2', {}, `ユーザー ${users.length}人`),
    h('div', { class: 'table-wrap' },
      h('table', {},
        h('thead', {}, h('tr', {},
          h('th', {}, '名前'), h('th', {}, 'メール'), h('th', {}, '登録'),
          h('th', { class: 'cell-check' }, 'メンバー'), h('th', { class: 'cell-check' }, '管理者'))),
        h('tbody', {}, ...rows),
      ),
    ),
    h('p', { class: 'muted' }, 'アカウントの削除は Supabase の Authentication > Users から'),
  );
}

async function commentsBlock() {
  const list = h('ol', { class: 'comments' });
  const block = h('section', { class: 'block' },
    h('h2', {}, '最近のコメント'),
    h('p', { class: 'muted' }, '匿名の投稿者も出ています。荒らし対応以外には使わないこと'),
    list,
  );

  async function load() {
    // 最新50件だけ。足りなかったら増やす
    const { data, error } = await sb
      .from('comments')
      .select('id, body, is_anonymous, created_at, script_id, script:scripts(title), ca:comment_authors(user_id, user:profiles(display_name))')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return list.replaceChildren(h('li', {}, notice('error', errText(error))));
    if (!data.length) return list.replaceChildren(h('li', { class: 'muted' }, 'まだありません'));

    list.replaceChildren(...data.map((c) => {
      // 配列で返ってくるときと1個で返ってくるときがある？ので両方対応
      const ca = Array.isArray(c.ca) ? c.ca[0] : c.ca;
      const who = ca?.user?.display_name ?? '退会した人';
      return h('li', { class: 'comment' },
        h('div', { class: 'comment__head' },
          h('b', {}, c.is_anonymous ? `匿名（${who}）` : who),
          h('a', { href: `#/s/${c.script_id}` }, c.script?.title ?? '脚本'),
          h('time', { datetime: c.created_at }, fmtDateTime(c.created_at)),
          h('button', {
            type: 'button', class: 'link-btn',
            onclick: async () => {
              if (confirm('このコメントを消しますか？')) {
                const { error: err } = await sb.from('comments').delete().eq('id', c.id);
                if (err) {
                  toast(errText(err), 'error');
                } else {
                  load();
                }
              }
            },
          }, '削除'),
        ),
        h('p', {}, c.body),
      );
    }));
  }

  await load();
  return block;
}
