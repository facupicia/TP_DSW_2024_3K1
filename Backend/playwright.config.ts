import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Production Testing
 * @see https://playwright.dev/docs/test-configuration
 */

export default defineConfig({
  testDir: './e2e',
  
  /* Test files pattern */
  testMatch: ['**/*.spec.ts'],
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 1,
  
  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter to use */
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ...(process.env.CI ? [['github'] as const] : []),
  ],
  
  /* Shared settings for all projects */
  use: {
    /* Base URL */
    baseURL: process.env.TEST_BASE_URL || 'https://event-life.netlify.app',
    
    /* Collect trace when retrying */
    trace: 'on-first-retry',
    
    /* Screenshots on failure */
    screenshot: 'only-on-failure',
    
    /* Video recording */
    video: 'on-first-retry',
    
    /* Action timeout */
    actionTimeout: 15000,
    
    /* Navigation timeout */
    navigationTimeout: 30000,
    
    /* Viewport */
    viewport: { width: 1920, height: 1080 },
  },

  /* Configure projects for different browsers and devices */
  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: { width: 1920, height: 1080 },
      },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        viewport: { width: 1920, height: 1080 },
      },
      dependencies: ['setup'],
    },
    /* Mobile viewports */
    {
      name: 'Mobile Chrome',
      use: { 
        ...devices['Pixel 5'],
      },
      dependencies: ['setup'],
    },
    {
      name: 'Mobile Safari',
      use: { 
        ...devices['iPhone 12'],
      },
      dependencies: ['setup'],
    },
    /* Tablet */
    {
      name: 'Tablet Chrome',
      use: { 
        ...devices['iPad (gen 7)'],
      },
      dependencies: ['setup'],
    },
  ],

  /* Run local dev server before starting tests */
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },

  /* Output directory for test results */
  outputDir: './test-results',
  
  /* Global timeout */
  globalTimeout: 60 * 60 * 1000, // 1 hour
  
  /* Expect timeout */
  expect: {
    timeout: 10000,
  },
});
