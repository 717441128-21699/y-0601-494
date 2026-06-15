import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (db) return db

  const userDataPath = app.getPath('userData')
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }

  const dbPath = path.join(userDataPath, 'pet-hospital.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  initializeDatabase(db)
  return db
}

function initializeDatabase(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      department_id INTEGER,
      title TEXT,
      specialty TEXT,
      status TEXT DEFAULT 'available',
      room_number TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id)
    );

    CREATE TABLE IF NOT EXISTS pet_owners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      member_level TEXT DEFAULT 'normal',
      points INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      owner_id INTEGER,
      species TEXT NOT NULL,
      breed TEXT,
      gender TEXT,
      age INTEGER,
      weight REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES pet_owners(id)
    );

    CREATE TABLE IF NOT EXISTS symptoms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      department_id INTEGER,
      default_urgency INTEGER DEFAULT 1,
      FOREIGN KEY (department_id) REFERENCES departments(id)
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_id INTEGER NOT NULL,
      owner_id INTEGER NOT NULL,
      doctor_id INTEGER,
      department_id INTEGER,
      symptom_id INTEGER,
      symptom_description TEXT,
      urgency_level INTEGER DEFAULT 1,
      status TEXT DEFAULT 'waiting',
      queue_number INTEGER,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      called_at DATETIME,
      completed_at DATETIME,
      timeout_reminded INTEGER DEFAULT 0,
      FOREIGN KEY (pet_id) REFERENCES pets(id),
      FOREIGN KEY (owner_id) REFERENCES pet_owners(id),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id),
      FOREIGN KEY (department_id) REFERENCES departments(id),
      FOREIGN KEY (symptom_id) REFERENCES symptoms(id)
    );

    CREATE TABLE IF NOT EXISTS diagnoses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      pet_id INTEGER NOT NULL,
      chief_complaint TEXT,
      examination TEXT,
      diagnosis TEXT,
      treatment_plan TEXT,
      diagnosis_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (registration_id) REFERENCES registrations(id),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id),
      FOREIGN KEY (pet_id) REFERENCES pets(id)
    );

    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      specification TEXT,
      unit TEXT,
      dosage_per_kg REAL,
      price_per_unit REAL NOT NULL,
      stock INTEGER DEFAULT 0,
      safety_threshold INTEGER DEFAULT 10,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diagnosis_id INTEGER NOT NULL,
      medicine_id INTEGER NOT NULL,
      dosage REAL,
      frequency TEXT,
      duration TEXT,
      quantity INTEGER,
      unit_price REAL,
      subtotal REAL,
      usage_instructions TEXT,
      FOREIGN KEY (diagnosis_id) REFERENCES diagnoses(id),
      FOREIGN KEY (medicine_id) REFERENCES medicines(id)
    );

    CREATE TABLE IF NOT EXISTS diagnosis_service_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diagnosis_id INTEGER NOT NULL,
      service_item_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (diagnosis_id) REFERENCES diagnoses(id),
      FOREIGN KEY (service_item_id) REFERENCES service_items(id)
    );

    CREATE TABLE IF NOT EXISTS service_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      price REAL NOT NULL,
      department_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id)
    );

    CREATE TABLE IF NOT EXISTS packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      original_price REAL,
      discount_price REAL NOT NULL,
      member_level_required TEXT DEFAULT 'normal',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS package_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id INTEGER NOT NULL,
      item_type TEXT NOT NULL,
      item_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      FOREIGN KEY (package_id) REFERENCES packages(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_id INTEGER,
      diagnosis_id INTEGER,
      owner_id INTEGER NOT NULL,
      total_amount REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      final_amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      receipt_number TEXT UNIQUE,
      points_earned INTEGER DEFAULT 0,
      paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'paid',
      FOREIGN KEY (registration_id) REFERENCES registrations(id),
      FOREIGN KEY (diagnosis_id) REFERENCES diagnoses(id),
      FOREIGN KEY (owner_id) REFERENCES pet_owners(id)
    );

    CREATE TABLE IF NOT EXISTS payment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL,
      item_type TEXT NOT NULL,
      item_id INTEGER,
      item_name TEXT,
      quantity INTEGER DEFAULT 1,
      unit_price REAL,
      subtotal REAL,
      FOREIGN KEY (payment_id) REFERENCES payments(id)
    );

    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      model TEXT,
      department_id INTEGER,
      room TEXT,
      total_run_hours REAL DEFAULT 0,
      last_maintenance_date DATE,
      maintenance_interval_hours REAL DEFAULT 500,
      status TEXT DEFAULT 'normal',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id)
    );

    CREATE TABLE IF NOT EXISTS device_usage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      duration_hours REAL,
      operator TEXT,
      FOREIGN KEY (device_id) REFERENCES devices(id)
    );

    CREATE TABLE IF NOT EXISTS maintenance_teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      members TEXT,
      contact TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS maintenance_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      team_id INTEGER,
      order_type TEXT DEFAULT 'routine',
      priority TEXT DEFAULT 'normal',
      description TEXT,
      status TEXT DEFAULT 'pending',
      scheduled_date DATE,
      completed_date DATE,
      repair_content TEXT,
      materials_used TEXT,
      person_in_charge TEXT,
      next_maintenance_date DATE,
      cost_amount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id),
      FOREIGN KEY (team_id) REFERENCES maintenance_teams(id)
    );

    CREATE TABLE IF NOT EXISTS stock_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL,
      alert_type TEXT DEFAULT 'low_stock',
      current_stock INTEGER,
      threshold INTEGER,
      resolved INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id)
    );
  `)

  migrateDatabase(db)
  seedInitialData(db)
}

function migrateDatabase(db: Database.Database) {
  const cols = db.prepare("PRAGMA table_info(maintenance_orders)").all() as { name: string }[]
  const colNames = new Set(cols.map(c => c.name))

  const addCol = (sql: string) => {
    try { db.exec(sql) } catch { /* column exists */ }
  }

  if (!colNames.has('repair_content')) addCol('ALTER TABLE maintenance_orders ADD COLUMN repair_content TEXT')
  if (!colNames.has('materials_used')) addCol('ALTER TABLE maintenance_orders ADD COLUMN materials_used TEXT')
  if (!colNames.has('person_in_charge')) addCol('ALTER TABLE maintenance_orders ADD COLUMN person_in_charge TEXT')
  if (!colNames.has('next_maintenance_date')) addCol('ALTER TABLE maintenance_orders ADD COLUMN next_maintenance_date DATE')
  if (!colNames.has('cost_amount')) addCol('ALTER TABLE maintenance_orders ADD COLUMN cost_amount REAL DEFAULT 0')

  const payCols = db.prepare("PRAGMA table_info(payments)").all() as { name: string }[]
  const payColNames = new Set(payCols.map(c => c.name))
  if (!payColNames.has('status')) {
    try { db.exec('ALTER TABLE payments ADD COLUMN status TEXT DEFAULT \'paid\'') } catch { /* exist */ }
  }
  if (!payColNames.has('void_reason')) {
    try { db.exec('ALTER TABLE payments ADD COLUMN void_reason TEXT') } catch { /* exist */ }
  }
  if (!payColNames.has('void_at')) {
    try { db.exec('ALTER TABLE payments ADD COLUMN void_at DATETIME') } catch { /* exist */ }
  }
}

function seedInitialData(db: Database.Database) {
  const deptCount = db.prepare('SELECT COUNT(*) as count FROM departments').get() as { count: number }
  if (deptCount.count > 0) return

  const insertDept = db.prepare('INSERT INTO departments (name, description) VALUES (?, ?)')
  const departments = [
    ['内科', '处理宠物内脏、呼吸、消化等内科疾病'],
    ['外科', '处理创伤、肿瘤、骨科等外科手术'],
    ['皮肤科', '处理皮肤过敏、感染、寄生虫等'],
    ['牙科', '处理口腔、牙齿相关疾病'],
    ['眼科', '处理眼部疾病和手术'],
    ['急诊科', '24小时急诊处理危急重症'],
    ['影像科', 'X光、B超、CT等影像检查'],
    ['检验科', '血液、尿液、生化等检验项目']
  ]
  const deptIds: number[] = []
  departments.forEach(([name, desc]) => {
    const info = insertDept.run(name, desc)
    deptIds.push(Number(info.lastInsertRowid))
  })

  const insertDoctor = db.prepare('INSERT INTO doctors (name, department_id, title, specialty, status, room_number) VALUES (?, ?, ?, ?, ?, ?)')
  const doctors = [
    ['张医生', deptIds[0], '主治医师', '消化系统疾病', 'available', 'A101'],
    ['李医生', deptIds[0], '副主任医师', '心血管疾病', 'available', 'A102'],
    ['王医生', deptIds[1], '主治医师', '骨科手术', 'available', 'B201'],
    ['赵医生', deptIds[1], '主任医师', '肿瘤外科', 'busy', 'B202'],
    ['陈医生', deptIds[2], '主治医师', '皮肤病', 'available', 'C301'],
    ['刘医生', deptIds[3], '主治医师', '牙科手术', 'available', 'D401'],
    ['周医生', deptIds[4], '副主任医师', '眼科手术', 'available', 'E501'],
    ['吴医生', deptIds[5], '主治医师', '急诊急救', 'available', 'F101'],
    ['郑医生', deptIds[5], '副主任医师', '重症监护', 'busy', 'F102']
  ]
  doctors.forEach(d => insertDoctor.run(...d))

  const insertOwner = db.prepare('INSERT INTO pet_owners (name, phone, address, member_level, points, total_spent) VALUES (?, ?, ?, ?, ?, ?)')
  const owners = [
    ['小明', '13800138001', '北京市朝阳区XX路1号', 'gold', 2580, 12800],
    ['小红', '13800138002', '北京市海淀区XX路2号', 'silver', 980, 4800],
    ['小刚', '13800138003', '北京市西城区XX路3号', 'normal', 200, 1200],
    ['小丽', '13800138004', '北京市东城区XX路4号', 'gold', 5200, 26800],
    ['小强', '13800138005', '北京市丰台区XX路5号', 'normal', 0, 0]
  ]
  const ownerIds: number[] = []
  owners.forEach(o => {
    const info = insertOwner.run(...o)
    ownerIds.push(Number(info.lastInsertRowid))
  })

  const insertPet = db.prepare('INSERT INTO pets (name, owner_id, species, breed, gender, age, weight) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const pets = [
    ['旺财', ownerIds[0], '犬', '金毛', '公', 3, 28.5],
    ['咪咪', ownerIds[0], '猫', '英国短毛猫', '母', 2, 4.2],
    ['豆豆', ownerIds[1], '犬', '泰迪', '公', 5, 6.8],
    ['花花', ownerIds[1], '猫', '布偶猫', '母', 1, 3.5],
    ['小黑', ownerIds[2], '犬', '拉布拉多', '公', 4, 32.0],
    ['小白', ownerIds[3], '猫', '波斯猫', '母', 6, 3.8],
    ['阿黄', ownerIds[3], '犬', '中华田园犬', '公', 8, 15.2],
    ['球球', ownerIds[4], '兔', '荷兰垂耳兔', '母', 1, 2.1]
  ]
  pets.forEach(p => insertPet.run(...p))

  const insertSymptom = db.prepare('INSERT INTO symptoms (name, department_id, default_urgency) VALUES (?, ?, ?)')
  const symptoms = [
    ['呕吐腹泻', deptIds[0], 2],
    ['食欲不振', deptIds[0], 1],
    ['咳嗽气喘', deptIds[0], 2],
    ['外伤出血', deptIds[1], 3],
    ['骨折跛行', deptIds[1], 3],
    ['皮肤瘙痒', deptIds[2], 1],
    ['脱毛皮屑', deptIds[2], 1],
    ['口臭流涎', deptIds[3], 1],
    ['牙齿松动', deptIds[3], 2],
    ['眼部分泌物', deptIds[4], 2],
    ['视力下降', deptIds[4], 2],
    ['抽搐昏迷', deptIds[5], 5],
    ['呼吸困难', deptIds[5], 5],
    ['中毒', deptIds[5], 5],
    ['异物吞食', deptIds[5], 4]
  ]
  symptoms.forEach(s => insertSymptom.run(...s))

  const insertMedicine = db.prepare('INSERT INTO medicines (name, category, specification, unit, dosage_per_kg, price_per_unit, stock, safety_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  const medicines = [
    ['阿莫西林胶囊', '抗生素', '250mg*24粒', '粒', 12.5, 2.5, 120, 30],
    ['头孢氨苄片', '抗生素', '125mg*24片', '片', 15, 1.8, 80, 30],
    ['布洛芬片', '解热镇痛', '100mg*20片', '片', 5, 1.2, 150, 30],
    ['蒙脱石散', '止泻药', '3g*10袋', '袋', 0.5, 3.5, 200, 50],
    ['益生菌粉', '肠道调理', '5g*10袋', '袋', 0.2, 8, 60, 20],
    ['氯雷他定片', '抗过敏', '10mg*6片', '片', 1, 4.5, 25, 20],
    ['伊维菌素注射液', '驱虫药', '10ml/瓶', 'ml', 0.02, 15, 15, 10],
    ['维生素B12注射液', '维生素', '1ml*10支', '支', 0.05, 3, 45, 20],
    ['利多卡因凝胶', '局部麻醉', '20g/支', '支', 0, 25, 8, 10],
    ['碘伏消毒液', '消毒剂', '100ml/瓶', '瓶', 0, 8, 12, 15]
  ]
  medicines.forEach(m => insertMedicine.run(...m))

  const insertService = db.prepare('INSERT INTO service_items (name, category, price, department_id) VALUES (?, ?, ?, ?)')
  const services = [
    ['挂号费', '基础服务', 20, null],
    ['专家挂号费', '基础服务', 50, null],
    ['急诊挂号费', '基础服务', 80, deptIds[5]],
    ['血常规检查', '检验', 60, deptIds[7]],
    ['生化全项', '检验', 280, deptIds[7]],
    ['X光检查', '影像', 120, deptIds[6]],
    ['B超检查', '影像', 180, deptIds[6]],
    ['CT检查', '影像', 800, deptIds[6]],
    ['尿常规检查', '检验', 40, deptIds[7]],
    ['粪便检查', '检验', 35, deptIds[7]],
    ['静脉输液', '治疗', 80, deptIds[0]],
    ['肌肉注射', '治疗', 25, deptIds[0]],
    ['皮下注射', '治疗', 15, deptIds[0]],
    ['外伤处理', '治疗', 60, deptIds[1]],
    ['伤口换药', '治疗', 30, deptIds[1]],
    ['洗牙', '牙科', 200, deptIds[3]],
    ['拔牙', '牙科', 150, deptIds[3]],
    ['基础体检套餐', '体检', 380, null],
    ['全身体检套餐', '体检', 880, null],
    ['疫苗接种', '预防', 120, null]
  ]
  services.forEach(s => insertService.run(...s))

  const insertPackage = db.prepare('INSERT INTO packages (name, description, original_price, discount_price, member_level_required) VALUES (?, ?, ?, ?, ?)')
  const info1 = insertPackage.run('新宠体检套餐', '适合新到家宠物的全面体检', 580, 399, 'normal')
  const info2 = insertPackage.run('年度健康套餐', '包含全面体检和疫苗接种', 1280, 888, 'silver')
  const info3 = insertPackage.run('老年宠关爱套餐', '针对老年宠物的深度检查', 1880, 1280, 'gold')

  const insertDevice = db.prepare('INSERT INTO devices (name, model, department_id, room, total_run_hours, maintenance_interval_hours, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const devices = [
    ['X光机', 'DR-2000', deptIds[6], '影像室1', 480, 500, 'normal'],
    ['B超机', 'US-300', deptIds[6], '影像室2', 620, 500, 'needs_maintenance'],
    ['血液分析仪', 'BC-5000', deptIds[7], '检验科', 320, 500, 'normal'],
    ['生化分析仪', 'BS-200', deptIds[7], '检验科', 750, 600, 'needs_maintenance'],
    ['麻醉呼吸机', 'AV-100', deptIds[1], '手术室1', 120, 500, 'normal'],
    ['心电监护仪', 'PM-50', deptIds[1], '手术室1', 80, 500, 'normal'],
    ['洗牙机', 'UD-600', deptIds[3], '牙科诊室', 350, 500, 'normal'],
    ['检眼镜', 'OT-200', deptIds[4], '眼科诊室', 90, 500, 'normal'],
    ['CT扫描仪', 'CT-16', deptIds[6], 'CT室', 550, 1000, 'normal']
  ]
  devices.forEach(d => insertDevice.run(...d))

  const insertTeam = db.prepare('INSERT INTO maintenance_teams (name, members, contact) VALUES (?, ?, ?)')
  const teams = [
    ['机电一班', '老王、小张', '13900139001'],
    ['机电二班', '老李、小刘', '13900139002'],
    ['影像设备组', '老陈、小赵', '13900139003'],
    ['检验科设备组', '老孙、小周', '13900139004']
  ]
  const teamIds: number[] = []
  teams.forEach(t => {
    const info = insertTeam.run(...t)
    teamIds.push(Number(info.lastInsertRowid))
  })

  const insertMaintOrder = db.prepare('INSERT INTO maintenance_orders (device_id, team_id, order_type, priority, description, status, scheduled_date) VALUES (?, ?, ?, ?, ?, ?, ?)')
  insertMaintOrder.run(2, teamIds[2], 'routine', 'high', 'B超机已达维保周期，需进行全面检查校准', 'pending', '2026-06-18')
  insertMaintOrder.run(4, teamIds[3], 'routine', 'medium', '生化分析仪运行时长接近维保周期', 'pending', '2026-06-20')

  const insertReg = db.prepare(`INSERT INTO registrations 
    (pet_id, owner_id, doctor_id, department_id, symptom_id, symptom_description, urgency_level, status, queue_number, registered_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  const now = new Date()
  const registrations = [
    [1, ownerIds[0], 1, deptIds[0], 1, '呕吐2天，伴有腹泻', 2, 'diagnosing', 1, new Date(now.getTime() - 3600000).toISOString()],
    [3, ownerIds[1], 3, deptIds[1], 5, '右后腿跛行，不敢着地', 3, 'waiting', 2, new Date(now.getTime() - 1800000).toISOString()],
    [5, ownerIds[2], 6, deptIds[3], 9, '牙齿松动，进食困难', 2, 'waiting', 3, new Date(now.getTime() - 1200000).toISOString()],
    [4, ownerIds[1], 5, deptIds[2], 7, '大量脱毛，有皮屑', 1, 'waiting', 4, new Date(now.getTime() - 900000).toISOString()],
    [2, ownerIds[0], 8, deptIds[5], 15, '怀疑吞食了异物', 4, 'waiting', 5, new Date(now.getTime() - 600000).toISOString()],
    [6, ownerIds[3], 7, deptIds[4], 10, '眼睛红肿，分泌物增多', 2, 'waiting', 6, new Date(now.getTime() - 300000).toISOString()]
  ]
  registrations.forEach(r => insertReg.run(...r))

  const lowStockMedicines = [7, 9]
  const insertAlert = db.prepare('INSERT INTO stock_alerts (medicine_id, alert_type, current_stock, threshold) VALUES (?, ?, ?, ?)')
  lowStockMedicines.forEach(id => {
    const med = db.prepare('SELECT stock, safety_threshold FROM medicines WHERE id = ?').get(id) as { stock: number; safety_threshold: number }
    if (med && med.stock < med.safety_threshold) {
      insertAlert.run(id, 'low_stock', med.stock, med.safety_threshold)
    }
  })
}
