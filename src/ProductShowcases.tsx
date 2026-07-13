import { CalendarDays, Check, Crop, RotateCw, Upload } from "lucide-react";

const BenefitList = ({items}:{items:string[]}) => <ul className="showcase-benefits">{items.map((item)=><li key={item}><Check size={15}/>{item}</li>)}</ul>;

export function ProductShowcases(){
  return <section id="features" className="showcases">
    <article className="showcase">
      <div className="showcase-copy"><p className="eyebrow">РИТМ ОБУЧЕНИЯ</p><h2>Расписание, задания и Zoom-ссылка всегда под рукой</h2><p>Ученик видит ближайшее занятие, дедлайны и домашние задания в одном кабинете. Всё необходимое для подготовки находится рядом и не теряется в переписках.</p><BenefitList items={["ближайшее занятие","персональная Zoom-ссылка","календарь","активные домашние задания","точные сроки сдачи","важные уведомления"]}/></div>
      <div className="rhythm-preview product-preview">
        <div className="preview-top"><span>Следующее занятие</span><b>Сегодня · 18:00</b></div>
        <h3>Линейные уравнения</h3><button>Подключиться к Zoom</button>
        <div className="mini-calendar"><header><CalendarDays size={17}/> Июль 2026</header><div>{["Пн","Вт","Ср","Чт","Пт","Сб","Вс",...Array.from({length:31},(_,i)=>String(i+1))].map((d,i)=><span className={d==="15"?"active":""} key={`${d}-${i}`}>{d}</span>)}</div></div>
        <div className="preview-homework"><div><small>Домашнее задание</small><strong>Линейные уравнения</strong></div><div><span>до 15 июля, 23:59</span><b>В процессе</b></div></div>
      </div>
    </article>
    <article className="showcase reverse">
      <div className="assignment-preview product-preview">
        <div className="result-score"><span>Результат</span><strong>16 <small>из 17</small></strong><p><b>16 верно</b><i>1 ошибка</i><em>2 из 3 попыток</em></p></div>
        <div className="solution-pages">{[1,2,3].map((page)=><div key={page}><span>{page}</span><i></i><i></i><i></i><footer><Crop size={14}/><RotateCw size={14}/></footer></div>)}</div>
        <div className="upload-row"><Upload size={18}/><div><b>Загрузка решения</b><span><i></i></span></div><strong>100%</strong></div><p className="submitted">Отправлено преподавателю</p>
      </div>
      <div className="showcase-copy"><p className="eyebrow">ЯСНЫЕ ЗАДАНИЯ</p><h2>Автоматическая проверка и удобная сдача письменных решений</h2><p>Тестовую часть Eclipse проверяет сразу, а письменные решения ученик фотографирует, обрезает, упорядочивает и отправляет преподавателю прямо внутри платформы.</p><BenefitList items={["автопроверка тестов","результат сразу после попытки","несколько попыток","учитывается лучший результат","загрузка фотографий с телефона","обрезка, поворот и изменение порядка страниц"]}/></div>
    </article>
    <article className="showcase">
      <div className="showcase-copy"><p className="eyebrow">ЗАМЕТНЫЙ ПРОГРЕСС</p><h2>Результаты складываются в понятную картину роста</h2><p>Преподаватель видит, кто выполнил работу, где возникают трудности и как меняются результаты по темам. Ученик получает ясное представление о собственном прогрессе.</p><BenefitList items={["средний результат","динамика по темам","история домашних заданий","выполненные и просроченные работы","результаты всех попыток","сводка по каждому ученику"]}/></div>
      <div className="analytics-preview product-preview"><div className="analytics-metrics"><div><span>Средний результат</span><strong>86%</strong></div><div><span>Выполнено</span><strong>14/16</strong></div><div><span>Просрочено</span><strong>1</strong></div></div><div className="fake-chart"><svg viewBox="0 0 500 150" preserveAspectRatio="none"><polyline points="0,125 80,105 160,112 240,68 320,76 400,34 500,18"/></svg></div><div className="topic-bars">{[["Дроби",74],["Линейные уравнения",92],["Функции",86],["Геометрия",78]].map(([name,value])=><div key={name}><span>{name}</span><i><b style={{width:`${value}%`}}/></i><strong>{value}%</strong></div>)}</div><table><tbody><tr><td>Функции и графики</td><td>92%</td><td>Проверено</td></tr><tr><td>Теорема Пифагора</td><td>84%</td><td>Проверено</td></tr></tbody></table></div>
    </article>
  </section>
}
