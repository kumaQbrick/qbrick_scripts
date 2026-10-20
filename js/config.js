// =====================================================================
// サイトの設定
// 引き継ぎのときに書き換えるのは、基本的にこのファイルだけです。
// =====================================================================

// Supabase の「Project Settings > API Keys」で確認できる値
// Project URL と Publishable key（sb_publishable_ で始まるもの）は公開されても大丈夫な値です。
// Secret key（sb_secret_ で始まるもの）は絶対にここへ書かないでください。
export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_REPLACE_ME';

export const SITE_NAME = '脚本棚';

// ジャンルの選択肢（1本につき最大3つまで選べる）
// 並び順はそのまま画面の並び順になります。
// 名前を変えると、すでに投稿された脚本の古い名前は絞り込みに出なくなるので注意してください。
export const GENRES = [
  'ドラマ',
  'コメディ',
  '恋愛',
  '青春',
  'ホラー',
  'サスペンス・ミステリー',
  'SF',
  'ファンタジー',
  'アクション',
  'ドキュメンタリー風',
  '実験的',
  'その他',
];

// 長さの区分（キーはデータベースの値なので変えないでください。表示名と目安は変えてOK）
export const LENGTHS = {
  short:  { label: '短編', hint: '20分くらいまで' },
  medium: { label: '中編', hint: '20〜60分くらい' },
  long:   { label: '長編', hint: '60分くらい以上' },
};

// 脚本の状態
export const STATUSES = {
  open:          { label: '検討中' },
  unselected:    { label: '未採用' },
  in_production: { label: '採用・制作中', stamp: '制作中' },
  completed:     { label: '完成', stamp: '完成' },
};

// ほかの人がこの脚本を使ってよいか
export const PERMISSIONS = {
  free:      { label: '自由に使ってOK', desc: '撮影・書き直し・一部の流用など、サークル内で自由に使ってかまいません。' },
  ask:       { label: '使う前に筆者に相談', desc: '使いたい人は、先に筆者に声をかけてください。' },
  read_only: { label: '読むだけ', desc: '読んで感想を伝えるのは歓迎。作品として使うのはやめてください。' },
};

// 公開範囲
export const VISIBILITIES = {
  members: {
    label: 'メンバーだけ',
    desc: 'ログインしたサークルメンバーだけが読めます。',
  },
  public: {
    label: 'リンクを知っている人なら誰でも',
    desc: 'ログインしていない人も読めます。検索エンジンには出ませんが、URLが共有されればサークル外の人も読めます。',
  },
};

// PDF の最大サイズ（MB）。supabase/schema.sql のバケット設定（20MB）と合わせてください。
export const MAX_PDF_MB = 20;

// 一覧で一度に読み込む件数
export const PAGE_SIZE = 24;

// 署名つきURL（PDFを読むための期限つきリンク）の有効時間（秒）
export const SIGNED_URL_SECONDS = 60 * 60;
