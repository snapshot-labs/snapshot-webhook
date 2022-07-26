import { createHash } from 'crypto';

export function shortenAddress(str = '') {
  return `${str.slice(0, 6)}...${str.slice(str.length - 4)}`;
}

const hubPublicKey = process.env.HUB_PUBLIC_KEY;
export function sendError(res, description, status = 500) {
  return res.status(status).json({
    error: 'unauthorized',
    error_description: description
  });
}

export function sha256(str) {
  return createHash('sha256')
    .update(str)
    .digest('hex');
}

export const checkAuth = (req, res, next) => {
  // TODO: Remove this body secret once events are working on this server
  const secret = req.body?.secret || '0';
  const token = req.headers?.authentication || '0';
  if (sha256(secret) === hubPublicKey || sha256(token) === hubPublicKey) {
    next();
    return;
  }
  console.log('Wrong secret');
  return sendError(res, 'Wrong secret');
};
