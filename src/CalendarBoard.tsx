import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

export default function CalendarBoard() {
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
        events={[
          {
            title: "Анна Волкова · Уравнения",
            start: "2026-07-13T16:00:00",
            end: "2026-07-13T16:50:00",
          },
          {
            title: "Максим Орлов · Дроби",
            start: "2026-07-15T18:00:00",
            end: "2026-07-15T18:50:00",
          },
        ]}
      />
    </div>
  );
}
