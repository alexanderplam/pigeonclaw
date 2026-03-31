import { EventEmitter } from 'node:events';

import {
  type DesktopPairRequest,
  type DesktopProjectDraft,
  type Incident,
  type Job,
  type RunUpdate,
  desktopPairResponseSchema,
  incidentSchema,
  relayEnvelopeSchema,
  relayProjectCredentialsSchema,
  relayProjectSchema,
} from '@pigeonclaw/shared';
import WebSocket from 'ws';

import type { LocalStore } from '../stores/local-store.js';

type RelayStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export class RelayClient extends EventEmitter<{
  job: [Job];
  status: [RelayStatus];
}> {
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private status: RelayStatus = 'disconnected';
  private readonly store: LocalStore;

  constructor(store: LocalStore) {
    super();
    this.store = store;
  }

  getStatus() {
    const state = this.store.getAppState();
    return {
      ...state,
      relayStatus: this.status,
      paired: Boolean(state.deviceId && this.store.getSetting('deviceToken')),
    };
  }

  async pairDevice(input: {
    relayBaseUrl: string;
    bootstrapToken: string;
    deviceName: string;
    appVersion: string;
  }) {
    const payload: DesktopPairRequest = {
      deviceName: input.deviceName,
      platform: 'macos',
      appVersion: input.appVersion,
    };

    const response = await fetch(
      `${trimTrailingSlash(input.relayBaseUrl)}/v1/bootstrap/register-device`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-bootstrap-token': input.bootstrapToken,
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      throw new Error('Failed to pair device with relay');
    }

    const parsed = desktopPairResponseSchema.parse(await response.json());
    this.store.setSetting('relayBaseUrl', trimTrailingSlash(parsed.relayBaseUrl));
    this.store.setSetting('tenantId', parsed.tenantId);
    this.store.setSetting('deviceId', parsed.deviceId);
    this.store.setSetting('deviceName', input.deviceName);
    this.store.setSetting('deviceToken', parsed.deviceToken, true);

    await this.connect();
    return parsed;
  }

  async connect() {
    const state = this.store.getAppState();
    const deviceToken = this.store.getSetting('deviceToken');
    if (!state.relayBaseUrl || !deviceToken) {
      return;
    }

    this.setStatus('connecting');

    const socketUrl = `${trimTrailingSlash(state.relayBaseUrl).replace(/^http/, 'ws')}/v1/devices/connect`;
    this.socket = new WebSocket(socketUrl, {
      headers: {
        Authorization: `Bearer ${deviceToken}`,
      },
    });

    this.socket.on('open', () => {
      this.setStatus('connected');
    });

    this.socket.on('close', () => {
      this.setStatus('disconnected');
      this.scheduleReconnect();
    });

    this.socket.on('error', () => {
      this.setStatus('error');
    });

    this.socket.on('message', (data) => {
      try {
        const envelope = relayEnvelopeSchema.parse(JSON.parse(data.toString()));
        if (envelope.type === 'job.ready') {
          this.emit('job', envelope.payload);
        }
      } catch {
        this.setStatus('error');
      }
    });
  }

  async listProjects() {
    const json = await this.requestJson('/v1/projects');
    const projects = Array.isArray(json.projects)
      ? json.projects.map((entry) => relayProjectSchema.parse(entry))
      : [];
    return { projects };
  }

  async createProject(project: DesktopProjectDraft) {
    const json = await this.requestJson('/v1/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: project.name,
        slug: project.slug,
        cooldownSeconds: project.cooldownSeconds,
        fingerprintFields: project.fingerprintFields,
        eventIdPath: project.eventIdPath,
        enabled: project.enabled,
      }),
    });

    return relayProjectCredentialsSchema.parse(json);
  }

  async updateProject(project: DesktopProjectDraft) {
    if (!project.projectId) {
      throw new Error('Project ID is required for updates');
    }

    const body: Record<string, unknown> = {
      name: project.name,
      slug: project.slug,
      cooldownSeconds: project.cooldownSeconds,
      fingerprintFields: project.fingerprintFields,
      eventIdPath: project.eventIdPath,
      enabled: project.enabled,
    };

    if (project.rotateSigningSecret) {
      body.signingSecret =
        crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().slice(0, 8);
    }

    return this.requestJson(`/v1/projects/${project.projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async listIncidents() {
    const json = await this.requestJson('/v1/incidents');
    const incidents = Array.isArray(json.incidents)
      ? json.incidents.map((entry) => incidentSchema.parse(entry))
      : [];

    return incidents as Incident[];
  }

  async sendRunUpdate(runId: string, update: Omit<RunUpdate, 'runId'>) {
    await this.requestJson(`/v1/runs/${runId}`, {
      method: 'POST',
      body: JSON.stringify(update),
    });
  }

  private async requestJson(path: string, init?: RequestInit) {
    const state = this.store.getAppState();
    const token = this.store.getSetting('deviceToken');
    if (!state.relayBaseUrl || !token) {
      throw new Error('Desktop is not paired with a relay');
    }

    const response = await fetch(`${trimTrailingSlash(state.relayBaseUrl)}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Relay request failed: ${response.status}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      void this.connect();
    }, 2_500);
  }

  private setStatus(status: RelayStatus) {
    this.status = status;
    this.emit('status', status);
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, '');
}
