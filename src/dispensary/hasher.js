import { createHash } from 'crypto';

export default function hasher(string) {
  return createHash('sha256').update(string, 'utf8').digest('hex');
}
