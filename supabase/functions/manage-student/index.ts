import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors})
  const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const auth=request.headers.get('Authorization')??''
  const client=createClient(url,anon,{global:{headers:{Authorization:auth}}}),admin=createClient(url,service)
  const {data:{user}}=await client.auth.getUser();if(!user)return Response.json({error:'Не авторизован'},{status:401,headers:cors})
  const {studentId,action,password}=await request.json()
  const {data:link}=await client.from('teacher_student_links').select('student_id').eq('teacher_id',user.id).eq('student_id',studentId).maybeSingle()
  if(!link)return Response.json({error:'Недостаточно прав'},{status:403,headers:cors})
  if(action==='reset-password'){
    if(typeof password!=='string'||password.length<8)return Response.json({error:'Пароль должен содержать минимум 8 символов'},{status:400,headers:cors})
    const {error}=await admin.auth.admin.updateUserById(studentId,{password});if(error)return Response.json({error:'Не удалось сменить пароль'},{status:400,headers:cors})
    await admin.from('profiles').update({must_change_password:true}).eq('id',studentId)
  }else if(action==='archive'||action==='restore'){
    const archived=action==='archive';await admin.auth.admin.updateUserById(studentId,{ban_duration:archived?'876000h':'none'});await admin.from('profiles').update({status:archived?'archived':'active'}).eq('id',studentId)
  }else return Response.json({error:'Неизвестное действие'},{status:400,headers:cors})
  return Response.json({ok:true},{headers:cors})
})
