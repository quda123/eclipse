import { supabase } from './supabase'
import { usernameSchema } from './schemas'

export const internalEmail = (username: string) => `${usernameSchema.parse(username)}@users.eclipse.local`

export async function signInWithUsername(username: string, password: string) {
  if (!supabase) throw new Error('Supabase не настроен. Заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.')
  const { data, error } = await supabase.auth.signInWithPassword({ email: internalEmail(username), password })
  if (error) throw new Error('Неверный логин или пароль')
  const { data: profile, error: profileError } = await supabase.from('profiles').select('id,status,must_change_password').eq('id', data.user.id).single()
  if (profileError || profile?.status !== 'active') { await supabase.auth.signOut(); throw new Error('Аккаунт недоступен') }
  const { data: membership, error: membershipError } = await supabase.from('organization_members').select('role').eq('user_id', data.user.id).limit(1).maybeSingle()
  if (membershipError || !membership) { await supabase.auth.signOut(); throw new Error('Для аккаунта не настроена роль') }
  sessionStorage.removeItem('eclipse:signed-out')
  return { user: data.user, profile, role: membership?.role as 'owner' | 'teacher' | 'student' }
}

export async function currentRole() {
  if (sessionStorage.getItem('eclipse:signed-out')) return null
  if (!supabase) return null
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw new Error('Не удалось проверить сессию')
  if (!user) return null
  const { data: profile, error: profileError } = await supabase.from('profiles').select('status,must_change_password').eq('id', user.id).maybeSingle()
  if (profileError) throw new Error('Не удалось загрузить профиль')
  if (!profile || profile.status !== 'active') return 'archived' as const
  if (profile.must_change_password) return 'password_change' as const
  const { data, error } = await supabase.from('organization_members').select('role').eq('user_id', user.id).limit(1).maybeSingle()
  if (error) throw new Error('Не удалось определить роль')
  return data?.role as 'owner' | 'teacher' | 'student' | undefined
}
