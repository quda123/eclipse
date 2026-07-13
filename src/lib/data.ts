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

export type AssignmentCard={id:string;title:string;topic:string;deadline:string;status:string;mode:string}
const demoAssignments:AssignmentCard[]=[
  {id:'functions',title:'Функции и их графики',topic:'Функции',deadline:'15 июля, 23:59',status:'В процессе',mode:'automatic'},
  {id:'geometry',title:'Теорема Пифагора · фото-решение',topic:'Геометрия',deadline:'18 июля, 20:00',status:'Не начато',mode:'manual'},
  {id:'fractions',title:'Обыкновенные дроби',topic:'Дроби',deadline:'12 июля, 23:59',status:'Просрочено',mode:'automatic'},
]
async function fetchAssignments():Promise<AssignmentCard[]>{
  if(!supabase)return demoAssignments
  const {data,error}=await supabase.from('homework_assignments').select('id,deadline_at,status,homework_versions(title,mode,topics(name))').order('deadline_at')
  if(error)throw error
  return (data??[]).map(row=>{const version=Array.isArray(row.homework_versions)?row.homework_versions[0]:row.homework_versions;const topics=version?.topics as unknown as {name:string}|{name:string}[]|null;const topicName=Array.isArray(topics)?topics[0]?.name:topics?.name;return{id:row.id,title:version?.title??'Задание',topic:topicName??'Математика',deadline:new Date(row.deadline_at).toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}),status:String(row.status).replaceAll('_',' '),mode:version?.mode??'automatic'}})
}
export const useAssignments=()=>useQuery({queryKey:['assignments'],queryFn:fetchAssignments})

export async function saveTeacherNote(studentId:string,body:string){if(!supabase){localStorage.setItem(`teacher-note:${studentId}`,body);return}const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Не авторизован');const {error}=await supabase.from('teacher_notes').upsert({student_id:studentId,teacher_id:user.id,body});if(error)throw error}
