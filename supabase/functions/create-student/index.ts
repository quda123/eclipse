import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const normalizeUsername = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('ru-RU')

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const auth = request.headers.get('Authorization')
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth ?? '' } } })
  const { data: { user } } = await client.auth.getUser()
  if (!user) return Response.json({ error: 'Не авторизован' }, { status: 401, headers: cors })
  const { data: member } = await client.from('organization_members').select('organization_id, role').eq('user_id', user.id).in('role', ['owner', 'teacher']).single()
  if (!member) return Response.json({ error: 'Недостаточно прав' }, { status: 403, headers: cors })
  const body = await request.json()
  const username = normalizeUsername(body.username ?? '')
  if (!/^[a-zа-яё0-9_.-]+$/iu.test(username) || !body.password || !body.firstName || !body.lastName) return Response.json({ error: 'Проверьте данные ученика' }, { status: 400, headers: cors })
  const { data: created, error } = await admin.auth.admin.createUser({ email: `${username}@users.eclipse.local`, password: body.password, email_confirm: true })
  if (error || !created.user) return Response.json({ error: error?.message ?? 'Не удалось создать аккаунт' }, { status: 409, headers: cors })
  const { error: profileError } = await admin.from('profiles').insert({ id: created.user.id, username, first_name: body.firstName, last_name: body.lastName, class_name: body.className, must_change_password: true })
  if (profileError) { await admin.auth.admin.deleteUser(created.user.id); return Response.json({ error: 'Не удалось создать профиль' }, { status: 500, headers: cors }) }
  await admin.from('organization_members').insert({ organization_id: member.organization_id, user_id: created.user.id, role: 'student' })
  await admin.from('teacher_student_links').insert({ organization_id: member.organization_id, teacher_id: user.id, student_id: created.user.id, subject: body.subject || 'Математика' })
  return Response.json({ id: created.user.id, username }, { headers: cors })
})
