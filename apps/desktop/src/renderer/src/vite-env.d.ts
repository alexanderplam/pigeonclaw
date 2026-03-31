/// <reference types="vite/client" />

import type { DesktopApi } from '../../preload/index.js';

declare global {
  interface Window {
    pigeonclaw: DesktopApi;
  }
}
