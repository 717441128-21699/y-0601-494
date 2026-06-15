import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'

const navItems = [
  { to: '/dashboard', label: '工作台', icon: '🏠' },
  { to: '/registration', label: '挂号分诊', icon: '📋' },
  { to: '/queue', label: '候诊队列', icon: '📊' },
  { to: '/diagnosis', label: '诊疗开方', icon: '💊' },
  { to: '/payment', label: '收费结算', icon: '💰' },
  { to: '/medicine', label: '药品库存', icon: '💉' },
  { to: '/device', label: '设备维保', icon: '🔧' },
  { to: '/statistics', label: '统计报表', icon: '📈' },
]

export default function Layout() {
  const location = useLocation()
  const stockAlerts = useAppStore(state => state.stockAlerts)
  const maintenanceOrders = useAppStore(state => state.maintenanceOrders)
  const pendingOrders = maintenanceOrders.filter(o => o.status === 'pending').length

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-60 bg-slate-800 text-white flex flex-col shrink-0">
        <div className="p-5 border-b border-slate-700">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <span className="text-2xl">🐾</span>
            <span>宠物医院系统</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">智能诊疗调度平台</p>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const isActive = location.pathname.startsWith(item.to)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="font-medium">{item.label}</span>
                {item.to === '/medicine' && stockAlerts.length > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                    {stockAlerts.length}
                  </span>
                )}
                {item.to === '/device' && pendingOrders > 0 && (
                  <span className="ml-auto bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
                    {pendingOrders}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        <div className="p-4 border-t border-slate-700 text-xs text-slate-400">
          <p>© 2026 宠物医院智能系统</p>
          <p className="mt-1">v1.0.0</p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              {navItems.find(n => location.pathname.startsWith(n.to))?.label || '工作台'}
            </h2>
            <p className="text-xs text-gray-500">
              {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {stockAlerts.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-sm">
                <span>⚠️</span>
                <span>{stockAlerts.length} 种药品库存预警</span>
              </div>
            )}
            {pendingOrders > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-sm">
                <span>🔧</span>
                <span>{pendingOrders} 个待处理维保工单</span>
              </div>
            )}
            <div className="flex items-center gap-2 pl-4 border-l">
              <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">
                管
              </div>
              <span className="text-sm font-medium">管理员</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
