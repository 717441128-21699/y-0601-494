export interface Department {
  id: number
  name: string
  description?: string
  created_at?: string
}

export interface Doctor {
  id: number
  name: string
  department_id?: number
  title?: string
  specialty?: string
  status: 'available' | 'busy' | 'off'
  room_number?: string
  created_at?: string
  department_name?: string
  current_load?: number
  total_patients?: number
  avg_duration_minutes?: number
  total_income?: number
}

export interface PetOwner {
  id: number
  name: string
  phone?: string
  address?: string
  member_level: 'normal' | 'silver' | 'gold'
  points: number
  total_spent: number
  created_at?: string
}

export interface Pet {
  id: number
  name: string
  owner_id?: number
  species: string
  breed?: string
  gender?: string
  age?: number
  weight?: number
  created_at?: string
  owner_name?: string
}

export interface Symptom {
  id: number
  name: string
  department_id?: number
  default_urgency: number
  department_name?: string
}

export interface Registration {
  id: number
  pet_id: number
  owner_id: number
  doctor_id?: number
  department_id?: number
  symptom_id?: number
  symptom_description?: string
  urgency_level: number
  status: 'waiting' | 'diagnosing' | 'completed' | 'cancelled'
  queue_number: number
  registered_at: string
  called_at?: string
  completed_at?: string
  timeout_reminded: number
  pet_name?: string
  species?: string
  breed?: string
  weight?: number
  owner_name?: string
  phone?: string
  doctor_name?: string
  room_number?: string
  department_name?: string
  symptom_name?: string
}

export interface Medicine {
  id: number
  name: string
  category?: string
  specification?: string
  unit: string
  dosage_per_kg: number
  price_per_unit: number
  stock: number
  safety_threshold: number
  created_at?: string
}

export interface ServiceItem {
  id: number
  name: string
  category?: string
  price: number
  department_id?: number
  department_name?: string
}

export interface Package {
  id: number
  name: string
  description?: string
  original_price?: number
  discount_price: number
  member_level_required?: string
}

export interface Diagnosis {
  id: number
  registration_id: number
  doctor_id: number
  pet_id: number
  chief_complaint?: string
  examination?: string
  diagnosis?: string
  treatment_plan?: string
  diagnosis_time: string
}

export interface Prescription {
  id: number
  diagnosis_id: number
  medicine_id: number
  dosage?: string
  frequency?: string
  duration?: string
  quantity: number
  unit_price: number
  subtotal: number
  usage_instructions?: string
  medicine_name?: string
}

export interface Payment {
  id: number
  registration_id?: number
  diagnosis_id?: number
  owner_id: number
  total_amount: number
  discount_amount: number
  final_amount: number
  payment_method: 'cash' | 'insurance' | 'wechat' | 'alipay' | 'card'
  receipt_number?: string
  points_earned?: number
  paid_at?: string
  status?: string
  items?: PaymentItem[]
}

export interface PaymentItem {
  id?: number
  payment_id?: number
  item_type: 'service' | 'medicine' | 'package'
  item_id?: number
  item_name: string
  quantity: number
  unit_price: number
  subtotal: number
}

export interface Device {
  id: number
  name: string
  model?: string
  department_id?: number
  room?: string
  total_run_hours: number
  last_maintenance_date?: string
  maintenance_interval_hours: number
  status: 'normal' | 'needs_maintenance' | 'in_maintenance' | 'fault'
  department_name?: string
}

export interface MaintenanceTeam {
  id: number
  name: string
  members?: string
  contact?: string
}

export interface MaintenanceOrder {
  id: number
  device_id: number
  team_id?: number
  order_type: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  scheduled_date?: string
  completed_date?: string
  created_at?: string
  device_name?: string
  team_name?: string
}

export interface StockAlert {
  id: number
  medicine_id: number
  alert_type: string
  current_stock: number
  threshold: number
  resolved: number
  created_at?: string
  medicine_name?: string
}

export interface RoomHeatmapData {
  room_number: string
  doctor_name: string
  department_name: string
  doctor_status: string
  is_occupied: number
  waiting_count: number
  avg_visit_minutes?: number
  utilization_rate?: number
}

declare global {
  interface Window {
    api: {
      query: (sql: string, params?: any[]) => Promise<{ success: boolean; data?: any; error?: string }>
      transaction: (operations: { sql: string; params?: any[] }[]) => Promise<{ success: boolean; data?: any; error?: string }>
      registration: {
        create: (data: { petId: number; ownerId: number; symptomIds: number[]; symptomDescription: string; urgencyLevel?: number }) => Promise<any>
        queue: () => Promise<any>
        call: (regId: number) => Promise<any>
        checkTimeout: () => Promise<any>
      }
      diagnosis: {
        create: (data: any) => Promise<any>
      }
      medicine: {
        calculateDosage: (data: { medicineId: number; weight: number; durationDays: number; frequency: string }) => Promise<any>
      }
      payment: {
        create: (data: any) => Promise<any>
        calculateDiscount: (data: any) => Promise<any>
      }
      device: {
        logUsage: (data: any) => Promise<any>
        generateMaintenance: () => Promise<any>
      }
      statistics: {
        doctor: (data?: any) => Promise<any>
        department: (data?: any) => Promise<any>
        roomHeatmap: () => Promise<any>
      }
    }
  }
}
