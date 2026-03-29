import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthProvider";
import { GuestRoute } from "./components/GuestRoute";
import { ProtectedLayout } from "./components/ProtectedLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AccountPage from "./pages/AccountPage";
import ChatPage from "./pages/ChatPage";
import RoomChatPage from "./pages/RoomChatPage";
import RoomsPage from "./pages/RoomsPage";
import AdminPage from "./pages/AdminPage";
import { ModeratorRoute } from "./components/ModeratorRoute";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route
            path="/login"
            element={
              <GuestRoute>
                <LoginPage />
              </GuestRoute>
            }
          />
          <Route
            path="/register"
            element={
              <GuestRoute>
                <RegisterPage />
              </GuestRoute>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <GuestRoute>
                <ForgotPasswordPage />
              </GuestRoute>
            }
          />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            element={
              <ProtectedRoute>
                <ProtectedLayout />
              </ProtectedRoute>
            }
          >
            <Route path="chat" element={<ChatPage />} />
            <Route path="rooms/:roomId" element={<RoomChatPage />} />
            <Route path="rooms" element={<RoomsPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route
              path="admin"
              element={
                <ModeratorRoute>
                  <AdminPage />
                </ModeratorRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
