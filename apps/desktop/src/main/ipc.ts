import { basename } from 'node:path';

import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { OpenDialogOptions } from 'electron';

import {
  type DesktopProjectDraft,
  type ProjectSnapshot,
  desktopProjectDraftSchema,
  projectSnapshotSchema,
} from '@pigeonclaw/shared';

import {
  ensureUniqueProjectSlug,
  makeProjectDraft,
  slugifyProjectName,
} from '../shared/project-defaults.js';
import type { RelayClient } from './services/relay-client.js';
import type { LocalStore } from './stores/local-store.js';

export function registerIpcHandlers(input: {
  relayClient: RelayClient;
  store: LocalStore;
  appVersion: string;
}) {
  ipcMain.handle('setup:get-state', () => {
    return input.relayClient.getStatus();
  });

  ipcMain.handle(
    'setup:pair-device',
    async (
      _event,
      payload: { relayBaseUrl: string; bootstrapToken: string; deviceName: string },
    ) => {
      return input.relayClient.pairDevice({
        ...payload,
        appVersion: input.appVersion,
      });
    },
  );

  ipcMain.handle(
    'settings:update',
    async (_event, payload: { codexPath?: string; globalConcurrency?: number }) => {
      if (payload.codexPath) {
        input.store.setSetting('codexPath', payload.codexPath);
      }

      if (payload.globalConcurrency) {
        input.store.setSetting('globalConcurrency', String(payload.globalConcurrency));
      }

      return input.store.getAppState();
    },
  );

  ipcMain.handle('projects:list', async () => {
    const localProjects = input.store.listProjects();
    if (!input.relayClient.getStatus().paired) {
      return localProjects;
    }

    try {
      const remoteProjects = await input.relayClient.listProjects();
      const merged = mergeProjects(localProjects, remoteProjects.projects);
      for (const project of merged) {
        input.store.upsertProject(project);
      }
      return merged;
    } catch {
      return localProjects;
    }
  });

  ipcMain.handle('projects:save', async (_event, payload: DesktopProjectDraft) => {
    const draft = desktopProjectDraftSchema.parse(payload);
    const current = draft.projectId ? input.store.getProject(draft.projectId) : null;

    if (!draft.projectId) {
      const created = await input.relayClient.createProject(draft);
      const snapshot = projectSnapshotSchema.parse({
        projectId: created.project.id,
        name: draft.name,
        slug: draft.slug,
        repoPath: draft.repoPath,
        basePrompt: draft.basePrompt,
        eventPromptTemplate: draft.eventPromptTemplate,
        localRules: draft.localRules,
        codexModel: draft.codexModel,
        concurrencyLimit: draft.concurrencyLimit,
        sandboxMode: draft.sandboxMode,
        cooldownSeconds: draft.cooldownSeconds,
        fingerprintFields: draft.fingerprintFields,
        eventIdPath: draft.eventIdPath,
        enabled: draft.enabled,
        webhookUrl: created.project.webhookUrl,
        webhookToken: created.issuedWebhookToken,
        signingSecret: created.issuedSigningSecret,
        signingSecretHint: created.project.signingSecretHint,
        updatedAt: created.project.updatedAt,
      });

      input.store.upsertProject(snapshot);
      return snapshot;
    }

    const updated = await input.relayClient.updateProject(draft);
    const snapshot = projectSnapshotSchema.parse({
      projectId: draft.projectId,
      name: draft.name,
      slug: draft.slug,
      repoPath: draft.repoPath,
      basePrompt: draft.basePrompt,
      eventPromptTemplate: draft.eventPromptTemplate,
      localRules: draft.localRules,
      codexModel: draft.codexModel,
      concurrencyLimit: draft.concurrencyLimit,
      sandboxMode: draft.sandboxMode,
      cooldownSeconds: draft.cooldownSeconds,
      fingerprintFields: draft.fingerprintFields,
      eventIdPath: draft.eventIdPath,
      enabled: draft.enabled,
      webhookUrl: current?.webhookUrl ?? '',
      webhookToken: current?.webhookToken,
      signingSecret: (updated.issuedSigningSecret as string | undefined) ?? current?.signingSecret,
      signingSecretHint: (updated.issuedSigningSecret as string | undefined)
        ? `••••${String(updated.issuedSigningSecret).slice(-4)}`
        : current?.signingSecretHint,
      updatedAt: new Date().toISOString(),
    });

    input.store.upsertProject(snapshot);
    return snapshot;
  });

  ipcMain.handle('projects:create-from-folder', async () => {
    if (!input.relayClient.getStatus().paired) {
      throw new Error('Pair this Mac with your relay before adding a project.');
    }

    const pickerOptions: OpenDialogOptions = {
      title: 'Choose a local repository',
      buttonLabel: 'Add Project',
      properties: ['openDirectory'],
    };
    const ownerWindow = BrowserWindow.getFocusedWindow();
    const picker = ownerWindow
      ? await dialog.showOpenDialog(ownerWindow, pickerOptions)
      : await dialog.showOpenDialog(pickerOptions);

    if (picker.canceled || picker.filePaths.length === 0) {
      return null;
    }

    const repoPath = picker.filePaths[0];
    const existingProjects = input.store.listProjects();
    const existingProject = existingProjects.find((project) => project.repoPath === repoPath);
    if (existingProject) {
      return existingProject;
    }

    const folderName = basename(repoPath).trim() || 'Project';
    const draft = makeProjectDraft(null, {
      name: folderName.slice(0, 80),
      slug: ensureUniqueProjectSlug(
        slugifyProjectName(folderName),
        existingProjects.map((project) => project.slug),
      ),
      repoPath,
    });

    const created = await input.relayClient.createProject(draft);
    const snapshot = projectSnapshotSchema.parse({
      projectId: created.project.id,
      name: draft.name,
      slug: draft.slug,
      repoPath: draft.repoPath,
      basePrompt: draft.basePrompt,
      eventPromptTemplate: draft.eventPromptTemplate,
      localRules: draft.localRules,
      codexModel: draft.codexModel,
      concurrencyLimit: draft.concurrencyLimit,
      sandboxMode: draft.sandboxMode,
      cooldownSeconds: draft.cooldownSeconds,
      fingerprintFields: draft.fingerprintFields,
      eventIdPath: draft.eventIdPath,
      enabled: draft.enabled,
      webhookUrl: created.project.webhookUrl,
      webhookToken: created.issuedWebhookToken,
      signingSecret: created.issuedSigningSecret,
      signingSecretHint: created.project.signingSecretHint,
      updatedAt: created.project.updatedAt,
    });

    input.store.upsertProject(snapshot);
    return snapshot;
  });

  ipcMain.handle('incidents:list', async () => {
    if (!input.relayClient.getStatus().paired) {
      return [];
    }

    try {
      return await input.relayClient.listIncidents();
    } catch {
      return [];
    }
  });
  ipcMain.handle('runs:list', async (_event, projectId?: string) =>
    input.store.listRuns(projectId),
  );
  ipcMain.handle('system:open-path', async (_event, targetPath: string) => {
    const result = await shell.openPath(targetPath);
    if (result) {
      throw new Error(result);
    }
    return true;
  });
}

function mergeProjects(
  localProjects: ProjectSnapshot[],
  remoteProjects: Array<Record<string, unknown>>,
) {
  const localById = new Map(localProjects.map((project) => [project.projectId, project]));

  return remoteProjects.map((remoteProject) => {
    const local = localById.get(String(remoteProject.id));
    return projectSnapshotSchema.parse({
      projectId: remoteProject.id,
      name: local?.name ?? remoteProject.name,
      slug: local?.slug ?? remoteProject.slug,
      repoPath: local?.repoPath ?? '',
      basePrompt:
        local?.basePrompt ??
        'You are responding to an incoming event. Investigate the repository, determine the safest next step, and make minimal changes if warranted.',
      eventPromptTemplate:
        local?.eventPromptTemplate ??
        'An event triggered this project.\n\nIncident ID: {{incident.id}}\nFingerprint: {{incident.fingerprint}}\nDuplicate count: {{incident.duplicateCount}}\n\nEvent payload:\n{{event}}\n',
      localRules: local?.localRules ?? ['Summarize what you changed before exiting.'],
      codexModel: local?.codexModel,
      concurrencyLimit: local?.concurrencyLimit ?? 1,
      sandboxMode: local?.sandboxMode ?? 'workspace-write',
      cooldownSeconds: Number(remoteProject.cooldownSeconds),
      fingerprintFields: remoteProject.fingerprintFields,
      eventIdPath: (remoteProject.eventIdPath as string | undefined) ?? local?.eventIdPath,
      enabled: Boolean(remoteProject.enabled),
      webhookUrl: String(remoteProject.webhookUrl),
      webhookToken: local?.webhookToken,
      signingSecret: local?.signingSecret,
      signingSecretHint:
        (remoteProject.signingSecretHint as string | undefined) ?? local?.signingSecretHint,
      updatedAt: String(remoteProject.updatedAt),
    });
  });
}
