/**
 * Frontend Supabase Auth Client Proxy
 * Provides crash-safe mock/noop handlers for frontend auth state listeners
 * while ensuring zero direct DB connections or /api/config polling.
 */

export async function initSupabaseClient() {
  return null;
}

export const supabase = {
  auth: {
    onAuthStateChange: (cb) => {
      return {
        data: {
          subscription: {
            unsubscribe: () => {}
          }
        }
      };
    },
    signInWithOAuth: async () => {
      throw new Error('OAuth is managed via backend auth endpoints.');
    },
    resetPasswordForEmail: async () => {
      return { error: null };
    },
    updateUser: async () => {
      return { error: null };
    },
    signOut: async () => {
      return { error: null };
    },
    getUser: async () => {
      return { data: { user: null }, error: null };
    },
    getSession: async () => {
      return { data: { session: null }, error: null };
    }
  }
};
