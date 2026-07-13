import { supabase } from './supabase'
import { usernameSchema } from './schemas'

export const internalEmail = (username: string) => `${usernameSchema.parse(username)}@users.eclipse.local`

export async function signInWithUsername(username: string, password: string) {
  if (!supabase) throw new Error('Supabase не настроен. Заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.')
  const { data, error } = await supabase.auth.signInWithPassword({ email: internalEmail(username), password })
  if (error) throw new Error('Неверный логин или пароль')
  const { data: profile, error: profileError } = await supabase.from('profiles').select('id,status,must_change_password').eq('id', data.user.id).single()
  if (profileError || profile?.status !== 'active') { await supabase.auth.signOut(); throw new Error('Аккаунт недоступен') }
  const { data: membership } = await supabase.from('organization_members').select('role').eq('user_id', data.user.id).single()
  return { user: data.user, profile, role: membership?.role as 'owner' | 'teacher' | 'student' }
}

export async function currentRole() {
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('organization_members').select('role').eq('user_id', user.id).single()
  return data?.role as 'owner' | 'teacher' | 'student' | undefined
}
