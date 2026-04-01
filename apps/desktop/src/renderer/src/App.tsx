import type { DesktopProjectDraft, Incident, ProjectSnapshot, RunUpdate } from '@pigeonclaw/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { HistoryView } from './components/HistoryView.js';
import { ProjectForm } from './components/ProjectForm.js';
import { SetupView } from './components/SetupView.js';
import { Sidebar } from './components/Sidebar.js';
import { StatusBar } from './components/StatusBar.js';

type SetupState = Awaited<ReturnType<typeof window.pigeonclaw.getSetupState>>;

export default function App() {
  const [setupState, setSetupState] = useState<SetupState | null>(null);
  const [projects, setProjects] = useState<ProjectSnapshot[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [runs, setRuns] = useState<RunUpdate[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.projectId === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const refreshAll = useCallback(async () => {
    const [nextSetup, nextProjects, nextIncidents, nextRuns] = await Promise.all([
      window.pigeonclaw.getSetupState(),
      window.pigeonclaw.listProjects(),
      window.pigeonclaw.listIncidents().catch(() => []),
      window.pigeonclaw.listRuns(),
    ]);

    setSetupState(nextSetup);
    setProjects(nextProjects);
    setIncidents(nextIncidents);
    setRuns(nextRuns);

    if (!selectedProjectId && nextProjects[0]) {
      setSelectedProjectId(nextProjects[0].projectId);
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

  if (!setupState) {
    return <div className="loading-state">Loading PigeonClaw…</div>;
  }

  if (!setupState.paired) {
    return (
      <SetupView
        defaultDeviceName={setupState.deviceName ?? 'My Mac'}
        onPair={async (payload) => {
          await window.pigeonclaw.pairDevice(payload);
          await refreshAll();
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        onCreateProject={() => setSelectedProjectId(null)}
      />

      <main className="workspace">
        <StatusBar
          relayStatus={setupState.relayStatus}
          deviceName={setupState.deviceName}
          codexPath={setupState.codexPath}
          globalConcurrency={setupState.globalConcurrency}
          onSaveSettings={async (payload) => {
            await window.pigeonclaw.updateSettings(payload);
            await refreshAll();
          }}
        />

        <ProjectForm
          project={selectedProject}
          onSave={async (draft: DesktopProjectDraft) => {
            const saved = await window.pigeonclaw.saveProject(draft);
            await refreshAll();
            setSelectedProjectId(saved.projectId);
          }}
        />

        <HistoryView project={selectedProject} incidents={incidents} runs={runs} />
      </main>
    </div>
  );
}
