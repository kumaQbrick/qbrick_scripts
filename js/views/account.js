import { sb } from '../lib/supabase.js';
import { state, setUser, refreshProfile, isLoggedIn, isMember, isAdmin } from '../lib/state.js';
import { h, field, errText, toast, notice, busy, fmtDate } from '../lib/ui.js';

export async function accountView({ go }) {
  if (!isLoggedIn()) {
    return h('section', { class: 'page narrow' }, h('h1', {}, 'アカウント'), h('p', {}, h('a', { class: 'btn btn--ink', href: '#/login' }, 'ログイン')));
  }
  const p = state.profile;

  let membership;
  if (isMember()) {
    membership = h('section', { class: 'block' },
      h('p', {}, isAdmin() ? '管理者です。' : 'メンバーです。'),
      h('p', { class: 'links' }, h('a', { href: '#/?mine=1' }, '自分の投稿'), h('a', { href: '#/?liked=1' }, 'いいねした脚本')),
    );
  } else {
    // まだメンバーじゃない人（登録のとき招待コード間違えた人とか）はここで入れ直せる
    const code = h('input', { type: 'text', autocomplete: 'off' });
    const submit = h('button', { type: 'submit', class: 'btn btn--ink' }, 'メンバーになる');
    const msg = h('div', { role: 'alert' });
    membership = h('section', { class: 'block' },
      h('h2', {}, '招待コード'),
      h('p', {}, 'まだメンバーではありません。招待コードを入れると、投稿・いいね・コメントができます。'),
      h('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          await busy(submit, '確認中…', async () => {
            const { data, error } = await sb.rpc('redeem_invite', { p_code: code.value.trim() });
            if (!error) {
              if (data) {
                await refreshProfile();
                toast('メンバーになりました');
                go('/');
              } else {
                msg.replaceChildren(notice('error', '招待コードが違います'));
              }
            } else {
              msg.replaceChildren(notice('error', errText(error)));
            }
          });
        },
      }, field('招待コード', code), msg, h('div', { class: 'form-actions' }, submit)),
    );
  }

  // 名前の変更
  const name = h('input', { type: 'text', maxlength: 30, value: p?.display_name ?? '', required: true });
  const nameBtn = h('button', { type: 'submit', class: 'btn' }, '変更');
  const nameForm = h('form', {
    onsubmit: async (e) => {
        e.preventDefault();
        const value = name.value.trim();
        if (value) {
          await busy(nameBtn, '保存中…', async () => {
            const { error } = await sb.from('profiles').update({ display_name: value }).eq('id', state.user.id);
            if (error) {
              toast(errText(error), 'error');
            } else {
              await refreshProfile();
              toast('変更しました');
            }
          });
        } else {
          toast('名前が空です', 'error');
        }
    },
  }, field('名前', name), h('div', { class: 'form-actions' }, nameBtn));

  // パスワードの変更
  const pw = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8 });
  const pwBtn = h('button', { type: 'submit', class: 'btn' }, '変更');
  const pwForm = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      if (pw.value.length < 8) return toast('パスワードは8文字以上', 'error');
      await busy(pwBtn, '変更中…', async () => {
        const { error } = await sb.auth.updateUser({ password: pw.value });
        if (error) return toast(errText(error), 'error');
        pw.value = '';
        toast('パスワードを変えました');
      });
    },
  }, field('新しいパスワード', pw, { help: '8文字以上' }), h('div', { class: 'form-actions' }, pwBtn));

  const logout = h('button', {
    type: 'button', class: 'btn',
    onclick: async (e) => {
      await busy(e.currentTarget, '…', async () => {
        await sb.auth.signOut();
        await setUser(null);
        go('/');
      })
    },
  }, 'ログアウト');

  return h('section', { class: 'page narrow' },
    h('h1', {}, 'アカウント'),
    h('p', { class: 'muted' }, `${state.user.email}（${fmtDate(p?.created_at)} 登録）`),
    membership,
    h('section', { class: 'block' }, nameForm),
    h('section', { class: 'block' }, pwForm),
    h('section', { class: 'block' },
      logout,
      h('p', { class: 'muted' }, '退会したいときは管理者へ。退会しても投稿した脚本は残るので、消したいものは先に消してください。')),
  );
}
