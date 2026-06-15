import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import type { Registration, PaymentItem } from '../types'

export default function PaymentPage() {
  const { regId } = useParams()
  const navigate = useNavigate()
  const { registrations, owners, packages, medicines, services, loadOwners, loadQueue, loadData } = useAppStore()

  const [selectedReg, setSelectedReg] = useState<Registration | null>(null)
  const [selectedOwnerId, setSelectedOwnerId] = useState<number | ''>('')
  const [selectedPackageId, setSelectedPackageId] = useState<number | ''>('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'insurance' | 'wechat' | 'alipay' | 'card'>('wechat')
  const [items, setItems] = useState<PaymentItem[]>([])
  const [discountResult, setDiscountResult] = useState<any>(null)
  const [receiptInfo, setReceiptInfo] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const completedRegs = registrations.filter(r => r.status === 'completed')

  useEffect(() => {
    if (regId) {
      const reg = registrations.find(r => r.id === parseInt(regId))
      if (reg) {
        setSelectedReg(reg)
        setSelectedOwnerId(reg.owner_id)
        loadPaymentItems(reg.id, reg.owner_id)
      }
    }
  }, [regId, registrations])

  const loadPaymentItems = async (registrationId: number, ownerId: number) => {
    setLoading(true)
    try {
      const diagResult = await window.api.query(
        'SELECT * FROM diagnoses WHERE registration_id = ? ORDER BY diagnosis_time DESC LIMIT 1',
        [registrationId]
      )

      const loadedItems: PaymentItem[] = []

      loadedItems.push({
        item_type: 'service',
        item_id: 1,
        item_name: '挂号费',
        quantity: 1,
        unit_price: 20,
        subtotal: 20
      })

      if (diagResult.success && diagResult.data && diagResult.data.length > 0) {
        const diagnosisId = diagResult.data[0].id

        const prescResult = await window.api.query(`
          SELECT p.*, m.name as medicine_name
          FROM prescriptions p LEFT JOIN medicines m ON p.medicine_id = m.id
          WHERE p.diagnosis_id = ?
        `, [diagnosisId])

        if (prescResult.success && prescResult.data) {
          prescResult.data.forEach((p: any) => {
            loadedItems.push({
              item_type: 'medicine',
              item_id: p.medicine_id,
              item_name: p.medicine_name,
              quantity: p.quantity,
              unit_price: p.unit_price,
              subtotal: p.subtotal
            })
          })
        }

        loadedItems.push(
          { item_type: 'service', item_id: 5, item_name: '生化全项检查', quantity: 1, unit_price: 280, subtotal: 280 },
          { item_type: 'service', item_id: 4, item_name: '血常规检查', quantity: 1, unit_price: 60, subtotal: 60 }
        )
      }

      setItems(loadedItems)
      await calculateDiscount(ownerId, loadedItems, undefined)
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const calculateDiscount = async (ownerId: number, currentItems: PaymentItem[], pkgId?: number) => {
    const result = await window.api.payment.calculateDiscount({
      ownerId,
      items: currentItems.map(i => ({
        type: i.item_type,
        id: i.item_id,
        name: i.item_name,
        unitPrice: i.unit_price,
        quantity: i.quantity
      })),
      packageId: pkgId || undefined
    })
    if (result.success) {
      setDiscountResult(result.data)
    }
  }

  const handleOwnerSelect = (ownerId: number | '') => {
    if (ownerId === '') {
      setSelectedOwnerId('')
      setDiscountResult(null)
      return
    }
    setSelectedOwnerId(ownerId)
    if (items.length > 0) {
      calculateDiscount(ownerId, items, selectedPackageId || undefined)
    }
  }

  const handlePackageChange = (pkgId: number | '') => {
    setSelectedPackageId(pkgId)
    if (selectedOwnerId && items.length > 0) {
      calculateDiscount(selectedOwnerId as number, items, pkgId || undefined)
    }
  }

  const removeItem = (idx: number) => {
    const newItems = items.filter((_, i) => i !== idx)
    setItems(newItems)
    if (selectedOwnerId) {
      calculateDiscount(selectedOwnerId as number, newItems, selectedPackageId || undefined)
    }
  }

  const addCustomItem = () => {
    const name = prompt('请输入项目名称:')
    if (!name) return
    const priceStr = prompt('请输入单价:')
    if (!priceStr) return
    const price = parseFloat(priceStr)
    if (isNaN(price)) return

    const newItem: PaymentItem = {
      item_type: 'service',
      item_name: name,
      quantity: 1,
      unit_price: price,
      subtotal: price
    }
    const newItems = [...items, newItem]
    setItems(newItems)
    if (selectedOwnerId) {
      calculateDiscount(selectedOwnerId as number, newItems, selectedPackageId || undefined)
    }
  }

  const handlePayment = async () => {
    if (!selectedOwnerId) {
      alert('请选择会员')
      return
    }
    if (items.length === 0) {
      alert('请添加收费项目')
      return
    }
    if (!discountResult) {
      alert('请等待费用计算完成')
      return
    }

    setLoading(true)
    try {
      const result = await window.api.payment.create({
        registrationId: selectedReg?.id,
        ownerId: selectedOwnerId as number,
        items: items.map(i => ({
          type: i.item_type,
          id: i.item_id,
          name: i.item_name,
          unitPrice: i.unit_price,
          quantity: i.quantity,
          subtotal: i.subtotal
        })),
        totalAmount: discountResult.originalTotal,
        discountAmount: discountResult.discountAmount,
        finalAmount: discountResult.totalAmount,
        paymentMethod,
        packageId: selectedPackageId || undefined,
        pointsEarned: discountResult.pointsEarned
      })

      if (!result.success) {
        alert(result.error || '支付失败')
        return
      }

      setReceiptInfo(result.data)
      await loadOwners()
      await loadQueue()
      await loadData()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  const currentOwner = owners.find(o => o.id === selectedOwnerId)

  if (receiptInfo) {
    const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)
    return (
      <div className="flex items-center justify-center h-full">
        <div className="card w-full max-w-lg shadow-2xl">
          <div className="card-header text-center !border-b-2 !border-dashed">
            <div className="text-3xl mb-2">🧾</div>
            <h3 className="text-2xl font-bold">电子收据</h3>
            <p className="text-sm text-gray-500 mt-1">宠物医院收费凭证</p>
          </div>
          <div className="card-body space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-dashed">
              <span className="text-gray-500">收据编号</span>
              <span className="font-mono font-bold">{receiptInfo.receiptNumber}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">会员姓名：</span>
                <span className="font-semibold">{currentOwner?.name}</span>
              </div>
              <div>
                <span className="text-gray-500">会员等级：</span>
                <span className={`badge-${currentOwner?.member_level === 'gold' ? 'yellow' : currentOwner?.member_level === 'silver' ? 'gray' : 'blue'}`}>
                  {currentOwner?.member_level === 'gold' ? '金卡' : currentOwner?.member_level === 'silver' ? '银卡' : '普通'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">支付方式：</span>
                <span className="font-semibold">
                  {paymentMethod === 'cash' ? '💵 现金' : paymentMethod === 'insurance' ? '🏥 医保' :
                    paymentMethod === 'wechat' ? '💚 微信' : paymentMethod === 'alipay' ? '💙 支付宝' : '💳 银行卡'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">支付时间：</span>
                <span>{new Date().toLocaleString('zh-CN')}</span>
              </div>
            </div>

            <div className="border-t border-b border-dashed py-3 space-y-2">
              <p className="text-sm font-semibold mb-2">消费明细（{totalItems}项）</p>
              {items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-gray-700">
                    {item.item_name} × {item.quantity}
                  </span>
                  <span>¥{item.subtotal.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">原价合计</span>
                <span>¥{discountResult?.originalTotal?.toFixed(2)}</span>
              </div>
              {discountResult?.discountDetails?.map((d: string, idx: number) => (
                <div key={idx} className="flex justify-between text-green-600">
                  <span>🎁 {d}</span>
                  <span>-¥{idx === 0 ? discountResult.discountAmount?.toFixed(2) : '0.00'}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 border-t-2">
                <span className="font-bold text-lg">应收金额</span>
                <span className="text-3xl font-bold text-red-600">¥{discountResult?.totalAmount?.toFixed(2)}</span>
              </div>
            </div>

            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-600">本次获得积分</p>
                <p className="text-2xl font-bold text-purple-600">+{discountResult?.pointsEarned || 0} 分</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">当前总积分</p>
                <p className="text-2xl font-bold text-blue-600">
                  {(currentOwner?.points || 0) + (discountResult?.pointsEarned || 0)} 分
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button className="btn-secondary flex-1" onClick={() => {
                setReceiptInfo(null)
                setSelectedReg(null)
                setSelectedOwnerId('')
                setItems([])
                setDiscountResult(null)
                setSelectedPackageId('')
                navigate('/payment')
              }}>继续收费</button>
              <button className="btn-primary flex-1" onClick={() => {
                window.print()
              }}>🖨️ 打印收据</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-12 gap-6 h-full">
      <div className="col-span-3 space-y-4 overflow-y-auto">
        <div className="card">
          <div className="card-header !py-3 text-sm">📋 待收费病例</div>
          <div className="card-body !p-2 space-y-1 max-h-[300px] overflow-y-auto">
            {completedRegs.length === 0 ? (
              <p className="text-center text-gray-400 py-6 text-sm">暂无待收费病例</p>
            ) : (
              completedRegs.map(reg => (
                <div
                  key={reg.id}
                  onClick={() => {
                    setSelectedReg(reg)
                    setSelectedOwnerId(reg.owner_id)
                    loadPaymentItems(reg.id, reg.owner_id)
                    navigate(`/payment/${reg.id}`)
                  }}
                  className={`p-2 rounded-lg cursor-pointer text-sm ${
                    selectedReg?.id === reg.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold">No.{reg.queue_number}</span>
                    <span className="badge-green">待收费</span>
                  </div>
                  <p>{reg.pet_name}（{reg.owner_name}）</p>
                  <p className="text-xs text-gray-500">{reg.doctor_name} · {reg.department_name}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header !py-3 text-sm">👤 会员信息</div>
          <div className="card-body space-y-3">
            <div>
              <label className="label">选择会员</label>
              <select
                className="input text-sm"
                value={selectedOwnerId}
                onChange={e => handleOwnerSelect(e.target.value ? parseInt(e.target.value) : '')}
              >
                <option value="">-- 请选择会员 --</option>
                {owners.map(o => (
                  <option key={o.id} value={o.id}>{o.name}（{o.phone}）</option>
                ))}
              </select>
            </div>

            {currentOwner && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-bold text-lg">{currentOwner.name}</p>
                    <p className="text-xs text-gray-500">📞 {currentOwner.phone}</p>
                  </div>
                  <span className={`badge-${currentOwner.member_level === 'gold' ? 'yellow' : currentOwner.member_level === 'silver' ? 'gray' : 'blue'}`}>
                    {currentOwner.member_level === 'gold' ? '⭐ 金卡' : currentOwner.member_level === 'silver' ? '🥈 银卡' : '🎫 普通'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white/70 rounded-lg p-2">
                    <span className="text-gray-500">当前积分</span>
                    <p className="text-lg font-bold text-purple-600">{currentOwner.points}</p>
                  </div>
                  <div className="bg-white/70 rounded-lg p-2">
                    <span className="text-gray-500">累计消费</span>
                    <p className="text-lg font-bold text-blue-600">¥{currentOwner.total_spent}</p>
                  </div>
                </div>
                {currentOwner.member_level === 'normal' && currentOwner.total_spent >= 3000 && (
                  <p className="text-xs text-amber-600 mt-2 text-center bg-amber-50 rounded py-1">
                    🎉 消费满¥3000可升级银卡会员！
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header !py-3 text-sm">🎁 可选套餐</div>
          <div className="card-body space-y-2">
            <label className="flex items-center p-2 rounded-lg border-2 cursor-pointer transition-all"
              style={{ borderColor: selectedPackageId === '' ? '#3b82f6' : '#e5e7eb', background: selectedPackageId === '' ? '#eff6ff' : 'transparent' }}
              onClick={() => handlePackageChange('')}>
              <input type="radio" checked={selectedPackageId === ''} readOnly className="mr-2" />
              <span className="text-sm">不使用套餐</span>
            </label>
            {packages.map(pkg => {
              const canUse = !pkg.member_level_required || pkg.member_level_required === 'normal' ||
                (pkg.member_level_required === 'silver' && currentOwner?.member_level !== 'normal') ||
                (pkg.member_level_required === 'gold' && currentOwner?.member_level === 'gold')
              return (
                <label
                  key={pkg.id}
                  className={`block p-3 rounded-lg border-2 cursor-pointer transition-all ${!canUse ? 'opacity-50 cursor-not-allowed' : ''}`}
                  style={{ borderColor: selectedPackageId === pkg.id ? '#16a34a' : '#e5e7eb', background: selectedPackageId === pkg.id ? '#f0fdf4' : 'transparent' }}
                  onClick={() => canUse && handlePackageChange(pkg.id)}
                >
                  <div className="flex items-center">
                    <input type="radio" checked={selectedPackageId === pkg.id} readOnly className="mr-2" disabled={!canUse} />
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <span className="font-semibold text-sm">{pkg.name}</span>
                        <span className="text-red-600 font-bold">¥{pkg.discount_price}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{pkg.description}</p>
                      {pkg.original_price && (
                        <p className="text-xs text-gray-400 mt-1">
                          原价 ¥{pkg.original_price} <span className="text-green-600">省 ¥{(pkg.original_price - pkg.discount_price).toFixed(0)}</span>
                        </p>
                      )}
                      {pkg.member_level_required && pkg.member_level_required !== 'normal' && (
                        <p className="text-xs text-amber-600 mt-1">
                          需要{pkg.member_level_required === 'gold' ? '金卡' : '银卡'}会员
                        </p>
                      )}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        </div>
      </div>

      <div className="col-span-6 space-y-4 overflow-y-auto">
        <div className="card">
          <div className="card-header flex items-center justify-between !py-3">
            <span>收费明细</span>
            <button className="btn-secondary text-sm !py-1 !px-3" onClick={addCustomItem}>
              + 添加自定义项目
            </button>
          </div>
          <div className="card-body !p-0">
            {loading ? (
              <p className="text-center text-gray-400 py-12">加载中...</p>
            ) : items.length === 0 ? (
              <p className="text-center text-gray-400 py-12">
                <div className="text-4xl mb-2">💰</div>
                暂无收费项目
              </p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>类型</th>
                    <th>项目名称</th>
                    <th>单价</th>
                    <th>数量</th>
                    <th>小计</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <span className={`badge-${item.item_type === 'medicine' ? 'purple' : 'blue'}`}>
                          {item.item_type === 'medicine' ? '药品' : '服务'}
                        </span>
                      </td>
                      <td className="font-medium">{item.item_name}</td>
                      <td>¥{item.unit_price.toFixed(2)}</td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          className="input !w-20 !py-1 text-sm"
                          value={item.quantity}
                          onChange={e => {
                            const qty = parseInt(e.target.value) || 1
                            const newItems = [...items]
                            newItems[idx].quantity = qty
                            newItems[idx].subtotal = qty * newItems[idx].unit_price
                            setItems(newItems)
                            if (selectedOwnerId) {
                              calculateDiscount(selectedOwnerId as number, newItems, selectedPackageId || undefined)
                            }
                          }}
                        />
                      </td>
                      <td className="font-semibold">¥{item.subtotal.toFixed(2)}</td>
                      <td>
                        <button className="text-red-500 hover:text-red-700 text-xs" onClick={() => removeItem(idx)}>删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header !py-3">💳 选择支付方式</div>
          <div className="card-body">
            <div className="grid grid-cols-5 gap-3">
              {[
                { key: 'wechat', label: '微信支付', icon: '💚', color: 'green' },
                { key: 'alipay', label: '支付宝', icon: '💙', color: 'blue' },
                { key: 'cash', label: '现金', icon: '💵', color: 'amber' },
                { key: 'card', label: '银行卡', icon: '💳', color: 'purple' },
                { key: 'insurance', label: '医保', icon: '🏥', color: 'teal' }
              ].map(m => (
                <button
                  key={m.key}
                  onClick={() => setPaymentMethod(m.key as any)}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    paymentMethod === m.key
                      ? `border-${m.color}-500 bg-${m.color}-50`
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={paymentMethod === m.key ? {
                    borderColor: m.color === 'green' ? '#22c55e' : m.color === 'blue' ? '#3b82f6' :
                      m.color === 'amber' ? '#f59e0b' : m.color === 'purple' ? '#a855f7' : '#14b8a6',
                    backgroundColor: m.color === 'green' ? '#f0fdf4' : m.color === 'blue' ? '#eff6ff' :
                      m.color === 'amber' ? '#fffbeb' : m.color === 'purple' ? '#faf5ff' : '#f0fdfa'
                  } : {}}
                >
                  <div className="text-3xl mb-2">{m.icon}</div>
                  <p className="font-medium text-sm">{m.label}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="col-span-3">
        <div className="card sticky top-0">
          <div className="card-header !py-3">💰 费用结算</div>
          <div className="card-body space-y-3">
            {discountResult ? (
              <>
                <div className="text-sm space-y-2">
                  <div className="flex justify-between py-1">
                    <span className="text-gray-500">项目原价</span>
                    <span>¥{discountResult.originalTotal?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-green-600">
                    <span>优惠折扣</span>
                    <span>-¥{discountResult.discountAmount?.toFixed(2)}</span>
                  </div>
                  {discountResult.discountDetails?.length > 0 && (
                    <div className="pl-2 space-y-1 border-l-2 border-green-200">
                      {discountResult.discountDetails.map((d: string, idx: number) => (
                        <p key={idx} className="text-xs text-green-700">🎁 {d}</p>
                      ))}
                    </div>
                  )}
                </div>

                <div className="py-3 border-t-2 border-dashed">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-lg">应付金额</span>
                    <span className="text-4xl font-bold text-red-600">
                      ¥{discountResult.totalAmount?.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-3 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-gray-600">预计获得积分</p>
                    <p className="text-xl font-bold text-purple-600">
                      +{discountResult.pointsEarned || 0} 分
                    </p>
                  </div>
                  <div className="text-2xl">🎁</div>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-gray-400">
                <p>请选择会员和收费项目</p>
                <p className="text-xs mt-1">系统将自动计算折扣</p>
              </div>
            )}

            <button
              className="btn-success w-full py-4 text-lg mt-4"
              onClick={handlePayment}
              disabled={loading || !selectedOwnerId || items.length === 0 || !discountResult}
            >
              {loading ? '处理中...' : `✓ 确认支付 ¥${discountResult?.totalAmount?.toFixed(2) || '0.00'}`}
            </button>

            <div className="space-y-2 text-xs text-gray-500 pt-2 border-t">
              <p>💡 温馨提示：</p>
              <ul className="pl-4 space-y-1 list-disc">
                <li>会员积分可兑换后续服务</li>
                <li>金卡会员享9折，银卡会员享9.5折</li>
                <li>电子收据可随时查看历史记录</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
