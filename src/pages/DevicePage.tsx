import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { Device, MaintenanceOrder } from '../types'

export default function DevicePage() {
  const { devices, maintenanceOrders, loadDevices, loadMaintenanceOrders } = useAppStore()
  const [activeTab, setActiveTab] = useState<'devices' | 'maintenance'>('devices')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [showLogModal, setShowLogModal] = useState(false)
  const [logForm, setLogForm] = useState({ duration: '', operator: '' })
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [orderForm, setOrderForm] = useState({
    deviceId: '', teamId: '', priority: 'normal', description: '', scheduledDate: ''
  })

  const statusLabels: Record<string, { label: string; cls: string }> = {
    normal: { label: '正常', cls: 'badge-green' },
    needs_maintenance: { label: '待维保', cls: 'badge-yellow' },
    in_maintenance: { label: '维保中', cls: 'badge-blue' },
    fault: { label: '故障', cls: 'badge-red' }
  }

  const priorityLabels: Record<string, { label: string; cls: string }> = {
    low: { label: '低', cls: 'badge-gray' },
    normal: { label: '普通', cls: 'badge-blue' },
    high: { label: '高', cls: 'badge-orange' },
    urgent: { label: '紧急', cls: 'badge-red' }
  }

  const orderStatusLabels: Record<string, { label: string; cls: string }> = {
    pending: { label: '待处理', cls: 'badge-yellow' },
    in_progress: { label: '处理中', cls: 'badge-blue' },
    completed: { label: '已完成', cls: 'badge-green' },
    cancelled: { label: '已取消', cls: 'badge-gray' }
  }

  const filteredDevices = devices.filter(d =>
    statusFilter === 'all' ? true : d.status === statusFilter
  )

  const totalRuntime = devices.reduce((s, d) => s + d.total_run_hours, 0)
  const needsMaintenance = devices.filter(d => d.status === 'needs_maintenance').length
  const avgUtilization = devices.length > 0
    ? (devices.reduce((s, d) => s + (d.total_run_hours / d.maintenance_interval_hours), 0) / devices.length) * 100
    : 0

  const handleLogUsage = async () => {
    if (!selectedDevice || !logForm.duration) return
    const result = await window.api.device.logUsage({
      deviceId: selectedDevice.id,
      durationHours: parseFloat(logForm.duration),
      operator: logForm.operator || '系统'
    })
    if (result.success) {
      alert('✅ 使用记录已提交')
      setShowLogModal(false)
      setLogForm({ duration: '', operator: '' })
      setSelectedDevice(null)
      await loadDevices()
    } else {
      alert(result.error)
    }
  }

  const handleGenerateOrders = async () => {
    if (!confirm('将自动扫描所有达到维保周期的设备并生成工单，是否继续？')) return
    const result = await window.api.device.generateMaintenance()
    if (result.success) {
      if (result.data && result.data.length > 0) {
        alert(`✅ 已生成 ${result.data.length} 个维保工单`)
      } else {
        alert('暂无需要维保的设备')
      }
      await loadMaintenanceOrders()
      await loadDevices()
    }
  }

  const handleCreateOrder = async () => {
    if (!orderForm.deviceId) {
      alert('请选择设备')
      return
    }
    const teams = await window.api.query('SELECT * FROM maintenance_teams')
    const teamId = orderForm.teamId ? parseInt(orderForm.teamId) : (teams.data?.[0]?.id || 1)

    const result = await window.api.query(
      `INSERT INTO maintenance_orders (device_id, team_id, order_type, priority, description, status, scheduled_date)
       VALUES (?, ?, 'manual', ?, ?, 'pending', ?)`,
      [parseInt(orderForm.deviceId), teamId, orderForm.priority, orderForm.description,
        orderForm.scheduledDate || new Date(Date.now() + 86400000).toISOString().split('T')[0]]
    )
    if (result.success) {
      alert('✅ 工单创建成功')
      setShowOrderModal(false)
      setOrderForm({ deviceId: '', teamId: '', priority: 'normal', description: '', scheduledDate: '' })
      await loadMaintenanceOrders()
    } else {
      alert(result.error)
    }
  }

  const handleOrderStatus = async (order: MaintenanceOrder, newStatus: string) => {
    const updates = newStatus === 'completed'
      ? [newStatus, new Date().toISOString().split('T')[0], order.id]
      : [newStatus, order.id]
    const sql = newStatus === 'completed'
      ? 'UPDATE maintenance_orders SET status = ?, completed_date = ? WHERE id = ?'
      : 'UPDATE maintenance_orders SET status = ? WHERE id = ?'

    const result = await window.api.query(sql, updates as any)
    if (result.success) {
      if (newStatus === 'completed') {
        await window.api.query(
          `UPDATE devices SET status = 'normal', total_run_hours = 0, last_maintenance_date = ? 
           WHERE id = (SELECT device_id FROM maintenance_orders WHERE id = ?)`,
          [new Date().toISOString().split('T')[0], order.id]
        )
        await loadDevices()
      }
      await loadMaintenanceOrders()
    }
  }

  const pendingOrders = maintenanceOrders.filter(o => o.status === 'pending')
  const inProgressOrders = maintenanceOrders.filter(o => o.status === 'in_progress')
  const completedOrders = maintenanceOrders.filter(o => o.status === 'completed')

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="grid grid-cols-5 gap-4 shrink-0">
        <div className="card card-body !p-5 flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center text-3xl">🖥️</div>
          <div>
            <p className="text-sm text-gray-500">设备总数</p>
            <p className="text-3xl font-bold text-blue-600">{devices.length}</p>
          </div>
        </div>
        <div className="card card-body !p-5 flex items-center gap-4">
          <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center text-3xl">⏱️</div>
          <div>
            <p className="text-sm text-gray-500">累计运行</p>
            <p className="text-3xl font-bold text-green-600">{totalRuntime.toFixed(0)}h</p>
          </div>
        </div>
        <div className="card card-body !p-5 flex items-center gap-4">
          <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center text-3xl">📊</div>
          <div>
            <p className="text-sm text-gray-500">平均使用率</p>
            <p className="text-3xl font-bold text-purple-600">{avgUtilization.toFixed(1)}%</p>
          </div>
        </div>
        <div className={`card card-body !p-5 flex items-center gap-4 ${needsMaintenance > 0 ? 'border-amber-300 border-2' : ''}`}>
          <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center text-3xl">⚠️</div>
          <div>
            <p className="text-sm text-gray-500">待维保</p>
            <p className={`text-3xl font-bold ${needsMaintenance > 0 ? 'text-amber-600' : 'text-gray-600'}`}>{needsMaintenance}</p>
          </div>
        </div>
        <div className="card card-body !p-5 flex items-center gap-4">
          <div className="w-14 h-14 bg-cyan-100 rounded-xl flex items-center justify-center text-3xl">📋</div>
          <div>
            <p className="text-sm text-gray-500">待处理工单</p>
            <p className={`text-3xl font-bold ${pendingOrders.length > 0 ? 'text-cyan-600' : 'text-gray-600'}`}>{pendingOrders.length}</p>
          </div>
        </div>
      </div>

      <div className="card shrink-0">
        <div className="card-header !py-3">
          <div className="flex items-center justify-between">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('devices')}
                className={`px-5 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'devices' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
                }`}
              >
                🖥️ 设备管理
              </button>
              <button
                onClick={() => setActiveTab('maintenance')}
                className={`px-5 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                  activeTab === 'maintenance' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
                }`}
              >
                🔧 维保工单
                {pendingOrders.length > 0 && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingOrders.length}</span>}
              </button>
            </div>

            <div className="flex gap-2">
              {activeTab === 'devices' ? (
                <>
                  <select
                    className="input !w-36 !py-1.5 text-sm"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                  >
                    <option value="all">全部状态</option>
                    <option value="normal">正常运行</option>
                    <option value="needs_maintenance">待维保</option>
                    <option value="in_maintenance">维保中</option>
                    <option value="fault">故障</option>
                  </select>
                  <button className="btn-secondary text-sm" onClick={() => { loadDevices(); loadMaintenanceOrders() }}>🔄 刷新</button>
                  <button className="btn-primary text-sm" onClick={() => setShowLogModal(true)}>
                    📝 记录使用
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-secondary text-sm" onClick={handleGenerateOrders}>
                    🤖 自动生成工单
                  </button>
                  <button className="btn-primary text-sm" onClick={() => setShowOrderModal(true)}>
                    + 创建工单
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card flex-1 overflow-hidden flex flex-col">
        <div className="overflow-y-auto flex-1">
          {activeTab === 'devices' ? (
            filteredDevices.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-5xl mb-3">🖥️</div>
                暂无设备
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4 p-5">
                {filteredDevices.map(device => {
                  const utilization = (device.total_run_hours / device.maintenance_interval_hours) * 100
                  const status = statusLabels[device.status]
                  return (
                    <div
                      key={device.id}
                      className={`rounded-xl border-2 overflow-hidden transition-all hover:shadow-lg ${
                        device.status === 'needs_maintenance' ? 'border-amber-300' :
                          device.status === 'fault' ? 'border-red-300' : 'border-gray-100'
                      }`}
                    >
                      <div className={`h-2 ${
                        utilization >= 100 ? 'bg-red-500' : utilization >= 80 ? 'bg-amber-500' :
                          utilization >= 50 ? 'bg-blue-500' : 'bg-green-500'
                      }`} style={{ width: `${Math.min(utilization, 100)}%` }}></div>
                      <div className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-bold text-lg">{device.name}</h4>
                            <p className="text-xs text-gray-500">{device.model}</p>
                          </div>
                          <span className={status.cls}>{status.label}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                          <div className="bg-gray-50 rounded-lg p-2">
                            <p className="text-xs text-gray-500">所属科室</p>
                            <p className="font-medium">{device.department_name || '-'}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2">
                            <p className="text-xs text-gray-500">位置</p>
                            <p className="font-medium">{device.room || '-'}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2">
                            <p className="text-xs text-gray-500">累计运行</p>
                            <p className="font-mono font-bold text-blue-600">{device.total_run_hours.toFixed(1)}h</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2">
                            <p className="text-xs text-gray-500">维保周期</p>
                            <p className="font-mono">{device.maintenance_interval_hours}h</p>
                          </div>
                        </div>

                        <div className="mb-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-500">维保进度</span>
                            <span className={utilization >= 100 ? 'text-red-600 font-bold' : 'text-gray-600'}>
                              {utilization.toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                utilization >= 100 ? 'bg-red-500' : utilization >= 80 ? 'bg-amber-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(utilization, 100)}%` }}
                            ></div>
                          </div>
                          {utilization >= 100 && (
                            <p className="text-xs text-red-600 mt-1">⚠️ 已达到维保周期，请及时安排维护</p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button
                            className="btn-secondary !py-1.5 text-xs flex-1"
                            onClick={() => {
                              setSelectedDevice(device)
                              setShowLogModal(true)
                            }}
                          >
                            📝 记录使用
                          </button>
                          {device.status !== 'normal' && (
                            <button
                              className="btn-warning !py-1.5 text-xs flex-1"
                              onClick={() => {
                                setOrderForm(prev => ({
                                  ...prev,
                                  deviceId: String(device.id),
                                  priority: utilization >= 120 ? 'high' : 'normal',
                                  scheduledDate: new Date(Date.now() + 86400000).toISOString().split('T')[0]
                                }))
                                setShowOrderModal(true)
                              }}
                            >
                              🔧 发起维保
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            maintenanceOrders.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-5xl mb-3">🔧</div>
                暂无维保工单
              </div>
            ) : (
              <div className="space-y-4 p-5">
                {[
                  { key: 'pending', label: '📋 待处理', orders: pendingOrders, color: 'amber' },
                  { key: 'in_progress', label: '🔧 处理中', orders: inProgressOrders, color: 'blue' },
                  { key: 'completed', label: '✅ 已完成', orders: completedOrders.slice(0, 5), color: 'green' }
                ].map(group => (
                  group.orders.length > 0 && (
                    <div key={group.key}>
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <span>{group.label}</span>
                        <span className={`badge-${group.color as 'amber' | 'blue' | 'green'}`}>{group.orders.length}</span>
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        {group.orders.map(order => {
                          const priority = priorityLabels[order.priority]
                          const status = orderStatusLabels[order.status]
                          return (
                            <div key={order.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all">
                              <div className="flex justify-between items-start mb-3">
                                <div>
                                  <h5 className="font-bold text-base">{order.device_name}</h5>
                                  <p className="text-xs text-gray-500">工单号: MO-{order.id.toString().padStart(5, '0')}</p>
                                </div>
                                <div className="flex flex-col gap-1 items-end">
                                  <span className={priority.cls}>{priority.label}优先级</span>
                                  <span className={status.cls}>{status.label}</span>
                                </div>
                              </div>

                              <div className="text-sm space-y-1 mb-3">
                                <div className="flex">
                                  <span className="text-gray-500 w-20">负责班组：</span>
                                  <span className="font-medium">{order.team_name || '待分配'}</span>
                                </div>
                                <div className="flex">
                                  <span className="text-gray-500 w-20">计划日期：</span>
                                  <span className="font-mono">{order.scheduled_date || '-'}</span>
                                </div>
                                {order.completed_date && (
                                  <div className="flex">
                                    <span className="text-gray-500 w-20">完成日期：</span>
                                    <span className="font-mono text-green-600">{order.completed_date}</span>
                                  </div>
                                )}
                              </div>

                              {order.description && (
                                <p className="text-xs bg-gray-50 rounded-lg p-2 text-gray-600 mb-3">
                                  📝 {order.description}
                                </p>
                              )}

                              {order.status === 'pending' && (
                                <div className="flex gap-2">
                                  <button
                                    className="btn-primary !py-1.5 text-xs flex-1"
                                    onClick={() => handleOrderStatus(order, 'in_progress')}
                                  >
                                    ▶️ 开始处理
                                  </button>
                                </div>
                              )}
                              {order.status === 'in_progress' && (
                                <button
                                  className="btn-success !py-1.5 text-xs w-full"
                                  onClick={() => handleOrderStatus(order, 'completed')}
                                >
                                  ✅ 完成维保
                                </button>
                              )}
                              {order.status === 'completed' && (
                                <p className="text-center text-xs text-gray-400">
                                  工单完成于 {order.completed_date}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {showLogModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span>📝</span> 记录设备使用
            </h3>
            <div className="space-y-4">
              <div>
                <label className="label">选择设备</label>
                <select
                  className="input"
                  value={selectedDevice?.id || ''}
                  onChange={e => {
                    const dev = devices.find(d => d.id === parseInt(e.target.value))
                    setSelectedDevice(dev || null)
                  }}
                >
                  <option value="">-- 请选择设备 --</option>
                  {devices.map(d => (
                    <option key={d.id} value={d.id}>{d.name}（{d.model}）</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">使用时长（小时）</label>
                <input
                  type="number"
                  step="0.1"
                  className="input"
                  value={logForm.duration}
                  onChange={e => setLogForm(prev => ({ ...prev, duration: e.target.value }))}
                  placeholder="如: 2.5"
                />
              </div>
              <div>
                <label className="label">操作人</label>
                <input
                  className="input"
                  value={logForm.operator}
                  onChange={e => setLogForm(prev => ({ ...prev, operator: e.target.value }))}
                  placeholder="请输入操作人姓名"
                />
              </div>

              {selectedDevice && logForm.duration && (
                <div className="bg-blue-50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">当前累计运行</span>
                    <span className="font-mono font-semibold">{selectedDevice.total_run_hours.toFixed(1)}h</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">本次使用</span>
                    <span className="font-mono text-blue-600 font-semibold">+{parseFloat(logForm.duration).toFixed(1)}h</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-600">新累计运行时长</span>
                    <span className="font-mono font-bold text-lg">{(selectedDevice.total_run_hours + parseFloat(logForm.duration)).toFixed(1)}h</span>
                  </div>
                  {selectedDevice.total_run_hours + parseFloat(logForm.duration) >= selectedDevice.maintenance_interval_hours && (
                    <p className="text-amber-700 bg-amber-50 rounded-lg p-2 text-xs">
                      ⚠️ 达到维保周期，将自动标记为待维保状态
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button className="btn-secondary flex-1" onClick={() => {
                setShowLogModal(false)
                setSelectedDevice(null)
                setLogForm({ duration: '', operator: '' })
              }}>取消</button>
              <button
                className="btn-primary flex-1"
                onClick={handleLogUsage}
                disabled={!selectedDevice || !logForm.duration}
              >确认提交</button>
            </div>
          </div>
        </div>
      )}

      {showOrderModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span>🔧</span> 创建维保工单
            </h3>
            <div className="space-y-4">
              <div>
                <label className="label">选择设备 *</label>
                <select
                  className="input"
                  value={orderForm.deviceId}
                  onChange={e => setOrderForm(prev => ({ ...prev, deviceId: e.target.value }))}
                >
                  <option value="">-- 请选择设备 --</option>
                  {devices.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name}（{d.model}）
                      {d.status === 'needs_maintenance' && ' ⚠️待维保'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">优先级</label>
                  <select
                    className="input"
                    value={orderForm.priority}
                    onChange={e => setOrderForm(prev => ({ ...prev, priority: e.target.value }))}
                  >
                    <option value="low">低</option>
                    <option value="normal">普通</option>
                    <option value="high">高</option>
                    <option value="urgent">紧急</option>
                  </select>
                </div>
                <div>
                  <label className="label">计划日期</label>
                  <input
                    type="date"
                    className="input"
                    value={orderForm.scheduledDate}
                    onChange={e => setOrderForm(prev => ({ ...prev, scheduledDate: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="label">问题描述</label>
                <textarea
                  className="input min-h-[80px]"
                  value={orderForm.description}
                  onChange={e => setOrderForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="请详细描述设备故障或维保需求..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button className="btn-secondary flex-1" onClick={() => {
                setShowOrderModal(false)
                setOrderForm({ deviceId: '', teamId: '', priority: 'normal', description: '', scheduledDate: '' })
              }}>取消</button>
              <button
                className="btn-primary flex-1"
                onClick={handleCreateOrder}
                disabled={!orderForm.deviceId}
              >创建工单</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
