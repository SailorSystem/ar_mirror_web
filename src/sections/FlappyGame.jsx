import { useEffect } from 'react';
import { initFlappyGame, stopFlappyGame } from '../lib/flappyGame.js';

export default function FlappyGame({ refs }) {
  useEffect(() => {
    initFlappyGame(refs);
    return () => stopFlappyGame();
  }, [refs]);
  return null;
}