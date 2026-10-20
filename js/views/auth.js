import { sb, siteUrl } from '../lib/supabase.js';
import { state, setUser, isLoggedIn, isMember } from '../lib/state.js';
import { h, field, errText, toast, notice, busy } from '../lib/ui.js';

const MIN_PASSWORD = 8;

function page(title, ...children) {
  return h('section', { class: 'page narrow auth' }, h('h1', { class: 'page-title' }, title), ...children);
}

// ---------------------------------------------------------------------
// ログイン
// ---------------------------------------------------------------------
export async function loginView({ go }) {
  if (isLoggedIn()) {
    return page('ログイン', h('p', {}, `${state.profile?.display_name ?? ''} としてログインしています。`),
      h('p', {}, h('a', { href: '#/' }, '脚本一覧へ')));
  }
  const email = h('input', { type: 'email', autocomplete: 'email', required: true });
  const password = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const msg = h('div', { role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, 'ログイン');

  const form = h('form', {
    class: 'auth-form',
    onsubmit: async (e) => {
      e.preventDefault();
      msg.replaceChildren();
      await busy(submit, 'ログイン中…', async () => {
        const { data, error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
        if (error) { msg.replaceChildren(notice('error', errText(error))); return; }
        await setUser(data.user);
        toast('ログインしました');
        go('/');
      });
    },
  },
    field('メールアドレス', email),
    field('パスワード', password),
    msg,
    h('div', { class: 'form-actions' }, submit),
  );

  return page('ログイン', form,
    h('p', {}, 'アカウントがない人は ', h('a', { href: '#/signup' }, 'アカウント登録'), '。'),
    h('p', {}, h('a', { href: '#/reset' }, 'パスワードを忘れたとき')),
  );
}

// ---------------------------------------------------------------------
// アカウント登録（招待コードつき）
// ---------------------------------------------------------------------
export async function signupView({ go }) {
  if (isLoggedIn()) return loginView({ go });

  const name = h('input', { type: 'text', maxlength: 30, autocomplete: 'nickname', required: true });
  const email = h('input', { type: 'email', autocomplete: 'email', required: true });
  const password = h('input', { type: 'password', autocomplete: 'new-password', minlength: MIN_PASSWORD, required: true });
  const code = h('input', { type: 'text', autocomplete: 'off', required: true });
  const msg = h('div', { role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, '登録する');

  const form = h('form', {
    class: 'auth-form',
    onsubmit: async (e) => {
      e.preventDefault();
      msg.replaceChildren();
      const problems = [];
      if (!name.value.trim()) problems.push('表示名を入力してください。');
      if (!email.value.trim()) problems.push('メールアドレスを入力してください。');
      if (password.value.length < MIN_PASSWORD) problems.push(`パスワードは${MIN_PASSWORD}文字以上にしてください。`);
      if (!code.value.trim()) problems.push('招待コードを入力してください。');
      if (problems.length) { msg.replaceChildren(notice('error', h('ul', {}, ...problems.map((p) => h('li', {}, p))))); return; }

      await busy(submit, '登録中…', async () => {
        const { data, error } = await sb.auth.signUp({
          email: email.value.trim(),
          password: password.value,
          options: {
            data: { display_name: name.value.trim(), invite_code: code.value.trim() },
            emailRedirectTo: siteUrl(),
          },
        });
        if (error) { msg.replaceChildren(notice('error', errText(error))); return; }

        if (data.session) {
          // メール確認をオフにしている場合はそのままログインされる
          await setUser(data.user);
          if (isMember()) {
            toast('登録しました。ようこそ！');
            go('/');
          } else {
            toast('登録しましたが、招待コードが違ったためまだメンバーではありません', 'error');
            go('/account');
          }
        } else {
          form.replaceWith(notice('ok',
            h('p', {}, `${email.value.trim()} に確認メールを送りました。`),
            h('p', {}, 'メールのリンクを開くと登録が完了してログインできます。届かないときは迷惑メールフォルダも見てください。'),
          ));
        }
      });
    },
  },
    field('表示名', name, { help: '名前つきコメントやメニューに表示されます。あとで変えられます（30文字まで）。' }),
    field('メールアドレス', email),
    field('パスワード', password, { help: `${MIN_PASSWORD}文字以上` }),
    field('招待コード', code, { help: 'サークルの管理者から聞いてください。' }),
    msg,
    h('div', { class: 'form-actions' }, submit),
  );

  return page('アカウント登録', form,
    h('p', {}, 'すでにアカウントがある人は ', h('a', { href: '#/login' }, 'ログイン'), '。'));
}

// ---------------------------------------------------------------------
// パスワード再設定
// ---------------------------------------------------------------------
export async function resetView() {
  const email = h('input', { type: 'email', autocomplete: 'email', required: true });
  const msg = h('div', { role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, '再設定メールを送る');
  const form = h('form', {
    class: 'auth-form',
    onsubmit: async (e) => {
      e.preventDefault();
      await busy(submit, '送信中…', async () => {
        const { error } = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: siteUrl() });
        if (error) { msg.replaceChildren(notice('error', errText(error))); return; }
        form.replaceWith(notice('ok', '登録されているメールアドレスなら、パスワード再設定のメールが届きます。メールのリンクを開いてください。'));
      });
    },
  },
    field('登録したメールアドレス', email),
    msg,
    h('div', { class: 'form-actions' }, submit),
  );
  return page('パスワードの再設定', form);
}

export async function newPasswordView({ go }) {
  if (!isLoggedIn()) {
    return page('新しいパスワード',
      h('p', {}, 'リンクの期限が切れているか、もう使われています。'),
      h('p', {}, h('a', { href: '#/reset' }, 'もう一度再設定メールを送る')));
  }
  const password = h('input', { type: 'password', autocomplete: 'new-password', minlength: MIN_PASSWORD, required: true });
  const msg = h('div', { role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, 'パスワードを変更する');
  const form = h('form', {
    class: 'auth-form',
    onsubmit: async (e) => {
      e.preventDefault();
      if (password.value.length < MIN_PASSWORD) {
        msg.replaceChildren(notice('error', `パスワードは${MIN_PASSWORD}文字以上にしてください。`));
        return;
      }
      await busy(submit, '変更中…', async () => {
        const { error } = await sb.auth.updateUser({ password: password.value });
        if (error) { msg.replaceChildren(notice('error', errText(error))); return; }
        toast('パスワードを変更しました');
        go('/');
      });
    },
  },
    field('新しいパスワード', password, { help: `${MIN_PASSWORD}文字以上` }),
    msg,
    h('div', { class: 'form-actions' }, submit),
  );
  return page('新しいパスワード', form);
}
