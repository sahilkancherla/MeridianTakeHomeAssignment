/**
 * Auth session state (Supabase email + password). Initialized from the persisted
 * session and kept in sync via onAuthStateChange. The route guard (RequireAuth)
 * reads `loading`/`session`; the rest of the app reads `user`.
 */
import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../data/supabase';
import { fetchProfile, type AppRole, type MyProfile } from '../data/profiles';

export type AuthResult = { ok: true; needsConfirmation?: boolean } | { ok: false; error: string };

export type AuthState = {
  session: Session | null;
  user: User | null;
  /** Role + profile, derived from the email domain server-side (migration …0006).
   *  null until the profile loads after a session resolves. */
  role: AppRole | null;
  profile: MyProfile | null;
  /** The org this user belongs to (null = not in one yet). Drives the no-org gate. */
  orgId: string | null;
  /** True until the initial session check resolves (avoids a login flash on reload). */
  loading: boolean;
  /** True until the profile (and thus role + org) loads — guards role/org routing. */
  roleLoading: boolean;

  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  /** Re-read the profile (after creating/joining/leaving an org). */
  refreshProfile: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  session: null,
  user: null,
  role: null,
  profile: null,
  orgId: null,
  loading: true,
  roleLoading: true,

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  signUp: async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { ok: false, error: error.message };
    // With "Confirm email" on, no session comes back until the user verifies.
    return { ok: true, needsConfirmation: !data.session };
  },

  signOut: async () => {
    await supabase.auth.signOut();
  },

  refreshProfile: async () => {
    const userId = useAuth.getState().user?.id;
    if (!userId) return;
    const profile = await fetchProfile(userId);
    useAuth.setState({ profile, role: profile.role, orgId: profile.orgId });
  },
}));

/** Load the profile (and thus role) for a session, or clear it on sign-out. */
function syncProfile(session: Session | null) {
  if (!session?.user) {
    useAuth.setState({ role: null, profile: null, orgId: null, roleLoading: false });
    return;
  }
  useAuth.setState({ roleLoading: true });
  fetchProfile(session.user.id)
    .then((profile) =>
      useAuth.setState({ profile, role: profile.role, orgId: profile.orgId, roleLoading: false }),
    )
    // Don't strand the app if the profile read fails — default to the customer view.
    .catch(() => useAuth.setState({ role: 'customer', profile: null, orgId: null, roleLoading: false }));
}

// Hydrate from the persisted session, then track changes. onAuthStateChange fires an
// INITIAL_SESSION event on subscribe, so this also covers the first load.
supabase.auth.getSession().then(({ data }) => {
  useAuth.setState({ session: data.session, user: data.session?.user ?? null, loading: false });
  syncProfile(data.session);
});
supabase.auth.onAuthStateChange((_event, session) => {
  useAuth.setState({ session, user: session?.user ?? null, loading: false });
  syncProfile(session);
});
