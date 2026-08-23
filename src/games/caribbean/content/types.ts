export interface SloopClass {
  id: 'sloop';
  hold: number;
  crew: {
    minimum: number;
    safe: number;
    maximum: number;
  };
  cannonMaximum: number;
  hullMaximum: number;
  sailsMaximum: number;
  topSpeed: number;
  turnResponse: number;
  bestWindAngle: number;
}
