import { createClient } from '@supabase/supabase-js';

let clientInstance = null;
let initPromise = null;

/**
 * Dynamically initializes the Supabase client by fetching public configuration 
 * parameters from the backend (/api/config). Zero hardcoded credentials in frontend.
 */
export async function initSupabaseClient() {
  if (clientInstance) return clientInstance;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const res = await fetch('/api/config', { credentials: 'include' });
        if (res.ok) {
          const config = await res.json();
          if (config.supabaseUrl && config.supabaseAnonKey) {
            clientInstance = createClient(config.supabaseUrl, config.supabaseAnonKey);
          }
        }
      } catch (err) {
        console.warn('Unable to fetch runtime config from /api/config:', err);
      }
      return clientInstance;
    })();
  }
  return initPromise;
}

// Start fetching configuration as soon as module is loaded
initSupabaseClient();

/**
 * Crash-safe Proxy export for `supabase`.
 * Transparently delegates calls to the dynamically initialized Supabase client
 * without requiring any frontend .env files or hardcoded credentials.
 */
export const supabase = new Proxy({}, {
  get(target, prop) {
    if (clientInstance) {
      const val = clientInstance[prop];
      return typeof val === 'function' ? val.bind(clientInstance) : val;
    }
    
    // Provide safe async/deferred handlers while /api/config is fetching
    if (prop === 'auth') {
      return {
        onAuthStateChange: (cb) => {
          let realUnsubscribe = null;
          initSupabaseClient().then((client) => {
            if (client && client.auth) {
              const res = client.auth.onAuthStateChange(cb);
              if (res?.data?.subscription) {
                realUnsubscribe = res.data.subscription.unsubscribe;
              }
            }
          });
          return {
            data: {
              subscription: {
                unsubscribe: () => {
                  if (realUnsubscribe) realUnsubscribe();
                }
              }
            }
          };
        },
        signInWithOAuth: async (...args) => {
          const client = await initSupabaseClient();
          if (!client) throw new Error('Supabase configuration unavailable');
          return client.auth.signInWithOAuth(...args);
        },
        resetPasswordForEmail: async (...args) => {
          const client = await initSupabaseClient();
          if (!client) throw new Error('Supabase configuration unavailable');
          return client.auth.resetPasswordForEmail(...args);
        },
        updateUser: async (...args) => {
          const client = await initSupabaseClient();
          if (!client) throw new Error('Supabase configuration unavailable');
          return client.auth.updateUser(...args);
        },
        signOut: async (...args) => {
          const client = await initSupabaseClient();
          if (!client) return { error: null };
          return client.auth.signOut(...args);
        },
        getUser: async (...args) => {
          const client = await initSupabaseClient();
          if (!client) return { data: { user: null }, error: null };
          return client.auth.getUser(...args);
        },
        getSession: async (...args) => {
          const client = await initSupabaseClient();
          if (!client) return { data: { session: null }, error: null };
          return client.auth.getSession(...args);
        }
      };
    }
    return undefined;
  }
});
