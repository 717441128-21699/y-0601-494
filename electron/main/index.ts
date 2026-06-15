import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { getDatabase } from './database'
import Database from 'better-sqlite3'

let db: Database.Database

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: '宠物医院诊疗与智能调度系统',
    icon: path.join(process.env.VITE_PUBLIC || '', 'vite.svg')
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }
}

app.whenReady().then(() => {
  db = getDatabase()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (db) db.close()
  if (process.platform !== 'darwin') app.quit()
})

function registerIpcHandlers() {
  ipcMain.handle('db:query', (_e, sql: string, params: any[] = []) => {
    try {
      const stmt = db.prepare(sql)
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        return { success: true, data: stmt.all(...params) }
      } else {
        const info = stmt.run(...params)
        return { 
          success: true, 
          data: { 
            changes: info.changes, 
            lastInsertRowid: info.lastInsertRowid 
          } 
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db:transaction', (_e, operations: { sql: string; params?: any[] }[]) => {
    try {
      const transaction = db.transaction((ops: { sql: string; params?: any[] }[]) => {
        const results: any[] = []
        for (const op of ops) {
          const stmt = db.prepare(op.sql)
          if (op.sql.trim().toUpperCase().startsWith('SELECT')) {
            results.push(stmt.all(...(op.params || [])))
          } else {
            const info = stmt.run(...(op.params || []))
            results.push({ changes: info.changes, lastInsertRowid: info.lastInsertRowid })
          }
        }
        return results
      })
      return { success: true, data: transaction(operations) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('registration:create', handleCreateRegistration)
  ipcMain.handle('registration:queue', handleGetQueue)
  ipcMain.handle('registration:call', handleCallRegistration)
  ipcMain.handle('registration:checkTimeout', handleCheckTimeout)

  ipcMain.handle('diagnosis:create', handleCreateDiagnosis)
  ipcMain.handle('prescription:create', handleCreatePrescription)
  ipcMain.handle('medicine:calculateDosage', handleCalculateDosage)

  ipcMain.handle('payment:create', handleCreatePayment)
  ipcMain.handle('discount:calculate', handleCalculateDiscount)

  ipcMain.handle('maintenance:generate', handleGenerateMaintenanceOrders)
  ipcMain.handle('device:logUsage', handleLogDeviceUsage)

  ipcMain.handle('statistics:doctor', handleDoctorStatistics)
  ipcMain.handle('statistics:department', handleDepartmentStatistics)
  ipcMain.handle('statistics:roomHeatmap', handleRoomHeatmap)
}

function handleCreateRegistration(_e: any, data: {
  petId: number; ownerId: number; symptomIds: number[]; symptomDescription: string; urgencyLevel?: number
}) {
  try {
    const { petId, ownerId, symptomIds, symptomDescription, urgencyLevel } = data
    
    const pet = db.prepare('SELECT * FROM pets WHERE id = ?').get(petId) as any
    if (!pet) return { success: false, error: '宠物不存在' }

    let deptId: number | null = null
    let calculatedUrgency = urgencyLevel || 1
    
    if (symptomIds && symptomIds.length > 0) {
      const symptoms = db.prepare(`
        SELECT s.*, d.id as dept_id FROM symptoms s
        LEFT JOIN departments d ON s.department_id = d.id
        WHERE s.id IN (${symptomIds.map(() => '?').join(',')})
      `).all(...symptomIds) as any[]
      
      if (symptoms.length > 0) {
        deptId = symptoms[0].dept_id
        calculatedUrgency = Math.max(...symptoms.map(s => s.default_urgency), calculatedUrgency)
      }
    }

    let doctorId: number | null = null
    if (deptId) {
      const availableDoctors = db.prepare(`
        SELECT d.*, 
          (SELECT COUNT(*) FROM registrations r WHERE r.doctor_id = d.id AND r.status IN ('waiting', 'diagnosing')) as current_load
        FROM doctors d
        WHERE d.department_id = ? AND d.status = 'available'
        ORDER BY current_load ASC, d.id ASC
        LIMIT 1
      `).get(deptId) as any
      
      if (availableDoctors) {
        doctorId = availableDoctors.id
      } else {
        const anyDoctor = db.prepare(`
          SELECT d.*,
            (SELECT COUNT(*) FROM registrations r WHERE r.doctor_id = d.id AND r.status IN ('waiting', 'diagnosing')) as current_load
          FROM doctors d
          WHERE d.status = 'available'
          ORDER BY current_load ASC, d.id ASC
          LIMIT 1
        `).get() as any
        if (anyDoctor) {
          doctorId = anyDoctor.id
          deptId = anyDoctor.department_id
        }
      }
    }

    const today = new Date().toISOString().split('T')[0]
    const queueResult = db.prepare(`
      SELECT COALESCE(MAX(queue_number), 0) as max_num 
      FROM registrations 
      WHERE DATE(registered_at) = ?
    `).get(today) as { max_num: number }
    const queueNumber = queueResult.max_num + 1

    const result = db.prepare(`
      INSERT INTO registrations 
      (pet_id, owner_id, doctor_id, department_id, symptom_id, symptom_description, urgency_level, status, queue_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', ?)
    `).run(petId, ownerId, doctorId, deptId, symptomIds[0] || null, symptomDescription, calculatedUrgency, queueNumber)

    return {
      success: true,
      data: {
        id: result.lastInsertRowid,
        queueNumber,
        doctorId,
        departmentId: deptId,
        urgencyLevel: calculatedUrgency
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

function handleGetQueue() {
  try {
    const queue = db.prepare(`
      SELECT r.*, p.name as pet_name, p.species, p.breed, p.weight,
             po.name as owner_name, po.phone,
             d.name as doctor_name, d.room_number,
             dep.name as department_name,
             s.name as symptom_name
      FROM registrations r
      LEFT JOIN pets p ON r.pet_id = p.id
      LEFT JOIN pet_owners po ON r.owner_id = po.id
      LEFT JOIN doctors d ON r.doctor_id = d.id
      LEFT JOIN departments dep ON r.department_id = dep.id
      LEFT JOIN symptoms s ON r.symptom_id = s.id
      WHERE r.status IN ('waiting', 'diagnosing')
      ORDER BY 
        CASE r.status WHEN 'diagnosing' THEN 0 ELSE 1 END,
        r.urgency_level DESC,
        r.registered_at ASC
    `).all()
    return { success: true, data: queue }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

function handleCallRegistration(_e: any, regId: number) {
  try {
    const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(regId) as any
    if (!reg) return { success: false, error: '挂号记录不存在' }
    if (reg.status !== 'waiting') return { success: false, error: '当前状态不可呼叫' }

    db.prepare(`
      UPDATE registrations SET status = 'diagnosing', called_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(regId)

    if (reg.doctor_id) {
      db.prepare(`UPDATE doctors SET status = 'busy' WHERE id = ?`).run(reg.doctor_id)
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

function handleCheckTimeout() {
  try {
    const timeoutMinutes = 30
    const timeoutRegistrations = db.prepare(`
      SELECT r.*, p.name as pet_name, po.name as owner_name, po.phone,
             d.name as doctor_name, d.room_number
      FROM registrations r
      LEFT JOIN pets p ON r.pet_id = p.id
      LEFT JOIN pet_owners po ON r.owner_id = po.id
      LEFT JOIN doctors d ON r.doctor_id = d.id
      WHERE r.status = 'waiting'
        AND r.timeout_reminded = 0
        AND (JULIANDAY(CURRENT_TIMESTAMP) - JULIANDAY(r.registered_at)) * 24 * 60 > ?
    `).all(timeoutMinutes) as any[]

    const updateStmt = db.prepare(`UPDATE registrations SET timeout_reminded = 1 WHERE id = ?`)
    timeoutRegistrations.forEach(r => updateStmt.run(r.id))

    return { success: true, data: timeoutRegistrations }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

function handleCalculateDosage(_e: any, data: { medicineId: number; weight: number; durationDays: number; frequency: string }) {
  try {
    const { medicineId, weight, durationDays, frequency } = data
    const medicine = db.prepare('SELECT * FROM medicines WHERE id = ?').get(medicineId) as any
    if (!medicine) return { success: false, error: '药品不存在' }

    let timesPerDay = 1
    if (frequency === '每日2次') timesPerDay = 2
    else if (frequency === '每日3次') timesPerDay = 3
    else if (frequency === '每日4次') timesPerDay = 4

    const dosagePerTime = medicine.dosage_per_kg * weight
    const totalQuantity = Math.ceil(dosagePerTime * timesPerDay * durationDays)
    const subtotal = totalQuantity * medicine.price_per_unit

    if (medicine.stock < totalQuantity) {
      return { 
        success: false, 
        error: `库存不足！当前库存${medicine.stock}${medicine.unit}，需要${totalQuantity}${medicine.unit}` 
      }
    }

    return {
      success: true,
      data: {
        medicine,
        dosagePerTime: dosagePerTime.toFixed(2),
        totalQuantity,
        subtotal: subtotal.toFixed(2)
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

function handleCreateDiagnosis(_e: any, data: {
  registrationId: number; doctorId: number; petId: number;
  chiefComplaint: string; examination: string; diagnosis: string; treatmentPlan: string;
  prescriptions: Array<{
    medicineId: number; dosage: string; frequency: string; duration: string;
    quantity: number; unitPrice: number; subtotal: number; usageInstructions: string
  }>;
  serviceItems: Array<{ itemId: number; quantity: number; unitPrice: number; subtotal: number }>
}) {
  try {
    const tx = db.transaction(() => {
      const diagResult = db.prepare(`
        INSERT INTO diagnoses (registration_id, doctor_id, pet_id, chief_complaint, examination, diagnosis, treatment_plan)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.registrationId, data.doctorId, data.petId,
        data.chiefComplaint, data.examination, data.diagnosis, data.treatmentPlan
      )
      const diagnosisId = diagResult.lastInsertRowid

      const presStmt = db.prepare(`
        INSERT INTO prescriptions 
        (diagnosis_id, medicine_id, dosage, frequency, duration, quantity, unit_price, subtotal, usage_instructions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const p of data.prescriptions) {
        presStmt.run(
          diagnosisId, p.medicineId, p.dosage, p.frequency, p.duration,
          p.quantity, p.unitPrice, p.subtotal, p.usageInstructions
        )
        const medResult = db.prepare(`
          UPDATE medicines SET stock = stock - ? WHERE id = ? AND stock >= ?
        `).run(p.quantity, p.medicineId, p.quantity)
        
        if (medResult.changes === 0) {
          throw new Error('药品库存扣减失败')
        }

        const med = db.prepare('SELECT stock, safety_threshold FROM medicines WHERE id = ?').get(p.medicineId) as any
        if (med && med.stock < med.safety_threshold) {
          const existing = db.prepare(`
            SELECT id FROM stock_alerts WHERE medicine_id = ? AND resolved = 0
          `).get(p.medicineId)
          if (!existing) {
            db.prepare(`
              INSERT INTO stock_alerts (medicine_id, alert_type, current_stock, threshold)
              VALUES (?, 'low_stock', ?, ?)
            `).run(p.medicineId, med.stock, med.safety_threshold)
          }
        }
      }

      db.prepare(`
        UPDATE registrations SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(data.registrationId)

      const doctor = db.prepare(`
        SELECT COUNT(*) as count FROM registrations WHERE doctor_id = ? AND status IN ('waiting', 'diagnosing')
      `).get(data.doctorId) as { count: number }
      if (doctor.count === 0) {
        db.prepare(`UPDATE doctors SET status = 'available' WHERE id = ?`).run(data.doctorId)
      }

      return diagnosisId
    })

    const diagnosisId = tx()
    return { success: true, data: { diagnosisId } }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

function handleCreatePrescription() {
  return { success: true }
}

function handleCalculateDiscount(_e: any, data: {
  ownerId: number; items: Array<{ type: string; id?: number; name: string; unitPrice: number; quantity: number }>; packageId?: number
}) {
  try {
    const owner = db.prepare('SELECT * FROM pet_owners WHERE id = ?').get(data.ownerId) as any
    if (!owner) return { success: false, error: '会员不存在' }

    let totalAmount = data.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    let discountAmount = 0
    let discountDetails: string[] = []

    let memberDiscount = 1
    if (owner.member_level === 'silver') {
      memberDiscount = 0.95
      discountDetails.push('银卡会员 9.5折')
    } else if (owner.member_level === 'gold') {
      memberDiscount = 0.9
      discountDetails.push('金卡会员 9折')
    }

    if (data.packageId) {
      const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(data.packageId) as any
      if (pkg) {
        discountAmount = totalAmount - pkg.discount_price
        discountDetails.push(`套餐优惠: ${pkg.name}`)
        totalAmount = pkg.discount_price
      }
    } else {
      const memberDiscountAmount = totalAmount * (1 - memberDiscount)
      discountAmount += memberDiscountAmount
      totalAmount = totalAmount - memberDiscountAmount
    }

    const pointsEarned = Math.floor(totalAmount / 10)

    return {
      success: true,
      data: {
        originalTotal: data.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
        totalAmount,
        discountAmount,
        discountDetails,
        pointsEarned
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

function handleCreatePayment(_e: any, data: {
  registrationId?: number; diagnosisId?: number; ownerId: number;
  items: Array<{ type: string; id?: number; name: string; unitPrice: number; quantity: number; subtotal: number }>;
  totalAmount: number; discountAmount: number; finalAmount: number;
  paymentMethod: string; packageId?: number; pointsEarned?: number
}) {
  try {
    const tx = db.transaction(() => {
      const receiptNumber = 'RCP' + Date.now().toString().slice(-10)
      
      const payResult = db.prepare(`
        INSERT INTO payments 
        (registration_id, diagnosis_id, owner_id, total_amount, discount_amount, final_amount, payment_method, receipt_number, points_earned)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.registrationId || null, data.diagnosisId || null, data.ownerId,
        data.totalAmount, data.discountAmount, data.finalAmount,
        data.paymentMethod, receiptNumber, data.pointsEarned || 0
      )
      const paymentId = payResult.lastInsertRowid

      const itemStmt = db.prepare(`
        INSERT INTO payment_items (payment_id, item_type, item_id, item_name, quantity, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      for (const item of data.items) {
        itemStmt.run(paymentId, item.type, item.id || null, item.name, item.quantity, item.unitPrice, item.subtotal)
      }

      if (data.pointsEarned && data.pointsEarned > 0) {
        db.prepare(`
          UPDATE pet_owners 
          SET points = points + ?, total_spent = total_spent + ?
          WHERE id = ?
        `).run(data.pointsEarned, data.finalAmount, data.ownerId)
      }

      return { paymentId, receiptNumber }
    })

    const result = tx()
    return { success: true, data: result }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

function handleLogDeviceUsage(_e: any, data: { deviceId: number; durationHours: number; operator: string }) {
  try {
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO device_usage_logs (device_id, start_time, end_time, duration_hours, operator)
        VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)
      `).run(data.deviceId, data.durationHours, data.operator)

      db.prepare(`
        UPDATE devices SET total_run_hours = total_run_hours + ? WHERE id = ?
      `).run(data.durationHours, data.deviceId)

      const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(data.deviceId) as any
      const hoursSinceLast = device.total_run_hours
      if (hoursSinceLast >= device.maintenance_interval_hours) {
        db.prepare(`UPDATE devices SET status = 'needs_maintenance' WHERE id = ?`).run(data.deviceId)
      }
    })
    tx()
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

function handleGenerateMaintenanceOrders() {
  try {
    const tx = db.transaction(() => {
      const devices = db.prepare(`
        SELECT d.*,
          COALESCE(MAX(mo.scheduled_date), '2000-01-01') as last_scheduled
        FROM devices d
        LEFT JOIN maintenance_orders mo ON d.id = mo.device_id AND mo.status != 'cancelled'
        WHERE d.status = 'needs_maintenance'
           OR d.total_run_hours >= d.maintenance_interval_hours
        GROUP BY d.id
        HAVING last_scheduled < DATE(CURRENT_TIMESTAMP, '-30 days')
           OR last_scheduled = '2000-01-01'
      `).all() as any[]

      const teams = db.prepare('SELECT * FROM maintenance_teams').all() as any[]
      const createdOrders: any[] = []

      for (const device of devices) {
        const deptId = device.department_id
        let teamIndex = 0
        if (deptId === 7) teamIndex = 2
        else if (deptId === 8) teamIndex = 3
        else teamIndex = (device.id % 2)

        const team = teams[teamIndex % teams.length]
        const priority = device.total_run_hours >= device.maintenance_interval_hours * 1.2 ? 'high' : 'normal'
        const scheduledDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

        const result = db.prepare(`
          INSERT INTO maintenance_orders 
          (device_id, team_id, order_type, priority, description, status, scheduled_date)
          VALUES (?, ?, 'routine', ?, ?, 'pending', ?)
        `).run(
          device.id, team.id, priority,
          `设备【${device.name}】累计运行${device.total_run_hours.toFixed(1)}小时，已达维保周期，请及时安排维护保养`,
          scheduledDate
        )
        createdOrders.push({
          id: result.lastInsertRowid,
          deviceName: device.name,
          teamName: team.name,
          scheduledDate
        })
      }

      return createdOrders
    })

    const orders = tx()
    return { success: true, data: orders }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

function handleDoctorStatistics(_e: any, data: { startDate?: string; endDate?: string }) {
  try {
    const startDate = data.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = data.endDate || new Date().toISOString().split('T')[0]

    const stats = db.prepare(`
      SELECT 
        d.id, d.name, d.title,
        dep.name as department_name,
        COUNT(DISTINCT r.id) as total_patients,
        AVG(CASE WHEN r.completed_at IS NOT NULL AND r.called_at IS NOT NULL 
            THEN (JULIANDAY(r.completed_at) - JULIANDAY(r.called_at)) * 24 * 60 END) as avg_duration_minutes,
        COALESCE(SUM(CASE WHEN pi.item_type IN ('service', 'medicine') THEN pi.subtotal ELSE 0 END), 0) as total_income
      FROM doctors d
      LEFT JOIN departments dep ON d.department_id = dep.id
      LEFT JOIN registrations r ON d.id = r.doctor_id 
        AND DATE(r.completed_at) BETWEEN ? AND ?
      LEFT JOIN diagnoses diag ON r.id = diag.registration_id
      LEFT JOIN prescriptions p ON diag.id = p.diagnosis_id
      LEFT JOIN payments pay ON r.id = pay.registration_id
      LEFT JOIN payment_items pi ON pay.id = pi.payment_id
      GROUP BY d.id
      ORDER BY total_patients DESC
    `).all(startDate, endDate)

    return { success: true, data: stats }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

function handleDepartmentStatistics(_e: any, data: { startDate?: string; endDate?: string }) {
  try {
    const startDate = data.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const endDate = data.endDate || new Date().toISOString().split('T')[0]

    const stats = db.prepare(`
      SELECT 
        d.id, d.name, d.description,
        COUNT(DISTINCT r.id) as total_patients,
        COUNT(DISTINCT doc.id) as doctor_count,
        AVG(CASE WHEN r.completed_at IS NOT NULL AND r.called_at IS NOT NULL 
            THEN (JULIANDAY(r.completed_at) - JULIANDAY(r.called_at)) * 24 * 60 END) as avg_duration_minutes,
        COALESCE(SUM(pi.subtotal), 0) as total_income
      FROM departments d
      LEFT JOIN registrations r ON d.id = r.department_id 
        AND DATE(r.completed_at) BETWEEN ? AND ?
      LEFT JOIN doctors doc ON d.id = doc.department_id
      LEFT JOIN payments pay ON r.id = pay.registration_id
      LEFT JOIN payment_items pi ON pay.id = pi.payment_id
      GROUP BY d.id
      ORDER BY total_patients DESC
    `).all(startDate, endDate)

    return { success: true, data: stats }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

function handleRoomHeatmap() {
  try {
    const rooms = db.prepare(`
      SELECT 
        d.room_number,
        d.name as doctor_name,
        dep.name as department_name,
        d.status as doctor_status,
        COUNT(CASE WHEN r.status = 'diagnosing' THEN 1 END) as is_occupied,
        COUNT(CASE WHEN r.status = 'waiting' AND r.doctor_id = d.id THEN 1 END) as waiting_count,
        AVG(CASE WHEN r.completed_at IS NOT NULL AND r.called_at IS NOT NULL 
            THEN (JULIANDAY(r.completed_at) - JULIANDAY(r.called_at)) * 24 * 60 END) as avg_visit_minutes
      FROM doctors d
      LEFT JOIN departments dep ON d.department_id = dep.id
      LEFT JOIN registrations r ON d.id = r.doctor_id 
        AND DATE(r.registered_at) = DATE(CURRENT_TIMESTAMP)
      WHERE d.room_number IS NOT NULL
      GROUP BY d.id
      ORDER BY dep.name, d.room_number
    `).all()

    return { success: true, data: rooms }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
