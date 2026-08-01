/**
 * Privacy & safety page (/privacy). Written to be readable by a parent deciding
 * whether it's OK for their kid to play with a friend — plain language, honest
 * about the one thing that isn't literally "no servers" (the free WebRTC broker
 * + STUN), and clear about the kid-safety choices we made.
 */
import { Link } from 'react-router-dom';
import './privacy.css';

export function Privacy() {
  return (
    <div className="app privacy">
      <div className="pv-topbar">
        <Link className="pv-back" to="/">‹ Home</Link>
      </div>

      <header className="pv-head">
        <h1>Privacy &amp; Safety</h1>
        <p className="pv-sub">
          The Kny-Flores Family Arcade is a small, free set of games made for family game night. Here's
          exactly what happens with your information — and the choices we made to keep kids safe.
        </p>
        <p className="pv-updated">Plain-language summary · last updated August 2026</p>
      </header>

      <section className="pv-card pv-tldr">
        <h2>The short version</h2>
        <ul>
          <li><b>No accounts, no sign-in, no ads, no tracking.</b></li>
          <li><b>We have no server that stores your data.</b> Names and scores live only in your browser.</li>
          <li><b>Playing with a friend connects the two devices directly</b> using a short code you share.</li>
          <li><b>Video &amp; voice are off until you turn them on</b>, and nothing is ever recorded.</li>
          <li><b>Only share a code with someone you know and trust.</b></li>
        </ul>
      </section>

      <section className="pv-card">
        <h2>What we collect</h2>
        <p>
          Nothing leaves your device to us. There are no analytics, no advertising, and no third-party
          trackers. The player names you type and your game scores are saved in your browser's local
          storage on your own device so the games remember them next time. You can erase all of it any
          time by clearing this site's data in your browser.
        </p>
      </section>

      <section className="pv-card">
        <h2>Playing with a friend</h2>
        <p>
          Two-player games (and the “party”) connect your two devices <b>directly to each other</b>
          {' '}using WebRTC — the same technology behind video calls. One person shares a short 4-letter
          code; the other types it in. Your game moves, and any video or voice, travel
          <b> device-to-device</b>, not through us.
        </p>
        <p className="pv-note">
          To help two devices find each other on the internet, WebRTC uses a couple of small, free,
          public helpers: a matchmaking “broker” (PeerJS) that only passes the initial hello, and public
          “STUN” servers (Google, Twilio) that help each device learn its address. They set up the
          connection; they don't carry or store your game, video, or voice. This is the one part that
          isn't literally “no servers,” and we want to be upfront about it.
        </p>
      </section>

      <section className="pv-card">
        <h2>Video &amp; voice</h2>
        <ul>
          <li><b>Off by default.</b> Your microphone and camera stay off until you tap to turn them on. The camera is a separate, extra opt-in from voice.</li>
          <li><b>Nothing is recorded or stored.</b> It's live and peer-to-peer — when you hang up or close the tab, it's gone.</li>
          <li><b>You're always in control.</b> Mute, turn the camera off, or leave the party at any time. There's a clear indicator when your camera is on.</li>
          <li>Your browser will ask permission before the camera or mic can be used, every time it needs it.</li>
        </ul>
      </section>

      <section className="pv-card pv-safety">
        <h2>For grown-ups: keeping kids safe</h2>
        <ul>
          <li><b>Codes are the key.</b> Anyone who has your party or game code can connect to it while it's live. Only share it with a person you know and trust — a friend or family member — ideally set up together with an adult.</li>
          <li><b>Best on your home wifi.</b> Two devices on the same home network get the most reliable and private connection.</li>
          <li><b>No strangers, no discovery.</b> There's no public list of games, no chat with strangers, no way for someone to find you without a code you gave them.</li>
          <li><b>An easy off switch.</b> The camera toggle and “Leave party” are one tap away, on every screen.</li>
        </ul>
      </section>

      <section className="pv-card">
        <h2>Questions</h2>
        <p>
          This is a hobby project a family built together, and it's open source — you can read exactly how
          it works. If something here is unclear, that's on us; tell us and we'll fix the wording.
        </p>
      </section>

      <div className="pv-foot">
        <Link to="/">← Back to the arcade</Link>
      </div>
    </div>
  );
}
