import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'slack/commands': 'api/slack/commands.ts',
    'slack/interactive': 'api/slack/interactive.ts',
    'cron/digest': 'api/cron/digest.ts',
    'cron/triage': 'api/cron/triage.ts',
  },
  outDir: 'api',
  format: ['esm'],
  bundle: true,
  splitting: false,
  clean: false,
  dts: false,
  sourcemap: false,
});
