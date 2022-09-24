import { createHash } from 'crypto';

export function shortenAddress(str = '') {
  return `${str.slice(0, 6)}...${str.slice(str.length - 4)}`;
}

export function sha256(str) {
  return createHash('sha256')
    .update(str)
    .digest('hex');
}
