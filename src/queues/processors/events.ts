import { run } from '../../events';

export default async () => {
  if (process.env.SERVICE_EVENT || '0') {
    console.log('[queue] Running "events" processor');
    await run();
  }
};
