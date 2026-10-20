import { sb } from '../lib/supabase.js';
import { state, setUser, refreshProfile, isLoggedIn, isMember, isAdmin } from '../lib/state.js';
import { h, field, errText, toast, notice, busy, fmtDate } from '../lib/ui.js';

export async function accountView({ go }) {
  if (!isLoggedIn()) {
    return h('section', { class: 'page narrow' },
      h('h1', { class: 'page-title' }, 'アカウント'),
      h('p', {}, h('a', { class: 'btn btn--primary', href: '#/login' }, 'ログイン')));
  }
  const p = state.profile;

  // ---- メンバー状態 ----
  let membership;
  if (isMember()) {
    membership = h('section', { class: 'panel' },
      h('h2', { class: 'section-title' }, 'メンバー'),
      h('p', {}, isAdmin() ? '管理者です。' : 'サークルメンバーです。投稿・いいね・コメントができます。'),
      h('p', { class: 'link-row' },
        h('a', { href: '#/?mine=1' }, '自分の投稿'),
        h('a', { href: '#/?liked=1' }, 'いいねした脚本')),
    );
  } else {
    const code = h('input', { type: 'text', autocomplete: 'off' });
    const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, 'メンバーになる');
    const msg = h('div', { role: 'alert' });
    membership = h('section', { class: 'panel' },
      h('h2', { class: 'section-title' }, 'メンバー登録'),
      h('p', {}, 'まだメンバーではありません。招待コードを入力すると、投稿・いいね・コメントができるようになります。'),
      h('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          await busy(submit, '確認中…', async () => {
            const { data, error } = await sb.rpc('redeem_invite', { p_code: code.value.trim() });
            if (error) { msg.replaceChildren(notice('error', errText(error))); return; }
            if (!data) { msg.replaceChildren(notice('error', '招待コードが違います。管理者に確認してください。')); return; }
            await refreshProfile();
            toast('メンバーになりました');
            go('/');
          });
        },
      }, field('招待コード', code), msg, h('div', { class: 'form-actions' }, submit)),
    );
  }

  // ---- 表示名 ----
  const name = h('input', { type: 'text', maxlength: 30, value: p?.display_name ?? '', required: true });
  const nameBtn = h('button', { type: 'submit', class: 'btn' }, '表示名を変更する');
  const nameForm = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const value = name.value.trim();
      if (!value) { toast('表示名を入力してください', 'error'); return; }
      await busy(nameBtn, '保存中…', async () => {
        const { error } = await sb.from('profiles').update({ display_name: value }).eq('id', state.user.id);
        if (error) { toast(errText(error), 'error'); return; }
        await refreshProfile();
        toast('表示名を変更しました');
      });
    },
  }, field('表示名', name, { help: '名前つきコメントやメニューに表示されます。脚本の「筆者名」は脚本ごとに設定します。' }),
     h('div', { class: 'form-actions' }, nameBtn));

  // ---- パスワード ----
  const pw = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8 });
  const pwBtn = h('button', { type: 'submit', class: 'btn' }, 'パスワードを変更する');
  const pwForm = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      if (pw.value.length < 8) { toast('パスワードは8文字以上にしてください', 'error'); return; }
      await busy(pwBtn, '変更中…', async () => {
        const { error } = await sb.auth.updateUser({ password: pw.value });
        if (error) { toast(errText(error), 'error'); return; }
        pw.value = '';
        toast('パスワードを変更しました');
      });
    },
  }, field('新しいパスワード', pw, { help: '8文字以上' }), h('div', { class: 'form-actions' }, pwBtn));

  const logout = h('button', {
    type: 'button', class: 'btn btn--ghost',
    onclick: async (e) => {
      await busy(e.currentTarget, 'ログアウト中…', async () => {
        await sb.auth.signOut();
        await setUser(null);
        toast('ログアウトしました');
        go('/');
      });
    },
  }, 'ログアウト');

  return h('section', { class: 'page narrow' },
    h('h1', { class: 'page-title' }, 'アカウント'),
    h('p', { class: 'muted' }, `${state.user.email}　登録日 ${fmtDate(p?.created_at)}`),
    membership,
    h('section', { class: 'panel' }, h('h2', { class: 'section-title' }, 'プロフィール'), nameForm),
    h('section', { class: 'panel' }, h('h2', { class: 'section-title' }, 'パスワード'), pwForm),
    h('section', { class: 'panel' },
      h('h2', { class: 'section-title' }, 'ログアウト・退会'),
      h('p', {}, '退会したいときは管理者に連絡してください。退会しても、投稿した脚本は残ります（消してほしいときは先に自分で削除するか、管理者に頼んでください）。'),
      h('div', { class: 'form-actions' }, logout)),
  );
}
