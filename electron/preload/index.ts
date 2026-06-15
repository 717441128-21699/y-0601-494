import { contextBridge, ipcRenderer } from 'electron'

export const api = {
  query: (sql: string, params?: any[]) => ipcRenderer.invoke('db:query', sql, params),
  transaction: (operations: { sql: string; params?: any[] }[]) => ipcRenderer.invoke('db:transaction', operations),

  registration: {
    create: (data: { petId: number; ownerId: number; symptomIds: number[]; symptomDescription: string; urgencyLevel?: number }) =>
      ipcRenderer.invoke('registration:create', data),
    queue: () => ipcRenderer.invoke('registration:queue'),
    call: (regId: number) => ipcRenderer.invoke('registration:call', regId),
    checkTimeout: () => ipcRenderer.invoke('registration:checkTimeout')
  },

  diagnosis: {
    create: (data: {
      registrationId: number; doctorId: number; petId: number;
      chiefComplaint: string; examination: string; diagnosis: string; treatmentPlan: string;
      prescriptions: Array<{
        medicineId: number; dosage: string; frequency: string; duration: string;
        quantity: number; unitPrice: number; subtotal: number; usageInstructions: string
      }>;
      serviceItems: Array<{ itemId: number; quantity: number; unitPrice: number; subtotal: number }>
    }) => ipcRenderer.invoke('diagnosis:create', data)
  },

  medicine: {
    calculateDosage: (data: { medicineId: number; weight: number; durationDays: number; frequency: string }) =>
      ipcRenderer.invoke('medicine:calculateDosage', data)
  },

  payment: {
    create: (data: {
      registrationId?: number; diagnosisId?: number; ownerId: number;
      items: Array<{ type: string; id?: number; name: string; unitPrice: number; quantity: number; subtotal: number }>;
      totalAmount: number; discountAmount: number; finalAmount: number;
      paymentMethod: string; packageId?: number; pointsEarned?: number
    }) => ipcRenderer.invoke('payment:create', data),
    calculateDiscount: (data: {
      ownerId: number; items: Array<{ type: string; id?: number; name: string; unitPrice: number; quantity: number }>; packageId?: number
    }) => ipcRenderer.invoke('discount:calculate', data),
    voidPayment: (data: { paymentId: number; reason?: string }) =>
      ipcRenderer.invoke('payment:void', data),
    history: (data: {
      ownerId?: number; petName?: string; queueNumber?: string;
      startDate?: string; endDate?: string; page?: number; pageSize?: number
    }) => ipcRenderer.invoke('payment:history', data)
  },

  device: {
    logUsage: (data: { deviceId: number; durationHours: number; operator: string }) =>
      ipcRenderer.invoke('device:logUsage', data),
    generateMaintenance: () => ipcRenderer.invoke('maintenance:generate'),
    updateMaintenanceOrder: (data: {
      id: number; status?: string; repair_content?: string;
      materials_used?: string; person_in_charge?: string;
      next_maintenance_date?: string; cost_amount?: number;
      description?: string; priority?: string; scheduled_date?: string;
      team_id?: number
    }) => ipcRenderer.invoke('maintenance:updateOrder', data)
  },

  statistics: {
    doctor: (data?: { startDate?: string; endDate?: string }) =>
      ipcRenderer.invoke('statistics:doctor', data || {}),
    department: (data?: { startDate?: string; endDate?: string }) =>
      ipcRenderer.invoke('statistics:department', data || {}),
    roomHeatmap: () => ipcRenderer.invoke('statistics:roomHeatmap')
  }
}

contextBridge.exposeInMainWorld('api', api)
