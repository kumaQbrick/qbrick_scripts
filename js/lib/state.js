import { sb } from './supabase.js';

// ログイン状態をまとめて持つ
export const state = {
  user: null,     // Supabase Auth のユーザー
  profile: null,  // profiles テーブルの行（display_name, is_member, is_admin）
};

const listeners = new Set();

export function onStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(state);
}

export async function setUser(user) {
  state.user = user ?? null;
  await refreshProfile();
}

export async function refreshProfile() {
  if (!state.user) {
    state.profile = null;
  } else {
    const { data, error } = await sb
      .from('profiles')
      .select('id, display_name, is_member, is_admin, created_at')
      .eq('id', state.user.id)
      .maybeSingle();
    if (error) console.error(error);
    state.profile = data ?? null;
  }
  emit();
}

export const isLoggedIn = () => !!state.user;
export const isMember = () => !!state.profile && (state.profile.is_member || state.profile.is_admin);
export const isAdmin = () => !!state.profile?.is_admin;
export const myId = () => state.user?.id ?? null;
