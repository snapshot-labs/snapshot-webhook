import { createHash } from 'crypto';
import http from 'node:http';
import https from 'node:https';

export function shortenAddress(str = '') {
  return `${str.slice(0, 6)}...${str.slice(str.length - 4)}`;
}

export function sha256(str) {
  return createHash('sha256').update(str).digest('hex');
}

const agentOptions = { keepAlive: true };
const httpAgent = new http.Agent(agentOptions);
const httpsAgent = new https.Agent(agentOptions);

function agent(url: string) {
  return new URL(url).protocol === 'http:' ? httpAgent : httpsAgent;
}

export const fetchWithKeepAlive = (uri: any, options: any = {}) => {
  return fetch(uri, { agent: agent(uri), ...options });
};
