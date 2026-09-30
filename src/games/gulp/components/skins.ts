/**
 * The holes' colours, and the computer holes' names. The child picks a
 * colour; the rivals take the others in order.
 */

export interface Skin {
  name: string;
  color: number;
  css: string;
}

export const SKINS: Skin[] = [
  { name: 'Blueberry', color: 0x3d7bff, css: '#3d7bff' },
  { name: 'Bubblegum', color: 0xff5fa8, css: '#ff5fa8' },
  { name: 'Lime', color: 0x3fcf5a, css: '#3fcf5a' },
  { name: 'Grape', color: 0x9b5cff, css: '#9b5cff' },
  { name: 'Tangerine', color: 0xff8a2a, css: '#ff8a2a' },
  { name: 'Lemon', color: 0xf2c200, css: '#f2c200' },
  { name: 'Cherry', color: 0xff3b4f, css: '#ff3b4f' },
  { name: 'Mint', color: 0x22cdb6, css: '#22cdb6' },
  { name: 'Cocoa', color: 0x9a6a4a, css: '#9a6a4a' },
  { name: 'Sky', color: 0x6cc6ff, css: '#6cc6ff' },
];

const RIVAL_NAMES = ['Big Gulp', 'Sir Slurps', 'Nom Nom', 'Hungry Hattie', 'Captain Crumbs', 'Munch Bunch', 'Gobbler', 'Chompers', 'Slurpy Sue'];

/** `count` computer holes, each in a colour other than the child's. */
export function rivalsFor(playerSkin: number, count: number): Array<{ name: string; skin: number }> {
  const colours = SKINS.map((_, i) => i).filter((i) => i !== playerSkin);
  return RIVAL_NAMES.slice(0, count).map((name, i) => ({ name, skin: colours[i % colours.length] }));
}
