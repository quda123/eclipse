import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { updateLesson, updateLessonSeries, useLessons } from "./lib/data";

export default function CalendarBoard() {
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
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        locale="ru"
        firstDay={1}
        height="auto"
        slotMinTime="14:00:00"
        slotMaxTime="21:00:00"
        allDaySlot={false}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek",
        }}
        buttonText={{ today: "Сегодня", month: "Месяц", week: "Неделя" }}
        datesSet={({ start, end }) =>
          setVisibleRange({ start: start.toISOString(), end: end.toISOString() })
        }
        events={lessons.map((lesson) => ({
          id: lesson.id,
          title: `${lesson.studentName || "Математика"}${lesson.status === "cancelled" ? " · Отменено" : lesson.status === "moved" ? " · Перенесено" : ""}`,
          start: lesson.startsAt,
          end: lesson.endsAt,
          classNames: [`lesson-${lesson.status}`],
        }))}
        eventClick={({ event }) => {
          if (!teacher) return;
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
