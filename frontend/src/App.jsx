import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import GroupDetail from './pages/GroupDetail';
import ExpenseForm from './pages/ExpenseForm';
import Balances from './pages/Balances';
import ImportFlow from './pages/ImportFlow';
import ImportReport from './pages/ImportReport';
import SettlementForm from './pages/SettlementForm';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return !isAuthenticated ? children : <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* Public */}
      <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

      {/* Protected */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/groups/:groupId" element={<ProtectedRoute><GroupDetail /></ProtectedRoute>} />
      <Route path="/groups/:groupId/expenses/new" element={<ProtectedRoute><ExpenseForm /></ProtectedRoute>} />
      <Route path="/groups/:groupId/expenses/:expenseId/edit" element={<ProtectedRoute><ExpenseForm /></ProtectedRoute>} />
      <Route path="/groups/:groupId/balances" element={<ProtectedRoute><Balances /></ProtectedRoute>} />
      <Route path="/groups/:groupId/import" element={<ProtectedRoute><ImportFlow /></ProtectedRoute>} />
      <Route path="/groups/:groupId/import/:batchId/report" element={<ProtectedRoute><ImportReport /></ProtectedRoute>} />
      <Route path="/groups/:groupId/settle" element={<ProtectedRoute><SettlementForm /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1e293b',
              color: '#f8fafc',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '10px',
              fontSize: '0.9rem',
            },
            success: { iconTheme: { primary: '#10b981', secondary: '#f8fafc' } },
            error:   { iconTheme: { primary: '#f43f5e', secondary: '#f8fafc' } },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}
