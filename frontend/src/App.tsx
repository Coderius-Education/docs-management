import { Route, Routes } from 'react-router';

import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { Dashboard } from './routes/Dashboard';
import { Login } from './routes/Login';
import { SiteBrowser } from './routes/SiteBrowser';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sites/:site" element={<SiteBrowser />} />
        </Route>
      </Route>
    </Routes>
  );
}
