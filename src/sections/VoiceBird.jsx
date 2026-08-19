import { useEffect } from 'react';
import { initVoiceBird, stopVoiceBird } from '../lib/voiceBird.js';

export default function VoiceBird({ refs }) {
  useEffect(() => {
    initVoiceBird(refs);
    return () => stopVoiceBird();
  }, [refs]);
  return null;
}