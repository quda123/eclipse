import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { updateLesson, updateLessonSeries, useLessons, useStudentTeachers } from "./lib/data";

export default function CalendarBoard() {
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [visibleRange, setVisibleRange] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 7);
    const end = new Date();
    end.setDate(end.getDate() + 35);
    return { start: start.toISOString(), end: end.toISOString() };
  });
  const { data: lessons = [], isLoading, error } = useLessons(
    visibleRange.start,
    visibleRange.end,
  );
  const teacher = useLocation().pathname.startsWith("/teacher");
  const { data: studentTeachers = [] } = useStudentTeachers(!teacher);
  const teacherOptions = teacher ? [] : studentTeachers.filter((item) => item.status === "active").map((item) => [item.teacherId, item.teacherName] as const);
  const visibleLessons = teacher ? lessons : lessons.filter((lesson) => teacherFilter === "all" || lesson.teacherId === teacherFilter);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null),
    [startsAt, setStartsAt] = useState(""),
    [endsAt, setEndsAt] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [scope, setScope] = useState<"occurrence" | "following" | "series">(
      "occurrence",
    );
  const selectedLesson = lessons.find((lesson) => lesson.id === selected);
  const selectedTeacher = studentTeachers.find((item) => item.teacherId === selectedLesson?.teacherId);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["lessons"] });
  const changeStatus = async (
    status: "scheduled" | "cancelled" | "completed",
  ) => {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      await updateLesson(selected, { status });
      await refresh();
      setSelected(null);
    } catch {
      setMessage("Не удалось изменить занятие.");
    } finally {
      setBusy(false);
    }
  };
  if (isLoading)
    return (
      <section className="panel empty" role="status">
        Загрузка календаря…
      </section>
    );
  if (error)
    return (
      <section className="panel empty form-error" role="alert">
        Не удалось загрузить расписание.
      </section>
    );
  return (
    <div className="calendar-board">
      {!teacher && teacherOptions.length > 1 && <div className="calendar-filter"><select aria-label="Фильтр календаря по преподавателю" value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)}><option value="all">Все преподаватели</option>{teacherOptions.map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></div>}
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        initialDate={calendarDate}
        locale="ru"
        firstDay={1}
        height="auto"
        slotMinTime="08:00:00"
        slotMaxTime="22:00:00"
        allDaySlot={false}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek",
        }}
        buttonText={{ today: "Сегодня", month: "Месяц", week: "Неделя" }}
        datesSet={({ start, end, view }) => {
          setCalendarDate(view.currentStart);
          setVisibleRange({ start: start.toISOString(), end: end.toISOString() });
        }}
        events={visibleLessons.map((lesson) => ({
          id: lesson.id,
          title: teacher ? lesson.studentName : studentTeachers.find((item) => item.teacherId === lesson.teacherId)?.teacherName || "Преподаватель",
          start: lesson.startsAt,
          end: lesson.endsAt,
          classNames: [`lesson-${lesson.status}`],
          extendedProps: { subject: studentTeachers.find((item) => item.teacherId === lesson.teacherId)?.subject || "Занятие", status: lesson.status },
        }))}
        eventContent={({ event }) => <><span>{teacher ? "" : `${event.extendedProps.subject} · `}</span><span>{event.title}</span>{event.extendedProps.status === "cancelled" ? <span> · Отменено</span> : event.extendedProps.status === "moved" ? <span> · Перенесено</span> : null}</>}
        eventClick={({ event }) => {
          if (!teacher) {
            setSelected(event.id);
            return;
          }
          setSelected(event.id);
          setScope("occurrence");
          setStartsAt(
            event.start
              ? new Date(
                  event.start.getTime() -
                    event.start.getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)
              : "",
          );
          setEndsAt(
            event.end
              ? new Date(
                  event.end.getTime() - event.end.getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)
              : "",
          );
        }}
      />
      {!teacher && selectedLesson && <section className="panel calendar-lesson-details" aria-live="polite"><div><p className="eyebrow">ЗАНЯТИЕ</p><h2>{selectedTeacher?.subject || "Занятие"}</h2><p>{selectedTeacher?.teacherName} · {selectedTeacher?.organizationName}</p><p>{new Date(selectedLesson.startsAt).toLocaleString("ru-RU", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p></div><div className="sticky-actions">{selectedLesson.zoomUrl && /^https:\/\//i.test(selectedLesson.zoomUrl) && <a className="button" href={selectedLesson.zoomUrl} target="_blank" rel="noreferrer">Открыть видеоурок</a>}<button type="button" className="button secondary" onClick={() => setSelected(null)}>Закрыть</button></div></section>}
      {teacher && selected && (
        <form
          className="panel form-panel"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              if (scope === "occurrence")
                await updateLesson(selected, { startsAt, endsAt });
              else await updateLessonSeries(selected, scope, startsAt, endsAt);
              await refresh();
              setSelected(null);
            } catch {
              setMessage("Не удалось перенести занятие.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Изменить выбранное занятие</h2>
          <div className="form-row">
            <label>
              Начало
              <input
                type="datetime-local"
                required
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </label>
            <label>
              Окончание
              <input
                type="datetime-local"
                required
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
              />
            </label>
            {selectedLesson?.seriesId && (
              <label>
                Область изменения
                <select
                  value={scope}
                  onChange={(event) =>
                    setScope(event.target.value as typeof scope)
                  }
                >
                  <option value="occurrence">Только это занятие</option>
                  <option value="following">Это и следующие</option>
                  <option value="series">Вся серия</option>
                </select>
              </label>
            )}
          </div>
          <div className="sticky-actions">
            <button className="button" disabled={busy}>
              Перенести
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => changeStatus("cancelled")}
            >
              Отменить
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => changeStatus("scheduled")}
            >
              Восстановить
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => changeStatus("completed")}
            >
              Проведено
            </button>
          </div>
          {message && (
            <p className="form-error" role="alert">
              {message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
