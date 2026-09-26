import { sb } from './lib/supabase.js';

const main = document.getElementById('main');

// つながるか確認
const { data, error } = await sb.auth.getSession();
console.log(data, error);
main.textContent = error ? 'つながらない' : 'つながった';
