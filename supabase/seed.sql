-- Development only. Resetting the local database recreates these accounts.
create extension if not exists pgcrypto;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000001','authenticated','authenticated','teacher@users.eclipse.local',crypt('Eclipse-demo-2026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000001','authenticated','authenticated','anna@users.eclipse.local',crypt('Eclipse-demo-2026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000002','authenticated','authenticated','maxim@users.eclipse.local',crypt('Eclipse-demo-2026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000002','authenticated','authenticated','teacher2@users.eclipse.local',crypt('Eclipse-demo-2026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000003','authenticated','authenticated','student2@users.eclipse.local',crypt('Eclipse-demo-2026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
update auth.users set
  confirmation_token='',
  recovery_token='',
  email_change_token_new='',
  email_change='',
  phone_change='',
  phone_change_token='',
  email_change_token_current='',
  reauthentication_token=''
where id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003'
);
insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values
('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','{"sub":"10000000-0000-0000-0000-000000000001","email":"teacher@users.eclipse.local"}','email',now(),now(),now()),
('70000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','{"sub":"20000000-0000-0000-0000-000000000001","email":"anna@users.eclipse.local"}','email',now(),now(),now()),
('70000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','{"sub":"20000000-0000-0000-0000-000000000002","email":"maxim@users.eclipse.local"}','email',now(),now(),now());
insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values
('70000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','{"sub":"10000000-0000-0000-0000-000000000002","email":"teacher2@users.eclipse.local"}','email',now(),now(),now()),
('70000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','{"sub":"20000000-0000-0000-0000-000000000003","email":"student2@users.eclipse.local"}','email',now(),now(),now());

insert into public.organizations(id,name) values('30000000-0000-0000-0000-000000000001','Eclipse Demo');
insert into public.profiles(id,username,first_name,last_name,class_name,must_change_password) values
('10000000-0000-0000-0000-000000000001','teacher','Мария','Соколова',null,false),
('20000000-0000-0000-0000-000000000001','anna','Анна','Волкова','8 класс',false),
('20000000-0000-0000-0000-000000000002','maxim','Максим','Орлов','7 класс',false);
insert into public.organization_members values
('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','owner'),
('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','student'),
('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','student');
insert into public.teacher_student_links(teacher_id,student_id,organization_id,default_zoom_url) values
('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','https://zoom.us/j/demo-anna'),
('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','https://zoom.us/j/demo-maxim');
insert into public.subjects(id,organization_id,name) values('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Математика');
insert into public.topics(id,subject_id,name) values
('41000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Функции'),
('41000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','Дроби'),
('41000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','Геометрия');
insert into public.homeworks(id,organization_id,teacher_id,title) values
('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Функции и их графики'),
('50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Теорема Пифагора');
insert into public.homework_versions(id,homework_id,organization_id,teacher_id,subject_id,topic_id,title,mode,attempts_allowed,published_at) values
('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','Функции и их графики','automatic',2,now()),
('51000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000003','Теорема Пифагора','manual',1,now());
insert into public.homework_questions(id,homework_version_id,position,prompt) values
('52000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001',1,'Найдите значение y = 2x + 1 при x = 3'),
('52000000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000001',2,'Как называется график функции y = x²?');
insert into public.question_accepted_answers(question_id,value) values('52000000-0000-0000-0000-000000000001','7'),('52000000-0000-0000-0000-000000000002','парабола');
insert into public.homework_assignments(id,homework_version_id,student_id,deadline_at,timezone,status) values
('53000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',now()+interval '3 days','Europe/Moscow','in_progress'),
('53000000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',now()+interval '5 days','Europe/Moscow','not_started'),
('53000000-0000-0000-0000-000000000003','51000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',now()-interval '1 day','Europe/Moscow','overdue');
insert into public.lessons(id,organization_id,teacher_id,student_id,starts_at,ends_at,timezone,zoom_url) values
('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',date_trunc('day',now())+interval '16 hours',date_trunc('day',now())+interval '16 hours 50 minutes','Europe/Moscow','https://zoom.us/j/demo-anna'),
('60000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',date_trunc('day',now())+interval '18 hours',date_trunc('day',now())+interval '18 hours 50 minutes','Europe/Moscow','https://zoom.us/j/demo-maxim');
insert into public.notifications(user_id,kind,title,href,dedupe_key) values
('10000000-0000-0000-0000-000000000001','submission','Анна загрузила фотографии','/teacher/review','submission:demo'),
('20000000-0000-0000-0000-000000000001','homework','Новое задание: Функции','/student/homework/53000000-0000-0000-0000-000000000001','homework:functions');

-- Второй изолированный tenant для RLS-проверок.
insert into public.organizations(id,name) values('30000000-0000-0000-0000-000000000002','Eclipse RLS Tenant B');
insert into public.profiles(id,username,first_name,last_name,class_name,must_change_password) values
('10000000-0000-0000-0000-000000000002','teacher2','Ольга','Петрова',null,false),
('20000000-0000-0000-0000-000000000003','student2','Ирина','Смирнова','9 класс',false);
insert into public.organization_members values
('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','teacher'),
('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000003','student'),
('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','student');
insert into public.teacher_student_links(teacher_id,student_id,organization_id) values('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000002');

insert into public.manual_tasks(homework_version_id,position,prompt,max_points) values
('51000000-0000-0000-0000-000000000002',1,'Докажите теорему Пифагора',2),
('51000000-0000-0000-0000-000000000002',2,'Решите задачу на применение теоремы',3);
insert into public.attempts(id,assignment_id,student_id,attempt_number,answers,score,maximum_score,idempotency_key,started_at,duration_seconds,submitted_at) values
('54000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,'{"52000000-0000-0000-0000-000000000001":"7","52000000-0000-0000-0000-000000000002":"гипербола"}',1,2,'55000000-0000-0000-0000-000000000001',now()-interval '25 minutes',1500,now()),
('54000000-0000-0000-0000-000000000002','53000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',2,'{"52000000-0000-0000-0000-000000000001":"7","52000000-0000-0000-0000-000000000002":"парабола"}',2,2,'55000000-0000-0000-0000-000000000002',now()-interval '15 minutes',900,now());
insert into public.assignment_deadline_extensions(assignment_id,extended_until,reason,created_by) values('53000000-0000-0000-0000-000000000003',now()+interval '2 days','Болезнь','10000000-0000-0000-0000-000000000001');

-- Комбинированное задание с проверенным итогом.
insert into public.homeworks(id,organization_id,teacher_id,title) values
('50000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Комбинированная работа по дробям');
insert into public.homework_versions(id,homework_id,organization_id,teacher_id,subject_id,topic_id,title,mode,attempts_allowed,published_at) values
('51000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000002','Комбинированная работа по дробям','combined',2,now());
insert into public.homework_questions(id,homework_version_id,position,prompt) values
('52000000-0000-0000-0000-000000000003','51000000-0000-0000-0000-000000000003',1,'Сколько четвертей в числе 3/4?');
insert into public.question_accepted_answers(question_id,value) values
('52000000-0000-0000-0000-000000000003','3');
insert into public.manual_tasks(homework_version_id,position,prompt,max_points) values
('51000000-0000-0000-0000-000000000003',1,'Покажите дробь 3/4 на рисунке',4);
insert into public.homework_assignments(id,homework_version_id,student_id,deadline_at,timezone,status) values
('53000000-0000-0000-0000-000000000004','51000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001',now()+interval '7 days','Europe/Moscow','reviewed');
insert into public.attempts(id,assignment_id,student_id,attempt_number,answers,score,maximum_score,idempotency_key,started_at,duration_seconds,submitted_at) values
('54000000-0000-0000-0000-000000000003','53000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001',1,'{"52000000-0000-0000-0000-000000000003":"3"}',1,1,'55000000-0000-0000-0000-000000000003',now()-interval '20 minutes',600,now()-interval '10 minutes');
insert into public.manual_submissions(id,assignment_id,student_id,version,submitted_at,reviewed_at) values
('56000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001',1,now()-interval '9 minutes',now()-interval '2 minutes');
insert into public.manual_submission_versions(id,submission_id,version,submitted_at) values
('57000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000001',1,now()-interval '9 minutes');
insert into public.manual_task_scores(submission_id,task_number,manual_task_id,points)
select '56000000-0000-0000-0000-000000000001',position,id,2 from public.manual_tasks
where homework_version_id='51000000-0000-0000-0000-000000000003' and position=1;

-- Еженедельная серия и перенесённое отдельное занятие.
insert into public.lesson_series(id,organization_id,teacher_id,student_id,rrule,timezone,zoom_url) values
('61000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','FREQ=WEEKLY','Europe/Moscow','https://zoom.us/j/demo-anna');
insert into public.lessons(id,series_id,organization_id,teacher_id,student_id,starts_at,ends_at,timezone,zoom_url,status,original_occurrence) values
('60000000-0000-0000-0000-000000000003','61000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',date_trunc('day',now())+interval '3 days 17 hours',date_trunc('day',now())+interval '3 days 17 hours 50 minutes','Europe/Moscow','https://zoom.us/j/demo-anna','moved',date_trunc('day',now())+interval '3 days 16 hours'),
('60000000-0000-0000-0000-000000000004','61000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',date_trunc('day',now())+interval '24 days 17 hours',date_trunc('day',now())+interval '24 days 17 hours 50 minutes','Europe/Moscow','https://zoom.us/j/demo-anna','scheduled',date_trunc('day',now())+interval '24 days 17 hours');

do $$ declare item record; begin
  for item in select id from public.homework_assignments loop
    perform public.recalculate_assignment_result(item.id);
  end loop;
end $$;
