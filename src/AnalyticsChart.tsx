import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const data = [
  { name: "Неделя 1", result: 68 },
  { name: "Неделя 2", result: 76 },
  { name: "Неделя 3", result: 82 },
  { name: "Неделя 4", result: 92 },
];
export default function AnalyticsChart() {
  return (
    <div
      className="chart"
      role="img"
      aria-label="Результат вырос с 68 до 92 процентов за четыре недели"
    >
      <ResponsiveContainer width="100%" height={230}>
        <LineChart
          data={data}
          margin={{ top: 16, right: 12, bottom: 0, left: -16 }}
        >
          <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
          <XAxis
            dataKey="name"
            stroke="#8fa5ab"
            tickLine={false}
            axisLine={false}
            fontSize={10}
          />
          <YAxis
            domain={[0, 100]}
            stroke="#8fa5ab"
            tickLine={false}
            axisLine={false}
            fontSize={10}
          />
          <Tooltip
            contentStyle={{
              background: "#062630",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 8,
            }}
          />
          <Line
            type="monotone"
            dataKey="result"
            name="Результат"
            stroke="#d5c189"
            strokeWidth={3}
            dot={{ fill: "#d5c189", strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
