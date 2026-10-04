import { STATUSES, PERMISSIONS, VISIBILITIES, SIGNED_URL_SECONDS } from '../config.js';
import { sb, BUCKET } from '../lib/supabase.js';
import { isLoggedIn, myId } from '../lib/state.js';
import { h, icon, fmtDate, fmtSize, lengthText, errText, toast, notice } from '../lib/ui.js';
import { pdfViewer } from '../lib/pdfviewer.js';

export async function detailView({ params, go }) {
  const [id] = params;
  const { data: s, error } = await sb.from('scripts').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  console.log(s);

  if (!s) {
    return h('section', { class: 'page narrow' },
      h('h1', {}, '見つかりません'),
      h('p', {}, '消されたか、メンバー限定の脚本かもしれません。'),
      !isLoggedIn() && h('p', {}, h('a', { class: 'btn btn--ink', href: '#/login' }, 'ログイン')),
      h('p', {}, h('a', { href: '#/' }, '一覧へ')),
    );
  }

  const isOwner = !!s.owner_id && s.owner_id === myId();

  // PDFのバケットは非公開なので期限つきのURLを毎回発行する
  // 表示用とダウンロード用で2個いる（download付きのURLだと別タブで開いたときダウンロードになってしまう）
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

  // いいねボタン
  async function renderLike() {
    const label = [icon('heart'), ' いいね ', h('b', {}, s.like_count)];
    if (isLoggedIn()) {
      if (!isOwner) {
        const { data: mine } = await sb.from('likes').select('script_id').eq('script_id', s.id).eq('user_id', myId()).maybeSingle();
        const liked = !!mine;
        const btn = h('button', {
          type: 'button',
          class: `like__btn${liked ? ' is-on' : ''}`,
          'aria-pressed': String(liked),
          onclick: async () => {
            btn.disabled = true;   // 連打防止
            let res;
            if (liked) {
              res = await sb.from('likes').delete().eq('script_id', s.id).eq('user_id', myId());
            } else {
              res = await sb.from('likes').insert({ script_id: s.id });
            }
            if (res.error) toast(errText(res.error), 'error');
            // 数はDBのトリガーで数えてるので取り直す
            const { data } = await sb.from('scripts').select('like_count').eq('id', s.id).single();
            if (data) s.like_count = data.like_count;
            await renderLike();
          },
        }, ...label);
        likeBox.replaceChildren(btn);
      } else {
        // 自分の脚本 → 押せない
        likeBox.replaceChildren(
          h('span', { class: 'like__btn is-off' }, ...label),
          isOwner && h('small', {}, '自分の脚本'),
        );
      }
    } else {
      likeBox.replaceChildren(h('a', { class: 'like__btn', href: '#/login' }, ...label));
    }
  }

  const perm = PERMISSIONS[s.usage_permission];

  const aside = h('aside', { class: 'detail__aside' },
    likeBox,
    h('dl', { class: 'facts' },
      fact('ジャンル', s.genres.join('・')),
      fact('長さ', lengthText(s)),
      fact('状態', STATUSES[s.status]?.label ?? s.status),
      fact('使っていい？', perm?.label ?? s.usage_permission),
      fact('公開', VISIBILITIES[s.visibility]?.label ?? s.visibility),
      fact('投稿', fmtDate(s.created_at)),
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
        ),
      ),
    ),
  };
}

function fact(label, value) {
  return h('div', {}, h('dt', {}, label), h('dd', {}, value));
}
