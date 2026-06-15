import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import type { Pet, PetOwner, Symptom } from '../types'

export default function RegistrationPage() {
  const navigate = useNavigate()
  const { pets, owners, symptoms, addRegistration } = useAppStore()

  const [selectedOwner, setSelectedOwner] = useState<PetOwner | null>(null)
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null)
  const [selectedSymptoms, setSelectedSymptoms] = useState<number[]>([])
  const [symptomDescription, setSymptomDescription] = useState('')
  const [urgencyLevel, setUrgencyLevel] = useState(1)
  const [searchText, setSearchText] = useState('')
  const [newPetMode, setNewPetMode] = useState(false)
  const [newPetForm, setNewPetForm] = useState({ name: '', species: '犬', breed: '', gender: '公', age: '', weight: '' })
  const [submitting, setSubmitting] = useState(false)
  const [successInfo, setSuccessInfo] = useState<any>(null)

  const filteredOwners = owners.filter(o =>
    o.name.includes(searchText) || o.phone?.includes(searchText)
  )
  const ownerPets = selectedOwner ? pets.filter(p => p.owner_id === selectedOwner.id) : []

  const urgencyOptions = [
    { level: 1, label: '常规', color: 'blue', desc: '普通门诊，按顺序等候' },
    { level: 2, label: '较急', color: 'orange', desc: '优先安排，建议尽快就诊' },
    { level: 3, label: '紧急', color: 'red', desc: '优先呼叫，安排急诊通道' },
    { level: 4, label: '危重', color: 'red', desc: '立即抢救，无需排队' },
    { level: 5, label: '极危', color: 'red', desc: '绿色通道，立即处置' }
  ]

  const handleSymptomToggle = (symptomId: number, defaultUrgency: number) => {
    setSelectedSymptoms(prev => {
      const newSelected = prev.includes(symptomId)
        ? prev.filter(id => id !== symptomId)
        : [...prev, symptomId]

      if (newSelected.length > 0) {
        const maxUrgency = Math.max(
          ...newSelected.map(id => {
            const s = symptoms.find(sym => sym.id === id)
            return s?.default_urgency || 1
          })
        )
        setUrgencyLevel(Math.max(urgencyLevel, maxUrgency, defaultUrgency))
      }
      return newSelected
    })
  }

  const handleSubmit = async () => {
    if (!selectedOwner || (!selectedPet && !newPetMode)) {
      alert('请选择宠物主人和宠物')
      return
    }
    if (selectedSymptoms.length === 0 && !symptomDescription) {
      alert('请选择症状或填写症状描述')
      return
    }

    setSubmitting(true)
    try {
      let petId = selectedPet?.id

      if (newPetMode && selectedOwner) {
        const result = await window.api.query(
          `INSERT INTO pets (name, owner_id, species, breed, gender, age, weight) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [newPetForm.name, selectedOwner.id, newPetForm.species, newPetForm.breed, newPetForm.gender,
            newPetForm.age ? parseInt(newPetForm.age) : null, newPetForm.weight ? parseFloat(newPetForm.weight) : null]
        )
        if (result.success) {
          petId = Number(result.data.lastInsertRowid)
        }
      }

      if (!petId) {
        alert('宠物信息处理失败')
        return
      }

      const result = await addRegistration({
        petId,
        ownerId: selectedOwner.id,
        symptomIds: selectedSymptoms,
        symptomDescription,
        urgencyLevel
      })

      if (result.success) {
        setSuccessInfo(result.data)
      } else {
        alert(result.error || '挂号失败')
      }
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setSelectedOwner(null)
    setSelectedPet(null)
    setSelectedSymptoms([])
    setSymptomDescription('')
    setUrgencyLevel(1)
    setNewPetMode(false)
    setNewPetForm({ name: '', species: '犬', breed: '', gender: '公', age: '', weight: '' })
    setSuccessInfo(null)
    useAppStore.getState().loadPets()
  }

  if (successInfo) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="card w-full max-w-md p-8 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">✅</span>
          </div>
          <h3 className="text-2xl font-bold text-green-700 mb-2">挂号成功！</h3>
          <p className="text-gray-500 mb-6">已自动完成分诊和医生分配</p>

          <div className="bg-gray-50 rounded-xl p-5 mb-6 space-y-3 text-left">
            <div className="flex justify-between">
              <span className="text-gray-500">排队号码</span>
              <span className="text-2xl font-bold text-blue-600">No.{successInfo.queueNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">就诊科室</span>
              <span className="font-semibold">{symptoms.find(s => s.id === successInfo.departmentId)?.department_name || '已分配'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">主治医生</span>
              <span className="font-semibold">Dr. {successInfo.doctorId || '已分配'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">紧急程度</span>
              <span className={`badge-${urgencyLevel >= 3 ? 'red' : urgencyLevel >= 2 ? 'orange' : 'blue'}`}>
                {urgencyOptions.find(o => o.level === urgencyLevel)?.label}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={resetForm}>继续挂号</button>
            <button className="btn-primary flex-1" onClick={() => navigate('/queue')}>查看候诊队列</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-12 gap-6 h-full">
      <div className="col-span-3 card h-full overflow-hidden flex flex-col">
        <div className="card-header !py-4">
          <label className="label">搜索宠物主人</label>
          <input
            className="input"
            placeholder="输入姓名或手机号"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredOwners.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">未找到匹配的主人信息</p>
          ) : (
            filteredOwners.map(owner => (
              <div
                key={owner.id}
                onClick={() => { setSelectedOwner(owner); setSelectedPet(null); setNewPetMode(false) }}
                className={`p-3 rounded-lg cursor-pointer transition-all border-2 ${
                  selectedOwner?.id === owner.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-transparent hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold">{owner.name}</span>
                  <span className={`badge-${owner.member_level === 'gold' ? 'yellow' : owner.member_level === 'silver' ? 'gray' : 'blue'}`}>
                    {owner.member_level === 'gold' ? '金卡' : owner.member_level === 'silver' ? '银卡' : '普通会员'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">📞 {owner.phone || '暂无电话'}</p>
                <p className="text-xs text-gray-500 mt-1">💰 积分: {owner.points} | 累计消费: ¥{owner.total_spent}</p>
                <p className="text-xs text-blue-600 mt-1">🐾 养宠 {pets.filter(p => p.owner_id === owner.id).length} 只</p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="col-span-5 space-y-6 overflow-y-auto">
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <span>选择宠物</span>
            {selectedOwner && (
              <button
                className="text-sm text-blue-600 hover:underline"
                onClick={() => { setNewPetMode(!newPetMode); setSelectedPet(null) }}
              >
                {newPetMode ? '选择已有宠物' : '+ 新增宠物'}
              </button>
            )}
          </div>
          <div className="card-body">
            {!selectedOwner ? (
              <p className="text-center text-gray-400 py-8">请先选择宠物主人</p>
            ) : newPetMode ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">宠物名称 *</label>
                  <input className="input" value={newPetForm.name} onChange={e => setNewPetForm(f => ({ ...f, name: e.target.value }))} placeholder="请输入宠物名称" />
                </div>
                <div>
                  <label className="label">物种</label>
                  <select className="input" value={newPetForm.species} onChange={e => setNewPetForm(f => ({ ...f, species: e.target.value }))}>
                    <option>犬</option><option>猫</option><option>兔</option><option>鸟</option><option>其他</option>
                  </select>
                </div>
                <div>
                  <label className="label">品种</label>
                  <input className="input" value={newPetForm.breed} onChange={e => setNewPetForm(f => ({ ...f, breed: e.target.value }))} placeholder="请输入品种" />
                </div>
                <div>
                  <label className="label">性别</label>
                  <select className="input" value={newPetForm.gender} onChange={e => setNewPetForm(f => ({ ...f, gender: e.target.value }))}>
                    <option>公</option><option>母</option>
                  </select>
                </div>
                <div>
                  <label className="label">年龄（岁）</label>
                  <input className="input" type="number" value={newPetForm.age} onChange={e => setNewPetForm(f => ({ ...f, age: e.target.value }))} placeholder="请输入年龄" />
                </div>
                <div>
                  <label className="label">体重（kg）</label>
                  <input className="input" type="number" step="0.1" value={newPetForm.weight} onChange={e => setNewPetForm(f => ({ ...f, weight: e.target.value }))} placeholder="请输入体重" />
                </div>
              </div>
            ) : ownerPets.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 mb-3">该主人暂无登记宠物</p>
                <button className="btn-primary" onClick={() => setNewPetMode(true)}>+ 添加第一只宠物</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {ownerPets.map(pet => (
                  <div
                    key={pet.id}
                    onClick={() => setSelectedPet(pet)}
                    className={`p-4 rounded-xl cursor-pointer transition-all border-2 ${
                      selectedPet?.id === pet.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white text-xl">
                        {pet.species === '犬' ? '🐶' : pet.species === '猫' ? '🐱' : pet.species === '兔' ? '🐰' : '🐾'}
                      </div>
                      <div>
                        <p className="font-bold">{pet.name}</p>
                        <p className="text-xs text-gray-500">{pet.species} · {pet.breed || '未知品种'}</p>
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span>⚧ {pet.gender || '未知'}</span>
                      <span>🎂 {pet.age || '?'}岁</span>
                      <span>⚖️ {pet.weight || '?'}kg</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">症状描述</div>
          <div className="card-body space-y-4">
            <div>
              <label className="label">选择症状标签（可多选）</label>
              <div className="flex flex-wrap gap-2">
                {symptoms.map(symptom => (
                  <button
                    key={symptom.id}
                    onClick={() => handleSymptomToggle(symptom.id, symptom.default_urgency)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all border-2 ${
                      selectedSymptoms.includes(symptom.id)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {symptom.name}
                    {symptom.default_urgency >= 3 && <span className="ml-1">⚠️</span>}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">详细症状描述</label>
              <textarea
                className="input min-h-[80px]"
                placeholder="请详细描述宠物的症状、持续时间、近期饮食等情况..."
                value={symptomDescription}
                onChange={e => setSymptomDescription(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="col-span-4 space-y-6">
        <div className="card">
          <div className="card-header">紧急程度分级</div>
          <div className="card-body space-y-2">
            {urgencyOptions.map(opt => (
              <div
                key={opt.level}
                onClick={() => setUrgencyLevel(opt.level)}
                className={`p-3 rounded-lg cursor-pointer transition-all border-2 ${
                  urgencyLevel === opt.level
                    ? `border-${opt.color}-500 bg-${opt.color}-50`
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                style={urgencyLevel === opt.level ? {
                  borderColor: opt.color === 'blue' ? '#3b82f6' : opt.color === 'orange' ? '#f59e0b' : '#ef4444',
                  backgroundColor: opt.color === 'blue' ? '#eff6ff' : opt.color === 'orange' ? '#fffbeb' : '#fef2f2'
                } : {}}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{'⭐'.repeat(opt.level)}</span>
                    <span className="font-semibold">{opt.label}</span>
                  </div>
                  {opt.level >= 3 && <span className="badge-red">优先处理</span>}
                </div>
                <p className="text-xs text-gray-500 mt-1 ml-8">{opt.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">挂号信息确认</div>
          <div className="card-body space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">宠物主人</span>
              <span className="font-medium">{selectedOwner?.name || '未选择'}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">就诊宠物</span>
              <span className="font-medium">
                {newPetMode ? newPetForm.name || '待填写' : selectedPet?.name || '未选择'}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">体重</span>
              <span className="font-medium">
                {newPetMode ? `${newPetForm.weight || '?'}kg` : `${selectedPet?.weight || '?'}kg`}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">症状数量</span>
              <span className="font-medium">{selectedSymptoms.length} 项</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-500">挂号费用</span>
              <span className="font-bold text-lg text-blue-600">
                ¥{urgencyLevel >= 4 ? 80 : urgencyLevel >= 3 ? 50 : 20}
              </span>
            </div>
          </div>
        </div>

        <button
          className="btn-success w-full py-4 text-lg"
          onClick={handleSubmit}
          disabled={submitting || !selectedOwner || (!selectedPet && !newPetMode)}
        >
          {submitting ? '提交中...' : '✓ 确认挂号并自动分诊'}
        </button>
      </div>
    </div>
  )
}
