import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

export type StudentCard={id:string;name:string;className:string;topic:string;result:number;overdue:number;activity:string}
export const demoStudents:StudentCard[]=[
  {id:'anna',name:'Анна Волкова',className:'8 класс',topic:'Линейные уравнения',result:92,overdue:0,activity:'12 минут назад'},
  {id:'max',name:'Максим Орлов',className:'7 класс',topic:'Дроби',result:74,overdue:2,activity:'вчера'},
  {id:'sofia',name:'София Лебедева',className:'9 класс',topic:'Функции',result:86,overdue:1,activity:'2 часа назад'},
]

async function fetchStudents():Promise<StudentCard[]>{
  if(!supabase)return demoStudents
  const {data,error}=await supabase.from('profiles').select('id,first_name,last_name,class_name,updated_at').order('last_name')
  if(error)throw error
  return (data??[]).map(profile=>({id:profile.id,name:`${profile.first_name} ${profile.last_name}`,className:profile.class_name??'—',topic:'Математика',result:0,overdue:0,activity:new Date(profile.updated_at).toLocaleDateString('ru-RU')}))
}
export const useStudents=()=>useQuery({queryKey:['students'],queryFn:fetchStudents})

export type AssignmentCard={id:string;title:string;topic:string;deadline:string;deadlineAt:string;status:string;mode:string}
const demoAssignments:AssignmentCard[]=[
  {id:'functions',title:'Функции и их графики',topic:'Функции',deadline:'15 июля, 23:59',deadlineAt:'2026-07-15T23:59:00',status:'В процессе',mode:'automatic'},
  {id:'geometry',title:'Теорема Пифагора · фото-решение',topic:'Геометрия',deadline:'18 июля, 20:00',deadlineAt:'2026-07-18T20:00:00',status:'Не начато',mode:'manual'},
  {id:'fractions',title:'Обыкновенные дроби',topic:'Дроби',deadline:'12 июля, 23:59',deadlineAt:'2026-07-12T23:59:00',status:'Просрочено',mode:'automatic'},
]
async function fetchAssignments():Promise<AssignmentCard[]>{
  if(!supabase)return demoAssignments
  const {data,error}=await supabase.from('homework_assignments').select('id,deadline_at,status,homework_versions(title,mode,topics(name))').order('deadline_at')
  if(error)throw error
  const labels:Record<string,string>={not_started:'Не начато',in_progress:'В процессе',submitted:'Сдано',awaiting_review:'Ожидает проверки',reviewed:'Проверено',overdue:'Просрочено',returned:'Возвращено'}
  return (data??[]).map(row=>{const version=Array.isArray(row.homework_versions)?row.homework_versions[0]:row.homework_versions;const topics=version?.topics as unknown as {name:string}|{name:string}[]|null;const topicName=Array.isArray(topics)?topics[0]?.name:topics?.name;return{id:row.id,title:version?.title??'Задание',topic:topicName??'Математика',deadline:new Date(row.deadline_at).toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}),deadlineAt:row.deadline_at,status:labels[row.status]??row.status,mode:version?.mode??'automatic'}})
}
export const useAssignments=()=>useQuery({queryKey:['assignments'],queryFn:fetchAssignments})

export type LessonCard={id:string;startsAt:string;endsAt:string;studentName:string;status:string;zoomUrl:string|null}
async function fetchLessons():Promise<LessonCard[]>{
  if(!supabase)return []
  const from=new Date();from.setHours(0,0,0,0)
  const to=new Date(from);to.setDate(to.getDate()+14)
  const {data,error}=await supabase.from('lessons').select('id,starts_at,ends_at,status,zoom_url,profiles!lessons_student_id_fkey(first_name,last_name)').gte('starts_at',from.toISOString()).lt('starts_at',to.toISOString()).order('starts_at')
  if(error)throw error
  return (data??[]).map(row=>{const profile=Array.isArray(row.profiles)?row.profiles[0]:row.profiles;return{id:row.id,startsAt:row.starts_at,endsAt:row.ends_at,studentName:profile?`${profile.first_name} ${profile.last_name}`:'Ученик',status:row.status,zoomUrl:row.zoom_url}})
}
export const useLessons=()=>useQuery({queryKey:['lessons'],queryFn:fetchLessons})

export type NotificationCard={id:string;title:string;href:string;kind:string;createdAt:string;readAt:string|null}
async function fetchNotifications():Promise<NotificationCard[]>{
  if(!supabase)return []
  const {data,error}=await supabase.from('notifications').select('id,title,href,kind,created_at,read_at').order('created_at',{ascending:false}).limit(50)
  if(error)throw error
  return (data??[]).map(row=>({id:row.id,title:row.title,href:row.href,kind:row.kind,createdAt:row.created_at,readAt:row.read_at}))
}
export const useNotifications=()=>useQuery({queryKey:['notifications'],queryFn:fetchNotifications})
export async function markAllNotificationsRead(){if(!supabase)return;const {error}=await supabase.rpc('mark_all_notifications_read');if(error)throw error}

export async function createHomework(input:{title:string;mode:'automatic'|'manual'|'combined';question:string;answer:string;deadline:string;attempts:number;studentIds:string[]}){
  if(!supabase)throw new Error('Supabase не настроен')
  const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Не авторизован')
  const {data:membership,error:memberError}=await supabase.from('organization_members').select('organization_id').eq('user_id',user.id).single();if(memberError)throw memberError
  const organizationId=membership.organization_id
  const {data:homework,error:homeworkError}=await supabase.from('homeworks').insert({organization_id:organizationId,teacher_id:user.id,title:input.title}).select('id').single();if(homeworkError)throw homeworkError
  const {data:version,error:versionError}=await supabase.from('homework_versions').insert({organization_id:organizationId,teacher_id:user.id,homework_id:homework.id,title:input.title,mode:input.mode,attempts_allowed:input.attempts,published_at:new Date().toISOString()}).select('id').single();if(versionError)throw versionError
  if(input.mode!=='manual'){
    const {data:question,error:questionError}=await supabase.from('homework_questions').insert({homework_version_id:version.id,position:1,prompt:input.question}).select('id').single();if(questionError)throw questionError
    const {error:answerError}=await supabase.from('question_accepted_answers').insert({question_id:question.id,value:input.answer});if(answerError)throw answerError
  }
  if(input.studentIds.length){const {error:assignmentError}=await supabase.from('homework_assignments').insert(input.studentIds.map(studentId=>({homework_version_id:version.id,student_id:studentId,deadline_at:new Date(input.deadline).toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})));if(assignmentError)throw assignmentError}
  return homework.id
}

export type AssignmentDetail={id:string;title:string;deadlineAt:string;attemptsAllowed:number;questions:{id:string;prompt:string;position:number}[];draft:Record<string,string>}
async function fetchAssignment(id:string):Promise<AssignmentDetail>{
  if(!supabase || localStorage.getItem('eclipse-demo-role')) return {id,title:'Функции и их графики',deadlineAt:'2026-07-15T23:59:00',attemptsAllowed:2,questions:[{id:'q1',prompt:'Найдите значение y = 2x + 1 при x = 3',position:1},{id:'q2',prompt:'Как называется график функции y = x²?',position:2}],draft:JSON.parse(localStorage.getItem(`eclipse-attempt:${id}`)??'{}')}
  const {data,error}=await supabase.from('homework_assignments').select('id,deadline_at,homework_versions(title,attempts_allowed,homework_questions(id,prompt,position))').eq('id',id).single();if(error)throw error
  const version=Array.isArray(data.homework_versions)?data.homework_versions[0]:data.homework_versions
  const {data:draft}=await supabase.from('attempt_drafts').select('answers').eq('assignment_id',id).maybeSingle()
  return{id:data.id,title:version?.title??'Задание',deadlineAt:data.deadline_at,attemptsAllowed:version?.attempts_allowed??1,questions:[...(version?.homework_questions??[])].sort((a,b)=>a.position-b.position),draft:(draft?.answers as Record<string,string>)??{}}
}
export const useAssignment=(id:string,enabled=true)=>useQuery({queryKey:['assignment',id],queryFn:()=>fetchAssignment(id),enabled:Boolean(id)&&enabled})
export async function saveAttemptDraft(assignmentId:string,answers:Record<string,string>){if(!supabase || localStorage.getItem('eclipse-demo-role')){localStorage.setItem(`eclipse-attempt:${assignmentId}`,JSON.stringify(answers));return}const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Не авторизован');const {error}=await supabase.from('attempt_drafts').upsert({assignment_id:assignmentId,student_id:user.id,answers},{onConflict:'assignment_id,student_id'});if(error)throw error}
export async function submitAttempt(assignmentId:string,answers:Record<string,string>){if(!supabase || localStorage.getItem('eclipse-demo-role')) return null;const {data,error}=await supabase.rpc('submit_attempt',{p_assignment:assignmentId,p_answers:answers,p_idempotency:crypto.randomUUID()});if(error)throw error;return data?.[0]??null}

export async function saveTeacherNote(studentId:string,body:string){if(!supabase){localStorage.setItem(`teacher-note:${studentId}`,body);return}const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Не авторизован');const {error}=await supabase.from('teacher_notes').upsert({student_id:studentId,teacher_id:user.id,body});if(error)throw error}
