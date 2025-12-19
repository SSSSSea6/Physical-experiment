import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./routes/Login";
import DashboardPage from "./routes/Dashboard";
import ExperimentPage from "./routes/Experiment";
import RegisterPage from "./routes/Register";
import ResetPasswordPage from "./routes/ResetPassword";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/exp/:expId" element={<ExperimentPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
