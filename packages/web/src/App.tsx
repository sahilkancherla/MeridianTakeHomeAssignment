import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './routes/RequireAuth';
import { RequireRole } from './routes/RequireRole';
import { LoginPage } from './routes/LoginPage';
import { RoleHome } from './routes/RoleHome';
import { BoardRoute } from './routes/BoardRoute';
import { GlobalSettingsPage } from './routes/GlobalSettingsPage';
import { BoardSettingsPage } from './routes/BoardSettingsPage';
import { EngineerSpecDetail } from './routes/EngineerSpecDetail';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          {/* Home dispatches on role (customer whiteboards vs engineer spec inbox). */}
          <Route path="/" element={<RoleHome />} />
          <Route path="/settings" element={<GlobalSettingsPage />} />

          {/* Customer board surfaces. */}
          <Route path="/board/:id" element={<BoardRoute />} />
          <Route path="/board/:id/settings" element={<BoardSettingsPage />} />

          {/* Internal-engineer-only spec handoff surfaces. */}
          <Route element={<RequireRole role="engineer" />}>
            <Route path="/specs/:specId" element={<EngineerSpecDetail />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
