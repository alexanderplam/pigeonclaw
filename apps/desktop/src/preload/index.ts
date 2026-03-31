import { contextBridge, ipcRenderer } from 'electron';

import type { DesktopProjectDraft } from '@pigeonclaw/shared';

const api = {
  getSetupState: () => ipcRenderer.invoke('setup:get-state'),
  pairDevice: (payload: { relayBaseUrl: string; bootstrapToken: string; deviceName: string }) =>
    ipcRenderer.invoke('setup:pair-device', payload),
  updateSettings: (payload: { codexPath?: string; globalConcurrency?: number }) =>
    ipcRenderer.invoke('settings:update', payload),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  saveProject: (payload: DesktopProjectDraft) => ipcRenderer.invoke('projects:save', payload),
  listIncidents: () => ipcRenderer.invoke('incidents:list'),
  listRuns: (projectId?: string) => ipcRenderer.invoke('runs:list', projectId),
};

contextBridge.exposeInMainWorld('pigeonclaw', api);

export type DesktopApi = typeof api;
