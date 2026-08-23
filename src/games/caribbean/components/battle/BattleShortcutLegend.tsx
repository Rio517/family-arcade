const SHORTCUTS = [
  ['A', 'Turn port'],
  ['Q', 'Fire port'],
  ['1', 'Round shot'],
  ['2', 'Chain shot'],
  ['3', 'Grape shot'],
  ['R', 'Toggle sail'],
  ['E', 'Fire starboard'],
  ['D', 'Turn starboard'],
  ['Space / Esc', 'Pause'],
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
        A turns port; Q fires port; 1 selects round shot; 2 selects chain shot; 3 selects grape shot; R toggles sail; E fires starboard; D turns starboard; Space or Escape pauses.
      </p>
    </section>
  );
}
