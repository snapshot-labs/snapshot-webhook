import { createHash } from 'crypto';
import snapshot from '@snapshot-labs/snapshot.js';

export function shortenAddress(str = '') {
  return `${str.slice(0, 6)}...${str.slice(str.length - 4)}`;
}

export function sha256(str) {
  return createHash('sha256')
    .update(str)
    .digest('hex');
}

export async function verifySignature(body) {
  try {
    const isValidSig = await snapshot.utils.verify(body.address, body.sig, body.data);
    if (!isValidSig) return Promise.reject('wrong signature');
  } catch (e) {
    console.warn(`signature validation failed for ${body.address}`);
    return Promise.reject('signature validation failed');
  }
}