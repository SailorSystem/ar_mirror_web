import { useEffect } from 'react';
import { initSenias, stopSenias } from '../lib/senias.js';

export default function Senias({ refs }) {
  useEffect(() => {
    initSenias(refs);
    return () => stopSenias();
  }, [refs]);
  return null;
}