'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    // Chromium complet (et non la version "headless shell", qui plante sur la reconnaissance vocale).
    channel: 'chromium',
    locale: 'fr-FR',
    permissions: ['clipboard-read', 'clipboard-write'],
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/server.js 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
