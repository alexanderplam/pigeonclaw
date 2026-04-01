import type { ProjectSnapshot } from '@pigeonclaw/shared';
import { StatusPill, SurfaceCard } from '@pigeonclaw/ui';
import { FolderPlus } from 'lucide-react';

import { getExecutionModeLabel } from './runtime-utils.js';
import { SidebarFooter } from './SidebarFooter.js';

export function Sidebar({
  projects,
  selectedProjectId,
  onSelectProject,
  onCreateProject,
  onOpenSettings,
}: {
  projects: ProjectSnapshot[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>PigeonClaw</h1>
        <button
          className="ghost-button sidebar-icon-button"
          type="button"
          aria-label="Add project from folder"
          onClick={onCreateProject}
        >
          <FolderPlus aria-hidden="true" size={18} strokeWidth={1.9} />
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
              <div className="project-item-copy">
                <strong>{project.name}</strong>
                <div className="project-item-meta">
                  <span>{project.slug}</span>
                  <span className="project-mode-label">
                    {getExecutionModeLabel(project.executionMode, 'short')}
                  </span>
                </div>
              </div>

              <span className="project-live-state">
                <span
                  className={project.enabled ? 'project-status-dot is-live' : 'project-status-dot'}
                  aria-hidden="true"
                />
                <span>{project.enabled ? 'Live' : 'Paused'}</span>
              </span>
            </button>
          ))}

          {projects.length === 0 ? (
            <div className="empty-state">
              <strong>No projects yet</strong>
              <p>Choose a local repository to issue a webhook and light up the runtime.</p>
            </div>
          ) : null}
        </div>
      </SurfaceCard>

      <SidebarFooter onOpenSettings={onOpenSettings} />
    </aside>
  );
}
