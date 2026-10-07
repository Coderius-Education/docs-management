import { Center, Loader } from "@mantine/core";
import { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useParams } from "react-router";

import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { BuildsPage } from "./routes/BuildsPage";
import { Dashboard } from "./routes/Dashboard";
import { ExperimentDetail } from "./routes/ExperimentDetail";
import { ExperimentsPage } from "./routes/ExperimentsPage";
import { KlasEditor } from "./routes/KlasEditor";
import { KlassenPage } from "./routes/KlassenPage";
import { Login } from "./routes/Login";

const EditorPage = lazy(() =>
  import("./routes/EditorPage").then((m) => ({ default: m.EditorPage })),
);
import { ConceptDetail } from "./routes/ConceptDetail";
import { ConceptList } from "./routes/ConceptList";
import { SettingsRedirect } from "./routes/SettingsRedirect";
import { SiteBrowser } from "./routes/SiteBrowser";

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
          <Route path="/sites/:site/settings" element={<SettingsRedirect />} />
          <Route
            path="/sites/:site/metadata"
            element={
              <Suspense fallback={<Loader />}>
                <EditorPage />
              </Suspense>
            }
          />
          <Route path="/concepten" element={<ConceptList />} />
          <Route path="/concepten/:number" element={<ConceptDetail />} />
          {/* Oude adressen blijven werken. */}
          <Route path="/prs" element={<Navigate to="/concepten" replace />} />
          <Route path="/prs/:number" element={<LegacyConceptRedirect />} />
          <Route path="/voorbeelden" element={<BuildsPage />} />
          <Route path="/builds" element={<Navigate to="/voorbeelden" replace />} />
          <Route path="/experiments" element={<ExperimentsPage />} />
          <Route path="/experiments/:id" element={<ExperimentDetail />} />
          <Route path="/klassen" element={<KlassenPage />} />
          <Route path="/klassen/:id" element={<KlasEditor />} />
        </Route>
      </Route>
    </Routes>
  );
}

function LegacyConceptRedirect() {
  const { number } = useParams();
  return <Navigate to={`/concepten/${number}`} replace />;
}
