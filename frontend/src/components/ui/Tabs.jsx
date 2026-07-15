export default function Tabs({
  tabs = [],
  activeTab,
  onChange,
  className = '',
}) {
  return (
    <div className={`flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 w-full overflow-x-auto no-scrollbar mb-6 ${className}`}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all duration-150 whitespace-nowrap cursor-pointer -mb-[2px] flex items-center gap-2 ${
              isActive
                ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={`inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 py-0.5 leading-none transition-all duration-150 ${
                isActive
                  ? 'bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
