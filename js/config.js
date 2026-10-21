// Supabase > Project Settings > API Keys
// publishable key は公開されてOK。secret key は絶対にここに書かない。
export const SUPABASE_URL = 'https://dspajwhgojljjswmrnvo.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_gGR3p_GKze8gBGDal_nh4g_uRhLoNxj';

// 名前を変えると、古い名前で投稿された脚本は絞り込みに出なくなる
export const GENRES = [
  'ドラマ', 'コメディ', '恋愛', '青春', 'ホラー', 'サスペンス・ミステリー',
  'SF', 'ファンタジー', 'アクション', 'ドキュメンタリー風', '実験的', 'その他',
];

// キーはDBの値なので変えない。label と hint は変えてOK
export const LENGTHS = {
  short:  { label: '短編', hint: '〜20分' },
  medium: { label: '中編', hint: '20〜60分' },
  long:   { label: '長編', hint: '60分〜' },
};

export const STATUSES = {
  open:          { label: '検討中' },
  unselected:    { label: '未採用' },
  in_production: { label: '制作中', tape: true },
  completed:     { label: '完成', tape: true },
};

export const PERMISSIONS = {
  free:      { label: '自由に使ってOK', desc: '撮影・書き直し・流用、ご自由に' },
  ask:       { label: '使うなら相談して', desc: '使う前に筆者に一声かけてください' },
  read_only: { label: '読むだけ', desc: '感想は歓迎、作品には使わないで' },
};

export const VISIBILITIES = {
  members: { label: 'メンバーだけ', desc: 'ログインしたメンバーだけ読める' },
  public:  { label: 'URLを知っていれば誰でも', desc: '検索には出ないけど、URLが回れば部外者も読める' },
};

// supabase/schema.sql の file_size_limit と合わせる
export const MAX_PDF_MB = 20;
export const PAGE_SIZE = 24;
export const SIGNED_URL_SECONDS = 60 * 60;
