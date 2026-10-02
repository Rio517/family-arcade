import { util } from 'peerjs';
import { describe, expect, it } from 'vitest';
import { MAPS } from '../domain/city';
import { rivals } from '../domain/testing';
import type { Input } from '../domain/world';
import { isGulpMsg, type GulpMsg, type RoundSettings } from './protocol';
import { GulpTable, type Links, type Me } from './table';

const DT = 1 / 60;
const settings: RoundSettings = { map: 'town', difficulty: 'medium', duration: 120, powerups: true, fightBack: false };

/**
 * Every device in one process, joined by a fake network that carries each
 * message the way PeerJS would (packed with BinaryPack, checked by the
 * protocol's guard on arrival) and delivers when `flush` is called.
 */
class Net {
  private queue: Array<() => void> = [];
  host: Parameters<Links['host']>[0] | null = null;
  guests = new Map<string, Parameters<Links['guest']>[0]>();
  kicked: string[] = [];
  /** Bytes sent host → guests, per message type. */
  bytes: Record<string, number> = {};
  private nextId = 1;

  private carry(msg: GulpMsg, to: (m: GulpMsg) => void): void {
    // BinaryPack's own types do not know our messages; it packs any plain data.
    const packed = util.pack(msg as never) as ArrayBuffer;
    this.bytes[msg.t] = (this.bytes[msg.t] ?? 0) + packed.byteLength;
    this.queue.push(() => {
      const back: unknown = util.unpack(packed);
      if (!isGulpMsg(back)) throw new Error(`the guard turned away a ${msg.t}`);
      to(back);
    });
  }

  links(): Links {
    return {
      host: (events) => {
        this.host = events;
        return {
          host: () => events.onStatus('hosting'),
          send: (id, m) => {
            const g = this.guests.get(id);
            if (g) this.carry(m, (x) => g.onMessage(x));
            return !!g;
          },
          broadcast: (m) => {
            for (const g of this.guests.values()) this.carry(m, (x) => g.onMessage(x));
            return this.guests.size;
          },
          kick: (id) => {
            this.kicked.push(id);
            this.guests.delete(id);
          },
          destroy: () => (this.host = null),
        };
      },
      guest: (events) => {
        const id = `peer-${this.nextId++}`;
        return {
          join: () => {
            this.guests.set(id, events);
            this.queue.push(() => {
              this.host?.onGuestOpen(id);
              events.onOpen();
            });
          },
          send: (m) => {
            if (this.guests.has(id)) this.carry(m, (x) => this.host?.onMessage(id, x));
            return this.guests.has(id);
          },
          destroy: () => {
            if (this.guests.delete(id)) this.queue.push(() => this.host?.onGuestClose(id));
          },
        };
      },
    };
  }

  flush(): void {
    while (this.queue.length) this.queue.shift()!();
  }
}

const me = (name: string, skin: number): Me => ({ name, skin, token: `token-${name}` });
const quiet = { onChange: () => {} };

function table(net: Net, who: Me) {
  return new GulpTable(who, quiet, net.links());
}

/** A host and `n` guests sitting down at one table. */
function seat(n: number) {
  const net = new Net();
  const host = table(net, me('Klara', 0));
  host.host('KQZT', settings);
  const guests = ['Rio', 'Mina', 'Oskar'].slice(0, n).map((name, i) => {
    const g = table(net, me(name, i + 1));
    g.join('KQZT');
    net.flush();
    return g;
  });
  return { net, host, guests };
}

function start(host: GulpTable, children: number) {
  return host.startRound(2026, [], rivals(MAPS.town.rivals - children));
}

/** Both sides play `secs` of the round, each child steering its own way. */
function play(net: Net, host: GulpTable, guests: GulpTable[], secs: number, steer: (i: number) => Input) {
  for (let f = 0; f < secs / DT; f++) {
    host.hostStep(DT, steer(0));
    guests.forEach((g, i) => g.guestStep(DT, steer(i + 1)));
    net.flush();
  }
}

describe('a Gulp table', () => {
  it('seats a host and up to three guests, and turns a fifth device away', () => {
    const { net, host, guests } = seat(3);
    expect(host.seats.map((s) => s.name)).toEqual(['Klara', 'Rio', 'Mina', 'Oskar']);
    // Every guest hears who is at the table, and which seat is theirs.
    guests.forEach((g, i) => {
      expect(g.seats.map((s) => s.name)).toEqual(['Klara', 'Rio', 'Mina', 'Oskar']);
      expect(g.mySeat).toBe(i + 1);
    });
    const late = table(net, me('Ada', 5));
    late.join('KQZT');
    net.flush();
    expect(net.kicked).toHaveLength(1);
    expect(host.seats).toHaveLength(4);
  });

  it('gives a child the next free colour when theirs is taken', () => {
    const { net, host, guests } = seat(1);
    guests[0].setSkin(0);
    net.flush();
    expect(host.seats[1].skin).not.toBe(host.seats[0].skin);
    expect(guests[0].seats[1].skin).toBe(host.seats[1].skin);
  });

  it('a guest who leaves the lobby frees the seat', () => {
    const { net, host, guests } = seat(2);
    guests[0].leave();
    net.flush();
    expect(host.seats.map((s) => s.name)).toEqual(['Klara', 'Mina']);
  });

  it('plays one round on three devices: each guest steers its own hole and sees the same city', () => {
    const { net, host, guests } = seat(2);
    const world = start(host, 3);
    net.flush();
    expect(world.holes.slice(0, 3).map((h) => h.name)).toEqual(['Klara', 'Rio', 'Mina']);
    guests.forEach((g, i) => {
      expect(g.mirror?.you).toBe(i + 1);
      expect(g.world?.holes.map((h) => h.name)).toEqual(world.holes.map((h) => h.name));
    });
    // Past the 3-2-1, then each child heads their own way.
    play(net, host, guests, 8, (i) => ({ x: [1, -1, 0][i], z: [0, 0, 1][i] }));
    for (const g of guests) {
      const mine = g.world!.holes[g.mirror!.you];
      const onHost = world.holes[g.mirror!.you];
      // The host has the guest's hole where the guest steered it, a report or two behind.
      expect(Math.hypot(mine.x - onHost.x, mine.z - onHost.z)).toBeLessThan(mine.r + 2);
      // And the guest's copy has the host's own hole where the host put it, eased
      // in from the last tick (so a step behind, never further than its own size).
      expect(Math.hypot(g.world!.holes[0].x - world.holes[0].x, g.world!.holes[0].z - world.holes[0].z)).toBeLessThan(world.holes[0].r);
      // The same things are still standing on every device.
      expect(g.world!.props.size).toBe(world.props.size);
      expect(g.world!.holes[0].score).toBe(world.holes[0].score);
    }
    // Twenty ticks a second, each a few hundred bytes.
    expect(net.bytes.tick / 2 / (8 * 20)).toBeLessThan(1500);
  });

  it('a guest whose link drops gets its own hole back, and so does one that reloads', () => {
    const { net, host, guests } = seat(1);
    const world = start(host, 2);
    net.flush();
    play(net, host, guests, 5, (i) => ({ x: i ? 1 : 0, z: 0 }));
    // The app is closed and opened again: a new table on the device, the same token.
    guests[0].leave();
    net.flush();
    expect(host.seats[1].connected).toBe(false);
    const again = table(net, me('Rio', 1));
    again.join('KQZT');
    net.flush();
    expect(again.mirror?.you).toBe(1);
    play(net, host, [again], 2, (i) => ({ x: i ? 1 : 0, z: 0 }));
    expect(again.world!.props.size).toBe(world.props.size);
    expect(host.seats.map((s) => s.connected)).toEqual([true, true]);
  });

  it('tells every guest the standings when the round ends', () => {
    const { net, host, guests } = seat(1);
    const world = start(host, 2);
    net.flush();
    world.options.duration = 4;
    play(net, host, guests, 8, () => ({ x: 0, z: 0 }));
    expect(world.status).toBe('over');
    expect(guests[0].order).toEqual(host.order);
    expect(guests[0].world?.status).toBe('over');
  });
});
