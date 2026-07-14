import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? 'http://localhost:5173'
const cors = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })
const normalizeUsername = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('ru-RU')

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405)

  const auth = request.headers.get('Authorization')
  if (!auth) return json({ error: 'Не авторизован' }, 401)
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError || !user) return json({ error: 'Не авторизован' }, 401)
  const { data: profile } = await client.from('profiles').select('active_organization_id').eq('id', user.id).single()
  const { data: member, error: memberError } = await client.from('organization_members').select('organization_id, role').eq('user_id', user.id).eq('organization_id', profile?.active_organization_id ?? '').in('role', ['owner', 'teacher']).maybeSingle()
  if (memberError || !member) return json({ error: 'Недостаточно прав' }, 403)

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return json({ error: 'Некорректный JSON' }, 400) }
  const username = normalizeUsername(typeof body.username === 'string' ? body.username : '')
  const password = typeof body.password === 'string' ? body.password : ''
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : ''
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : ''
  const className = typeof body.className === 'string' ? body.className.trim() : null
  const subject = typeof body.subject === 'string' ? body.subject.trim() : 'Математика'
  if (!/^[a-zа-яё0-9_.-]{3,40}$/iu.test(username) || password.length < 8 || password.length > 128 || !firstName || firstName.length > 80 || !lastName || lastName.length > 80 || (className?.length ?? 0) > 40 || subject.length > 80) {
    return json({ error: 'Проверьте данные ученика' }, 400)
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({ email: `${username}@users.eclipse.local`, password, email_confirm: true })
  if (createError || !created.user) return json({ error: createError?.message ?? 'Не удалось создать аккаунт' }, 409)
  const studentId = created.user.id
  const rollback = async () => { await admin.auth.admin.deleteUser(studentId) }

  const { error: profileError } = await admin.from('profiles').insert({ id: studentId, username, first_name: firstName, last_name: lastName, class_name: className, must_change_password: true })
  if (profileError) { await rollback(); return json({ error: 'Не удалось создать профиль' }, 500) }
  const { error: membershipError } = await admin.from('organization_members').insert({ organization_id: member.organization_id, user_id: studentId, role: 'student' })
  if (membershipError) { await rollback(); return json({ error: 'Не удалось добавить ученика в организацию' }, 500) }
  const { error: linkError } = await admin.from('teacher_student_links').insert({ organization_id: member.organization_id, teacher_id: user.id, student_id: studentId, subject: subject || 'Математика' })
  if (linkError) { await rollback(); return json({ error: 'Не удалось связать ученика с преподавателем' }, 500) }
  const { error: auditError } = await admin.from('audit_logs').insert({ organization_id: member.organization_id, actor_id: user.id, action: 'student_created', entity_type: 'profile', entity_id: studentId, metadata: { username } })
  if (auditError) { await rollback(); return json({ error: 'Не удалось завершить создание ученика' }, 500) }
  return json({ id: studentId, username }, 201)
})
