import { useEffect } from 'react';
import { initAirPiano, stopAirPiano } from '../lib/airPiano.js';

export default function AirPiano({ refs }) {
  useEffect(() => {
    initAirPiano(refs);
    return () => stopAirPiano();
  }, [refs]);
  return null;
}