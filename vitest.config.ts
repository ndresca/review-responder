import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Vitest config notes:
// - The plugin-react import is required because we now have client component
//   tests (.test.tsx) that mount React. Server-side .test.ts files don't
//   need it but the plugin is harmless to leave on for them.
// - Component tests under src/components/ opt into a jsdom environment via
//   the per-file `// @vitest-environment jsdom` pragma at the top of each
//   .test.tsx file. Keeping the global env at `node` keeps fast lib tests
//   from booting jsdom every run.
// - The include pattern accepts both .ts and .tsx so component tests are
//   picked up.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
