import { Center, Loader } from '@mantine/core';
import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router';

import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { BuildsPage } from './routes/BuildsPage';
import { Dashboard } from './routes/Dashboard';
import { ExperimentDetail } from './routes/ExperimentDetail';
import { ExperimentsPage } from './routes/ExperimentsPage';
import { Login } from './routes/Login';

const EditorPage = lazy(() =>
  import('./routes/EditorPage').then((m) => ({ default: m.EditorPage })),
);
import { PrDetail } from './routes/PrDetail';
import { PrList } from './routes/PrList';
import { SiteBrowser } from './routes/SiteBrowser';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sites/:site" element={<SiteBrowser />} />
          <Route
            path="/sites/:site/edit"
            element={
              <Suspense
                fallback={
                  <Center h="50vh">
                    <Loader />
                  </Center>
                }
              >
                <EditorPage />
              </Suspense>
            }
          />
          <Route path="/prs" element={<PrList />} />
          <Route path="/prs/:number" element={<PrDetail />} />
          <Route path="/builds" element={<BuildsPage />} />
          <Route path="/experiments" element={<ExperimentsPage />} />
          <Route path="/experiments/:id" element={<ExperimentDetail />} />
        </Route>
      </Route>
    </Routes>
  );
}
