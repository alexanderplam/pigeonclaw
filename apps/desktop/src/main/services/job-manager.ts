import type { Job, ProjectSnapshot } from '@pigeonclaw/shared';

import type { LocalStore } from '../stores/local-store.js';
import { runCodexJob } from './codex-runner.js';
import type { RelayClient } from './relay-client.js';

export class JobManager {
  private readonly relayClient: RelayClient;
  private readonly store: LocalStore;
  private readonly queued: Job[] = [];
  private readonly activeProjects = new Map<string, number>();
  private readonly activeIncidents = new Set<string>();
  private activeCount = 0;

  constructor(input: { relayClient: RelayClient; store: LocalStore }) {
    this.relayClient = input.relayClient;
    this.store = input.store;
  }

  attach() {
    this.relayClient.on('job', (job) => {
      void this.enqueue(job);
    });
  }

  async enqueue(job: Job) {
    const existing = this.store.getRun(job.id);
    if (existing && ['queued', 'running', 'succeeded', 'cancelled'].includes(existing.status)) {
      return;
    }

    const project = this.store.getProject(job.projectId);
    if (!project) {
      await this.failMissingProject(job);
      return;
    }

    if (project.executionMode === 'log') {
      await this.skipRun(job, 'Execution mode is Log only on this machine.');
      return;
    }

    const queuedUpdate = {
      runId: job.id,
      incidentId: job.incidentId,
      projectId: job.projectId,
      status: 'queued' as const,
      summary:
        project.executionMode === 'ask'
          ? 'Waiting for approval before starting Codex.'
          : 'Queued for execution on this machine.',
      updatedAt: new Date().toISOString(),
    };

    this.store.upsertRun(queuedUpdate);
    await this.relayClient.sendRunUpdate(job.id, {
      incidentId: queuedUpdate.incidentId,
      projectId: queuedUpdate.projectId,
      status: queuedUpdate.status,
      summary: queuedUpdate.summary,
      updatedAt: queuedUpdate.updatedAt,
    });

    if (project.executionMode === 'ask') {
      return;
    }

    this.queued.push(job);
    await this.drain();
  }

  private async drain() {
    const limit = this.store.getAppState().globalConcurrency;
    if (this.activeCount >= limit) {
      return;
    }

    const nextIndex = this.queued.findIndex((job) => {
      const project = this.store.getProject(job.projectId);
      if (
        !project ||
        !project.enabled ||
        project.executionMode !== 'auto' ||
        this.activeIncidents.has(job.incidentId)
      ) {
        return false;
      }

      const activeForProject = this.activeProjects.get(job.projectId) ?? 0;
      return activeForProject < project.concurrencyLimit;
    });

    if (nextIndex === -1) {
      return;
    }

    const [job] = this.queued.splice(nextIndex, 1);
    const project = this.store.getProject(job.projectId);
    if (!project) {
      await this.failMissingProject(job);
      void this.drain();
      return;
    }

    this.activeCount += 1;
    this.activeIncidents.add(job.incidentId);
    this.activeProjects.set(job.projectId, (this.activeProjects.get(job.projectId) ?? 0) + 1);

    const runningUpdate = {
      runId: job.id,
      incidentId: job.incidentId,
      projectId: job.projectId,
      status: 'running' as const,
      updatedAt: new Date().toISOString(),
    };

    this.store.upsertRun(runningUpdate);
    await this.relayClient.sendRunUpdate(job.id, {
      incidentId: runningUpdate.incidentId,
      projectId: runningUpdate.projectId,
      status: runningUpdate.status,
      updatedAt: runningUpdate.updatedAt,
    });

    try {
      const result = await runCodexJob({
        job,
        project,
        codexPath: this.store.getAppState().codexPath,
      });

      const update = {
        runId: job.id,
        incidentId: job.incidentId,
        projectId: job.projectId,
        status: result.status,
        summary: result.summary,
        logPath: result.logPath,
        lastMessagePath: result.lastMessagePath,
        exitCode: result.exitCode,
        updatedAt: new Date().toISOString(),
      };

      this.store.upsertRun(update);
      await this.relayClient.sendRunUpdate(job.id, {
        incidentId: update.incidentId,
        projectId: update.projectId,
        status: update.status,
        summary: update.summary,
        logPath: update.logPath,
        lastMessagePath: update.lastMessagePath,
        exitCode: update.exitCode,
        updatedAt: update.updatedAt,
      });
    } catch (error) {
      const update = {
        runId: job.id,
        incidentId: job.incidentId,
        projectId: job.projectId,
        status: 'failed' as const,
        summary: error instanceof Error ? error.message : 'Codex run failed',
        updatedAt: new Date().toISOString(),
      };

      this.store.upsertRun(update);
      await this.relayClient.sendRunUpdate(job.id, {
        incidentId: update.incidentId,
        projectId: update.projectId,
        status: update.status,
        summary: update.summary,
        updatedAt: update.updatedAt,
      });
    } finally {
      this.activeCount -= 1;
      this.activeIncidents.delete(job.incidentId);
      this.activeProjects.set(
        job.projectId,
        Math.max((this.activeProjects.get(job.projectId) ?? 1) - 1, 0),
      );
      void this.drain();
    }
  }

  private async failMissingProject(job: Job) {
    const update = {
      runId: job.id,
      incidentId: job.incidentId,
      projectId: job.projectId,
      status: 'failed' as const,
      summary: 'No local project is configured for this relay project.',
      updatedAt: new Date().toISOString(),
    };

    this.store.upsertRun(update);
    await this.relayClient.sendRunUpdate(job.id, {
      incidentId: update.incidentId,
      projectId: update.projectId,
      status: update.status,
      summary: update.summary,
      updatedAt: update.updatedAt,
    });
  }

  private async skipRun(job: Job, summary: string) {
    const update = {
      runId: job.id,
      incidentId: job.incidentId,
      projectId: job.projectId,
      status: 'cancelled' as const,
      summary,
      updatedAt: new Date().toISOString(),
    };

    this.store.upsertRun(update);
    await this.relayClient.sendRunUpdate(job.id, {
      incidentId: update.incidentId,
      projectId: update.projectId,
      status: update.status,
      summary: update.summary,
      updatedAt: update.updatedAt,
    });
  }
}
