import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'slack/commands': 'src/handlers/slack/commands.ts',
    'slack/interactive': 'src/handlers/slack/interactive.ts',
    'cron/digest': 'src/handlers/cron/digest.ts',
    'cron/triage': 'src/handlers/cron/triage.ts',
  },
  outDir: 'api',
  format: ['esm'],
  bundle: true,
  splitting: false,
  clean: false,
  dts: false,
  sourcemap: false,
});
