import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import type { Registration } from '../types'
import dayjs from 'dayjs'

export default function QueuePage() {
  const navigate = useNavigate()
  const { registrations, callRegistration, checkTimeout, loadQueue, doctors } = useAppStore()
  const [filter, setFilter] = useState<'all' | 'waiting' | 'diagnosing'>('all')
  const [deptFilter, setDeptFilter] = useState<string>('all')
  const [timeoutAlerts, setTimeoutAlerts] = useState<Registration[]>([])
  const [showTimeoutModal, setShowTimeoutModal] = useState(false)

  const departments = ['all', ...new Set(registrations.map(r => r.department_name).filter(Boolean))] as string[]

  const filtered = registrations.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false
    if (deptFilter !== 'all' && r.department_name !== deptFilter) return false
    return true
  })

  const waiting = registrations.filter(r => r.status === 'waiting')
  const diagnosing = registrations.filter(r => r.status === 'diagnosing')

  useEffect(() => {
    const checkTimeouts = async () => {
      const alerts = await checkTimeout()
      if (alerts && alerts.length > 0) {
        setTimeoutAlerts(alerts)
        setShowTimeoutModal(true)
      }
    }
    checkTimeouts()
  }, [])

  const getUrgencyBadge = (level: number) => {
    if (level >= 5) return { cls: 'badge-red', text: '极危' }
    if (level >= 4) return { cls: 'badge-red', text: '危重' }
    if (level >= 3) return { cls: 'badge-orange', text: '紧急' }
    if (level >= 2) return { cls: 'badge-yellow', text: '较急' }
    return { cls: 'badge-blue', text: '常规' }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'waiting': return { cls: 'badge-yellow', text: '候诊中' }
      case 'diagnosing': return { cls: 'badge-blue', text: '诊疗中' }
      case 'completed': return { cls: 'badge-green', text: '已完成' }
      default: return { cls: 'badge-gray', text: status }
    }
  }

  const getWaitTime = (time: string) => {
    const diff = dayjs().diff(dayjs(time), 'minute')
    if (diff < 60) return `${diff}分钟`
    return `${Math.floor(diff / 60)}小时${diff % 60}分钟`
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      {showTimeoutModal && timeoutAlerts.length > 0 && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">⏰</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-amber-800">超时候诊提醒</h3>
                <p className="text-sm text-gray-500">以下候诊者已超过30分钟未就诊</p>
              </div>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-5">
              {timeoutAlerts.map(reg => (
                <div key={reg.id} className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold">{reg.pet_name}（{reg.owner_name}）</span>
                    <span className="badge-orange">No.{reg.queue_number}</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    已等待 {getWaitTime(reg.registered_at)} · {reg.doctor_name} · {reg.room_number}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setShowTimeoutModal(false)}>稍后处理</button>
              <button className="btn-warning flex-1" onClick={() => {
                setShowTimeoutModal(false)
                setTimeoutAlerts([])
              }}>发送提醒通知</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 shrink-0">
        <div className="card card-body !p-5 flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center text-3xl">📋</div>
          <div>
            <p className="text-sm text-gray-500">今日挂号</p>
            <p className="text-3xl font-bold text-blue-600">{registrations.length}</p>
          </div>
        </div>
        <div className="card card-body !p-5 flex items-center gap-4">
          <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center text-3xl">⏳</div>
          <div>
            <p className="text-sm text-gray-500">候诊中</p>
            <p className="text-3xl font-bold text-amber-600">{waiting.length}</p>
          </div>
        </div>
        <div className="card card-body !p-5 flex items-center gap-4">
          <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center text-3xl">💊</div>
          <div>
            <p className="text-sm text-gray-500">诊疗中</p>
            <p className="text-3xl font-bold text-purple-600">{diagnosing.length}</p>
          </div>
        </div>
        <div className="card card-body !p-5 flex items-center gap-4">
          <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center text-3xl">👨‍⚕️</div>
          <div>
            <p className="text-sm text-gray-500">在线医生</p>
            <p className="text-3xl font-bold text-green-600">
              {doctors.filter(d => d.status === 'available').length}/{doctors.length}
            </p>
          </div>
        </div>
      </div>

      <div className="card shrink-0">
        <div className="card-header flex items-center justify-between !py-4">
          <div className="flex items-center gap-4">
            <div className="flex bg-gray-100 rounded-lg p-1">
              {([
                { key: 'all', label: '全部', count: registrations.length },
                { key: 'waiting', label: '候诊', count: waiting.length },
                { key: 'diagnosing', label: '诊疗中', count: diagnosing.length }
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    filter === tab.key ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab.label} <span className="ml-1 text-xs">({tab.count})</span>
                </button>
              ))}
            </div>

            <select
              className="input !w-40"
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
            >
              {departments.map(d => (
                <option key={d} value={d}>{d === 'all' ? '全部科室' : d}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button className="btn-secondary text-sm" onClick={loadQueue}>🔄 刷新</button>
            <button className="btn-primary text-sm" onClick={() => navigate('/registration')}>+ 新建挂号</button>
          </div>
        </div>
      </div>

      <div className="card flex-1 overflow-hidden flex flex-col">
        <div className="overflow-y-auto flex-1">
          <table className="table">
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th>序号</th>
                <th>排队号</th>
                <th>宠物信息</th>
                <th>主人信息</th>
                <th>症状</th>
                <th>科室/医生</th>
                <th>诊室</th>
                <th>紧急程度</th>
                <th>状态</th>
                <th>等待时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-16 text-gray-400">
                    <div className="text-5xl mb-3">📭</div>
                    暂无符合条件的挂号记录
                  </td>
                </tr>
              ) : (
                filtered.map((reg, idx) => {
                  const urgency = getUrgencyBadge(reg.urgency_level)
                  const status = getStatusBadge(reg.status)
                  const waitTime = getWaitTime(reg.registered_at)
                  const isTimeout = dayjs().diff(dayjs(reg.registered_at), 'minute') > 30 && reg.status === 'waiting'

                  return (
                    <tr
                      key={reg.id}
                      className={`${reg.status === 'diagnosing' ? 'bg-blue-50/50' : ''} ${isTimeout ? 'bg-amber-50/50' : ''}`}
                    >
                      <td className="font-mono text-gray-400">{idx + 1}</td>
                      <td>
                        <span className="text-lg font-bold text-blue-600">No.{reg.queue_number}</span>
                        {isTimeout && <span className="ml-2 badge-amber">超时</span>}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white">
                            {reg.species === '犬' ? '🐶' : reg.species === '猫' ? '🐱' : reg.species === '兔' ? '🐰' : '🐾'}
                          </div>
                          <div>
                            <p className="font-semibold">{reg.pet_name}</p>
                            <p className="text-xs text-gray-500">{reg.species} · {reg.breed} · {reg.weight}kg</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <p className="font-medium">{reg.owner_name}</p>
                        <p className="text-xs text-gray-500">📞 {reg.phone}</p>
                      </td>
                      <td>
                        <p className="text-sm">{reg.symptom_name || '待分诊'}</p>
                        {reg.symptom_description && (
                          <p className="text-xs text-gray-500 max-w-[180px] truncate" title={reg.symptom_description}>
                            {reg.symptom_description}
                          </p>
                        )}
                      </td>
                      <td>
                        <p className="font-medium">{reg.doctor_name || '待分配'}</p>
                        <p className="text-xs text-gray-500">{reg.department_name}</p>
                      </td>
                      <td className="font-mono font-semibold">{reg.room_number || '-'}</td>
                      <td>
                        <span className={`${urgency.cls}`}>
                          {'⭐'.repeat(reg.urgency_level)} {urgency.text}
                        </span>
                      </td>
                      <td><span className={status.cls}>{status.text}</span></td>
                      <td className={isTimeout ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                        {waitTime}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {reg.status === 'waiting' && (
                            <button
                              className="btn-success !px-3 !py-1 text-xs"
                              onClick={async () => {
                                await callRegistration(reg.id)
                              }}
                            >
                              📢 呼叫就诊
                            </button>
                          )}
                          {reg.status === 'diagnosing' && (
                            <button
                              className="btn-primary !px-3 !py-1 text-xs"
                              onClick={() => navigate(`/diagnosis/${reg.id}`)}
                            >
                              💊 进入诊疗
                            </button>
                          )}
                          {reg.status === 'completed' && (
                            <button
                              className="btn-secondary !px-3 !py-1 text-xs"
                              onClick={() => navigate(`/payment/${reg.id}`)}
                            >
                              💰 去收费
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
