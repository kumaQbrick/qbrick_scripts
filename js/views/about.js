import { LENGTHS, PERMISSIONS, VISIBILITIES, MAX_PDF_MB } from '../config.js';
import { h } from '../lib/ui.js';

export async function aboutView() {
  const section = (title, ...body) => h('section', { class: 'prose-section' }, h('h2', { class: 'section-title' }, title), ...body);
  const dl = (entries) => h('dl', { class: 'facts facts--wide' },
    ...entries.map(([k, v]) => h('div', { class: 'facts__row' }, h('dt', {}, k), h('dd', {}, v))));

  return h('section', { class: 'page narrow prose' },
    h('h1', { class: 'page-title' }, '使い方とルール'),
    h('p', {}, '脚本棚は、Qbrick 制作班に集まった脚本を残しておく場所です。映画にならなかった脚本も、ここで読まれたり、次の作品のきっかけになったりします。'),

    section('できること',
      h('ul', {},
        h('li', {}, '読む：公開範囲が「リンクを知っている人なら誰でも」の脚本は、ログインしなくても読めます。'),
        h('li', {}, '投稿・いいね・コメント：招待コードを入れて登録したメンバーだけができます。'),
        h('li', {}, 'いいねは1つの脚本に1人1回です。自分の脚本にはいいねできません。'),
      )),

    section('公開範囲',
      dl(Object.values(VISIBILITIES).map((v) => [v.label, v.desc])),
      h('p', {}, 'このサイトは検索エンジンに載らないように設定していますが、「非公開」ではありません。まだ発表していない作品は「メンバーだけ」にしておくのがおすすめです。PDFのリンクは1時間で使えなくなります。')),

    section('匿名コメントについて',
      h('p', {}, 'コメントは名前を出すか匿名にするかを選べます。匿名にすると、ほかのメンバーには誰が書いたか分かりません。'),
      h('p', {}, 'ただし、いじめや荒らしに対応するため、管理者には匿名コメントの投稿者が分かるようになっています。管理者はこの情報をそれ以外の目的には使いません。'),
      h('p', {}, 'いいねは、誰が押したかを管理者も含めて画面には表示しません。')),

    section('脚本を使うときのルール',
      dl(Object.values(PERMISSIONS).map((p) => [p.label, p.desc])),
      h('p', {}, '投稿できるのは、自分が書いた脚本か、共作者全員が投稿に同意している脚本だけです。使用の設定は筆者がいつでも変えられます。')),

    section('長さの目安',
      dl(Object.values(LENGTHS).map((l) => [l.label, l.hint]))),

    section('投稿するファイル',
      h('p', {}, `PDFのみ、${MAX_PDF_MB}MBまでです。Wordやテキストで書いた脚本は「PDFとして保存」してから投稿してください。`)),

    section('困ったときは',
      h('p', {}, '削除してほしいコメントや脚本、退会、パスワードの問題などは、サークルの管理者に連絡してください。')),
  );
}
