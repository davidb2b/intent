import { supabase } from "@/infrastructure/supabase/client"
import type { AuthChangeEvent, Session } from "@supabase/supabase-js"

export const authService = {
  getSession: () => supabase.auth.getSession(),
  onAuthStateChange: (callback: (event: AuthChangeEvent, session: Session | null) => void) => supabase.auth.onAuthStateChange(async (event, session) => { callback(event, session) }),
  signInWithPassword: (email: string, password: string) => supabase.auth.signInWithPassword({ email, password }),
  signUp: (email: string, password: string) => supabase.auth.signUp({ email, password }),
  resetPasswordForEmail: (email: string, redirectTo: string) => supabase.auth.resetPasswordForEmail(email, { redirectTo }),
  updatePassword: (password: string) => supabase.auth.updateUser({ password }),
  signOut: () => supabase.auth.signOut(),
}
