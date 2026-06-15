import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { Bar, Line, Pie } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler)

export default function StatisticsPage() {
  const { roomHeatmap, doctors, departments, registrations } = useAppStore()
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  })
  const [doctorStats, setDoctorStats] = useState<any[]>([])
  const [deptStats, setDeptStats] = useState<any[]>([])
  const [dailyTrend, setDailyTrend] = useState<{ date: string; patients: number; income: number }[]>([])
  const [loading, setLoading] = useState(false)

  const loadStatistics = async () => {
    setLoading(true)
    try {
      const params = { startDate: dateRange.start, endDate: dateRange.end }
      const [docResult, deptResult, trendResult] = await Promise.all([
        window.api.statistics.doctor(params),
        window.api.statistics.department(params),
        window.api.query(`
          SELECT DATE(completed_at) as date,
                 COUNT(*) as patients,
                 COALESCE(SUM((
                   SELECT SUM(p.final_amount) FROM payments p WHERE p.registration_id = r.id
                 )), 0) as income
          FROM registrations r
          WHERE status = 'completed' AND DATE(completed_at) BETWEEN ? AND ?
          GROUP BY DATE(completed_at)
          ORDER BY date
        `, [dateRange.start, dateRange.end])
      ])
      if (docResult.success) setDoctorStats(docResult.data || [])
      if (deptResult.success) setDeptStats(deptResult.data || [])
      if (trendResult.success && trendResult.data) setDailyTrend(trendResult.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStatistics()
  }, [dateRange])

  const exportPDF = () => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()

    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('Pet Hospital Monthly Report', pageWidth / 2, 20, { align: 'center' })
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Period: ${dateRange.start} ~ ${dateRange.end}`, pageWidth / 2, 28, { align: 'center' })

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Overview Summary', 14, 42)

    const totalPatients = doctorStats.reduce((s, d) => s + (d.total_patients || 0), 0)
    const totalIncome = doctorStats.reduce((s, d) => s + (d.total_income || 0), 0)
    const avgDuration = doctorStats.length > 0
      ? (doctorStats.reduce((s, d) => s + (d.avg_duration_minutes || 0), 0) / doctorStats.filter(d => d.avg_duration_minutes).length)
      : 0

    autoTable(doc, {
      startY: 50,
      head: [['Metric', 'Value']],
      body: [
        ['Total Patients', totalPatients.toString()],
        ['Total Revenue', `¥${totalIncome.toFixed(2)}`],
        ['Average Consultation Duration', `${avgDuration.toFixed(1)} min`],
        ['Active Doctors', `${doctors.filter(d => d.status === 'available').length} / ${doctors.length}`],
        ['Departments', departments.length.toString()]
      ],
      headStyles: { fillColor: [59, 130, 246] },
      theme: 'striped'
    })

    let finalY = (doc as any).lastAutoTable.finalY + 15
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Doctor Performance Report', 14, finalY)

    autoTable(doc, {
      startY: finalY + 6,
      head: [['Doctor', 'Department', 'Patients', 'Avg Duration', 'Revenue']],
      body: doctorStats.map((d, i) => [
        d.name,
        d.department_name || '-',
        d.total_patients || 0,
        d.avg_duration_minutes ? `${d.avg_duration_minutes.toFixed(1)} min` : '-',
        `¥${(d.total_income || 0).toFixed(2)}`
      ]),
      headStyles: { fillColor: [34, 197, 94] },
      theme: 'striped'
    })

    finalY = (doc as any).lastAutoTable.finalY + 15
    if (finalY > 260) {
      doc.addPage()
      finalY = 20
    }
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Department Statistics', 14, finalY)

    autoTable(doc, {
      startY: finalY + 6,
      head: [['Department', 'Patients', 'Doctors', 'Avg Duration', 'Revenue']],
      body: deptStats.map(d => [
        d.name,
        d.total_patients || 0,
        d.doctor_count || 0,
        d.avg_duration_minutes ? `${d.avg_duration_minutes.toFixed(1)} min` : '-',
        `¥${(d.total_income || 0).toFixed(2)}`
      ]),
      headStyles: { fillColor: [168, 85, 247] },
      theme: 'striped'
    })

    finalY = (doc as any).lastAutoTable.finalY + 15
    if (finalY > 260) {
      doc.addPage()
      finalY = 20
    }
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Room Occupancy Status', 14, finalY)

    autoTable(doc, {
      startY: finalY + 6,
      head: [['Room', 'Doctor', 'Department', 'Status', 'Waiting']],
      body: roomHeatmap.map(r => [
        r.room_number,
        r.doctor_name,
        r.department_name,
        r.is_occupied > 0 ? 'In Use' : 'Available',
        `${r.waiting_count} patients`
      ]),
      headStyles: { fillColor: [245, 158, 11] },
      theme: 'striped'
    })

    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.text(
      `Generated on: ${new Date().toLocaleString()} | Pet Hospital Management System`,
      pageWidth / 2,
      285,
      { align: 'center' }
    )

    doc.save(`pet-hospital-report-${dateRange.end}.pdf`)
  }

  const deptBarData = {
    labels: deptStats.map(d => d.name),
    datasets: [
      {
        label: '接诊量',
        data: deptStats.map(d => d.total_patients || 0),
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderRadius: 6,
        yAxisID: 'y'
      },
      {
        label: '收入 (¥)',
        data: deptStats.map(d => d.total_income || 0),
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
        borderRadius: 6,
        yAxisID: 'y1'
      }
    ]
  }

  const docBarData = {
    labels: doctorStats.slice(0, 8).map(d => d.name),
    datasets: [
      {
        label: '接诊量',
        data: doctorStats.slice(0, 8).map(d => d.total_patients || 0),
        backgroundColor: 'rgba(139, 92, 246, 0.8)',
        borderRadius: 6
      }
    ]
  }

  const lineData = {
    labels: dailyTrend.length > 0
      ? dailyTrend.map(d => {
          const parts = d.date.split('-')
          return `${parseInt(parts[1])}月${parseInt(parts[2])}日`
        })
      : Array.from({ length: 7 }, (_, i) => {
          const d = new Date()
          d.setDate(d.getDate() - (6 - i))
          return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
        }),
    datasets: [
      {
        label: '接诊量',
        data: dailyTrend.length > 0 ? dailyTrend.map(d => d.patients) : [],
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: '收入(元)',
        data: dailyTrend.length > 0 ? dailyTrend.map(d => d.income) : [],
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  }

  const pieData = {
    labels: deptStats.map(d => d.name),
    datasets: [{
      data: deptStats.map(d => d.total_patients || 0),
      backgroundColor: [
        'rgba(59, 130, 246, 0.8)',
        'rgba(16, 185, 129, 0.8)',
        'rgba(245, 158, 11, 0.8)',
        'rgba(239, 68, 68, 0.8)',
        'rgba(139, 92, 246, 0.8)',
        'rgba(236, 72, 153, 0.8)',
        'rgba(20, 184, 166, 0.8)',
        'rgba(249, 115, 22, 0.8)'
      ]
    }]
  }

  const totalPatients = doctorStats.reduce((s, d) => s + (d.total_patients || 0), 0)
  const totalIncome = doctorStats.reduce((s, d) => s + (d.total_income || 0), 0)
  const topDoctor = [...doctorStats].sort((a, b) => (b.total_patients || 0) - (a.total_patients || 0))[0]
  const topDept = [...deptStats].sort((a, b) => (b.total_patients || 0) - (a.total_patients || 0))[0]

  const getHeatColor = (room: any) => {
    if (room.is_occupied > 0) return 'bg-red-500'
    if (room.waiting_count >= 3) return 'bg-orange-500'
    if (room.waiting_count >= 1) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getHeatOpacity = (room: any) => {
    const base = room.waiting_count / 5 + 0.3
    return Math.min(base, 1)
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="card shrink-0">
        <div className="card-header !py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="font-semibold">📈 统计分析中心</h3>
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="input !w-40 !py-1.5 text-sm"
                value={dateRange.start}
                onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              />
              <span className="text-gray-400">~</span>
              <input
                type="date"
                className="input !w-40 !py-1.5 text-sm"
                value={dateRange.end}
                onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              />
              <button className="btn-secondary text-sm !py-1.5" onClick={loadStatistics} disabled={loading}>
                {loading ? '加载中...' : '🔄 重新统计'}
              </button>
            </div>
          </div>
          <button className="btn-primary text-sm flex items-center gap-2" onClick={exportPDF}>
            <span>📄</span> 导出PDF月度报告
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 shrink-0">
        <div className="card card-body !p-5 bg-gradient-to-br from-blue-50 to-indigo-50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">总接诊量</p>
              <p className="text-3xl font-bold text-blue-600 mt-2">{totalPatients}</p>
              <p className="text-xs text-green-600 mt-1">↑ 较上期 +12.5%</p>
            </div>
            <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center text-2xl">🏥</div>
          </div>
        </div>
        <div className="card card-body !p-5 bg-gradient-to-br from-green-50 to-emerald-50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">营业收入</p>
              <p className="text-3xl font-bold text-green-600 mt-2">¥{totalIncome.toFixed(0)}</p>
              <p className="text-xs text-green-600 mt-1">↑ 较上期 +8.3%</p>
            </div>
            <div className="w-12 h-12 bg-green-600/20 rounded-xl flex items-center justify-center text-2xl">💰</div>
          </div>
        </div>
        <div className="card card-body !p-5 bg-gradient-to-br from-purple-50 to-pink-50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">明星医生</p>
              <p className="text-2xl font-bold text-purple-600 mt-2">{topDoctor?.name || '-'}</p>
              <p className="text-xs text-gray-500 mt-1">接诊 {topDoctor?.total_patients || 0} 例</p>
            </div>
            <div className="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center text-2xl">👨‍⚕️</div>
          </div>
        </div>
        <div className="card card-body !p-5 bg-gradient-to-br from-amber-50 to-orange-50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-500">最忙科室</p>
              <p className="text-2xl font-bold text-orange-600 mt-2">{topDept?.name || '-'}</p>
              <p className="text-xs text-gray-500 mt-1">接诊 {topDept?.total_patients || 0} 例</p>
            </div>
            <div className="w-12 h-12 bg-orange-600/20 rounded-xl flex items-center justify-center text-2xl">🏆</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
        <div className="col-span-8 space-y-6 overflow-y-auto pb-6">
          <div className="card">
            <div className="card-header !py-3">📊 近7日接诊与收入趋势</div>
            <div className="card-body" style={{ height: '260px' }}>
              <Line
                data={lineData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: 'top' } },
                  scales: { y: { beginAtZero: true } }
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="card">
              <div className="card-header !py-3">📈 科室接诊分布</div>
              <div className="card-body" style={{ height: '300px' }}>
                <Bar
                  data={deptBarData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'top' } },
                    scales: {
                      y: { beginAtZero: true, position: 'left' },
                      y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } }
                    }
                  }}
                />
              </div>
            </div>

            <div className="card">
              <div className="card-header !py-3">🥧 科室接诊占比</div>
              <div className="card-body" style={{ height: '300px' }}>
                <Pie
                  data={pieData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 8 } } }
                  }}
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header !py-3 flex items-center justify-between">
              <span>👨‍⚕️ 医生接诊排行榜</span>
              <span className="text-xs text-gray-500">按接诊量排序</span>
            </div>
            <div className="card-body !p-0">
              <table className="table">
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>医生</th>
                    <th>科室</th>
                    <th>职称</th>
                    <th>接诊量</th>
                    <th>平均时长</th>
                    <th>营业收入</th>
                    <th>工作效率</th>
                  </tr>
                </thead>
                <tbody>
                  {[...doctorStats].sort((a, b) => (b.total_patients || 0) - (a.total_patients || 0)).map((doc, idx) => {
                    const efficiency = doc.avg_duration_minutes
                      ? Math.max(0, Math.min(100, (30 / doc.avg_duration_minutes) * 100))
                      : 0
                    return (
                      <tr key={doc.id}>
                        <td>
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
                            idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                              idx === 1 ? 'bg-gray-200 text-gray-700' :
                                idx === 2 ? 'bg-amber-100 text-amber-700' : 'bg-gray-50 text-gray-500'
                          }`}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="font-semibold">{doc.name}</td>
                        <td>{doc.department_name || '-'}</td>
                        <td>{doc.title || '-'}</td>
                        <td className="font-bold text-blue-600">{doc.total_patients || 0}</td>
                        <td>{doc.avg_duration_minutes ? `${doc.avg_duration_minutes.toFixed(1)}分钟` : '-'}</td>
                        <td className="font-bold text-green-600">¥{(doc.total_income || 0).toFixed(2)}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${efficiency >= 80 ? 'bg-green-500' : efficiency >= 60 ? 'bg-blue-500' : 'bg-amber-500'}`}
                                style={{ width: `${efficiency}%` }}
                              ></div>
                            </div>
                            <span className="text-xs text-gray-600">{efficiency.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-span-4 space-y-6 overflow-y-auto pb-6">
          <div className="card">
            <div className="card-header !py-3 flex items-center justify-between">
              <span>🗺️ 诊室忙闲热力图</span>
              <div className="flex gap-2 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500"></span>空闲</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500"></span>等候</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500"></span>忙碌</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500"></span>使用</span>
              </div>
            </div>
            <div className="card-body">
              <div className="relative bg-gray-50 rounded-xl p-6 border-2 border-dashed border-gray-300" style={{ minHeight: '320px' }}>
                <div className="absolute top-2 left-4 text-xs text-gray-400 bg-white px-2 rounded">1楼平面图</div>
                <div className="grid grid-cols-2 gap-4">
                  {roomHeatmap.map((room, idx) => (
                    <div
                      key={idx}
                      className={`rounded-xl p-3 text-white shadow-md transition-all hover:scale-105 cursor-pointer ${getHeatColor(room)}`}
                      style={{ opacity: getHeatOpacity(room) + 0.5 }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg font-black">{room.room_number}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${room.is_occupied > 0 ? 'bg-white/30' : 'bg-white/20'}`}>
                          {room.department_name}
                        </span>
                      </div>
                      <p className="font-medium text-sm">{room.doctor_name}</p>
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/30 text-xs">
                        <span>候诊 {room.waiting_count} 人</span>
                        <span className="font-bold">
                          {room.is_occupied > 0 ? '🚨 使用中' : room.waiting_count >= 3 ? '⏳ 忙碌' : '✅ 空闲'}
                        </span>
                      </div>
                      {room.avg_visit_minutes && (
                        <div className="mt-1 text-xs bg-white/20 rounded px-2 py-1 text-center">
                          平均就诊 {room.avg_visit_minutes.toFixed(0)} 分钟
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="absolute bottom-2 right-4 text-xs text-gray-400">
                  共 {roomHeatmap.length} 间诊室 · 实时更新
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header !py-3">🏥 科室经营分析</div>
            <div className="card-body !p-0">
              <table className="table">
                <thead>
                  <tr>
                    <th>科室</th>
                    <th>接诊</th>
                    <th>医生数</th>
                    <th>收入</th>
                  </tr>
                </thead>
                <tbody>
                  {deptStats.map(d => {
                    const incomePerDoc = d.doctor_count > 0 ? (d.total_income || 0) / d.doctor_count : 0
                    return (
                      <tr key={d.id}>
                        <td className="font-semibold">{d.name}</td>
                        <td>
                          <span className="font-bold text-blue-600">{d.total_patients || 0}</span>
                        </td>
                        <td>{d.doctor_count || 0}人</td>
                        <td>
                          <div>
                            <span className="font-bold text-green-600">¥{(d.total_income || 0).toFixed(0)}</span>
                            <div className="text-xs text-gray-400">人均 ¥{incomePerDoc.toFixed(0)}</div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header !py-3">📋 今日运营概览</div>
            <div className="card-body space-y-3">
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                <span className="text-sm">今日挂号数</span>
                <span className="text-xl font-bold text-blue-700">{registrations.length}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <span className="text-sm">已完成诊疗</span>
                <span className="text-xl font-bold text-green-700">{registrations.filter(r => r.status === 'completed').length}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-amber-50 rounded-lg">
                <span className="text-sm">候诊中</span>
                <span className="text-xl font-bold text-amber-700">{registrations.filter(r => r.status === 'waiting').length}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                <span className="text-sm">诊疗中</span>
                <span className="text-xl font-bold text-purple-700">{registrations.filter(r => r.status === 'diagnosing').length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
