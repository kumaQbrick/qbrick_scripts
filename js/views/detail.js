import { LENGTHS, STATUSES, PERMISSIONS, VISIBILITIES, SIGNED_URL_SECONDS } from '../config.js';
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
      h('h1', { class: 'page-title' }, '脚本が見つかりません'),
      h('p', {}, '削除されたか、メンバー限定の脚本の可能性があります。'),
      !isLoggedIn() ? h('p', {}, h('a', { class: 'btn btn--primary', href: '#/login' }, 'ログインして見る')) : null,
      h('p', {}, h('a', { href: '#/' }, '脚本一覧に戻る')),
    );
  }

  const isOwner = s.owner_id && s.owner_id === myId();
  const canEdit = (isOwner && isMember()) || isAdmin();
  const canDelete = isOwner || isAdmin();

  // ---- PDF ----
  const [viewUrl, downloadUrl] = await Promise.all([
    sb.storage.from(BUCKET).createSignedUrl(s.pdf_path, SIGNED_URL_SECONDS),
    sb.storage.from(BUCKET).createSignedUrl(s.pdf_path, SIGNED_URL_SECONDS, { download: s.pdf_filename }),
  ]);
  let viewer = null;
  let pdfSection;
  if (viewUrl.error || !viewUrl.data?.signedUrl) {
    pdfSection = notice('error', 'PDFを読み込めませんでした。', viewUrl.error ? errText(viewUrl.error) : '');
  } else {
    viewer = pdfViewer(viewUrl.data.signedUrl);
    pdfSection = h('div', { class: 'reader' },
      h('div', { class: 'reader__bar' },
        h('span', { class: 'reader__file' }, icon('file'), s.pdf_filename, s.pdf_size ? `（${fmtSize(s.pdf_size)}）` : ''),
        h('span', { class: 'reader__actions' },
          h('a', { class: 'btn btn--small', href: viewUrl.data.signedUrl, target: '_blank', rel: 'noopener' }, '新しいタブで開く'),
          downloadUrl.data?.signedUrl
            ? h('a', { class: 'btn btn--small', href: downloadUrl.data.signedUrl }, 'ダウンロード')
            : null,
        ),
      ),
      viewer.el,
    );
  }

  // ---- いいね ----
  const likeArea = h('div', { class: 'like' });
  await renderLike();

  async function renderLike() {
    const countText = `${s.like_count}`;
    if (!isLoggedIn()) {
      likeArea.replaceChildren(
        h('a', { class: 'like__btn', href: '#/login' }, icon('heart'), 'いいね', h('span', { class: 'like__count' }, countText)),
        h('span', { class: 'like__note' }, 'ログインするといいねできます'),
      );
      return;
    }
    if (!isMember() || isOwner) {
      likeArea.replaceChildren(
        h('span', { class: 'like__btn is-disabled' }, icon('heart'), 'いいね', h('span', { class: 'like__count' }, countText)),
        h('span', { class: 'like__note' }, isOwner ? '自分の脚本にはいいねできません' : 'メンバーになるといいねできます'),
      );
      return;
    }
    const { data: mine } = await sb.from('likes').select('script_id').eq('script_id', s.id).eq('user_id', myId()).maybeSingle();
    const liked = !!mine;
    const btn = h('button', {
      type: 'button',
      class: `like__btn${liked ? ' is-on' : ''}`,
      'aria-pressed': liked ? 'true' : 'false',
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
    }, icon('heart'), liked ? 'いいね済み' : 'いいね', h('span', { class: 'like__count' }, countText));
    likeArea.replaceChildren(btn, h('span', { class: 'like__note' }, 'だれがいいねしたかは表示されません'));
  }

  // ---- 削除 ----
  async function onDelete(e) {
    if (!confirm(`「${s.title}」を削除します。PDFも消え、元に戻せません。よろしいですか？`)) return;
    await busy(e.currentTarget, '削除中…', async () => {
      const { error: delErr } = await sb.from('scripts').delete().eq('id', s.id);
      if (delErr) { toast(errText(delErr), 'error'); return; }
      const { error: rmErr } = await sb.storage.from(BUCKET).remove([s.pdf_path]);
      if (rmErr) console.warn('PDFの削除に失敗', rmErr);
      toast('削除しました');
      go('/');
    });
  }

  // ---- 情報欄 ----
  const perm = PERMISSIONS[s.usage_permission];
  const info = h('aside', { class: 'detail__aside' },
    cover(s, { size: 'large' }),
    likeArea,
    h('dl', { class: 'facts' },
      fact('筆者', s.author_name),
      fact('ジャンル', s.genres.join('／')),
      fact('長さ', `${lengthText(s)}`, LENGTHS[s.length_category]?.hint),
      fact('状態', STATUSES[s.status]?.label ?? s.status),
      fact('使用について', perm?.label ?? s.usage_permission, perm?.desc),
      fact('公開範囲', VISIBILITIES[s.visibility]?.label ?? s.visibility),
      fact('投稿日', fmtDate(s.created_at)),
      s.updated_at && fmtDate(s.updated_at) !== fmtDate(s.created_at) ? fact('更新日', fmtDate(s.updated_at)) : null,
    ),
    canEdit || canDelete
      ? h('div', { class: 'detail__owner' },
          canEdit ? h('a', { class: 'btn', href: `#/edit/${s.id}` }, '編集する') : null,
          canDelete ? h('button', { type: 'button', class: 'btn btn--danger', onclick: onDelete }, '削除する') : null,
          isAdmin() && !isOwner ? h('p', { class: 'field__help' }, '管理者として操作しています') : null,
        )
      : null,
  );

  const comments = await commentsSection(s);

  return {
    title: s.title,
    destroy: () => viewer?.destroy(),
    el: h('article', { class: 'page detail' },
      h('p', { class: 'back' }, h('a', { href: '#/' }, '一覧に戻る')),
      h('header', { class: 'detail__head' },
        h('h1', { class: 'detail__title' }, s.title),
        h('p', { class: 'detail__byline' }, s.author_name),
      ),
      h('div', { class: 'detail__body' },
        info,
        h('div', { class: 'detail__main' },
          s.synopsis
            ? h('section', { class: 'synopsis' }, h('h2', { class: 'section-title' }, 'あらすじ'), h('p', {}, s.synopsis))
            : null,
          h('section', {}, h('h2', { class: 'section-title' }, '脚本'), pdfSection),
          comments,
        ),
      ),
    ),
  };
}

function fact(label, value, help) {
  return h('div', { class: 'facts__row' },
    h('dt', {}, label),
    h('dd', {}, value, help ? h('span', { class: 'facts__help' }, help) : null),
  );
}

// ---------------------------------------------------------------------
// コメント
// ---------------------------------------------------------------------
async function commentsSection(s) {
  const list = h('ol', { class: 'comments' });
  const heading = h('h2', { class: 'section-title' }, 'コメント');
  const section = h('section', { class: 'comments-section' }, heading, list);

  async function load() {
    const { data, error } = await sb
      .from('comments')
      .select('id, body, is_anonymous, author_id, created_at, author:profiles(display_name)')
      .eq('script_id', s.id)
      .order('created_at', { ascending: true });
    if (error) { list.replaceChildren(h('li', {}, notice('error', errText(error)))); return; }

    // 自分のコメントか（匿名も含む）、管理者なら本当の投稿者
    const authors = new Map();
    if (isLoggedIn() && data.length) {
      const { data: rows } = await sb
        .from('comment_authors')
        .select('comment_id, user_id, user:profiles(display_name)')
        .in('comment_id', data.map((c) => c.id));
      for (const r of rows ?? []) authors.set(r.comment_id, r);
    }

    heading.textContent = `コメント（${data.length}）`;
    if (!data.length) {
      list.replaceChildren(h('li', { class: 'comments__empty' }, 'まだコメントはありません。'));
      return;
    }
    list.replaceChildren(...data.map((c) => {
      const real = authors.get(c.id);
      const mine = real?.user_id === myId();
      const name = c.is_anonymous ? '匿名' : (c.author?.display_name ?? '退会したユーザー');
      return h('li', { class: `comment${c.is_anonymous ? ' comment--anon' : ''}` },
        h('div', { class: 'comment__head' },
          h('span', { class: 'comment__name' }, name),
          mine ? h('span', { class: 'tag' }, 'あなた') : null,
          isAdmin() && c.is_anonymous && real && !mine
            ? h('span', { class: 'tag tag--admin' }, `投稿者: ${real.user?.display_name ?? '不明'}`)
            : null,
          h('time', { class: 'comment__time', datetime: c.created_at }, fmtDateTime(c.created_at)),
        ),
        h('p', { class: 'comment__body' }, c.body),
        mine || isAdmin()
          ? h('button', {
              type: 'button', class: 'link-btn',
              onclick: async () => {
                if (!confirm('このコメントを削除しますか？')) return;
                const { error: e } = await sb.from('comments').delete().eq('id', c.id);
                if (e) toast(errText(e), 'error'); else { toast('コメントを削除しました'); load(); }
              },
            }, '削除')
          : null,
      );
    }));
  }

  await load();

  // 投稿フォーム
  if (!isLoggedIn()) {
    section.append(notice('info', 'コメントするには ', h('a', { href: '#/login' }, 'ログイン'), ' してください。'));
  } else if (!isMember()) {
    section.append(notice('info', 'コメントできるのはメンバーだけです。', h('a', { href: '#/account' }, '招待コードを入力する')));
  } else {
    const body = h('textarea', { rows: 4, maxlength: 2000, required: true, 'aria-label': 'コメント', placeholder: '感想やアドバイスを書いてください' });
    const counter = h('span', { class: 'comment-form__count' }, '0 / 2000');
    body.addEventListener('input', () => { counter.textContent = `${body.value.length} / 2000`; });
    const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, 'コメントする');
    const form = h('form', {
      class: 'comment-form',
      onsubmit: async (e) => {
        e.preventDefault();
        const text = body.value.trim();
        if (!text) return;
        const anonymous = form.querySelector('input[name=as]:checked').value === 'anon';
        await busy(submit, '送信中…', async () => {
          const { error } = await sb.rpc('post_comment', { p_script_id: s.id, p_body: text, p_anonymous: anonymous });
          if (error) { toast(errText(error), 'error'); return; }
          body.value = '';
          counter.textContent = '0 / 2000';
          toast('コメントしました');
          await load();
        });
      },
    },
      h('h3', { class: 'comment-form__title' }, 'コメントを書く'),
      body,
      h('div', { class: 'comment-form__as', role: 'radiogroup', 'aria-label': '名前の表示' },
        h('label', {}, h('input', { type: 'radio', name: 'as', value: 'name', checked: true }), `名前を出す（${state.profile?.display_name ?? ''}）`),
        h('label', {}, h('input', { type: 'radio', name: 'as', value: 'anon' }), '匿名にする'),
      ),
      h('p', { class: 'field__help' }, '匿名にしても、いじめや荒らしに対応するため、管理者には投稿者が分かるようになっています。'),
      h('div', { class: 'comment-form__foot' }, counter, submit),
    );
    section.append(form);
  }
  return section;
}
