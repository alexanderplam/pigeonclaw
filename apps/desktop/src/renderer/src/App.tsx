import type { DesktopProjectDraft, Incident, ProjectSnapshot, RunUpdate } from '@pigeonclaw/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ProjectForm } from './components/ProjectForm.js';
import { SettingsModal } from './components/SettingsModal.js';
import { SetupView } from './components/SetupView.js';
import { Sidebar } from './components/Sidebar.js';
import { StatusBar } from './components/StatusBar.js';

type SetupState = Awaited<ReturnType<typeof window.pigeonclaw.getSetupState>>;

export default function App() {
  const [setupState, setSetupState] = useState<SetupState | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [projectActionError, setProjectActionError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectSnapshot[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [runs, setRuns] = useState<RunUpdate[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.projectId === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const refreshAll = useCallback(async () => {
    if (!window.pigeonclaw?.getSetupState) {
      setLoadingError(
        'The desktop bridge did not initialize. Restart the app to reload the preload script.',
      );
      return;
    }

    try {
      const nextSetup = await window.pigeonclaw.getSetupState();
      setSetupState(nextSetup);

      const [projectsResult, incidentsResult, runsResult] = await Promise.allSettled([
        window.pigeonclaw.listProjects(),
        window.pigeonclaw.listIncidents(),
        window.pigeonclaw.listRuns(),
      ]);

      const nextProjects: ProjectSnapshot[] =
        projectsResult.status === 'fulfilled' ? projectsResult.value : [];
      const nextIncidents: Incident[] =
        incidentsResult.status === 'fulfilled' ? incidentsResult.value : [];
      const nextRuns: RunUpdate[] = runsResult.status === 'fulfilled' ? runsResult.value : [];

      setProjects(nextProjects);
      setIncidents(nextIncidents);
      setRuns(nextRuns);
      setLoadingError(null);

      if (
        !selectedProjectId ||
        !nextProjects.some((project) => project.projectId === selectedProjectId)
      ) {
        setSelectedProjectId(nextProjects[0]?.projectId ?? null);
      }
    } catch (error) {
      setLoadingError(
        error instanceof Error ? error.message : 'PigeonClaw could not load local state.',
      );
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void refreshAll();
    const timer = window.setInterval(() => {
      void refreshAll();
    }, 7_500);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshAll]);

  const handleCreateProjectFromFolder = useCallback(async () => {
    setProjectActionError(null);

    try {
      const project = await window.pigeonclaw.createProjectFromFolder();
      if (!project) {
        return;
      }

      await refreshAll();
      setSelectedProjectId(project.projectId);
    } catch (error) {
      setProjectActionError(
        error instanceof Error ? error.message : 'Could not add this folder as a project.',
      );
    }
  }, [refreshAll]);

  if (!setupState) {
    return (
      <div className="loading-state">
        <div className="window-drag-region" aria-hidden="true" />
        <div className="loading-card">
          <h1>Loading PigeonClaw…</h1>
          <p>
            {loadingError ??
              'Preparing the local desktop bridge, project state, and relay connection.'}
          </p>
          <button className="ghost-button" type="button" onClick={() => void refreshAll()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!setupState.paired) {
    return (
      <SetupView
        defaultDeviceName={setupState.deviceName ?? 'My Mac'}
        errorMessage={loadingError}
        onPair={async (payload) => {
          await window.pigeonclaw.pairDevice(payload);
          await refreshAll();
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <div className="window-drag-region" aria-hidden="true" />
      <Sidebar
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        onCreateProject={() => void handleCreateProjectFromFolder()}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="workspace">
        <StatusBar
          relayStatus={setupState.relayStatus}
          projectName={selectedProject?.name}
          repoPath={selectedProject?.repoPath}
          runtimeReady={Boolean(setupState.relayBaseUrl && setupState.codexPath)}
        />

        <div className="workspace-scroll">
          <ProjectForm
            project={selectedProject}
            incidents={incidents}
            runs={runs}
            hasProjects={projects.length > 0}
            createFromFolderError={projectActionError}
            onCreateFromFolder={handleCreateProjectFromFolder}
            relayStatus={setupState.relayStatus}
            onSave={async (draft: DesktopProjectDraft) => {
              const saved = await window.pigeonclaw.saveProject(draft);
              await refreshAll();
              setSelectedProjectId(saved.projectId);
            }}
          />
        </div>
      </main>

      <SettingsModal
        isOpen={settingsOpen}
        relayStatus={setupState.relayStatus}
        relayBaseUrl={setupState.relayBaseUrl}
        deviceName={setupState.deviceName}
        codexPath={setupState.codexPath}
        globalConcurrency={setupState.globalConcurrency}
        onClose={() => setSettingsOpen(false)}
        onSave={async (payload) => {
          await window.pigeonclaw.updateSettings(payload);
          await refreshAll();
        }}
      />
    </div>
  );
}
