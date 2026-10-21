import { LENGTHS, PERMISSIONS, VISIBILITIES, MAX_PDF_MB } from '../config.js';
import { h } from '../lib/ui.js';

export async function aboutView() {
  const list = (entries) => h('dl', { class: 'facts' },
    ...entries.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))));

  return h('section', { class: 'page narrow prose' },
    h('h1', {}, 'ルール'),
    h('p', {}, '制作班に出た脚本を置いておく場所です。採用されなかったものもどうぞ。'),

    h('h2', {}, '誰が何をできるか'),
    h('ul', {},
      h('li', {}, '「URLを知っていれば誰でも」の脚本は、ログインなしで読めます'),
      h('li', {}, '投稿・いいね・コメントは、招待コードで登録したメンバーだけ'),
      h('li', {}, 'いいねは1本につき1回。自分の脚本にはできません'),
    ),

    h('h2', {}, '公開範囲'),
    list(Object.values(VISIBILITIES).map((v) => [v.label, v.desc])),
    h('p', {}, 'このサイトは検索に出ないようにしていますが、非公開ではありません。まだ撮っていない作品は「メンバーだけ」にしておくのがおすすめです。'),

    h('h2', {}, '匿名について'),
    h('p', {}, 'コメントは匿名にできますが、管理者には誰が書いたか分かります。荒らしやいじめへの対応のためで、それ以外には使いません。'),
    h('p', {}, 'いいねを誰が押したかは、画面には出ません。'),

    h('h2', {}, '他の人の脚本を使うとき'),
    list(Object.values(PERMISSIONS).map((p) => [p.label, p.desc])),

    h('h2', {}, '長さの目安'),
    list(Object.values(LENGTHS).map((l) => [l.label, l.hint])),

    h('h2', {}, 'ファイル'),
    h('p', {}, `PDFだけ、${MAX_PDF_MB}MBまで。Wordなどは「PDFで保存」してから投稿してください。`),

    h('p', { class: 'muted' }, '困ったら管理者まで。'),
  );
}
