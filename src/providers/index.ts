import { send as webhook } from './webhook';
import { send as walletconnect } from './walletconnectNotify';
import { send as discord } from './discord';
import { send as beams } from './beams';
import { send as xmtp } from './xmtp';

export default [
  // Comment a line to disable a provider
  // webhook
  // discord,
  // beams,
  // xmtp
  walletconnect
];
