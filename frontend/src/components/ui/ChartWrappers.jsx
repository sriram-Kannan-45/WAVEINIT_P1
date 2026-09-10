import { Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// Custom tooltip for clean look
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg shadow-md text-xs">
        <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{label}</p>
        {payload.map((item, idx) => (
          <p key={idx} className="text-primary-600 dark:text-primary-400 font-bold">
            {item.name}: {item.value}
          </p>
        ))}
      </div>
    )
  }
  return null
}

const defaultColors = ['#0D9488', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#64748b']

// Area Chart component with gradient background
export function LineAreaChart({
  data,
  xKey = 'name',
  yKey = 'value',
  height = 240,
  strokeColor = '#0D9488',
  fillColorStart = '#5EEAD4',
  fillColorEnd = '#F0FDFA',
}) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={strokeColor} stopOpacity={0.2} />
              <stop offset="95%" stopColor={strokeColor} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-default)" />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 500 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 500 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey={yKey}
            stroke={strokeColor}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#chartGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// Donut Chart with total count in middle
export function DonutChart({
  data,
  colors = defaultColors,
  height = 240,
  innerRadius = 60,
  outerRadius = 80,
  showLegend = true,
}) {
  const total = data.reduce((sum, item) => sum + (item.value || 0), 0)

  return (
    <div className="flex flex-col items-center justify-center relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg shadow-md text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {payload[0].name}: {payload[0].value}
                  </div>
                )
              }
              return null
            }}
          />
          {showLegend && (
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, fontWeight: 500 }}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
      
      {/* Centered Total Label */}
      <div className="absolute flex flex-col items-center justify-center pointer-events-none" style={{ top: showLegend ? '40%' : '50%', transform: 'translateY(-50%)' }}>
        <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{total}</span>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total</span>
      </div>
    </div>
  )
}

export { ProgressBar } from './ProgressBar'

