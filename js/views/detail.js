import { STATUSES, PERMISSIONS, VISIBILITIES, SIGNED_URL_SECONDS } from '../config.js';
import { sb, BUCKET } from '../lib/supabase.js';
import { state, isLoggedIn, isMember, isAdmin, myId } from '../lib/state.js';
import { h, icon, cover, fmtDate, fmtDateTime, fmtSize, lengthText, errText, toast, notice, busy } from '../lib/ui.js';
import { pdfViewer } from '../lib/pdfviewer.js';

export async function detailView({ params, go }) {
  const [id] = params;
  const { data: s, error } = await sb.from('scripts').select('*').eq('id', id).maybeSingle();
  if (error) throw error;

  if (!s) {
    return h('section', { class: 'page narrow' },
      h('h1', {}, '見つかりません'),
      h('p', {}, '消されたか、メンバー限定の脚本かもしれません。'),
      !isLoggedIn() && h('p', {}, h('a', { class: 'btn btn--ink', href: '#/login' }, 'ログイン')),
      h('p', {}, h('a', { href: '#/' }, '一覧へ')),
    );
  }

  const isOwner = !!s.owner_id && s.owner_id === myId();
  const canEdit = (isOwner && isMember()) || isAdmin();
  const canDelete = isOwner || isAdmin();

  // PDF はバケットが非公開なので、期限つきの URL を毎回発行する
  const [view, dl] = await Promise.all([
    sb.storage.from(BUCKET).createSignedUrl(s.pdf_path, SIGNED_URL_SECONDS),
    sb.storage.from(BUCKET).createSignedUrl(s.pdf_path, SIGNED_URL_SECONDS, { download: s.pdf_filename }),
  ]);
  let viewer = null;
  let reader;
  if (!view.data?.signedUrl) {
    reader = notice('error', 'PDFを読み込めませんでした。', view.error ? errText(view.error) : '');
  } else {
    viewer = pdfViewer(view.data.signedUrl);
    reader = h('div', { class: 'reader' },
      h('div', { class: 'reader__bar' },
        h('span', { class: 'reader__file' }, s.pdf_filename, s.pdf_size ? ` (${fmtSize(s.pdf_size)})` : ''),
        h('a', { href: view.data.signedUrl, target: '_blank', rel: 'noopener' }, '別タブで開く'),
        dl.data?.signedUrl && h('a', { href: dl.data.signedUrl }, 'ダウンロード'),
      ),
      viewer.el,
    );
  }

  const likeBox = h('div', { class: 'like' });
  await renderLike();

  async function renderLike() {
    const label = [icon('heart'), ' いいね ', h('b', {}, s.like_count)];
    if (!isLoggedIn()) {
      likeBox.replaceChildren(h('a', { class: 'like__btn', href: '#/login' }, ...label));
      return;
    }
    if (!isMember() || isOwner) {
      likeBox.replaceChildren(
        h('span', { class: 'like__btn is-off' }, ...label),
        isOwner && h('small', {}, '自分の脚本'),
      );
      return;
    }
    const { data: mine } = await sb.from('likes').select('script_id').eq('script_id', s.id).eq('user_id', myId()).maybeSingle();
    const liked = !!mine;
    const btn = h('button', {
      type: 'button',
      class: `like__btn${liked ? ' is-on' : ''}`,
      'aria-pressed': String(liked),
      onclick: async () => {
        btn.disabled = true;
        const res = liked
          ? await sb.from('likes').delete().eq('script_id', s.id).eq('user_id', myId())
          : await sb.from('likes').insert({ script_id: s.id });
        if (res.error) toast(errText(res.error), 'error');
        const { data } = await sb.from('scripts').select('like_count').eq('id', s.id).single();
        if (data) s.like_count = data.like_count;
        await renderLike();
      },
    }, ...label);
    likeBox.replaceChildren(btn);
  }

  async function onDelete(e) {
    if (!confirm(`「${s.title}」を消します。PDFも消えて、元に戻せません。`)) return;
    await busy(e.currentTarget, '削除中…', async () => {
      const { error: delErr } = await sb.from('scripts').delete().eq('id', s.id);
      if (delErr) { toast(errText(delErr), 'error'); return; }
      const { error: rmErr } = await sb.storage.from(BUCKET).remove([s.pdf_path]);
      if (rmErr) console.warn(rmErr);
      toast('消しました');
      go('/');
    });
  }

  const perm = PERMISSIONS[s.usage_permission];
  const updated = fmtDate(s.updated_at) !== fmtDate(s.created_at) ? fmtDate(s.updated_at) : null;

  const aside = h('aside', { class: 'detail__aside' },
    cover(s, { large: true }),
    likeBox,
    h('dl', { class: 'facts' },
      fact('ジャンル', s.genres.join('・')),
      fact('長さ', lengthText(s)),
      fact('状態', STATUSES[s.status]?.label ?? s.status),
      fact('使っていい？', perm?.label ?? s.usage_permission),
      fact('公開', VISIBILITIES[s.visibility]?.label ?? s.visibility),
      fact('投稿', fmtDate(s.created_at) + (updated ? `（更新 ${updated}）` : '')),
    ),
    (canEdit || canDelete) && h('div', { class: 'detail__owner' },
      canEdit && h('a', { class: 'btn', href: `#/edit/${s.id}` }, '編集'),
      canDelete && h('button', { type: 'button', class: 'btn btn--danger', onclick: onDelete }, '削除'),
    ),
  );

  return {
    title: s.title,
    destroy: () => viewer?.destroy(),
    el: h('article', { class: 'page detail' },
      h('header', { class: 'detail__head' },
        h('h1', {}, s.title),
        h('p', {}, s.author_name),
      ),
      h('div', { class: 'detail__body' },
        aside,
        h('div', { class: 'detail__main' },
          s.synopsis && h('p', { class: 'synopsis' }, s.synopsis),
          reader,
          await comments(s),
        ),
      ),
    ),
  };
}

function fact(label, value) {
  return h('div', {}, h('dt', {}, label), h('dd', {}, value));
}

async function comments(s) {
  const list = h('ol', { class: 'comments' });
  const heading = h('h2', {}, 'コメント');
  const section = h('section', { class: 'comments-section' }, heading, list);

  async function load() {
    const { data, error } = await sb
      .from('comments')
      .select('id, body, is_anonymous, author_id, created_at, author:profiles(display_name)')
      .eq('script_id', s.id)
      .order('created_at', { ascending: true });
    if (error) { list.replaceChildren(h('li', {}, notice('error', errText(error)))); return; }

    // 自分のコメントか、管理者なら匿名の中身。RLS で本人と管理者の分しか返ってこない
    const authors = new Map();
    if (isLoggedIn() && data.length) {
      const { data: rows } = await sb
        .from('comment_authors')
        .select('comment_id, user_id, user:profiles(display_name)')
        .in('comment_id', data.map((c) => c.id));
      for (const r of rows ?? []) authors.set(r.comment_id, r);
    }

    heading.textContent = data.length ? `コメント ${data.length}` : 'コメント';
    if (!data.length) {
      list.replaceChildren(h('li', { class: 'muted' }, 'まだありません'));
      return;
    }
    list.replaceChildren(...data.map((c) => {
      const real = authors.get(c.id);
      const mine = real?.user_id === myId();
      return h('li', { class: 'comment' },
        h('div', { class: 'comment__head' },
          h('b', { class: c.is_anonymous ? 'muted' : null }, c.is_anonymous ? '匿名' : (c.author?.display_name ?? '退会した人')),
          mine && h('span', { class: 'tag' }, '自分'),
          isAdmin() && c.is_anonymous && real && !mine && h('span', { class: 'tag tag--admin' }, real.user?.display_name ?? '?'),
          h('time', { datetime: c.created_at }, fmtDateTime(c.created_at)),
          (mine || isAdmin()) && h('button', {
            type: 'button', class: 'link-btn',
            onclick: async () => {
              if (!confirm('このコメントを消しますか？')) return;
              const { error: e } = await sb.from('comments').delete().eq('id', c.id);
              if (e) toast(errText(e), 'error'); else load();
            },
          }, '削除'),
        ),
        h('p', {}, c.body),
      );
    }));
  }

  await load();

  if (!isLoggedIn()) {
    section.append(notice('info', 'コメントするには', h('a', { href: '#/login' }, 'ログイン')));
  } else if (!isMember()) {
    section.append(notice('info', 'コメントはメンバーだけ。', h('a', { href: '#/account' }, '招待コードを入れる')));
  } else {
    const body = h('textarea', { rows: 3, maxlength: 2000, required: true, 'aria-label': 'コメント' });
    const send = h('button', { type: 'submit', class: 'btn btn--ink' }, '送信');
    const form = h('form', {
      class: 'comment-form',
      onsubmit: async (e) => {
        e.preventDefault();
        const text = body.value.trim();
        if (!text) return;
        const anonymous = form.querySelector('input[name=as]:checked').value === 'anon';
        await busy(send, '送信中…', async () => {
          const { error } = await sb.rpc('post_comment', { p_script_id: s.id, p_body: text, p_anonymous: anonymous });
          if (error) { toast(errText(error), 'error'); return; }
          body.value = '';
          await load();
        });
      },
    },
      body,
      h('div', { class: 'comment-form__foot' },
        h('label', {}, h('input', { type: 'radio', name: 'as', value: 'name', checked: true }), state.profile?.display_name ?? '名前を出す'),
        h('label', {}, h('input', { type: 'radio', name: 'as', value: 'anon' }), '匿名'),
        send,
      ),
      notice('info', '匿名でも、管理者には誰が書いたか分かります（荒らし対策）'),
    );
    section.append(form);
  }
  return section;
}
