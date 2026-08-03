import { Component, type ReactNode } from 'react';

/**
 * The arcade's circuit breaker. Without it, any render-time throw (a buggy
 * save, a hostile peer message that slipped through, a plain bug) unmounts
 * the whole app to a blank white page. With it, the family gets a friendly
 * card and a working "back to the arcade" button.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false };

  static getDerivedStateFromError() {
    return { broken: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Arcade crashed', error);
  }

  private reset = () => {
    // A crash mid-game can be caused by the game's own saved state, so send
    // the player to the landing page rather than re-rendering in place.
    window.location.hash = '#/';
    this.setState({ broken: false });
  };

  render() {
    if (!this.state.broken) return this.props.children;
    return (
      <div className="app center" role="alert" data-testid="arcade-crash">
        <div className="panel" style={{ maxWidth: 420, margin: '15vh auto 0' }}>
          <h2>Uh oh — that game hit a glitch!</h2>
          <p className="subtle">Nothing is lost. Head back to the arcade and try again.</p>
          <button className="btn btn-primary btn-block" onClick={this.reset} data-testid="crash-home">
            ← Back to the arcade
          </button>
        </div>
      </div>
    );
  }
}
