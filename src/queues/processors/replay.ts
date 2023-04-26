import { run } from '../../replay';

export default async () => {
  console.log('[queue] == Running "replay" processor ==');
  await run();
};
