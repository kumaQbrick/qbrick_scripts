import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

export const isConfigured =
  !SUPABASE_URL.includes('YOUR-PROJECT-REF') && !SUPABASE_KEY.includes('REPLACE_ME');

// vendor/supabase/supabase.js が window.supabase を用意している
export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // メールのリンクを別のブラウザやスマホで開いてもログインできるよう implicit を使う
    flowType: 'implicit',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const BUCKET = 'scripts';

// サイトのURL（メールのリンクの戻り先）。例: https://example.github.io/qbrick-scripts/
export function siteUrl() {
  return location.origin + location.pathname;
}
