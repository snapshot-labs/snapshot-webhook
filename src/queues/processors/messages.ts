import { run } from '../../replay';

export default async () => {
  console.log('[queue] Running "messages" processor');
  await run();
};
