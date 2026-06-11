import { Route, Routes } from 'react-router';

import { Dashboard } from './routes/Dashboard';
import { Login } from './routes/Login';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Dashboard />} />
    </Routes>
  );
}
