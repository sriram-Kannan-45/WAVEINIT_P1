import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

function ProgressCard({ 
  label, 
  value, 
  icon, 
  theme = 'blue',
  trend = null,
  description = ''
}) {
  const themeClasses = {
    blue: 'from-blue-50 to-blue-100 border-blue-200',
    green: 'from-green-50 to-green-100 border-green-200',
    primary: 'from-primary-50 to-primary-100 border-primary-200',
    orange: 'from-orange-50 to-orange-100 border-orange-200',
    red: 'from-red-50 to-red-100 border-red-200'
  }

  const textColor = {
    blue: 'text-blue-700',
    green: 'text-green-700',
    primary: 'text-primary-700',
    orange: 'text-orange-700',
    red: 'text-red-700'
  }

  return (
    <div className={`bg-gradient-to-br ${themeClasses[theme]} border rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-gray-600 text-sm font-medium">{label}</p>
          <p className={`text-3xl font-bold ${textColor[theme]} mt-2`}>{value}</p>
          {description && <p className="text-gray-500 text-xs mt-1">{description}</p>}
        </div>
        {icon && <div className="text-4xl opacity-20">{icon}</div>}
      </div>
      {trend && (
        <div className="flex items-center gap-1 text-sm">
          {trend.direction === 'up' ? (
            <>
              <TrendingUp className="w-4 h-4 text-green-600" />
              <span className="text-green-600 font-semibold">{trend.value}%</span>
            </>
          ) : (
            <>
              <TrendingDown className="w-4 h-4 text-red-600" />
              <span className="text-red-600 font-semibold">{trend.value}%</span>
            </>
          )}
          <span className="text-gray-500">vs last month</span>
        </div>
      )}
    </div>
  )
}

export default ProgressCard
