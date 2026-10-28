import type { SceneDef } from './types';

export const SCENES: SceneDef[] = [
  {
    key: '1',
    id: 'palm-terrarium',
    title: 'Palm Terrarium',
    display: 'Palm Terr{a}rium',
    short: 'Terrarium',
    gestures: [
      ['Left palm', 'holds the garden'],
      ['Open right palm', 'is the sun'],
      ['Right fist', 'brings the night'],
      ['Both fists, 2 s', 'plant a fresh garden'],
    ],
    load: () => import('./palm-terrarium/PalmTerrarium'),
  },
  {
    key: '2',
    id: 'finger-puppet',
    title: 'Finger Puppet',
    display: 'Finger Pupp{e}t',
    short: 'Puppet',
    gestures: [
      ['Your fingers', 'become tentacles'],
      ['Index fingertip', 'leads the koi and dragon'],
      ['Spread', 'opens the fins'],
      ['Pinch', 'dragon breath'],
      ['C', 'next creature'],
    ],
    load: () => import('./finger-puppet/FingerPuppet'),
  },
  {
    key: '3',
    id: 'weather',
    title: 'Weather in Your Hands',
    display: 'Weath{e}r in Your Hands',
    short: 'Weather',
    gestures: [
      ['Open left hand', 'gathers a cloud'],
      ['Right pinch', 'makes it rain'],
      ['Quick pinch', 'throws lightning'],
      ['W', 'rain, snow or sun'],
    ],
    load: () => import('./weather/Weather'),
  },
  {
    key: '4',
    id: 'galaxy',
    title: 'Pour a Galaxy',
    display: 'Pour a Gal{a}xy',
    short: 'Galaxy',
    gestures: [
      ['Tip your right palm', 'pours the stars'],
      ['Clap', 'bursts a nebula'],
      ['Right fist', 'calls the stars back'],
    ],
    load: () => import('./galaxy/Galaxy'),
  },
  {
    key: '0',
    id: 'hand-lab',
    title: 'Hand Lab',
    display: 'Hand L{a}b',
    short: 'Lab',
    gestures: [
      ['Any hand', 'markers sit on your joints'],
      ['Fist, pinch, tilt, clap', 'check each gesture fires'],
    ],
    load: () => import('./hand-lab/HandLab'),
  },
];

/** The living meadow behind the landing screen. Not in the menu. */
export const PRELUDE: SceneDef = {
  key: '',
  id: 'prelude',
  title: 'Prelude',
  display: 'Prelude',
  short: 'Prelude',
  gestures: [],
  load: () => import('./prelude/Prelude'),
};
