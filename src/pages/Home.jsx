import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { socket } from '../lib/transport';
import { setStoredToken } from '../lib/storage';

function Home() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialJoinCode = (searchParams.get('join') || '').toUpperCase();
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState(initialJoinCode);
  const [error, setError] = useState('');

  useEffect(() => {
    setRoomId(initialJoinCode);
  }, [initialJoinCode]);

  useEffect(() => {
    function handleRoomCreated({ roomId: createdRoomId, playerToken }) {
      setStoredToken(createdRoomId, playerToken);
      navigate(`/table/${createdRoomId}`);
    }

    function handleError(event) {
      setError(event.message);
    }

    socket.on('room_created', handleRoomCreated);
    socket.on('game_error', handleError);
    socket.on('connect_error', handleError);

    return () => {
      socket.off('room_created', handleRoomCreated);
      socket.off('game_error', handleError);
      socket.off('connect_error', handleError);
    };
  }, [navigate]);

  function createRoom() {
    if (!username.trim()) {
      setError('Enter your name first.');
      return;
    }

    setError('');
    socket.emit('create_room', { username: username.trim() });
  }

  function joinRoom() {
    if (!username.trim() || !roomId.trim()) {
      setError('Enter your name and table code.');
      return;
    }

    setError('');
    navigate(`/table/${roomId.trim().toUpperCase()}?name=${encodeURIComponent(username.trim())}`);
  }

  return (
    <div className="entry-shell">
      <header className="entry-topbar">
        <div className="entry-brand">Teen Patti</div>
        <div className="entry-topbar-chip">Private Table Play</div>
      </header>

      <main className="entry-main">
        <section className="entry-hero">
          <div className="entry-kicker">Card Room</div>
          <h1>Start a table, share the code, and play Teen Patti on one live table screen.</h1>
          <p>
            Set the boot, choose the variation, seat everyone together, and play with blind, seen, side show, show,
            and custom deal modes.
          </p>

          <div className="entry-feature-row">
            <FeaturePill label="Up to 10 players" />
            <FeaturePill label="AK47 and custom variations" />
            <FeaturePill label="Single table play" />
          </div>

          <div className="entry-hero-notes">
            <div className="entry-note-card">
              <span>Before the game</span>
              <strong>Host sets boot, chips, and table variation.</strong>
            </div>
            <div className="entry-note-card">
              <span>During the game</span>
              <strong>Only live actions stay on screen when your turn comes.</strong>
            </div>
          </div>
        </section>

        <section className="entry-card">
          <div className="entry-card-header">
            <div>
              <div className="entry-card-kicker">Enter Table</div>
              <h2>Join the room</h2>
            </div>
            <div className="entry-card-badge">Teen Patti</div>
          </div>

          <label className="entry-field">
            <span>Your Name</span>
            <input
              className="entry-input"
              type="text"
              placeholder="Enter name"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <button className="entry-primary-button" onClick={createRoom}>
            Create Table
          </button>

          <div className="entry-divider">
            <span>or join with code</span>
          </div>

          <label className="entry-field">
            <span>Table Code</span>
            <input
              className="entry-input entry-input-code"
              type="text"
              placeholder="ABC123"
              value={roomId}
              onChange={(event) => setRoomId(event.target.value.toUpperCase())}
            />
          </label>

          <button className="entry-secondary-button" onClick={joinRoom}>
            Join Table
          </button>

          {error ? <div className="entry-error">{error}</div> : null}
        </section>
      </main>
    </div>
  );
}

function FeaturePill({ label }) {
  return <div className="entry-feature-pill">{label}</div>;
}

export default Home;
