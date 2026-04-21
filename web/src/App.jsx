import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { PendingActionsProvider } from './context/PendingActionsContext';

import Complaints   from './pages/Complaints';
import AllCases     from './pages/AllCases';
import FosReferrals from './pages/FosReferrals';
import Inbox        from './pages/Inbox';
import LiveChat     from './pages/LiveChat';
import PostalQueue  from './pages/PostalQueue';
import ConsumerDuty from './pages/ConsumerDuty';
import AuditTrail   from './pages/AuditTrail';
import RegUpdates        from './pages/RegUpdates';
import RegulatoryMonitoring          from './pages/RegulatoryMonitoring';
import CaseView                      from './components/CaseView';
import AnalyticsDashboard            from './components/AnalyticsDashboard';
import RegulatoryMonitoringScreen    from './components/RegulatoryMonitoringScreen';
import SettingsScreen                from './components/SettingsScreen';

export default function App() {
  return (
    <BrowserRouter>
      <PendingActionsProvider>
      <div className="flex h-screen overflow-hidden bg-nuqe-bg text-nuqe-text">
        <Sidebar />

        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route index element={<Navigate to="/complaints" replace />} />
            <Route path="/complaints"   element={<Complaints />} />
            <Route path="/cases"        element={<AllCases />} />
            <Route path="/cases/:id"    element={<CaseView />} />
            <Route path="/fos-referrals" element={<FosReferrals />} />
            <Route path="/inbox"        element={<Inbox />} />
            <Route path="/live-chat"    element={<LiveChat />} />
            <Route path="/postal-queue" element={<PostalQueue />} />
            <Route path="/consumer-duty" element={<ConsumerDuty />} />
            <Route path="/audit-trail"  element={<AuditTrail />} />
            <Route path="/reg-updates"  element={<RegUpdates />} />
            <Route path="/analytics"              element={<AnalyticsDashboard />} />
            <Route path="/regulatory-monitoring"          element={<RegulatoryMonitoring />} />
            <Route path="/compliance/regulatory-monitoring" element={<RegulatoryMonitoringScreen />} />
            <Route path="/settings"                         element={<SettingsScreen />} />
          </Routes>
        </main>
      </div>
      </PendingActionsProvider>
    </BrowserRouter>
  );
}
