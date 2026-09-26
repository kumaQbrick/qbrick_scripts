import { sb } from './supabase.js';

export const state = { user: null, profile: null };

const listeners = new Set();
export const onStateChange = (fn) => listeners.add(fn);

export async function setUser(user) {
  state.user = user ?? null;
  await refreshProfile();
}

export async function refreshProfile() {
  state.profile = null;
  if (state.user) {
    const { data, error } = await sb.from('profiles')
      .select('id, display_name, created_at')
      .eq('id', state.user.id)
      .maybeSingle();
    if (error) console.error(error);
    state.profile = data ?? null;
  }
  listeners.forEach(fn => fn(state));
}

export const isLoggedIn = () => !!state.user;
export const myId = () => state.user?.id ?? null;
