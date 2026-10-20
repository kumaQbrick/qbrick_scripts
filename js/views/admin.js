import { sb } from '../lib/supabase.js';
import { isAdmin, myId, refreshProfile } from '../lib/state.js';
import { h, field, errText, toast, notice, busy, fmtDate, fmtDateTime } from '../lib/ui.js';

export async function adminView({ rerender }) {
  if (!isAdmin()) {
    return h('section', { class: 'page narrow' },
      h('h1', { class: 'page-title' }, '管理'),
      h('p', {}, 'このページは管理者だけが使えます。'));
  }

  return h('section', { class: 'page admin' },
    h('h1', { class: 'page-title' }, '管理'),
    await inviteSection(),
    await usersSection(rerender),
    await commentsSection(),
    h('section', { class: 'panel' },
      h('h2', { class: 'section-title' }, '引き継ぎ'),
      h('p', {}, '管理者の交代、Supabase と GitHub の引き継ぎ、バックアップの取り方は、リポジトリの docs/HANDOVER.md にまとめてあります。'),
    ),
  );
}

// ---------------------------------------------------------------------
// 招待コード
// ---------------------------------------------------------------------
async function inviteSection() {
  const { data: current, error } = await sb.rpc('admin_get_invite_code');
  const shown = h('code', { class: 'secret' }, '••••••••');
  let visible = false;
  const toggle = h('button', {
    type: 'button', class: 'btn btn--small',
    onclick: () => {
      visible = !visible;
      shown.textContent = visible ? (current ?? '（未設定）') : '••••••••';
      toggle.textContent = visible ? '隠す' : '表示する';
    },
  }, '表示する');

  const input = h('input', { type: 'text', autocomplete: 'off', minlength: 8 });
  const btn = h('button', { type: 'submit', class: 'btn' }, '招待コードを変更する');
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      await busy(btn, '保存中…', async () => {
        const { error: err } = await sb.rpc('admin_set_invite_code', { p_code: input.value });
        if (err) { toast(errText(err), 'error'); return; }
        toast('招待コードを変更しました');
        input.value = '';
        const { data } = await sb.rpc('admin_get_invite_code');
        shown.textContent = visible ? data : '••••••••';
      });
    },
  },
    field('新しい招待コード', input, { help: '8文字以上。推測されにくいものにしてください。変えても、すでにメンバーの人はそのままです。' }),
    h('div', { class: 'form-actions' }, btn),
  );

  return h('section', { class: 'panel' },
    h('h2', { class: 'section-title' }, '招待コード'),
    error ? notice('error', errText(error)) : null,
    h('p', { class: 'secret-row' }, 'いまの招待コード: ', shown, ' ', toggle),
    !current && !error ? notice('warn', '招待コードがまだ設定されていません。設定するまで、新しく登録した人はメンバーになれません。') : null,
    form,
  );
}

// ---------------------------------------------------------------------
// ユーザー
// ---------------------------------------------------------------------
async function usersSection(rerender) {
  const { data: users, error } = await sb.rpc('admin_list_users');
  if (error) {
    return h('section', { class: 'panel' }, h('h2', { class: 'section-title' }, 'ユーザー'), notice('error', errText(error)));
  }

  const rows = users.map((u) => {
    const member = h('input', {
      type: 'checkbox', checked: u.is_member || u.is_admin, disabled: u.is_admin,
      'aria-label': `${u.display_name} をメンバーにする`,
      onchange: async (e) => {
        const value = e.target.checked;
        if (!value && !confirm(`${u.display_name} さんをメンバーから外します。投稿・いいね・コメントができなくなります。よろしいですか？`)) {
          e.target.checked = true; return;
        }
        e.target.disabled = true;
        const { error: err } = await sb.rpc('admin_set_member', { p_user_id: u.id, p_value: value });
        e.target.disabled = false;
        if (err) { toast(errText(err), 'error'); e.target.checked = !value; } else toast('変更しました');
      },
    });
    const admin = h('input', {
      type: 'checkbox', checked: u.is_admin,
      'aria-label': `${u.display_name} を管理者にする`,
      onchange: async (e) => {
        const value = e.target.checked;
        const msg = value
          ? `${u.display_name} さんを管理者にします。匿名コメントの投稿者や全員のメールアドレスが見えるようになります。よろしいですか？`
          : `${u.display_name} さんを管理者から外します。よろしいですか？`;
        if (!confirm(msg)) { e.target.checked = !value; return; }
        const { error: err } = await sb.rpc('admin_set_admin', { p_user_id: u.id, p_value: value });
        if (err) { toast(errText(err), 'error'); e.target.checked = !value; return; }
        toast('変更しました');
        if (u.id === myId()) await refreshProfile();
        rerender();
      },
    });
    return h('tr', {},
      h('td', {}, u.display_name, u.id === myId() ? h('span', { class: 'tag' }, 'あなた') : null),
      h('td', { class: 'cell-email' }, u.email ?? ''),
      h('td', {}, fmtDate(u.created_at)),
      h('td', { class: 'cell-check' }, member),
      h('td', { class: 'cell-check' }, admin),
    );
  });

  return h('section', { class: 'panel' },
    h('h2', { class: 'section-title' }, `ユーザー（${users.length}人）`),
    h('p', { class: 'field__help' }, 'アカウントそのものの削除は Supabase のダッシュボード（Authentication > Users）で行います。'),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'table' },
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, '表示名'), h('th', { scope: 'col' }, 'メール'), h('th', { scope: 'col' }, '登録日'),
          h('th', { scope: 'col', class: 'cell-check' }, 'メンバー'), h('th', { scope: 'col', class: 'cell-check' }, '管理者'))),
        h('tbody', {}, ...rows),
      ),
    ),
  );
}

// ---------------------------------------------------------------------
// 最近のコメント（匿名でも投稿者が分かる）
// ---------------------------------------------------------------------
async function commentsSection() {
  const list = h('ol', { class: 'comments comments--admin' });
  const section = h('section', { class: 'panel' },
    h('h2', { class: 'section-title' }, '最近のコメント'),
    h('p', { class: 'field__help' }, '匿名コメントの投稿者も表示しています。いじめや荒らしへの対応以外には使わないでください。'),
    list,
  );

  async function load() {
    const { data, error } = await sb
      .from('comments')
      .select('id, body, is_anonymous, created_at, script_id, script:scripts(title), ca:comment_authors(user_id, user:profiles(display_name))')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { list.replaceChildren(h('li', {}, notice('error', errText(error)))); return; }
    if (!data.length) { list.replaceChildren(h('li', { class: 'comments__empty' }, 'コメントはまだありません。')); return; }

    list.replaceChildren(...data.map((c) => {
      const ca = Array.isArray(c.ca) ? c.ca[0] : c.ca;
      const realName = ca?.user?.display_name ?? '退会したユーザー';
      return h('li', { class: 'comment' },
        h('div', { class: 'comment__head' },
          h('span', { class: 'comment__name' }, c.is_anonymous ? `匿名（${realName}）` : realName),
          h('a', { href: `#/s/${c.script_id}` }, c.script?.title ?? '脚本'),
          h('time', { class: 'comment__time', datetime: c.created_at }, fmtDateTime(c.created_at)),
        ),
        h('p', { class: 'comment__body' }, c.body),
        h('button', {
          type: 'button', class: 'link-btn',
          onclick: async () => {
            if (!confirm('このコメントを削除しますか？')) return;
            const { error: err } = await sb.from('comments').delete().eq('id', c.id);
            if (err) toast(errText(err), 'error'); else { toast('コメントを削除しました'); load(); }
          },
        }, '削除'),
      );
    }));
  }

  await load();
  return section;
}
