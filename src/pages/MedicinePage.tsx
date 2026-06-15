import { useEffect, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { Medicine } from '../types'

export default function MedicinePage() {
  const { medicines, stockAlerts, loadMedicines, loadStockAlerts } = useAppStore()
  const [searchText, setSearchText] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)
  const [selectedMed, setSelectedMed] = useState<Medicine | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newMedForm, setNewMedForm] = useState({
    name: '', category: '', specification: '', unit: '片',
    dosage_per_kg: 0, price_per_unit: 0, stock: 0, safety_threshold: 10
  })
  const [stockAdjustMode, setStockAdjustMode] = useState<'add' | 'reduce'>('add')
  const [stockAdjustAmount, setStockAdjustAmount] = useState(0)
  const [showStockAdjust, setShowStockAdjust] = useState(false)

  const categories = ['all', ...new Set(medicines.map(m => m.category).filter(Boolean))] as string[]

  const filtered = medicines.filter(m => {
    if (searchText && !m.name.includes(searchText) && !m.category?.includes(searchText)) return false
    if (categoryFilter !== 'all' && m.category !== categoryFilter) return false
    if (showLowStockOnly && m.stock >= m.safety_threshold) return false
    return true
  })

  const totalStock = medicines.reduce((sum, m) => sum + m.stock, 0)
  const totalValue = medicines.reduce((sum, m) => sum + m.stock * m.price_per_unit, 0)
  const lowStockCount = medicines.filter(m => m.stock < m.safety_threshold).length
  const outOfStock = medicines.filter(m => m.stock <= 0).length

  const handleAddMedicine = async () => {
    if (!newMedForm.name || newMedForm.price_per_unit <= 0) {
      alert('请填写药品名称和单价')
      return
    }
    const result = await window.api.query(
      `INSERT INTO medicines (name, category, specification, unit, dosage_per_kg, price_per_unit, stock, safety_threshold)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newMedForm.name, newMedForm.category, newMedForm.specification, newMedForm.unit,
        newMedForm.dosage_per_kg, newMedForm.price_per_unit, newMedForm.stock, newMedForm.safety_threshold]
    )
    if (result.success) {
      alert('✅ 药品添加成功')
      setShowAddModal(false)
      setNewMedForm({ name: '', category: '', specification: '', unit: '片', dosage_per_kg: 0, price_per_unit: 0, stock: 0, safety_threshold: 10 })
      await loadMedicines()
      await loadStockAlerts()
    } else {
      alert(result.error)
    }
  }

  const handleStockAdjust = async () => {
    if (!selectedMed || stockAdjustAmount <= 0) return
    const change = stockAdjustMode === 'add' ? stockAdjustAmount : -stockAdjustAmount

    if (stockAdjustMode === 'reduce' && selectedMed.stock < stockAdjustAmount) {
      alert('库存不足，无法扣减')
      return
    }

    const result = await window.api.query(
      'UPDATE medicines SET stock = stock + ? WHERE id = ?',
      [change, selectedMed.id]
    )
    if (result.success) {
      const newStock = selectedMed.stock + change
      if (newStock < selectedMed.safety_threshold) {
        const existing = stockAlerts.find(a => a.medicine_id === selectedMed.id && !a.resolved)
        if (!existing) {
          await window.api.query(
            'INSERT INTO stock_alerts (medicine_id, alert_type, current_stock, threshold) VALUES (?, ?, ?, ?)',
            [selectedMed.id, 'low_stock', newStock, selectedMed.safety_threshold]
          )
        } else {
          await window.api.query(
            'UPDATE stock_alerts SET current_stock = ? WHERE id = ?',
            [newStock, existing.id]
          )
        }
      } else {
        await window.api.query(
          'UPDATE stock_alerts SET resolved = 1 WHERE medicine_id = ? AND resolved = 0',
          [selectedMed.id]
        )
      }

      alert(`✅ 库存调整成功！${stockAdjustMode === 'add' ? '增加' : '减少'} ${stockAdjustAmount}${selectedMed.unit}`)
      setShowStockAdjust(false)
      setSelectedMed(null)
      setStockAdjustAmount(0)
      await loadMedicines()
      await loadStockAlerts()
    } else {
      alert(result.error)
    }
  }

  const resolveAlert = async (alertId: number, medId: number) => {
    await window.api.query('UPDATE stock_alerts SET resolved = 1 WHERE id = ?', [alertId])
    await loadStockAlerts()
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="grid grid-cols-5 gap-4 shrink-0">
        <div className="card card-body !p-5 flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center text-3xl">💊</div>
          <div>
            <p className="text-sm text-gray-500">药品品种</p>
            <p className="text-3xl font-bold text-blue-600">{medicines.length}</p>
          </div>
        </div>
        <div className="card card-body !p-5 flex items-center gap-4">
          <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center text-3xl">📦</div>
          <div>
            <p className="text-sm text-gray-500">总库存量</p>
            <p className="text-3xl font-bold text-green-600">{totalStock.toLocaleString()}</p>
          </div>
        </div>
        <div className="card card-body !p-5 flex items-center gap-4">
          <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center text-3xl">💎</div>
          <div>
            <p className="text-sm text-gray-500">库存总价值</p>
            <p className="text-3xl font-bold text-purple-600">¥{totalValue.toFixed(0)}</p>
          </div>
        </div>
        <div className={`card card-body !p-5 flex items-center gap-4 ${lowStockCount > 0 ? 'border-amber-300 border-2' : ''}`}>
          <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center text-3xl">⚠️</div>
          <div>
            <p className="text-sm text-gray-500">库存预警</p>
            <p className={`text-3xl font-bold ${lowStockCount > 0 ? 'text-amber-600' : 'text-gray-600'}`}>{lowStockCount}</p>
          </div>
        </div>
        <div className={`card card-body !p-5 flex items-center gap-4 ${outOfStock > 0 ? 'border-red-300 border-2' : ''}`}>
          <div className="w-14 h-14 bg-red-100 rounded-xl flex items-center justify-center text-3xl">⛔</div>
          <div>
            <p className="text-sm text-gray-500">缺货品种</p>
            <p className={`text-3xl font-bold ${outOfStock > 0 ? 'text-red-600' : 'text-gray-600'}`}>{outOfStock}</p>
          </div>
        </div>
      </div>

      {stockAlerts.length > 0 && (
        <div className="card border-amber-300 shrink-0">
          <div className="card-header !py-3 !text-amber-700 flex items-center justify-between !bg-amber-50/50">
            <span className="flex items-center gap-2">
              <span>🚨</span>
              实时库存预警（{stockAlerts.length}）
            </span>
            <button className="text-xs text-amber-700 hover:underline" onClick={loadStockAlerts}>刷新</button>
          </div>
          <div className="card-body !p-0">
            <div className="grid grid-cols-4 gap-3 p-3">
              {stockAlerts.map(alert => {
                const med = medicines.find(m => m.id === alert.medicine_id)
                const percent = alert.threshold > 0 ? (alert.current_stock / alert.threshold) * 100 : 0
                return (
                  <div key={alert.id} className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-3 border border-amber-200">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold text-amber-900">{med?.name || alert.medicine_name}</p>
                        <p className="text-xs text-gray-600">{med?.specification}</p>
                      </div>
                      <button className="text-xs text-green-700 hover:underline" onClick={() => resolveAlert(alert.id, alert.medicine_id)}>
                        标记处理
                      </button>
                    </div>
                    <div className="mb-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600">当前库存 / 安全阈值</span>
                        <span className="font-semibold">
                          <span className={alert.current_stock <= 0 ? 'text-red-600 font-bold' : 'text-amber-700'}>
                            {alert.current_stock}{med?.unit}
                          </span>
                          <span className="text-gray-400 mx-1">/</span>
                          <span>{alert.threshold}{med?.unit}</span>
                        </span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${percent < 30 ? 'bg-red-500' : percent < 60 ? 'bg-amber-500' : 'bg-yellow-400'}`}
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                    <button
                      className="w-full text-xs py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                      onClick={() => {
                        setSelectedMed(med || null)
                        setStockAdjustMode('add')
                        setShowStockAdjust(true)
                      }}
                    >
                      立即补货
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="card shrink-0">
        <div className="card-header flex items-center justify-between !py-4">
          <div className="flex items-center gap-4">
            <input
              className="input !w-64"
              placeholder="🔍 搜索药品名称、分类..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
            <select
              className="input !w-36"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              {categories.map(c => (
                <option key={c} value={c}>{c === 'all' ? '全部分类' : c}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showLowStockOnly}
                onChange={e => setShowLowStockOnly(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">仅显示库存不足</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary text-sm" onClick={() => { loadMedicines(); loadStockAlerts() }}>🔄 刷新</button>
            <button className="btn-primary text-sm" onClick={() => setShowAddModal(true)}>+ 新增药品</button>
          </div>
        </div>
      </div>

      <div className="card flex-1 overflow-hidden flex flex-col">
        <div className="overflow-y-auto flex-1">
          <table className="table">
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th>药品名称</th>
                <th>分类</th>
                <th>规格</th>
                <th>单位</th>
                <th>每kg剂量</th>
                <th>单价</th>
                <th>当前库存</th>
                <th>安全阈值</th>
                <th>库存价值</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-16 text-gray-400">
                    <div className="text-5xl mb-3">💊</div>
                    未找到符合条件的药品
                  </td>
                </tr>
              ) : (
                filtered.map(med => {
                  const stockPercent = med.safety_threshold > 0 ? (med.stock / med.safety_threshold) * 100 : 100
                  return (
                    <tr key={med.id}>
                      <td className="font-semibold">{med.name}</td>
                      <td>
                        <span className="badge-blue">{med.category || '未分类'}</span>
                      </td>
                      <td className="text-sm text-gray-600">{med.specification || '-'}</td>
                      <td>{med.unit}</td>
                      <td className="text-sm">
                        {med.dosage_per_kg > 0 ? `${med.dosage_per_kg}${med.unit}/kg` : '-'}
                      </td>
                      <td className="font-semibold">¥{med.price_per_unit.toFixed(2)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-[80px]">
                            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  med.stock <= 0 ? 'bg-red-600' : stockPercent < 50 ? 'bg-amber-500' : 'bg-green-500'
                                }`}
                                style={{ width: `${Math.min(stockPercent, 100)}%` }}
                              ></div>
                            </div>
                          </div>
                          <span className={`font-mono font-semibold min-w-[60px] text-right ${
                            med.stock <= 0 ? 'text-red-600' : stockPercent < 100 ? 'text-amber-600' : 'text-green-700'
                          }`}>
                            {med.stock}{med.unit}
                          </span>
                        </div>
                      </td>
                      <td className="text-gray-600">{med.safety_threshold}{med.unit}</td>
                      <td className="font-semibold text-purple-600">¥{(med.stock * med.price_per_unit).toFixed(2)}</td>
                      <td>
                        {med.stock <= 0 ? (
                          <span className="badge-red">缺货</span>
                        ) : stockPercent < 100 ? (
                          <span className="badge-yellow">库存不足</span>
                        ) : (
                          <span className="badge-green">充足</span>
                        )}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            className="btn-success !px-2 !py-1 text-xs"
                            onClick={() => { setSelectedMed(med); setStockAdjustMode('add'); setShowStockAdjust(true) }}
                          >
                            入库
                          </button>
                          <button
                            className="btn-warning !px-2 !py-1 text-xs"
                            onClick={() => { setSelectedMed(med); setStockAdjustMode('reduce'); setShowStockAdjust(true) }}
                          >
                            出库
                          </button>
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

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">➕ 新增药品</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">药品名称 *</label>
                <input className="input" value={newMedForm.name} onChange={e => setNewMedForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">分类</label>
                <select className="input" value={newMedForm.category} onChange={e => setNewMedForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="">请选择分类</option>
                  <option>抗生素</option>
                  <option>解热镇痛</option>
                  <option>止泻药</option>
                  <option>肠道调理</option>
                  <option>抗过敏</option>
                  <option>驱虫药</option>
                  <option>维生素</option>
                  <option>消毒剂</option>
                  <option>其他</option>
                </select>
              </div>
              <div>
                <label className="label">规格</label>
                <input className="input" value={newMedForm.specification} onChange={e => setNewMedForm(f => ({ ...f, specification: e.target.value }))} placeholder="如: 250mg*24粒" />
              </div>
              <div>
                <label className="label">计价单位</label>
                <select className="input" value={newMedForm.unit} onChange={e => setNewMedForm(f => ({ ...f, unit: e.target.value }))}>
                  <option>片</option><option>粒</option><option>袋</option>
                  <option>支</option><option>瓶</option><option>盒</option><option>ml</option>
                </select>
              </div>
              <div>
                <label className="label">每kg体重剂量（用于自动计算）</label>
                <input type="number" step="0.01" className="input" value={newMedForm.dosage_per_kg} onChange={e => setNewMedForm(f => ({ ...f, dosage_per_kg: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="label">单价（元） *</label>
                <input type="number" step="0.01" className="input" value={newMedForm.price_per_unit} onChange={e => setNewMedForm(f => ({ ...f, price_per_unit: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="label">初始库存</label>
                <input type="number" className="input" value={newMedForm.stock} onChange={e => setNewMedForm(f => ({ ...f, stock: parseInt(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="label">安全预警阈值</label>
                <input type="number" className="input" value={newMedForm.safety_threshold} onChange={e => setNewMedForm(f => ({ ...f, safety_threshold: parseInt(e.target.value) || 10 }))} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button className="btn-secondary flex-1" onClick={() => setShowAddModal(false)}>取消</button>
              <button className="btn-primary flex-1" onClick={handleAddMedicine}>确认添加</button>
            </div>
          </div>
        </div>
      )}

      {showStockAdjust && selectedMed && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span>{stockAdjustMode === 'add' ? '📥' : '📤'}</span>
              {stockAdjustMode === 'add' ? '药品入库' : '药品出库'}
            </h3>
            <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">药品名称</span>
                <span className="font-semibold">{selectedMed.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">规格</span>
                <span>{selectedMed.specification}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">当前库存</span>
                <span className="font-bold text-blue-600">{selectedMed.stock}{selectedMed.unit}</span>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">操作方式</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setStockAdjustMode('add')}
                    className={`p-3 rounded-xl border-2 transition-all ${stockAdjustMode === 'add' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}
                  >
                    <span className="text-2xl">📥</span>
                    <p className="font-semibold mt-1">入库</p>
                  </button>
                  <button
                    onClick={() => setStockAdjustMode('reduce')}
                    className={`p-3 rounded-xl border-2 transition-all ${stockAdjustMode === 'reduce' ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}
                  >
                    <span className="text-2xl">📤</span>
                    <p className="font-semibold mt-1">出库</p>
                  </button>
                </div>
              </div>
              <div>
                <label className="label">{stockAdjustMode === 'add' ? '入库数量' : '出库数量'}（{selectedMed.unit}）</label>
                <input
                  type="number"
                  min="1"
                  className="input text-xl"
                  value={stockAdjustAmount || ''}
                  onChange={e => setStockAdjustAmount(parseInt(e.target.value) || 0)}
                  placeholder="请输入数量"
                />
              </div>
              {stockAdjustAmount > 0 && (
                <div className="bg-blue-50 rounded-xl p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">调整后库存预计</span>
                    <span className={`text-2xl font-bold ${selectedMed.stock + (stockAdjustMode === 'add' ? stockAdjustAmount : -stockAdjustAmount) < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                      {selectedMed.stock + (stockAdjustMode === 'add' ? stockAdjustAmount : -stockAdjustAmount)}{selectedMed.unit}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button className="btn-secondary flex-1" onClick={() => { setShowStockAdjust(false); setSelectedMed(null) }}>取消</button>
              <button
                className={stockAdjustMode === 'add' ? 'btn-success flex-1' : 'btn-warning flex-1'}
                onClick={handleStockAdjust}
                disabled={stockAdjustAmount <= 0 || (stockAdjustMode === 'reduce' && selectedMed.stock < stockAdjustAmount)}
              >
                确认{stockAdjustMode === 'add' ? '入库' : '出库'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
