import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import type { PaymentItem } from '../types'

interface CompletedReg {
  id: number
  queue_number: string
  pet_name: string
  species: string
  breed: string
  owner_id: number
  owner_name: string
  doctor_id: number
  doctor_name: string
  department_id: number
  department_name: string
  urgency_level: number
  completed_at: string
  status: string
}

interface HistoryPayment {
  id: number
  registration_id?: number
  owner_id: number
  total_amount: number
  discount_amount: number
  final_amount: number
  payment_method: string
  receipt_number?: string
  points_earned?: number
  paid_at: string
  status: string
  owner_name?: string
  owner_phone?: string
  queue_number?: string
  pet_name?: string
  species?: string
  items?: any[]
}

export default function PaymentPage() {
  const { regId } = useParams()
  const navigate = useNavigate()
  const { owners, packages, loadOwners, loadData } = useAppStore()

  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending')

  const [selectedReg, setSelectedReg] = useState<CompletedReg | null>(null)
  const [selectedOwnerId, setSelectedOwnerId] = useState<number | ''>('')
  const [selectedPackageId, setSelectedPackageId] = useState<number | ''>('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'insurance' | 'wechat' | 'alipay' | 'card'>('wechat')
  const [items, setItems] = useState<PaymentItem[]>([])
  const [discountResult, setDiscountResult] = useState<any>(null)
  const [receiptInfo, setReceiptInfo] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [alreadyPaid, setAlreadyPaid] = useState<any>(null)
  const [completedRegs, setCompletedRegs] = useState<CompletedReg[]>([])

  const [historyList, setHistoryList] = useState<HistoryPayment[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyFilter, setHistoryFilter] = useState({
    ownerId: '',
    petName: '',
    queueNumber: '',
    startDate: '',
    endDate: ''
  })
  const [selectedHistory, setSelectedHistory] = useState<HistoryPayment | null>(null)
  const [historyItems, setHistoryItems] = useState<any[]>([])

  const fetchUnpaidRegs = async () => {
    const result = await window.api.query(`
      SELECT r.id, r.queue_number, r.urgency_level, r.status, r.completed_at,
             r.owner_id, r.doctor_id, r.department_id,
             p.name as pet_name, p.species, p.breed,
             po.name as owner_name,
             d.name as doctor_name,
             dep.name as department_name
      FROM registrations r
      LEFT JOIN pets p ON r.pet_id = p.id
      LEFT JOIN pet_owners po ON r.owner_id = po.id
      LEFT JOIN doctors d ON r.doctor_id = d.id
      LEFT JOIN departments dep ON r.department_id = dep.id
      WHERE r.status = 'completed'
        AND r.id NOT IN (SELECT registration_id FROM payments WHERE registration_id IS NOT NULL AND status = 'paid')
      ORDER BY r.completed_at DESC
    `)
    if (result.success && result.data) {
      setCompletedRegs(result.data)
    }
  }

  const fetchHistory = async (page = 1) => {
    setHistoryLoading(true)
    try {
      const params: any = { page, pageSize: 10 }
      if (historyFilter.ownerId) params.ownerId = parseInt(historyFilter.ownerId)
      if (historyFilter.petName) params.petName = historyFilter.petName
      if (historyFilter.queueNumber) params.queueNumber = historyFilter.queueNumber
      if (historyFilter.startDate) params.startDate = historyFilter.startDate
      if (historyFilter.endDate) params.endDate = historyFilter.endDate

      const result = await window.api.payment.history(params)
      if (result.success && result.data) {
        setHistoryList(result.data.list || [])
        setHistoryTotal(result.data.total || 0)
        setHistoryPage(page)
      }
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'pending') {
      fetchUnpaidRegs()
    }
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory(1)
    }
  }, [activeTab, historyFilter.startDate, historyFilter.endDate])

  useEffect(() => {
    if (regId) {
      setActiveTab('pending')
      loadRegById(parseInt(regId))
    }
  }, [regId])

  const loadRegById = async (id: number) => {
    const regResult = await window.api.query(`
      SELECT r.id, r.queue_number, r.urgency_level, r.status, r.completed_at,
             r.owner_id, r.doctor_id, r.department_id,
             p.name as pet_name, p.species, p.breed,
             po.name as owner_name,
             d.name as doctor_name,
             dep.name as department_name
      FROM registrations r
      LEFT JOIN pets p ON r.pet_id = p.id
      LEFT JOIN pet_owners po ON r.owner_id = po.id
      LEFT JOIN doctors d ON r.doctor_id = d.id
      LEFT JOIN departments dep ON r.department_id = dep.id
      WHERE r.id = ?
    `, [id])
    if (regResult.success && regResult.data && regResult.data.length > 0) {
      const reg = regResult.data[0]
      setSelectedReg(reg)
      setSelectedOwnerId(reg.owner_id)
      checkAndLoadItems(reg.id, reg.owner_id)
    }
  }

  const checkAndLoadItems = async (registrationId: number, ownerId: number) => {
    setLoading(true)
    setAlreadyPaid(null)
    try {
      const payResult = await window.api.query(
        "SELECT * FROM payments WHERE registration_id = ? AND status = 'paid' ORDER BY paid_at DESC LIMIT 1",
        [registrationId]
      )
      if (payResult.success && payResult.data && payResult.data.length > 0) {
        const payment = payResult.data[0]
        const itemsResult = await window.api.query(
          'SELECT * FROM payment_items WHERE payment_id = ?',
          [payment.id]
        )
        setAlreadyPaid({
          payment,
          items: itemsResult.success ? itemsResult.data : []
        })
        setLoading(false)
        return
      }
      await loadPaymentItems(registrationId, ownerId)
    } catch (e: any) {
      console.error(e)
      setLoading(false)
    }
  }

  const loadPaymentItems = async (registrationId: number, ownerId: number) => {
    setLoading(true)
    try {
      const diagResult = await window.api.query(
        'SELECT * FROM diagnoses WHERE registration_id = ? ORDER BY diagnosis_time DESC LIMIT 1',
        [registrationId]
      )
      const regResult = await window.api.query(
        'SELECT urgency_level FROM registrations WHERE id = ?',
        [registrationId]
      )

      const loadedItems: PaymentItem[] = []

      let registrationFee = 20
      if (regResult.success && regResult.data && regResult.data.length > 0) {
        const urgency = regResult.data[0].urgency_level
        if (urgency >= 4) registrationFee = 80
        else if (urgency >= 3) registrationFee = 50
        else registrationFee = 20
      }

      loadedItems.push({
        item_type: 'service',
        item_id: registrationFee === 80 ? 3 : registrationFee === 50 ? 2 : 1,
        item_name: registrationFee === 80 ? '急诊挂号费' : registrationFee === 50 ? '专家挂号费' : '挂号费',
        quantity: 1,
        unit_price: registrationFee,
        subtotal: registrationFee
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

        const svcResult = await window.api.query(`
          SELECT dsi.*, si.name as service_name
          FROM diagnosis_service_items dsi
          LEFT JOIN service_items si ON dsi.service_item_id = si.id
          WHERE dsi.diagnosis_id = ?
        `, [diagnosisId])

        if (svcResult.success && svcResult.data) {
          svcResult.data.forEach((s: any) => {
            loadedItems.push({
              item_type: 'service',
              item_id: s.service_item_id,
              item_name: s.service_name,
              quantity: s.quantity,
              unit_price: s.unit_price,
              subtotal: s.subtotal
            })
          })
        }
      }

      setItems(loadedItems)
      await recalculate(ownerId, loadedItems, undefined)
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const recalculate = async (ownerId: number, currentItems: PaymentItem[], pkgId?: number) => {
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
      recalculate(ownerId, items, selectedPackageId || undefined)
    }
  }

  const handlePackageChange = (pkgId: number | '') => {
    setSelectedPackageId(pkgId)
    if (selectedOwnerId && items.length > 0) {
      recalculate(selectedOwnerId as number, items, pkgId || undefined)
    }
  }

  const handleItemChange = (idx: number, qty: number) => {
    const newItems = [...items]
    newItems[idx] = { ...newItems[idx], quantity: qty, subtotal: qty * newItems[idx].unit_price }
    setItems(newItems)
    if (selectedOwnerId) {
      recalculate(selectedOwnerId as number, newItems, selectedPackageId || undefined)
    }
  }

  const removeItem = (idx: number) => {
    const newItems = items.filter((_, i) => i !== idx)
    setItems(newItems)
    if (selectedOwnerId) {
      recalculate(selectedOwnerId as number, newItems, selectedPackageId || undefined)
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
      recalculate(selectedOwnerId as number, newItems, selectedPackageId || undefined)
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
      await loadData()
      await fetchUnpaidRegs()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleVoidPayment = async (paymentId: number) => {
    if (!confirm('确定要作废这张收据吗？\n作废后将扣回会员积分，病例将重新回到待收费列表。')) return
    const reason = prompt('请输入作废原因（可选）:', '操作员作废')
    if (reason === null) return

    const result = await window.api.payment.voidPayment({ paymentId, reason })
    if (result.success) {
      alert('✅ 收据已作废')
      setSelectedHistory(null)
      setHistoryItems([])
      await fetchHistory(historyPage)
      await loadOwners()
      await loadData()
      if (activeTab === 'pending') {
        await fetchUnpaidRegs()
      }
    } else {
      alert(result.error)
    }
  }

  const viewHistoryDetail = async (pay: HistoryPayment) => {
    setSelectedHistory(pay)
    const result = await window.api.query('SELECT * FROM payment_items WHERE payment_id = ?', [pay.id])
    if (result.success && result.data) {
      setHistoryItems(result.data)
    }
  }

  const resetToPendingList = () => {
    setSelectedReg(null)
    setSelectedOwnerId('')
    setSelectedPackageId('')
    setItems([])
    setDiscountResult(null)
    setReceiptInfo(null)
    setAlreadyPaid(null)
    setSelectedHistory(null)
    setHistoryItems([])
    navigate('/payment')
    fetchUnpaidRegs()
  }

  const currentOwner = owners.find(o => o.id === selectedOwnerId)

  const methodLabels: Record<string, string> = {
    cash: '💵 现金', insurance: '🏥 医保', wechat: '💚 微信',
    alipay: '💙 支付宝', card: '💳 银行卡'
  }

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
                <span className="font-semibold">{methodLabels[paymentMethod]}</span>
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
                  <span className="text-gray-700">{item.item_name} × {item.quantity}</span>
                  <span>¥{item.subtotal.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">原价合计</span>
                <span>¥{discountResult?.originalTotal?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>优惠折扣</span>
                <span>-¥{discountResult?.discountAmount?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 border-t-2">
                <span className="font-bold text-lg">实收金额</span>
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
              <button className="btn-secondary flex-1" onClick={resetToPendingList}>返回收费列表</button>
              <button className="btn-primary flex-1" onClick={() => window.print()}>🖨️ 打印收据</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (alreadyPaid && !selectedHistory) {
    const p = alreadyPaid.payment
    const payItems = alreadyPaid.items || []
    return (
      <div className="flex items-center justify-center h-full">
        <div className="card w-full max-w-lg shadow-2xl">
          <div className="card-header text-center !border-b-2 !border-dashed bg-green-50">
            <div className="text-4xl mb-2">✅</div>
            <h3 className="text-2xl font-bold text-green-700">该病例已结算</h3>
            <p className="text-sm text-gray-500 mt-1">此病例已完成收费，无需重复支付</p>
          </div>
          <div className="card-body space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-dashed">
              <span className="text-gray-500">收据编号</span>
              <span className="font-mono font-bold">{p.receipt_number}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">支付金额：</span>
                <span className="font-bold text-red-600">¥{p.final_amount?.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-gray-500">支付方式：</span>
                <span className="font-semibold">{methodLabels[p.payment_method] || p.payment_method}</span>
              </div>
              <div>
                <span className="text-gray-500">优惠金额：</span>
                <span className="text-green-600">-¥{p.discount_amount?.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-gray-500">支付时间：</span>
                <span>{p.paid_at}</span>
              </div>
            </div>

            {payItems.length > 0 && (
              <div className="border-t border-b border-dashed py-3 space-y-2">
                <p className="text-sm font-semibold mb-2">收费明细</p>
                {payItems.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-gray-700">{item.item_name} × {item.quantity}</span>
                    <span>¥{item.subtotal?.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            {selectedReg && (
              <div className="bg-blue-50 rounded-xl p-3 text-sm">
                <p><span className="text-gray-500">宠物：</span>{selectedReg.pet_name}（{selectedReg.species}）</p>
                <p><span className="text-gray-500">主人：</span>{selectedReg.owner_name}</p>
                <p><span className="text-gray-500">医生：</span>{selectedReg.doctor_name} · {selectedReg.department_name}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button className="btn-secondary flex-1" onClick={resetToPendingList}>返回收费列表</button>
              <button className="btn-primary flex-1" onClick={() => window.print()}>🖨️ 打印收据</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (selectedHistory) {
    const p = selectedHistory
    return (
      <div className="flex items-center justify-center h-full">
        <div className="card w-full max-w-lg shadow-2xl">
          <div className="card-header text-center !border-b-2 !border-dashed">
            <div className="text-3xl mb-2">🧾</div>
            <h3 className="text-2xl font-bold">收据详情</h3>
            <p className="text-sm text-gray-500 mt-1">{p.receipt_number}</p>
          </div>
          <div className="card-body space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">会员：</span>
                <span className="font-semibold">{p.owner_name}</span>
              </div>
              <div>
                <span className="text-gray-500">联系电话：</span>
                <span>{p.owner_phone || '-'}</span>
              </div>
              <div>
                <span className="text-gray-500">宠物：</span>
                <span>{p.pet_name || '-'}</span>
              </div>
              <div>
                <span className="text-gray-500">病例号：</span>
                <span>{p.queue_number || '-'}</span>
              </div>
              <div>
                <span className="text-gray-500">支付方式：</span>
                <span className="font-semibold">{methodLabels[p.payment_method] || p.payment_method}</span>
              </div>
              <div>
                <span className="text-gray-500">支付时间：</span>
                <span>{p.paid_at}</span>
              </div>
              <div>
                <span className="text-gray-500">获得积分：</span>
                <span className="text-purple-600 font-semibold">+{p.points_earned || 0}</span>
              </div>
              <div>
                <span className="text-gray-500">状态：</span>
                <span className={`badge-${p.status === 'paid' ? 'green' : 'gray'}`}>
                  {p.status === 'paid' ? '已支付' : p.status === 'voided' ? '已作废' : p.status}
                </span>
              </div>
            </div>

            {historyItems.length > 0 && (
              <div className="border-t border-b border-dashed py-3 space-y-2">
                <p className="text-sm font-semibold mb-2">收费明细</p>
                {historyItems.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-gray-700">{item.item_name} × {item.quantity}</span>
                    <span>¥{item.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">原价合计</span>
                <span>¥{p.total_amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>优惠折扣</span>
                <span>-¥{p.discount_amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 border-t-2">
                <span className="font-bold text-lg">实收金额</span>
                <span className="text-3xl font-bold text-red-600">¥{p.final_amount.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button className="btn-secondary flex-1" onClick={() => {
                setSelectedHistory(null)
                setHistoryItems([])
              }}>返回列表</button>
              <button className="btn-primary flex-1" onClick={() => window.print()}>🖨️ 打印</button>
            </div>
            {p.status === 'paid' && (
              <button className="btn-danger w-full mt-2" onClick={() => handleVoidPayment(p.id)}>
                🗑️ 作废收据
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="card shrink-0">
        <div className="card-header !py-3">
          <div className="flex bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-6 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === 'pending' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
              }`}
            >
              💰 待收费
              {completedRegs.length > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{completedRegs.length}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === 'history' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
              }`}
            >
              📋 收据中心
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'pending' ? (
        <div className="grid grid-cols-12 gap-6 flex-1 overflow-hidden">
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
                        setSelectedPackageId('')
                        setItems([])
                        setDiscountResult(null)
                        setAlreadyPaid(null)
                        checkAndLoadItems(reg.id, reg.owner_id)
                        navigate(`/payment/${reg.id}`)
                      }}
                      className={`p-2 rounded-lg cursor-pointer text-sm transition-all ${
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
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="col-span-6 space-y-4 overflow-y-auto">
            {selectedReg && !alreadyPaid && (
              <div className="card bg-blue-50 border-blue-200">
                <div className="card-body !py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🐾</span>
                    <div>
                      <p className="font-bold">{selectedReg.pet_name}（{selectedReg.species} · {selectedReg.breed}）</p>
                      <p className="text-xs text-gray-600">
                        主人: {selectedReg.owner_name} · 医生: {selectedReg.doctor_name} · {selectedReg.department_name}
                      </p>
                    </div>
                  </div>
                  <span className="badge-blue">No.{selectedReg.queue_number}</span>
                </div>
              </div>
            )}

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
                    暂无收费项目，请从左侧选择待收费病例
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
                                const qty = Math.max(1, parseInt(e.target.value) || 1)
                                handleItemChange(idx, qty)
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
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold">
                        <td colSpan={4} className="text-right">小计</td>
                        <td>¥{items.reduce((s, i) => s + i.subtotal, 0).toFixed(2)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header !py-3">💳 选择支付方式</div>
              <div className="card-body">
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { key: 'wechat', label: '微信支付', icon: '💚' },
                    { key: 'alipay', label: '支付宝', icon: '💙' },
                    { key: 'cash', label: '现金', icon: '💵' },
                    { key: 'card', label: '银行卡', icon: '💳' },
                    { key: 'insurance', label: '医保', icon: '🏥' }
                  ].map(m => (
                    <button
                      key={m.key}
                      onClick={() => setPaymentMethod(m.key as any)}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        paymentMethod === m.key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
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
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card flex-1 overflow-hidden flex flex-col">
          <div className="card-body !p-4 !border-b grid grid-cols-5 gap-3 items-end">
            <div>
              <label className="label !text-xs">会员</label>
              <select
                className="input !py-2 text-sm"
                value={historyFilter.ownerId}
                onChange={e => setHistoryFilter(prev => ({ ...prev, ownerId: e.target.value }))}
              >
                <option value="">全部会员</option>
                {owners.map(o => (
                  <option key={o.id} value={o.id}>{o.name}（{o.phone}）</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label !text-xs">宠物名</label>
              <input
                className="input !py-2 text-sm"
                placeholder="输入宠物名"
                value={historyFilter.petName}
                onChange={e => setHistoryFilter(prev => ({ ...prev, petName: e.target.value }))}
              />
            </div>
            <div>
              <label className="label !text-xs">病例号</label>
              <input
                className="input !py-2 text-sm"
                placeholder="输入病例号"
                value={historyFilter.queueNumber}
                onChange={e => setHistoryFilter(prev => ({ ...prev, queueNumber: e.target.value }))}
              />
            </div>
            <div>
              <label className="label !text-xs">收款日期起</label>
              <input
                type="date"
                className="input !py-2 text-sm"
                value={historyFilter.startDate}
                onChange={e => setHistoryFilter(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="label !text-xs">收款日期止</label>
                <input
                  type="date"
                  className="input !py-2 text-sm"
                  value={historyFilter.endDate}
                  onChange={e => setHistoryFilter(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
              <button className="btn-primary !py-2 text-sm whitespace-nowrap" onClick={() => fetchHistory(1)}>
                🔍 查询
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {historyLoading ? (
              <p className="text-center text-gray-400 py-12">加载中...</p>
            ) : historyList.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-5xl mb-3">📋</div>
                暂无收据记录
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>收据编号</th>
                    <th>会员</th>
                    <th>宠物/病例</th>
                    <th>支付方式</th>
                    <th>金额</th>
                    <th>积分</th>
                    <th>支付时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {historyList.map(pay => (
                    <tr key={pay.id} className="cursor-pointer hover:bg-blue-50" onClick={() => viewHistoryDetail(pay)}>
                      <td className="font-mono text-sm">{pay.receipt_number}</td>
                      <td>{pay.owner_name}</td>
                      <td>
                        {pay.pet_name || '-'}
                        {pay.queue_number && <span className="text-xs text-gray-500 ml-2">#{pay.queue_number}</span>}
                      </td>
                      <td>{methodLabels[pay.payment_method] || pay.payment_method}</td>
                      <td className="font-bold text-red-600">¥{pay.final_amount.toFixed(2)}</td>
                      <td className="text-purple-600">+{pay.points_earned || 0}</td>
                      <td className="text-xs text-gray-500">{pay.paid_at}</td>
                      <td>
                        <span className={`badge-${pay.status === 'paid' ? 'green' : 'gray'}`}>
                          {pay.status === 'paid' ? '已支付' : pay.status === 'voided' ? '已作废' : pay.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {historyTotal > 10 && (
            <div className="card-body !py-3 !border-t flex justify-center gap-2">
              <button
                className="btn-secondary !py-1.5 text-sm"
                disabled={historyPage <= 1}
                onClick={() => fetchHistory(historyPage - 1)}
              >
                上一页
              </button>
              <span className="px-4 py-1.5 text-sm text-gray-600">
                第 {historyPage} 页 / 共 {Math.ceil(historyTotal / 10)} 页（{historyTotal}条）
              </span>
              <button
                className="btn-secondary !py-1.5 text-sm"
                disabled={historyPage >= Math.ceil(historyTotal / 10)}
                onClick={() => fetchHistory(historyPage + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
