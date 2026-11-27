import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { getAdminToken } from './api/client';
import HomePage from './pages/HomePage';
import PublicRegisterPage from './pages/PublicRegisterPage';
import MultiRegisterPage from './pages/MultiRegisterPage';
import LookupRegistrationPage from './pages/LookupRegistrationPage';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminEventEditorPage from './pages/AdminEventEditorPage';

function ProtectedAdminRoute({ children }) {
  const token = getAdminToken();
  if (!token) {
    return <Navigate to="/admin/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 前台公開路由 */}
        <Route path="/" element={<HomePage />} />
        <Route path="/multi-register" element={<MultiRegisterPage />} />
        <Route path="/lookup" element={<LookupRegistrationPage />} />
        <Route path="/register/:slug" element={<PublicRegisterPage />} />

        {/* 後台驗證與管理路由 */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route
          path="/admin"
          element={
            <ProtectedAdminRoute>
              <AdminDashboardPage />
            </ProtectedAdminRoute>
          }
        />
        <Route
          path="/admin/events/:id"
          element={
            <ProtectedAdminRoute>
              <AdminEventEditorPage />
            </ProtectedAdminRoute>
          }
        />

        {/* 未知路徑導回首頁 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
