import * as THREE from 'three';

// Era palette: marble / bronze / parchment / charcoal / gold  →  steel / electric / white / cool.
export const PALETTE = {
  black: '#000000',
  charcoal: '#14110e',
  marble: '#ece6db',
  marbleShadow: '#8f877b',
  parchment: '#d9c49b',
  ink: '#2a1d12',
  sepia: '#6b4a2b',
  bronze: '#9a6434',
  gold: '#e2b563',
  warmGold: '#ffcf85',
  ember: '#ff9a4a',
  copper: '#d7824a',
  steel: '#a3aeb9',
  iron: '#4a4f55',
  blueprint: '#86b9ff',
  electric: '#cfe8ff',
  coolWhite: '#eef5ff',
  ice: '#9cc8ff',
  signal: '#6fd3ff',
  bio: '#9fe6d6',
  white: '#ffffff',
};

export const color = (name, intensity = 1) => new THREE.Color(PALETTE[name] ?? name).multiplyScalar(intensity);
