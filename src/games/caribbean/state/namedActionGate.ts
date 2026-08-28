export interface NamedActionOwner {
  generation: number;
  token: symbol;
}

export class NamedActionGate {
  private owner: NamedActionOwner | null = null;

  acquire(generation: number): NamedActionOwner | null {
    if (this.owner !== null) return null;
    const owner = { generation, token: Symbol('named-action') };
    this.owner = owner;
    return owner;
  }

  reset(): void {
    this.owner = null;
  }

  release(owner: NamedActionOwner): void {
    if (
      this.owner?.generation === owner.generation
      && this.owner.token === owner.token
    ) this.owner = null;
  }
}
