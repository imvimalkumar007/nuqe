import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { AuthProvider } from './context/AuthContext';
import { PendingActionsProvider } from './context/PendingActionsContext';
import PrivateRoute from './components/shared/PrivateRoute';
import LoginPage from './pages/LoginPage';

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

function PlaceholderPage({ title }) {
  return (
    <div className="flex items-center justify-center h-full text-nuqe-muted text-sm">
      {title} — coming soon
    </div>
  );
}

function AppShell() {
  return (
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
            <Route path="/settings/ai-config"               element={<SettingsScreen />} />
            <Route path="/settings/tokeniser"               element={<SettingsScreen />} />
            <Route path="/knowledge/regulatory"             element={<PlaceholderPage title="Regulatory Knowledge" />} />
            <Route path="/knowledge/product"                element={<PlaceholderPage title="Product Knowledge" />} />
            <Route path="/knowledge/gaps"                   element={<PlaceholderPage title="Knowledge Gaps" />} />
          </Routes>
        </main>
      </div>
    </PendingActionsProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={
            <PrivateRoute>
              <AppShell />
            </PrivateRoute>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
