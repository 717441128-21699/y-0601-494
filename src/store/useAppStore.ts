import { create } from 'zustand'
import type { Registration, Doctor, Pet, PetOwner, Medicine, ServiceItem, Department, Symptom, Package, Device, MaintenanceOrder, StockAlert, RoomHeatmapData } from '../types'

interface AppState {
  registrations: Registration[]
  doctors: Doctor[]
  pets: Pet[]
  owners: PetOwner[]
  medicines: Medicine[]
  services: ServiceItem[]
  departments: Department[]
  symptoms: Symptom[]
  packages: Package[]
  devices: Device[]
  maintenanceOrders: MaintenanceOrder[]
  stockAlerts: StockAlert[]
  roomHeatmap: RoomHeatmapData[]
  loading: boolean
  error: string | null

  loadData: () => Promise<void>
  loadQueue: () => Promise<void>
  loadDoctors: () => Promise<void>
  loadPets: () => Promise<void>
  loadOwners: () => Promise<void>
  loadMedicines: () => Promise<void>
  loadServices: () => Promise<void>
  loadDepartments: () => Promise<void>
  loadSymptoms: () => Promise<void>
  loadPackages: () => Promise<void>
  loadDevices: () => Promise<void>
  loadMaintenanceOrders: () => Promise<void>
  loadStockAlerts: () => Promise<void>
  loadRoomHeatmap: () => Promise<void>
  
  addRegistration: (data: any) => Promise<any>
  callRegistration: (id: number) => Promise<any>
  checkTimeout: () => Promise<any>
}

export const useAppStore = create<AppState>((set, get) => ({
  registrations: [],
  doctors: [],
  pets: [],
  owners: [],
  medicines: [],
  services: [],
  departments: [],
  symptoms: [],
  packages: [],
  devices: [],
  maintenanceOrders: [],
  stockAlerts: [],
  roomHeatmap: [],
  loading: false,
  error: null,

  loadData: async () => {
    set({ loading: true })
    try {
      await Promise.all([
        get().loadQueue(),
        get().loadDoctors(),
        get().loadPets(),
        get().loadOwners(),
        get().loadMedicines(),
        get().loadServices(),
        get().loadDepartments(),
        get().loadSymptoms(),
        get().loadPackages(),
        get().loadDevices(),
        get().loadMaintenanceOrders(),
        get().loadStockAlerts(),
        get().loadRoomHeatmap()
      ])
    } catch (e: any) {
      set({ error: e.message })
    } finally {
      set({ loading: false })
    }
  },

  loadQueue: async () => {
    const result = await window.api.registration.queue()
    if (result.success) set({ registrations: result.data })
  },

  loadDoctors: async () => {
    const result = await window.api.query('SELECT d.*, dep.name as department_name FROM doctors d LEFT JOIN departments dep ON d.department_id = dep.id')
    if (result.success) set({ doctors: result.data })
  },

  loadPets: async () => {
    const result = await window.api.query(`
      SELECT p.*, po.name as owner_name 
      FROM pets p LEFT JOIN pet_owners po ON p.owner_id = po.id
    `)
    if (result.success) set({ pets: result.data })
  },

  loadOwners: async () => {
    const result = await window.api.query('SELECT * FROM pet_owners')
    if (result.success) set({ owners: result.data })
  },

  loadMedicines: async () => {
    const result = await window.api.query('SELECT * FROM medicines ORDER BY name')
    if (result.success) set({ medicines: result.data })
  },

  loadServices: async () => {
    const result = await window.api.query(`
      SELECT s.*, d.name as department_name 
      FROM service_items s LEFT JOIN departments d ON s.department_id = d.id
      ORDER BY s.category, s.name
    `)
    if (result.success) set({ services: result.data })
  },

  loadDepartments: async () => {
    const result = await window.api.query('SELECT * FROM departments')
    if (result.success) set({ departments: result.data })
  },

  loadSymptoms: async () => {
    const result = await window.api.query(`
      SELECT s.*, d.name as department_name 
      FROM symptoms s LEFT JOIN departments d ON s.department_id = d.id
      ORDER BY s.name
    `)
    if (result.success) set({ symptoms: result.data })
  },

  loadPackages: async () => {
    const result = await window.api.query('SELECT * FROM packages')
    if (result.success) set({ packages: result.data })
  },

  loadDevices: async () => {
    const result = await window.api.query(`
      SELECT dv.*, d.name as department_name 
      FROM devices dv LEFT JOIN departments d ON dv.department_id = d.id
    `)
    if (result.success) set({ devices: result.data })
  },

  loadMaintenanceOrders: async () => {
    const result = await window.api.query(`
      SELECT mo.*, dv.name as device_name, mt.name as team_name 
      FROM maintenance_orders mo 
      LEFT JOIN devices dv ON mo.device_id = dv.id
      LEFT JOIN maintenance_teams mt ON mo.team_id = mt.id
      ORDER BY mo.created_at DESC
    `)
    if (result.success) set({ maintenanceOrders: result.data })
  },

  loadStockAlerts: async () => {
    const result = await window.api.query(`
      SELECT sa.*, m.name as medicine_name 
      FROM stock_alerts sa LEFT JOIN medicines m ON sa.medicine_id = m.id
      WHERE sa.resolved = 0
      ORDER BY sa.created_at DESC
    `)
    if (result.success) set({ stockAlerts: result.data })
  },

  loadRoomHeatmap: async () => {
    const result = await window.api.statistics.roomHeatmap()
    if (result.success) set({ roomHeatmap: result.data })
  },

  addRegistration: async (data) => {
    const result = await window.api.registration.create(data)
    if (result.success) {
      await get().loadQueue()
    }
    return result
  },

  callRegistration: async (id) => {
    const result = await window.api.registration.call(id)
    if (result.success) {
      await get().loadQueue()
      await get().loadDoctors()
      await get().loadRoomHeatmap()
    }
    return result
  },

  checkTimeout: async () => {
    const result = await window.api.registration.checkTimeout()
    if (result.success && result.data && result.data.length > 0) {
      return result.data
    }
    return []
  }
}))
