import { join } from 'node:path';

import { app, BrowserWindow } from 'electron';
import desktopPackage from '../../package.json' with { type: 'json' };

import { registerIpcHandlers } from './ipc.js';
import { JobManager } from './services/job-manager.js';
import { RelayClient } from './services/relay-client.js';
import { LocalStore } from './stores/local-store.js';

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    backgroundMaterial: 'auto',
    backgroundColor: '#090c13',
    trafficLightPosition: {
      x: 18,
      y: 18,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

async function bootstrap() {
  await app.whenReady();
  app.setName('PigeonClaw');

  const store = new LocalStore(join(app.getPath('userData'), 'pigeonclaw.db'));
  const relayClient = new RelayClient(store);
  const jobManager = new JobManager({ relayClient, store });

  registerIpcHandlers({
    relayClient,
    store,
    appVersion: desktopPackage.version,
  });

  jobManager.attach();
  await relayClient.connect();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });

  app.on('before-quit', () => {
    store.close();
  });
}

void bootstrap();
