import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'api/slack/commands': 'api/slack/commands.ts',
    'api/slack/interactive': 'api/slack/interactive.ts',
    'api/cron/digest': 'api/cron/digest.ts',
    'api/cron/triage': 'api/cron/triage.ts',
  },
  outDir: 'dist',
  format: ['esm'],
  bundle: true,
  splitting: false,
  clean: true,
  dts: false,
  sourcemap: false,
});
