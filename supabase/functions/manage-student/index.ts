import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? 'http://localhost:5173'
const cors = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405)
  const auth = request.headers.get('Authorization')
  if (!auth) return json({ error: 'Не авторизован' }, 401)
  const url = Deno.env.get('SUPABASE_URL')!
  const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError || !user) return json({ error: 'Не авторизован' }, 401)
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return json({ error: 'Некорректный JSON' }, 400) }
  const studentId = typeof body.studentId === 'string' ? body.studentId : ''
  const action = body.action
  const password = typeof body.password === 'string' ? body.password : ''
  if (!/^[0-9a-f-]{36}$/i.test(studentId) || !['reset-password', 'archive', 'restore', 'update-profile'].includes(String(action))) return json({ error: 'Некорректный запрос' }, 400)
  const { data: link, error: linkError } = await client.from('teacher_student_links').select('organization_id').eq('teacher_id', user.id).eq('student_id', studentId).maybeSingle()
  if (linkError || !link) return json({ error: 'Недостаточно прав' }, 403)

  if (action === 'reset-password') {
    if (password.length < 8 || password.length > 128) return json({ error: 'Пароль должен содержать от 8 до 128 символов' }, 400)
    const { error } = await admin.auth.admin.updateUserById(studentId, { password })
    if (error) return json({ error: 'Не удалось сменить пароль' }, 400)
    const { error: profileError } = await admin.from('profiles').update({ must_change_password: true }).eq('id', studentId)
    if (profileError) return json({ error: 'Пароль изменён, но профиль не обновлён' }, 500)
  } else if (action === 'archive' || action === 'restore') {
    const archived = action === 'archive'
    const { error: authError } = await admin.auth.admin.updateUserById(studentId, { ban_duration: archived ? '876000h' : 'none' })
    if (authError) return json({ error: 'Не удалось изменить доступ' }, 500)
    const { error: profileError } = await admin.from('profiles').update({ status: archived ? 'archived' : 'active' }).eq('id', studentId)
    if (profileError) return json({ error: 'Доступ изменён, но профиль не обновлён' }, 500)
  } else {
    const className = typeof body.className === 'string' ? body.className.trim() : ''
    const zoomUrl = typeof body.zoomUrl === 'string' ? body.zoomUrl.trim() : ''
    if (className.length > 40 || (zoomUrl && !/^https:\/\/\S+$/i.test(zoomUrl))) return json({ error: 'Проверьте класс и ссылку' }, 400)
    const { error: profileError } = await admin.from('profiles').update({ class_name: className || null }).eq('id', studentId)
    if (profileError) return json({ error: 'Не удалось обновить класс' }, 500)
    const { error: linkUpdateError } = await admin.from('teacher_student_links').update({ default_zoom_url: zoomUrl || null }).eq('teacher_id', user.id).eq('student_id', studentId)
    if (linkUpdateError) return json({ error: 'Не удалось обновить ссылку' }, 500)
  }
  const { error: auditError } = await admin.from('audit_logs').insert({ organization_id: link.organization_id, actor_id: user.id, action: String(action).replace('-', '_'), entity_type: 'profile', entity_id: studentId })
  if (auditError) return json({ error: 'Операция выполнена, но не записана в журнал' }, 500)
  return json({ ok: true })
})
