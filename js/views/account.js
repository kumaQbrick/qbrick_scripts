import { sb } from '../lib/supabase.js';
import { state, setUser, refreshProfile, isLoggedIn } from '../lib/state.js';
import { h, field, errText, toast, busy } from '../lib/ui.js';

export async function accountView({ go }) {
  if (!isLoggedIn()) {
    return h('section', { class: 'page narrow' }, h('h1', {}, 'アカウント'), h('p', {}, h('a', { class: 'btn btn--ink', href: '/login' }, 'ログイン')));
  }
  const p = state.profile;

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
    h('p', { class: 'muted' }, state.user.email),
    h('section', { class: 'block' }, nameForm),
    h('section', { class: 'block' },
      logout,
      h('p', { class: 'muted' }, '退会したいときは管理者へ。退会しても投稿した脚本は残るので、消したいものは先に消してください。')),
  );
}
