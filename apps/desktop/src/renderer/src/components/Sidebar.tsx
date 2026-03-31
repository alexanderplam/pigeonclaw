import type { ProjectSnapshot } from '@pigeonclaw/shared';
import { StatusPill, SurfaceCard } from '@pigeonclaw/ui';

export function Sidebar({
  projects,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
}: {
  projects: ProjectSnapshot[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div>
          <span className="sidebar-eyebrow">Local Agent Control</span>
          <h1>PigeonClaw</h1>
        </div>
        <button className="ghost-button" type="button" onClick={onCreateProject}>
          New Project
        </button>
      </div>

      <SurfaceCard className="sidebar-card">
        <div className="sidebar-card-header">
          <span>Projects</span>
          <StatusPill tone="neutral">{projects.length}</StatusPill>
        </div>

        <div className="project-list">
          {projects.map((project) => (
            <button
              key={project.projectId}
              type="button"
              className={
                project.projectId === selectedProjectId ? 'project-item is-active' : 'project-item'
              }
              onClick={() => onSelectProject(project.projectId)}
            >
              <div>
                <strong>{project.name}</strong>
                <span>{project.slug}</span>
              </div>
              <StatusPill tone={project.enabled ? 'success' : 'warning'}>
                {project.enabled ? 'Ready' : 'Paused'}
              </StatusPill>
            </button>
          ))}

          {projects.length === 0 ? (
            <div className="empty-state">
              <strong>No projects yet</strong>
              <p>Create a project to get a public webhook URL and local Codex workflow.</p>
            </div>
          ) : null}
        </div>
      </SurfaceCard>
    </aside>
  );
}
