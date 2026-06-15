import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)

export default function Dashboard() {
  const navigate = useNavigate()
  const {
    registrations,
    doctors,
    pets,
    medicines,
    stockAlerts,
    roomHeatmap,
    devices,
    maintenanceOrders,
    loadData
  } = useAppStore()

  const [todayStats, setTodayStats] = useState({
    registered: 0,
    diagnosing: 0,
    completed: 0,
    waiting: 0,
    availableDoctors: 0,
    busyDoctors: 0
  })

  useEffect(() => {
    const waiting = registrations.filter(r => r.status === 'waiting').length
    const diagnosing = registrations.filter(r => r.status === 'diagnosing').length
    const completed = registrations.filter(r => r.status === 'completed').length
    const availableDoctors = doctors.filter(d => d.status === 'available').length
    const busyDoctors = doctors.filter(d => d.status === 'busy').length

    setTodayStats({
      registered: registrations.length,
      diagnosing,
      completed,
      waiting,
      availableDoctors,
      busyDoctors
    })
  }, [registrations, doctors])

  const urgentCases = registrations.filter(r => r.urgency_level >= 3 && r.status !== 'completed')
  const lowStockMeds = medicines.filter(m => m.stock < m.safety_threshold)
  const urgentMaintenance = maintenanceOrders.filter(o => o.status === 'pending' && (o.priority === 'high' || o.priority === 'urgent'))

  const deptData = {
    labels: ['内科', '外科', '皮肤科', '牙科', '眼科', '急诊科', '影像科', '检验科'],
    datasets: [{
      label: '接诊量',
      data: [12, 8, 6, 4, 3, 5, 7, 9],
      backgroundColor: [
        'rgba(59, 130, 246, 0.8)',
        'rgba(16, 185, 129, 0.8)',
        'rgba(245, 158, 11, 0.8)',
        'rgba(239, 68, 68, 0.8)',
        'rgba(139, 92, 246, 0.8)',
        'rgba(236, 72, 153, 0.8)',
        'rgba(20, 184, 166, 0.8)',
        'rgba(249, 115, 22, 0.8)'
      ],
      borderRadius: 6
    }]
  }

  const statusData = {
    labels: ['候诊中', '诊疗中', '已完成'],
    datasets: [{
      data: [todayStats.waiting, todayStats.diagnosing, todayStats.completed + 15],
      backgroundColor: [
        'rgba(245, 158, 11, 0.8)',
        'rgba(59, 130, 246, 0.8)',
        'rgba(16, 185, 129, 0.8)'
      ],
      borderWidth: 0
    }]
  }

  const getRoomHeatColor = (room: any) => {
    if (room.is_occupied > 0) return 'bg-red-400'
    if (room.waiting_count >= 3) return 'bg-orange-400'
    if (room.waiting_count >= 1) return 'bg-yellow-400'
    return 'bg-green-400'
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-6 gap-4">
        <div className="card card-body !p-5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/registration')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">今日挂号</p>
              <p className="text-3xl font-bold text-blue-600 mt-2">{todayStats.registered}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-2xl">📋</div>
          </div>
          <p className="text-xs text-gray-400 mt-2">点击新建挂号</p>
        </div>

        <div className="card card-body !p-5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/queue')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">等待候诊</p>
              <p className="text-3xl font-bold text-amber-600 mt-2">{todayStats.waiting}</p>
            </div>
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-2xl">⏳</div>
          </div>
          <p className="text-xs text-gray-400 mt-2">查看候诊队列</p>
        </div>

        <div className="card card-body !p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">诊疗中</p>
              <p className="text-3xl font-bold text-purple-600 mt-2">{todayStats.diagnosing}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-2xl">💊</div>
          </div>
          <p className="text-xs text-gray-400 mt-2">正在诊疗</p>
        </div>

        <div className="card card-body !p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">今日完成</p>
              <p className="text-3xl font-bold text-green-600 mt-2">{todayStats.completed + 15}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-2xl">✅</div>
          </div>
          <p className="text-xs text-gray-400 mt-2">诊疗完成</p>
        </div>

        <div className="card card-body !p-5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/medicine')}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">药品品种</p>
              <p className="text-3xl font-bold text-cyan-600 mt-2">{medicines.length}</p>
            </div>
            <div className="w-12 h-12 bg-cyan-100 rounded-xl flex items-center justify-center text-2xl">💉</div>
          </div>
          <p className={`text-xs mt-2 ${lowStockMeds.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>
            {lowStockMeds.length > 0 ? `⚠️ ${lowStockMeds.length} 种库存不足` : '库存充足'}
          </p>
        </div>

        <div className="card card-body !p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">在线医生</p>
              <p className="text-3xl font-bold text-indigo-600 mt-2">{todayStats.availableDoctors}/{doctors.length}</p>
            </div>
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-2xl">👨‍⚕️</div>
          </div>
          <p className="text-xs text-gray-400 mt-2">忙碌 {todayStats.busyDoctors} 人</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-7 space-y-6">
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <span>科室接诊分布</span>
              <button onClick={loadData} className="text-xs text-blue-600 hover:underline">刷新数据</button>
            </div>
            <div className="card-body">
              <div style={{ height: '260px' }}>
                <Bar
                  data={deptData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } }
                  }}
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header flex items-center justify-between">
              <span>诊室忙闲热力图</span>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-400"></span>空闲</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-400"></span>少量等候</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400"></span>多人等候</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400"></span>使用中</span>
              </div>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-4 gap-4">
                {roomHeatmap.map((room, idx) => (
                  <div
                    key={idx}
                    className={`${getRoomHeatColor(room)} rounded-xl p-4 text-white transition-all hover:scale-105 cursor-pointer shadow-sm`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-lg">{room.room_number}</span>
                      <span className="text-xs bg-white/30 px-2 py-0.5 rounded-full">{room.department_name}</span>
                    </div>
                    <p className="text-sm opacity-95">{room.doctor_name}</p>
                    <div className="mt-3 pt-2 border-t border-white/30 flex justify-between text-xs">
                      <span>候诊 {room.waiting_count} 人</span>
                      <span>{room.is_occupied > 0 ? '使用中' : '空闲'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-5 space-y-6">
          <div className="card">
            <div className="card-header">今日挂号状态</div>
            <div className="card-body">
              <div style={{ height: '220px' }}>
                <Doughnut
                  data={statusData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                      legend: { position: 'bottom', labels: { padding: 15 } }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {urgentCases.length > 0 && (
            <div className="card border-red-200">
              <div className="card-header !text-red-700 flex items-center gap-2">
                <span>🚨</span>
                <span>紧急病例提醒</span>
              </div>
              <div className="card-body !p-0">
                <table className="table">
                  <tbody>
                    {urgentCases.map(reg => (
                      <tr key={reg.id} onClick={() => navigate('/queue')} className="cursor-pointer">
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <span className="badge-red">{'⭐'.repeat(reg.urgency_level)}</span>
                            <div>
                              <p className="font-medium">{reg.pet_name} ({reg.species})</p>
                              <p className="text-xs text-gray-500">{reg.owner_name} · {reg.phone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="text-right text-sm text-gray-600">
                          <p>{reg.department_name}</p>
                          <p className="text-xs">{reg.doctor_name} · {reg.room_number}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {urgentMaintenance.length > 0 && (
            <div className="card border-amber-200">
              <div className="card-header !text-amber-700 flex items-center gap-2 cursor-pointer" onClick={() => navigate('/device')}>
                <span>🔧</span>
                <span>紧急维保工单</span>
                <span className="ml-auto text-xs">查看全部 →</span>
              </div>
              <div className="card-body !p-0">
                <table className="table">
                  <tbody>
                    {urgentMaintenance.slice(0, 3).map(order => (
                      <tr key={order.id}>
                        <td>
                          <p className="font-medium">{order.device_name}</p>
                          <p className="text-xs text-gray-500">{order.team_name} · {order.scheduled_date}</p>
                        </td>
                        <td className="text-right">
                          <span className={`badge-${order.priority === 'urgent' ? 'red' : 'orange'}`}>
                            {order.priority === 'urgent' ? '紧急' : '高'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header cursor-pointer" onClick={() => navigate('/queue')}>
              <div className="flex items-center justify-between">
                <span>最新候诊队列</span>
                <span className="text-xs text-blue-600">查看全部 →</span>
              </div>
            </div>
            <div className="card-body !p-0">
              {registrations.filter(r => r.status === 'waiting').slice(0, 5).length === 0 ? (
                <p className="p-6 text-center text-gray-400 text-sm">暂无候诊病例</p>
              ) : (
                <table className="table">
                  <tbody>
                    {registrations.filter(r => r.status === 'waiting').slice(0, 5).map(reg => (
                      <tr key={reg.id}>
                        <td className="font-medium">No.{reg.queue_number}</td>
                        <td>
                          <p className="font-medium">{reg.pet_name}</p>
                          <p className="text-xs text-gray-500">{reg.owner_name}</p>
                        </td>
                        <td>{reg.symptom_name || '待分诊'}</td>
                        <td className="text-right">
                          <span className={`badge-${reg.urgency_level >= 4 ? 'red' : reg.urgency_level >= 2 ? 'orange' : 'blue'}`}>
                            {reg.urgency_level >= 4 ? '危重' : reg.urgency_level >= 3 ? '紧急' : reg.urgency_level >= 2 ? '较急' : '常规'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
