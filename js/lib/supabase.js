import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

export const isConfigured =
  !SUPABASE_URL.includes('YOUR-PROJECT-REF') && !SUPABASE_KEY.includes('REPLACE_ME');

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // pkceだと、メールのリンクを別のブラウザ（スマホのメールアプリの中とか）で開いたときにログインできない
    // flowType: 'pkce',
    flowType: 'implicit',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export const BUCKET = 'scripts';

export const siteUrl = () => location.origin + location.pathname;
