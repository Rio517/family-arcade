import type { GameDescriptor } from '@shared/game';
import { MirrorIcon } from '@shared/ui/icons';
import { MirrorPage } from './components/MirrorPage';

export const mirror: GameDescriptor = {
  id: 'mirror',
  title: 'Magic Mirror',
  tag: 'Camera',
  // The camera-effects debut (ADR 0010): head-pose calibration still needs a
  // real-camera pass, so wear the honest badge until the family signs it off.
  releaseStatus: 'under-construction',
  players: { min: 1, max: 2 },
  // No seat picker — the mirror has no chairs, it just sees whoever's in frame.
  seats: { min: 1, max: 1 },
  path: '/mirror',
  description:
    'Look into the camera and become a fire-breathing dragon — flash a peace sign for rainbow magic. Two of you fit in the mirror!',
  Icon: MirrorIcon,
  Page: MirrorPage,
};
