const SHORTCUTS = [
  ['A', 'Turn port'],
  ['Q', 'Fire port'],
  ['S', 'Change shot'],
  ['R', 'Change sail'],
  ['E', 'Fire starboard'],
  ['D', 'Turn starboard'],
  ['Space', 'Pause'],
] as const;

export function BattleShortcutLegend() {
  return (
    <section className="battle-shortcut-legend" aria-label="Battle controls">
      <span className="battle-shortcut-legend__label" aria-hidden="true">Battle controls</span>
      <ul aria-hidden="true">
        {SHORTCUTS.map(([key, action]) => (
          <li key={key}><kbd>{key}</kbd><span>{action}</span></li>
        ))}
      </ul>
      <p className="naval-visually-hidden" data-testid="battle-shortcut-summary">
        A turns port; Q fires port; S changes shot; R changes sail; E fires starboard; D turns starboard; Space pauses. Arrow keys steer and Escape also pauses.
      </p>
    </section>
  );
}
