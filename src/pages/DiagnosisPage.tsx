import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import type { Medicine, Registration, ServiceItem } from '../types'

interface PrescriptionItem {
  medicineId: number
  medicine?: Medicine
  dosage: string
  frequency: string
  duration: string
  durationDays: number
  quantity: number
  unitPrice: number
  subtotal: number
  usageInstructions: string
}

interface ServiceOrder {
  itemId: number
  item?: ServiceItem
  quantity: number
  unitPrice: number
  subtotal: number
}

export default function DiagnosisPage() {
  const { regId } = useParams()
  const navigate = useNavigate()
  const { registrations, medicines, services, loadMedicines, loadQueue, loadDoctors, loadStockAlerts } = useAppStore()

  const [currentReg, setCurrentReg] = useState<Registration | null>(null)
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [examination, setExamination] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [treatmentPlan, setTreatmentPlan] = useState('')

  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([])
  const [selectedMedId, setSelectedMedId] = useState<number | ''>('')
  const [prescFrequency, setPrescFrequency] = useState('每日1次')
  const [prescDurationDays, setPrescDurationDays] = useState(3)
  const [calculating, setCalculating] = useState(false)
  const [calcError, setCalcError] = useState('')

  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([])
  const [selectedServiceId, setSelectedServiceId] = useState<number | ''>('')
  const [serviceQuantity, setServiceQuantity] = useState(1)

  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (regId) {
      const reg = registrations.find(r => r.id === parseInt(regId))
      if (reg) {
        setCurrentReg(reg)
        setChiefComplaint(reg.symptom_description || reg.symptom_name || '')
      }
    }
  }, [regId, registrations])

  const pendingDiagnosing = registrations.filter(r => r.status === 'diagnosing')
  const pendingWaiting = registrations.filter(r => r.status === 'waiting')

  const petWeight = currentReg?.weight || 0

  const addPrescription = async () => {
    if (!selectedMedId || petWeight <= 0) {
      alert('请先选择药品并确认宠物体重信息')
      return
    }

    setCalculating(true)
    setCalcError('')

    try {
      const result = await window.api.medicine.calculateDosage({
        medicineId: selectedMedId,
        weight: petWeight,
        durationDays: prescDurationDays,
        frequency: prescFrequency
      })

      if (!result.success) {
        setCalcError(result.error || '剂量计算失败')
        return
      }

      const med = medicines.find(m => m.id === selectedMedId)
      if (!med) return

      const alreadyExists = prescriptions.find(p => p.medicineId === selectedMedId)
      if (alreadyExists) {
        alert('该药品已在处方中')
        return
      }

      setPrescriptions(prev => [...prev, {
        medicineId: selectedMedId,
        medicine: med,
        dosage: result.data.dosagePerTime + med.unit,
        frequency: prescFrequency,
        duration: `${prescDurationDays}天`,
        durationDays: prescDurationDays,
        quantity: result.data.totalQuantity,
        unitPrice: med.price_per_unit,
        subtotal: parseFloat(result.data.subtotal),
        usageInstructions: `${med.dosage_per_kg > 0 ? `按体重计算，每次${result.data.dosagePerTime}${med.unit}，${prescFrequency}` : '遵医嘱使用'}`
      }])

      setSelectedMedId('')
    } catch (e: any) {
      setCalcError(e.message)
    } finally {
      setCalculating(false)
    }
  }

  const removePrescription = (idx: number) => {
    setPrescriptions(prev => prev.filter((_, i) => i !== idx))
  }

  const addService = () => {
    if (!selectedServiceId) return
    const item = services.find(s => s.id === selectedServiceId)
    if (!item) return

    const alreadyExists = serviceOrders.find(s => s.itemId === selectedServiceId)
    if (alreadyExists) {
      alert('该服务项目已添加')
      return
    }

    setServiceOrders(prev => [...prev, {
      itemId: selectedServiceId,
      item,
      quantity: serviceQuantity,
      unitPrice: item.price,
      subtotal: item.price * serviceQuantity
    }])
    setSelectedServiceId('')
    setServiceQuantity(1)
  }

  const removeService = (idx: number) => {
    setServiceOrders(prev => prev.filter((_, i) => i !== idx))
  }

  const totalPrescriptionAmount = prescriptions.reduce((sum, p) => sum + p.subtotal, 0)
  const totalServiceAmount = serviceOrders.reduce((sum, s) => sum + s.subtotal, 0)
  const totalAmount = 20 + totalPrescriptionAmount + totalServiceAmount

  const handleSubmit = async () => {
    if (!currentReg) {
      alert('请选择要诊疗的病例')
      return
    }
    if (!diagnosis.trim()) {
      alert('请填写诊断结果')
      return
    }

    setSubmitting(true)
    try {
      const result = await window.api.diagnosis.create({
        registrationId: currentReg.id,
        doctorId: currentReg.doctor_id!,
        petId: currentReg.pet_id,
        chiefComplaint,
        examination,
        diagnosis,
        treatmentPlan,
        prescriptions: prescriptions.map(p => ({
          medicineId: p.medicineId,
          dosage: p.dosage,
          frequency: p.frequency,
          duration: p.duration,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
          subtotal: p.subtotal,
          usageInstructions: p.usageInstructions
        })),
        serviceItems: serviceOrders.map(s => ({
          itemId: s.itemId,
          quantity: s.quantity,
          unitPrice: s.unitPrice,
          subtotal: s.subtotal
        }))
      })

      if (!result.success) {
        alert(result.error || '提交失败')
        return
      }

      await loadMedicines()
      await loadQueue()
      await loadDoctors()
      await loadStockAlerts()

      alert(`✅ 诊疗完成！诊断ID: ${result.data.diagnosisId}\n\n药品库存已自动扣减，状态已更新。`)

      if (confirm('是否立即前往收费结算？')) {
        navigate(`/payment/${currentReg.id}`)
      }
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const lowStockMeds = medicines.filter(m => m.stock < m.safety_threshold)

  return (
    <div className="grid grid-cols-12 gap-6 h-full">
      <div className="col-span-3 space-y-4 overflow-y-auto">
        <div className="card">
          <div className="card-header !py-3 text-sm">选择病例</div>
          <div className="card-body !p-2 space-y-1 max-h-[400px] overflow-y-auto">
            <div className="text-xs font-semibold text-blue-600 px-2 py-1">诊疗中 ({pendingDiagnosing.length})</div>
            {pendingDiagnosing.length === 0 && <p className="text-xs text-gray-400 px-2 py-2">暂无诊疗中病例</p>}
            {pendingDiagnosing.map(reg => (
              <div
                key={reg.id}
                onClick={() => {
                  setCurrentReg(reg)
                  navigate(`/diagnosis/${reg.id}`)
                }}
                className={`p-2 rounded-lg cursor-pointer text-sm ${
                  currentReg?.id === reg.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between mb-1">
                  <span className="font-semibold">No.{reg.queue_number}</span>
                  <span className="badge-blue">诊疗中</span>
                </div>
                <p>{reg.pet_name}（{reg.owner_name}）</p>
                <p className="text-xs text-gray-500">{reg.symptom_name}</p>
              </div>
            ))}

            <div className="text-xs font-semibold text-amber-600 px-2 py-1 mt-2">待接诊 ({pendingWaiting.length})</div>
            {pendingWaiting.length === 0 && <p className="text-xs text-gray-400 px-2 py-2">暂无待接诊病例</p>}
            {pendingWaiting.slice(0, 5).map(reg => (
              <div
                key={reg.id}
                onClick={() => {
                  useAppStore.getState().callRegistration(reg.id).then(() => {
                    setCurrentReg({ ...reg, status: 'diagnosing' })
                    navigate(`/diagnosis/${reg.id}`)
                  })
                }}
                className="p-2 rounded-lg cursor-pointer text-sm hover:bg-amber-50 border border-transparent hover:border-amber-200"
              >
                <div className="flex justify-between mb-1">
                  <span className="font-semibold">No.{reg.queue_number}</span>
                  <span className={`badge-${reg.urgency_level >= 3 ? 'red' : 'yellow'}`}>{reg.urgency_level >= 3 ? '紧急' : '待诊'}</span>
                </div>
                <p>{reg.pet_name}（{reg.owner_name}）</p>
                <p className="text-xs text-gray-500">{reg.doctor_name} · {reg.room_number}</p>
              </div>
            ))}
          </div>
        </div>

        {lowStockMeds.length > 0 && (
          <div className="card border-red-200">
            <div className="card-header !py-3 !text-red-700 text-sm flex items-center gap-2">
              <span>⚠️</span> 库存预警药品
            </div>
            <div className="card-body !p-0">
              {lowStockMeds.map(m => (
                <div key={m.id} className="px-3 py-2 border-b border-red-100 text-sm last:border-0 flex justify-between">
                  <span>{m.name}</span>
                  <span className={m.stock <= 0 ? 'text-red-600 font-bold' : 'text-amber-600 font-semibold'}>
                    剩 {m.stock}{m.unit}（阈值{m.safety_threshold}）
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="col-span-6 space-y-4 overflow-y-auto">
        {!currentReg ? (
          <div className="card h-96 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <div className="text-6xl mb-4">💊</div>
              <p className="text-lg">请从左侧选择要诊疗的病例</p>
              <p className="text-sm mt-2">或在候诊队列中呼叫患者</p>
            </div>
          </div>
        ) : (
          <>
            <div className="card">
              <div className="card-header flex items-center justify-between !py-3">
                <span className="flex items-center gap-2">
                  <span className="text-xl">🐾</span>
                  病例基本信息
                </span>
                <div className="flex gap-2">
                  <span className="badge-blue">No.{currentReg.queue_number}</span>
                  <span className={`badge-${currentReg.urgency_level >= 3 ? 'red' : 'orange'}`}>
                    {currentReg.urgency_level >= 4 ? '危重' : currentReg.urgency_level >= 3 ? '紧急' : '常规'}
                  </span>
                </div>
              </div>
              <div className="card-body grid grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">宠物名称：</span>
                  <span className="font-semibold">{currentReg.pet_name}</span>
                </div>
                <div>
                  <span className="text-gray-500">品种：</span>
                  <span>{currentReg.species} · {currentReg.breed}</span>
                </div>
                <div>
                  <span className="text-gray-500">体重：</span>
                  <span className="font-bold text-blue-600">{currentReg.weight || '未知'} kg</span>
                </div>
                <div>
                  <span className="text-gray-500">主人：</span>
                  <span>{currentReg.owner_name}</span>
                </div>
                <div>
                  <span className="text-gray-500">联系电话：</span>
                  <span>{currentReg.phone}</span>
                </div>
                <div>
                  <span className="text-gray-500">主治医生：</span>
                  <span className="font-semibold">{currentReg.doctor_name}</span>
                </div>
                <div>
                  <span className="text-gray-500">科室：</span>
                  <span>{currentReg.department_name}</span>
                </div>
                <div>
                  <span className="text-gray-500">诊室：</span>
                  <span className="font-mono">{currentReg.room_number}</span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header !py-3">诊疗记录</div>
              <div className="card-body space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">主诉</label>
                    <textarea
                      className="input min-h-[80px]"
                      value={chiefComplaint}
                      onChange={e => setChiefComplaint(e.target.value)}
                      placeholder="宠物主人描述的主要症状和持续时间..."
                    />
                  </div>
                  <div>
                    <label className="label">检查结果</label>
                    <textarea
                      className="input min-h-[80px]"
                      value={examination}
                      onChange={e => setExamination(e.target.value)}
                      placeholder="体格检查、实验室检查、影像检查等结果..."
                    />
                  </div>
                </div>
                <div>
                  <label className="label">诊断结果 <span className="text-red-500">*</span></label>
                  <textarea
                    className="input min-h-[60px]"
                    value={diagnosis}
                    onChange={e => setDiagnosis(e.target.value)}
                    placeholder="请填写明确的诊断结论..."
                  />
                </div>
                <div>
                  <label className="label">治疗方案</label>
                  <textarea
                    className="input min-h-[60px]"
                    value={treatmentPlan}
                    onChange={e => setTreatmentPlan(e.target.value)}
                    placeholder="整体治疗建议、注意事项、复诊安排等..."
                  />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header flex items-center justify-between !py-3">
                <span>开具处方</span>
                <span className="text-xs text-gray-500">系统将根据体重 {petWeight}kg 自动计算剂量</span>
              </div>
              <div className="card-body space-y-3">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-5">
                    <label className="label">选择药品</label>
                    <select
                      className="input"
                      value={selectedMedId}
                      onChange={e => setSelectedMedId(e.target.value ? parseInt(e.target.value) : '')}
                    >
                      <option value="">-- 请选择药品 --</option>
                      {medicines.map(m => (
                        <option
                          key={m.id}
                          value={m.id}
                          disabled={m.stock <= 0}
                        >
                          {m.name}（{m.specification}） - ¥{m.price_per_unit}/{m.unit} - 库存{m.stock}
                          {m.stock < m.safety_threshold && ' ⚠️'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="label">用药频率</label>
                    <select
                      className="input"
                      value={prescFrequency}
                      onChange={e => setPrescFrequency(e.target.value)}
                    >
                      <option>每日1次</option>
                      <option>每日2次</option>
                      <option>每日3次</option>
                      <option>每日4次</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="label">疗程天数</label>
                    <input
                      type="number"
                      min="1"
                      className="input"
                      value={prescDurationDays}
                      onChange={e => setPrescDurationDays(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="col-span-3 flex items-end">
                    <button
                      className="btn-primary w-full"
                      onClick={addPrescription}
                      disabled={calculating || !selectedMedId}
                    >
                      {calculating ? '计算中...' : '➕ 添加药品'}
                    </button>
                  </div>
                </div>
                {calcError && <p className="text-red-600 text-sm">❌ {calcError}</p>}

                {prescriptions.length === 0 ? (
                  <p className="text-center text-gray-400 py-6 text-sm">暂无处方药品</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>药品名称</th>
                        <th>规格</th>
                        <th>单次剂量</th>
                        <th>频率</th>
                        <th>疗程</th>
                        <th>数量</th>
                        <th>单价</th>
                        <th>小计</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prescriptions.map((p, idx) => (
                        <tr key={idx}>
                          <td className="font-medium">{p.medicine?.name}</td>
                          <td className="text-xs text-gray-500">{p.medicine?.specification}</td>
                          <td className="text-blue-600 font-semibold">{p.dosage}</td>
                          <td>{p.frequency}</td>
                          <td>{p.duration}</td>
                          <td>{p.quantity}{p.medicine?.unit}</td>
                          <td>¥{p.unitPrice.toFixed(2)}</td>
                          <td className="font-semibold">¥{p.subtotal.toFixed(2)}</td>
                          <td>
                            <button className="text-red-500 hover:text-red-700 text-xs" onClick={() => removePrescription(idx)}>删除</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header !py-3">服务项目</div>
              <div className="card-body space-y-3">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-7">
                    <label className="label">选择服务项目</label>
                    <select
                      className="input"
                      value={selectedServiceId}
                      onChange={e => setSelectedServiceId(e.target.value ? parseInt(e.target.value) : '')}
                    >
                      <option value="">-- 请选择服务项目 --</option>
                      {services.map(s => (
                        <option key={s.id} value={s.id}>
                          [{s.category}] {s.name} - ¥{s.price}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="label">数量</label>
                    <input
                      type="number"
                      min="1"
                      className="input"
                      value={serviceQuantity}
                      onChange={e => setServiceQuantity(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="col-span-3 flex items-end">
                    <button
                      className="btn-primary w-full"
                      onClick={addService}
                      disabled={!selectedServiceId}
                    >
                      ➕ 添加服务
                    </button>
                  </div>
                </div>

                {serviceOrders.length === 0 ? (
                  <p className="text-center text-gray-400 py-6 text-sm">暂无服务项目</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>服务项目</th>
                        <th>分类</th>
                        <th>数量</th>
                        <th>单价</th>
                        <th>小计</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serviceOrders.map((s, idx) => (
                        <tr key={idx}>
                          <td className="font-medium">{s.item?.name}</td>
                          <td>{s.item?.category}</td>
                          <td>{s.quantity}</td>
                          <td>¥{s.unitPrice.toFixed(2)}</td>
                          <td className="font-semibold">¥{s.subtotal.toFixed(2)}</td>
                          <td>
                            <button className="text-red-500 hover:text-red-700 text-xs" onClick={() => removeService(idx)}>删除</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="col-span-3 space-y-4">
        <div className="card sticky top-0">
          <div className="card-header !py-3">费用汇总</div>
          <div className="card-body space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">挂号费</span>
              <span>¥20.00</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">药品费 ({prescriptions.length}种)</span>
              <span>¥{totalPrescriptionAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">服务费 ({serviceOrders.length}项)</span>
              <span>¥{totalServiceAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-3 pt-4">
              <span className="font-bold text-base">应收总计</span>
              <span className="text-2xl font-bold text-red-600">¥{totalAmount.toFixed(2)}</span>
            </div>

            <button
              className="btn-success w-full py-3 text-base"
              onClick={handleSubmit}
              disabled={!currentReg || !diagnosis.trim() || submitting}
            >
              {submitting ? '提交中...' : '✓ 完成诊疗，开具处方'}
            </button>

            <button
              className="btn-secondary w-full"
              onClick={() => navigate('/queue')}
              disabled={submitting}
            >
              ← 返回候诊队列
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
