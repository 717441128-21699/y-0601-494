import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import RegistrationPage from './pages/RegistrationPage'
import QueuePage from './pages/QueuePage'
import DiagnosisPage from './pages/DiagnosisPage'
import PaymentPage from './pages/PaymentPage'
import MedicinePage from './pages/MedicinePage'
import DevicePage from './pages/DevicePage'
import StatisticsPage from './pages/StatisticsPage'
import { useAppStore } from './store/useAppStore'

export default function App() {
  const loadData = useAppStore(state => state.loadData)
  const checkTimeout = useAppStore(state => state.checkTimeout)
  const loadQueue = useAppStore(state => state.loadQueue)
  const loadRoomHeatmap = useAppStore(state => state.loadRoomHeatmap)

  useEffect(() => {
    loadData()

    const queueInterval = setInterval(() => {
      loadQueue()
      loadRoomHeatmap()
    }, 10000)

    const timeoutInterval = setInterval(() => {
      checkTimeout()
    }, 60000)

    return () => {
      clearInterval(queueInterval)
      clearInterval(timeoutInterval)
    }
  }, [])

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="registration" element={<RegistrationPage />} />
        <Route path="queue" element={<QueuePage />} />
        <Route path="diagnosis/:regId?" element={<DiagnosisPage />} />
        <Route path="payment/:regId?" element={<PaymentPage />} />
        <Route path="medicine" element={<MedicinePage />} />
        <Route path="device" element={<DevicePage />} />
        <Route path="statistics" element={<StatisticsPage />} />
      </Route>
    </Routes>
  )
}
