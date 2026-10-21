import { sb, siteUrl } from '../lib/supabase.js';
import { state, setUser, isLoggedIn, isMember } from '../lib/state.js';
import { h, field, errText, toast, notice, busy } from '../lib/ui.js';

const MIN_PASSWORD = 8;

const page = (title, ...children) =>
  h('section', { class: 'page narrow auth' }, h('h1', {}, title), ...children);

const showErrors = (box, list) =>
  box.replaceChildren(notice('error', list.length > 1 ? h('ul', {}, ...list.map((p) => h('li', {}, p))) : list[0]));

export async function loginView({ go }) {
  if (isLoggedIn()) {
    return page('ログイン', h('p', {}, `${state.profile?.display_name ?? ''} でログイン中です。`), h('p', {}, h('a', { href: '#/' }, '一覧へ')));
  }
  const email = h('input', { type: 'email', autocomplete: 'email', required: true });
  const password = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const msg = h('div', { role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--ink' }, 'ログイン');

  return page('ログイン',
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        msg.replaceChildren();
        await busy(submit, 'ログイン中…', async () => {
          const { data, error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
          if (error) return showErrors(msg, [errText(error)]);
          await setUser(data.user);
          go('/');
        });
      },
    },
      field('メールアドレス', email),
      field('パスワード', password),
      msg,
      h('div', { class: 'form-actions' }, submit, h('a', { href: '#/reset' }, 'パスワードを忘れた')),
    ),
    h('p', { class: 'auth__alt' }, 'アカウントがない人は ', h('a', { href: '#/signup' }, '登録')),
  );
}

export async function signupView({ go }) {
  if (isLoggedIn()) return loginView({ go });

  const name = h('input', { type: 'text', maxlength: 30, autocomplete: 'nickname', required: true });
  const email = h('input', { type: 'email', autocomplete: 'email', required: true });
  const password = h('input', { type: 'password', autocomplete: 'new-password', minlength: MIN_PASSWORD, required: true });
  const code = h('input', { type: 'text', autocomplete: 'off', required: true });
  const msg = h('div', { role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--ink' }, '登録');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      msg.replaceChildren();
      const problems = [];
      if (!name.value.trim()) problems.push('名前が空です');
      if (!email.value.trim()) problems.push('メールアドレスが空です');
      if (password.value.length < MIN_PASSWORD) problems.push(`パスワードは${MIN_PASSWORD}文字以上`);
      if (!code.value.trim()) problems.push('招待コードが空です');
      if (problems.length) return showErrors(msg, problems);

      await busy(submit, '登録中…', async () => {
        const { data, error } = await sb.auth.signUp({
          email: email.value.trim(),
          password: password.value,
          options: {
            // 招待コードは DB のトリガー（handle_new_user）で照合する
            data: { display_name: name.value.trim(), invite_code: code.value.trim() },
            emailRedirectTo: siteUrl(),
          },
        });
        if (error) return showErrors(msg, [errText(error)]);

        if (data.session) {
          // Supabase でメール確認をオフにしているとここに来る
          await setUser(data.user);
          if (isMember()) {
            go('/');
          } else {
            toast('招待コードが違ったので、まだメンバーになっていません', 'error');
            go('/account');
          }
        } else {
          form.replaceWith(h('div', {},
            h('p', {}, `${email.value.trim()} に確認メールを送りました。リンクを開くと登録完了です。`),
            h('p', { class: 'muted' }, '来ないときは迷惑メールも見てください。'),
          ));
        }
      });
    },
  },
    field('名前', name, { help: 'コメントなどに出ます。あとで変えられます' }),
    field('メールアドレス', email),
    field('パスワード', password, { help: `${MIN_PASSWORD}文字以上` }),
    field('招待コード', code, { help: '管理者に聞いてください' }),
    msg,
    h('div', { class: 'form-actions' }, submit),
  );

  return page('登録', form, h('p', { class: 'auth__alt' }, 'アカウントがある人は ', h('a', { href: '#/login' }, 'ログイン')));
}

export async function resetView() {
  const email = h('input', { type: 'email', autocomplete: 'email', required: true });
  const msg = h('div', { role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--ink' }, 'メールを送る');
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      await busy(submit, '送信中…', async () => {
        const { error } = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: siteUrl() });
        if (error) return showErrors(msg, [errText(error)]);
        form.replaceWith(h('p', {}, '登録済みのアドレスなら、再設定のメールが届きます。'));
      });
    },
  },
    field('登録したメールアドレス', email),
    msg,
    h('div', { class: 'form-actions' }, submit),
  );
  return page('パスワード再設定', form);
}

export async function newPasswordView({ go }) {
  if (!isLoggedIn()) {
    return page('新しいパスワード',
      h('p', {}, 'リンクの期限が切れているか、もう使われています。'),
      h('p', {}, h('a', { href: '#/reset' }, 'もう一度メールを送る')));
  }
  const password = h('input', { type: 'password', autocomplete: 'new-password', minlength: MIN_PASSWORD, required: true });
  const msg = h('div', { role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--ink' }, '変更');
  return page('新しいパスワード',
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        if (password.value.length < MIN_PASSWORD) return showErrors(msg, [`${MIN_PASSWORD}文字以上にしてください`]);
        await busy(submit, '変更中…', async () => {
          const { error } = await sb.auth.updateUser({ password: password.value });
          if (error) return showErrors(msg, [errText(error)]);
          toast('パスワードを変えました');
          go('/');
        });
      },
    },
      field('新しいパスワード', password, { help: `${MIN_PASSWORD}文字以上` }),
      msg,
      h('div', { class: 'form-actions' }, submit),
    ),
  );
}
