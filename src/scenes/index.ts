import type { SceneDef } from './types';

export const SCENES: SceneDef[] = [
  {
    key: '0',
    id: 'hand-lab',
    title: 'Hand Lab',
    hint: 'Glowing markers should sit right on your knuckles. Fist, pinch, tilt, clap.',
    load: () => import('./hand-lab/HandLab'),
  },
  {
    key: '1',
    id: 'palm-terrarium',
    title: 'Palm Terrarium',
    hint: 'Left palm holds the garden · open right palm is the sun · fist for night',
    load: () => import('./palm-terrarium/PalmTerrarium'),
  },
  {
    key: '2',
    id: 'finger-puppet',
    title: 'Finger Puppet',
    hint: 'Your fingers are the tentacles · C switches creature · spread fingers for fins · pinch = dragon breath',
    load: () => import('./finger-puppet/FingerPuppet'),
  },
  { key: '3', id: 'weather', title: 'Weather in Your Hands', hint: '' },
  { key: '4', id: 'galaxy', title: 'Pour a Galaxy', hint: '' },
];
