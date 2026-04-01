import type { DesktopProjectDraft } from '@pigeonclaw/shared';
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  getSetupState: () => ipcRenderer.invoke('setup:get-state'),
  pairDevice: (payload: { relayBaseUrl: string; bootstrapToken: string; deviceName: string }) =>
    ipcRenderer.invoke('setup:pair-device', payload),
  updateSettings: (payload: { codexPath?: string; globalConcurrency?: number }) =>
    ipcRenderer.invoke('settings:update', payload),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  createProjectFromFolder: () => ipcRenderer.invoke('projects:create-from-folder'),
  saveProject: (payload: DesktopProjectDraft) => ipcRenderer.invoke('projects:save', payload),
  listIncidents: () => ipcRenderer.invoke('incidents:list'),
  listRuns: (projectId?: string) => ipcRenderer.invoke('runs:list', projectId),
  openPath: (targetPath: string) => ipcRenderer.invoke('system:open-path', targetPath),
};

contextBridge.exposeInMainWorld('pigeonclaw', api);

export type DesktopApi = typeof api;
