import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  buildConfigFromPreset,
  getPresetList,
  formatJokerRanks,
  formatJokerSuits,
  normalizeConfig,
  RANK_OPTIONS,
  SUIT_OPTIONS,
} from '../game/variants';
import { clearStoredToken, getStoredToken, setStoredToken } from '../lib/storage';
import { emitGameCommand, socket } from '../lib/transport';

const TABLE_POSITIONS = [
  { bottom: '22%', left: '12%' },
  { top: '48%', left: '8%' },
  { top: '30%', left: '9%' },
  { top: '12%', left: '16%' },
  { top: '12%', right: '16%' },
  { top: '30%', right: '9%' },
  { top: '48%', right: '8%' },
  { bottom: '22%', right: '12%' },
  { bottom: '14%', right: '25%' },
  { bottom: '14%', left: '25%' },
];

const TABLE_LAYOUTS = {
  1: [{ top: '24%', left: '12%' }],
  2: [
    { top: '24%', left: '12%' },
    { top: '24%', right: '12%' },
  ],
  3: [
    { top: '32%', left: '10%' },
    { top: '12%', left: '16%' },
    { top: '32%', right: '10%' },
  ],
  4: [
    { bottom: '22%', left: '12%' },
    { top: '12%', left: '20%' },
    { top: '12%', right: '20%' },
    { bottom: '22%', right: '12%' },
  ],
  5: [
    { bottom: '22%', left: '12%' },
    { top: '34%', left: '8%' },
    { top: '12%', left: '16%' },
    { top: '34%', right: '8%' },
    { bottom: '22%', right: '12%' },
  ],
  6: [
    { bottom: '22%', left: '12%' },
    { top: '36%', left: '8%' },
    { top: '10%', left: '20%' },
    { top: '10%', right: '20%' },
    { top: '36%', right: '8%' },
    { bottom: '22%', right: '12%' },
  ],
  7: [
    { bottom: '22%', left: '12%' },
    { top: '44%', left: '8%' },
    { top: '25%', left: '9%' },
    { top: '12%', left: '16%' },
    { top: '25%', right: '9%' },
    { top: '44%', right: '8%' },
    { bottom: '22%', right: '12%' },
  ],
  8: [
    { bottom: '22%', left: '12%' },
    { top: '48%', left: '8%' },
    { top: '28%', left: '9%' },
    { top: '10%', left: '18%' },
    { top: '10%', right: '18%' },
    { top: '28%', right: '9%' },
    { top: '48%', right: '8%' },
    { bottom: '22%', right: '12%' },
  ],
  9: [
    { bottom: '22%', left: '12%' },
    { top: '48%', left: '8%' },
    { top: '28%', left: '9%' },
    { top: '10%', left: '18%' },
    { top: '10%', right: '18%' },
    { top: '28%', right: '9%' },
    { top: '48%', right: '8%' },
    { bottom: '22%', right: '12%' },
    { bottom: '14%', right: '25%' },
  ],
  10: [
    { bottom: '22%', left: '12%' },
    { top: '48%', left: '8%' },
    { top: '28%', left: '9%' },
    { top: '10%', left: '18%' },
    { top: '10%', right: '18%' },
    { top: '28%', right: '9%' },
    { top: '48%', right: '8%' },
    { bottom: '22%', right: '12%' },
    { bottom: '14%', right: '25%' },
    { bottom: '14%', left: '25%' },
  ],
};

const MOBILE_TABLE_POSITIONS = [
  { bottom: '38%', left: '3%' },
  { top: '46%', left: '1%' },
  { top: '32%', left: '1%' },
  { top: '18%', left: '3%' },
  { top: '18%', right: '3%' },
  { top: '32%', right: '1%' },
  { top: '46%', right: '1%' },
  { bottom: '38%', right: '3%' },
  { bottom: '26%', right: '10%' },
  { bottom: '26%', left: '10%' },
];

const MOBILE_TABLE_LAYOUTS = {
  1: [{ top: '28%', left: '3%' }],
  2: [
    { top: '28%', left: '3%' },
    { top: '28%', right: '3%' },
  ],
  3: [
    { top: '34%', left: '1%' },
    { top: '18%', left: '3%' },
    { top: '34%', right: '1%' },
  ],
  4: [
    { bottom: '38%', left: '3%' },
    { top: '18%', left: '3%' },
    { top: '18%', right: '3%' },
    { bottom: '38%', right: '3%' },
  ],
  5: [
    { bottom: '38%', left: '3%' },
    { top: '37%', left: '1%' },
    { top: '18%', left: '3%' },
    { top: '37%', right: '1%' },
    { bottom: '38%', right: '3%' },
  ],
  6: [
    { bottom: '38%', left: '3%' },
    { top: '42%', left: '1%' },
    { top: '18%', left: '3%' },
    { top: '18%', right: '3%' },
    { top: '42%', right: '1%' },
    { bottom: '38%', right: '3%' },
  ],
  7: [
    { bottom: '38%', left: '3%' },
    { top: '46%', left: '1%' },
    { top: '30%', left: '1%' },
    { top: '18%', left: '3%' },
    { top: '30%', right: '1%' },
    { top: '46%', right: '1%' },
    { bottom: '38%', right: '3%' },
  ],
  8: [
    { bottom: '38%', left: '3%' },
    { top: '46%', left: '1%' },
    { top: '32%', left: '1%' },
    { top: '18%', left: '3%' },
    { top: '18%', right: '3%' },
    { top: '32%', right: '1%' },
    { top: '46%', right: '1%' },
    { bottom: '38%', right: '3%' },
  ],
  9: [
    { bottom: '38%', left: '3%' },
    { top: '46%', left: '1%' },
    { top: '32%', left: '1%' },
    { top: '18%', left: '3%' },
    { top: '18%', right: '3%' },
    { top: '32%', right: '1%' },
    { top: '46%', right: '1%' },
    { bottom: '38%', right: '3%' },
    { bottom: '26%', right: '10%' },
  ],
  10: [
    { bottom: '38%', left: '3%' },
    { top: '46%', left: '1%' },
    { top: '32%', left: '1%' },
    { top: '18%', left: '3%' },
    { top: '18%', right: '3%' },
    { top: '32%', right: '1%' },
    { top: '46%', right: '1%' },
    { bottom: '38%', right: '3%' },
    { bottom: '26%', right: '10%' },
    { bottom: '26%', left: '10%' },
  ],
};

function Table() {
  const { roomId = '' } = useParams();
  const normalizedRoomId = roomId.toUpperCase();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const username = searchParams.get('name') || '';
  const [playerToken, setPlayerTokenState] = useState(() => getStoredToken(normalizedRoomId));
  const [roomState, setRoomState] = useState(null);
  const [error, setError] = useState('');
  const [inviteCopied, setInviteCopied] = useState(false);
  const [selectedDiscards, setSelectedDiscards] = useState([]);
  const [configDraft, setConfigDraft] = useState(buildConfigFromPreset('classic'));
  const [chipDrafts, setChipDrafts] = useState({});
  const [isCompactMobile, setIsCompactMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  const attemptedJoinRef = useRef(false);
  const copyTimeoutRef = useRef(null);

  const updateToken = useEffectEvent((nextToken) => {
    setPlayerTokenState(nextToken);
    setStoredToken(normalizedRoomId, nextToken);
  });

  useEffect(() => {
    function handleRoomState(nextRoomState) {
      if (nextRoomState.id !== normalizedRoomId) {
        return;
      }
      setRoomState(nextRoomState);
      setConfigDraft(nextRoomState.config);
      setChipDrafts((current) => {
        const next = { ...current };
        for (const player of nextRoomState.players) {
          next[player.id] = String(player.chips);
        }
        return next;
      });
      if (nextRoomState.you?.playerToken && nextRoomState.you.playerToken !== playerToken) {
        updateToken(nextRoomState.you.playerToken);
      }
    }

    function handleJoinLike(event) {
      if (event.roomId !== normalizedRoomId) {
        return;
      }
      updateToken(event.playerToken);
    }

    function handleError(event) {
      setError(event.message);
    }

    function handleKicked(event) {
      clearStoredToken(normalizedRoomId);
      setError(event.message || 'You were removed by the host.');
      navigate('/');
    }

    socket.on('room_state', handleRoomState);
    socket.on('room_joined', handleJoinLike);
    socket.on('room_reconnected', handleJoinLike);
    socket.on('game_error', handleError);
    socket.on('connect_error', handleError);
    socket.on('kicked', handleKicked);

    return () => {
      socket.off('room_state', handleRoomState);
      socket.off('room_joined', handleJoinLike);
      socket.off('room_reconnected', handleJoinLike);
      socket.off('game_error', handleError);
      socket.off('connect_error', handleError);
      socket.off('kicked', handleKicked);
    };
  }, [navigate, normalizedRoomId, playerToken]);

  useEffect(() => {
    if (attemptedJoinRef.current) {
      return;
    }

    if (username.trim()) {
      attemptedJoinRef.current = true;
      socket.emit('join_room', {
        roomId: normalizedRoomId,
        username: username.trim(),
      });
      return;
    }

    if (playerToken) {
      attemptedJoinRef.current = true;
      socket.emit('reconnect_room', {
        roomId: normalizedRoomId,
        playerToken,
      });
      return;
    }

    navigate(`/?join=${normalizedRoomId}`);
  }, [navigate, normalizedRoomId, playerToken, username]);

  function leaveTable() {
    if (playerToken) {
      socket.emit('leave_room', {
        roomId: normalizedRoomId,
        playerToken,
      });
      clearStoredToken(normalizedRoomId);
    }
    navigate('/');
  }

  function submitCommand(type, payload = {}) {
    if (!playerToken) {
      return;
    }
    setError('');
    emitGameCommand(normalizedRoomId, playerToken, type, payload);
  }

  function saveRules() {
    socket.emit('update_config', {
      roomId: normalizedRoomId,
      playerToken,
      config: configDraft,
    });
  }

  function updatePlayerStack(targetPlayerId) {
    socket.emit('set_player_chips', {
      roomId: normalizedRoomId,
      playerToken,
      targetPlayerId,
      chips: Number(chipDrafts[targetPlayerId] || 0),
    });
  }

  function changeStartingChipsDraft(value) {
    const nextConfig = normalizeConfig({ ...configDraft, startingChips: Number(value) });
    setConfigDraft(nextConfig);
    setChipDrafts((current) => {
      const next = { ...current };
      for (const player of roomState?.players || []) {
        next[player.id] = String(nextConfig.startingChips);
      }
      return next;
    });
  }

  function kickPlayer(targetPlayerId) {
    socket.emit('kick_player', {
      roomId: normalizedRoomId,
      playerToken,
      targetPlayerId,
    });
  }

  function startRound() {
    socket.emit('start_round', {
      roomId: normalizedRoomId,
      playerToken,
      config: configDraft,
    });
  }

  async function handleCopyInvite() {
    const copied = await copyInvite(normalizedRoomId);
    if (!copied) {
      return;
    }

    setInviteCopied(true);
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = window.setTimeout(() => {
      setInviteCopied(false);
      copyTimeoutRef.current = null;
    }, 1800);
  }

  function toggleDiscard(cardId) {
    const limit = roomState?.you?.pendingDiscardCount || 0;
    setSelectedDiscards((current) => {
      if (current.includes(cardId)) {
        return current.filter((entry) => entry !== cardId);
      }
      if (current.length >= limit) {
        return current;
      }
      return [...current, cardId];
    });
  }

  function confirmDiscard() {
    submitCommand('discard_cards', { discardIds: selectedDiscards });
    setSelectedDiscards([]);
  }

  function setCardReveal(reveal) {
    submitCommand('set_card_reveal', { reveal });
  }

  function toggleJokerRank(rank) {
    setConfigDraft((current) =>
      normalizeConfig({
        ...current,
        jokerRanks: current.jokerRanks.includes(rank)
          ? current.jokerRanks.filter((entry) => entry !== rank)
          : [...current.jokerRanks, rank].sort((left, right) => right - left),
      }),
    );
  }

  function toggleJokerSuit(suit) {
    setConfigDraft((current) =>
      normalizeConfig({
        ...current,
        jokerSuits: current.jokerSuits.includes(suit)
          ? current.jokerSuits.filter((entry) => entry !== suit)
          : [...current.jokerSuits, suit],
      }),
    );
  }

  const players = useMemo(() => roomState?.players || [], [roomState?.players]);
  const me = players.find((player) => player.id === roomState?.you?.playerId) || null;
  const activeTurnPlayer = players.find((player) => player.id === roomState?.round?.actionPlayerId) || null;
  const winnerPlayer = players.find((player) => player.id === roomState?.winnerId) || null;
  const otherPlayers = useMemo(() => getClockwiseOtherPlayers(players, me), [players, me]);
  const presets = getPresetList();
  const activityLog = useMemo(() => [...(roomState?.history || [])].reverse(), [roomState?.history]);
  const isLobby = roomState?.phase === 'lobby';
  const isFinished = roomState?.phase === 'finished';
  const currentPreset = detectPreset(roomState?.config);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const handleChange = (event) => setIsCompactMobile(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('viewport-locked', !isLobby);
    document.body.classList.toggle('viewport-locked', !isLobby);

    return () => {
      document.documentElement.classList.remove('viewport-locked');
      document.body.classList.remove('viewport-locked');
    };
  }, [isLobby]);

  if (!roomState) {
    return <div className="lounge-shell lounge-loading">Connecting to table...</div>;
  }

  return (
    <div className={`lounge-shell ${isLobby ? 'lounge-shell-lobby' : 'lounge-shell-game'}`}>
      <TopBar
        roomId={normalizedRoomId}
        onLeave={leaveTable}
        onCopyInvite={handleCopyInvite}
        inviteCopied={inviteCopied}
      />

      {isLobby ? (
        <LobbyView
          roomState={roomState}
          isCompactMobile={isCompactMobile}
          configDraft={configDraft}
          presets={presets}
          chipDrafts={chipDrafts}
          currentPreset={currentPreset}
          onSetConfigDraft={setConfigDraft}
          onChangeStartingChips={changeStartingChipsDraft}
          onChangeChipDraft={(playerId, value) =>
            setChipDrafts((current) => ({ ...current, [playerId]: value }))
          }
          onToggleJokerRank={toggleJokerRank}
          onToggleJokerSuit={toggleJokerSuit}
          onSaveRules={saveRules}
          onUpdatePlayerStack={updatePlayerStack}
          onStartRound={startRound}
          error={error}
        />
      ) : (
        <GameView
          roomState={roomState}
          me={me}
          otherPlayers={otherPlayers}
          activeTurnPlayer={activeTurnPlayer}
          winnerPlayer={winnerPlayer}
          configDraft={configDraft}
          presets={presets}
          currentPreset={currentPreset}
          activityLog={activityLog}
          error={error}
          selectedDiscards={selectedDiscards}
          onToggleDiscard={toggleDiscard}
          onConfirmDiscard={confirmDiscard}
          onSubmitCommand={submitCommand}
          onSetCardReveal={setCardReveal}
          onKickPlayer={kickPlayer}
          onSetConfigDraft={setConfigDraft}
          onChangeStartingChips={changeStartingChipsDraft}
          onToggleJokerRank={toggleJokerRank}
          onToggleJokerSuit={toggleJokerSuit}
          onSaveRules={saveRules}
          onStartRound={startRound}
          isFinished={isFinished}
          isCompactMobile={isCompactMobile}
        />
      )}
    </div>
  );
}

function LobbyView({
  roomState,
  isCompactMobile,
  configDraft,
  presets,
  chipDrafts,
  onSetConfigDraft,
  onChangeStartingChips,
  onChangeChipDraft,
  onToggleJokerRank,
  onToggleJokerSuit,
  onSaveRules,
  onUpdatePlayerStack,
  onStartRound,
  error,
}) {
  const canEdit = Boolean(roomState?.you?.isHost);
  const draftPreset = detectPreset(configDraft);
  const livePreset = detectPreset(roomState?.config);
  const [showMobileSetup, setShowMobileSetup] = useState(() => !isCompactMobile);
  const showSetupControls = !isCompactMobile || showMobileSetup;

  useEffect(() => {
    setShowMobileSetup(!isCompactMobile);
  }, [isCompactMobile]);

  return (
    <main className="lobby-main lobby-main-full">
      <section className="lobby-left">
        <div className="lobby-heading">
          <h1>{canEdit ? 'Setup Your Table' : 'Waiting For Host'}</h1>
          <p>
            {canEdit
              ? 'Refine the stakes and variation before the host starts the game.'
              : 'You can see the current table setup here while the host prepares the next game.'}
          </p>
        </div>

        <div className="glass-card lobby-config-card">
          {canEdit ? (
            <>
              {isCompactMobile ? (
                <div className="mobile-setup-toggle">
                  <button
                    className="lounge-cta lounge-cta-secondary"
                    onClick={() => setShowMobileSetup((current) => !current)}
                  >
                    {showSetupControls ? 'Hide Setup' : 'Edit Setup'}
                  </button>
                </div>
              ) : null}

              <div className="rules-summary-card">
                <div className="rules-summary-kicker">Current table shape</div>
                {renderVariationSummary(configDraft)}
              </div>

              {showSetupControls ? (
                <>
              <label className="lounge-field">
                <span>Variation Preset</span>
                <select
                  className="lounge-input"
                  value={draftPreset?.id || 'classic'}
                  onChange={(event) => onSetConfigDraft(buildConfigFromPreset(event.target.value))}
                >
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="lobby-form-grid">
                <label className="lounge-field">
                  <span>Boot Amount</span>
                  <input
                    className="lounge-input"
                    type="number"
                    value={configDraft.bootAmount}
                    onChange={(event) =>
                      onSetConfigDraft(normalizeConfig({ ...configDraft, bootAmount: Number(event.target.value) }))
                    }
                  />
                </label>

                <label className="lounge-field">
                  <span>Starting Chips</span>
                  <input
                    className="lounge-input"
                    type="number"
                    value={configDraft.startingChips}
                    onChange={(event) => onChangeStartingChips(event.target.value)}
                  />
                </label>

                <label className="lounge-field">
                  <span>Cards Dealt</span>
                  <input
                    className="lounge-input"
                    type="number"
                    min="1"
                    max="10"
                    disabled={configDraft.specialHandMode === 'kiss_miss'}
                    value={configDraft.cardsDealt}
                    onChange={(event) =>
                      onSetConfigDraft(normalizeConfig({ ...configDraft, cardsDealt: Number(event.target.value) }))
                    }
                  />
                </label>

                <label className="lounge-field">
                  <span>Actual Cards Kept</span>
                  <input
                    className="lounge-input"
                    type="number"
                    min="1"
                    max={configDraft.specialHandMode === 'kiss_miss' ? '5' : '3'}
                    disabled={configDraft.specialHandMode === 'kiss_miss'}
                    value={configDraft.cardsToKeep}
                    onChange={(event) =>
                      onSetConfigDraft(normalizeConfig({ ...configDraft, cardsToKeep: Number(event.target.value) }))
                    }
                  />
                </label>
              </div>

              <div className="lobby-note">
                Final hand is always 3 cards. If kept cards are fewer than 3, the missing cards are assumed as the
                best-fit wildcards.
              </div>

              <JokerConfigurator
                configDraft={configDraft}
                onSetConfigDraft={onSetConfigDraft}
                onToggleJokerRank={onToggleJokerRank}
                onToggleJokerSuit={onToggleJokerSuit}
              />

              <div className="lobby-note">
                Blind/seen betting, side show, and show are always enabled at this table.
              </div>

              <div className="lobby-actions">
                <button className="lounge-cta lounge-cta-secondary" onClick={onSaveRules}>
                  Save Table Rules
                </button>
              </div>
                </>
              ) : null}
            </>
          ) : (
            <>
              <div className="rules-summary-card">
                <div className="rules-summary-kicker">Current variation</div>
                <div className="rules-summary-line">{livePreset?.name || 'Custom'}</div>
                <div className="rules-summary-line">Boot: {formatExactChips(roomState.config.bootAmount)}</div>
                <div className="rules-summary-line">Starting chips: {formatExactChips(roomState.config.startingChips)}</div>
                {renderVariationSummary(roomState.config)}
              </div>

              <div className="lobby-note">
                The host controls the table setup. This panel updates whenever the saved table rules change.
              </div>
            </>
          )}
        </div>

        <div className="lobby-info-strip">
          <span className="material-symbols-outlined">info</span>
          <p>
            Only the host can choose the variation and start the game. Once the round starts, the setup panel disappears.
          </p>
        </div>
      </section>

      <aside className="lobby-right">
          <div className="lobby-guest-header">
            <h2>The Guest List</h2>
            <span>{roomState.players.length} / {roomState.config.maxPlayers} joined</span>
          </div>

          <div className="guest-list">
            {roomState.players.map((player) => {
              const displayedChips = canEdit ? chipDrafts[player.id] || String(player.chips) : String(player.chips);
              const isHost = player.id === roomState.hostPlayerId;
              const isYou = player.id === roomState.you?.playerId;
              return (
                <div
                  key={player.id}
                  className={`guest-row ${isHost ? 'guest-row-host' : ''} ${isYou ? 'guest-row-you' : ''}`}
                >
                  <div className="guest-avatar">{initialsFor(player.name)}</div>
                  <div className="guest-copy">
                    <div className="guest-name">
                      {player.name}
                      {isHost ? <span>👑 Host</span> : null}
                      {isYou ? <span>(You)</span> : null}
                    </div>
                    <div className="guest-meta">
                      {player.connected ? 'Connected' : 'Disconnected'} • {formatExactChips(displayedChips)} chips
                    </div>
                  </div>
                  {canEdit ? (
                    <div className="guest-stack-editor">
                      <input
                        className="lounge-input compact-input"
                        type="number"
                        value={displayedChips}
                        onChange={(event) => onChangeChipDraft(player.id, event.target.value)}
                      />
                      <button className="lounge-cta lounge-cta-ghost" onClick={() => onUpdatePlayerStack(player.id)}>
                        Set
                      </button>
                    </div>
                  ) : (
                    <div className="guest-chip">{formatExactChips(displayedChips)}</div>
                  )}
                </div>
              );
            })}
          </div>

          {canEdit ? (
            <button className="lounge-cta lounge-cta-primary lobby-start-button" onClick={onStartRound}>
              Start Game
            </button>
          ) : (
            <div className="lobby-start-hint">Waiting for host to start the table.</div>
          )}

          <div className="invite-card">
            <div className="invite-label">Private Invite Code</div>
            <div className="invite-code">{roomState.id}</div>
          </div>

          {error ? <div className="lounge-error">{error}</div> : null}
      </aside>
    </main>
  );
}

function GameView({
  roomState,
  me,
  otherPlayers,
  activeTurnPlayer,
  winnerPlayer,
  configDraft,
  presets,
  currentPreset,
  activityLog,
  error,
  selectedDiscards,
  onToggleDiscard,
  onConfirmDiscard,
  onSubmitCommand,
  onSetCardReveal,
  onKickPlayer,
  onSetConfigDraft,
  onChangeStartingChips,
  onToggleJokerRank,
  onToggleJokerSuit,
  onSaveRules,
  onStartRound,
  isFinished,
  isCompactMobile,
}) {
  const canAct = Boolean(me?.id === activeTurnPlayer?.id);
  const actions = roomState?.you?.availableActions || {};
  const canSeeOwnCards = Boolean(roomState?.you?.handVisible);
  const crowdedTable = otherPlayers.length >= 4;
  const ultraCrowdedTable = otherPlayers.length >= 7;
  const canStartNextRound = Boolean(isFinished && roomState?.you?.isHost);
  const draftPreset = detectPreset(configDraft);
  const activeJokerText = describeActiveJokers(roomState);
  const winnerDisplayName = winnerPlayer?.id === me?.id ? 'You' : winnerPlayer?.name || 'Player';
  const turnBannerText = activeTurnPlayer
    ? activeTurnPlayer.id === me?.id
      ? 'Your Turn'
      : `${activeTurnPlayer.name}'s Turn`
    : 'Waiting for players';
  const seatPositions = useMemo(
    () => getSeatPositions(otherPlayers.length, isCompactMobile),
    [otherPlayers.length, isCompactMobile],
  );
  const latestEvent = roomState?.history?.[roomState.history.length - 1] || null;
  const parsedEvent = useMemo(() => parseTableEvent(latestEvent, roomState.players), [latestEvent, roomState.players]);
  const sideShowReveal = roomState?.sideShowReveal || null;
  const sideShowRevealStyle = useMemo(
    () => getSideShowRevealStyle(sideShowReveal, me, otherPlayers, seatPositions),
    [sideShowReveal, me, otherPlayers, seatPositions],
  );
  const [sideShowNow, setSideShowNow] = useState(0);
  const [turnNow, setTurnNow] = useState(0);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showLogPanel, setShowLogPanel] = useState(false);
  const [showSetupPanel, setShowSetupPanel] = useState(false);
  const [raiseDraft, setRaiseDraft] = useState({ key: '', value: '' });
  const raiseControlKey = `${roomState.round?.number || 0}:${roomState.round?.currentStake || 0}:${actions.minRaiseAmount || 0}:${actions.maxRaiseAmount || 0}:${me?.hasSeenCards ? 'seen' : 'blind'}`;
  const raiseInputValue = raiseDraft.key === raiseControlKey
    ? raiseDraft.value
    : String(actions.raiseAmount || actions.minRaiseAmount || '');
  const heroCardLift = isCompactMobile ? '0' : '-10px';
  const parsedRaiseAmount = Number(raiseInputValue);
  const isRaiseAmountValid =
    Boolean(String(raiseInputValue).trim()) &&
    Number.isInteger(parsedRaiseAmount) &&
    parsedRaiseAmount >= (actions.minRaiseAmount || 0) &&
    parsedRaiseAmount <= (actions.maxRaiseAmount || 0) &&
    parsedRaiseAmount % (actions.raiseStep || 1) === 0;
  const sideShowCountdown =
    sideShowReveal?.endsAt
      ? Math.max(
          0,
          Math.ceil((sideShowReveal.endsAt - (sideShowNow || sideShowReveal.endsAt - 10_000)) / 1000),
        )
      : 0;
  const turnProgress = getTurnProgress(roomState.round, turnNow);
  const canToggleOwnReveal = Boolean(actions.canSetCardReveal);

  useEffect(() => {
    if (!sideShowReveal?.endsAt) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setSideShowNow(Date.now());
    }, 250);
    return () => window.clearInterval(intervalId);
  }, [sideShowReveal?.endsAt]);

  useEffect(() => {
    if (!roomState.round?.turnEndsAt || isFinished) {
      return;
    }

    const tick = () => setTurnNow(Date.now());
    const frameId = window.requestAnimationFrame(tick);
    const intervalId = window.setInterval(tick, 250);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(intervalId);
    };
  }, [isFinished, roomState.round?.turnEndsAt]);

  const actionButtons = [
    actions.canLook
      ? {
          id: 'look',
          label: 'See Cards',
          className: 'control-btn control-btn-dark',
          onClick: () => onSubmitCommand('look_cards'),
        }
      : null,
    actions.canCall
      ? {
          id: 'call',
          label: `Chaal ${formatChips(actions.callAmount)}`,
          className: 'control-btn control-btn-blue',
          onClick: () => onSubmitCommand('call'),
        }
      : null,
    actions.canRaise
      ? null
      : null,
    actions.canPack
      ? {
          id: 'pack',
          label: 'Fold',
          className: 'control-btn control-btn-red',
          onClick: () => onSubmitCommand('pack'),
        }
      : null,
    actions.canRequestSideShow
      ? {
          id: 'side-show',
          label: 'Side Show',
          className: 'control-btn control-btn-dark',
          onClick: () => onSubmitCommand('request_side_show'),
        }
      : null,
    actions.canShow
      ? {
          id: 'show',
          label: 'Show',
          className: 'control-btn control-btn-blue',
          onClick: () => onSubmitCommand('show'),
        }
      : null,
    actions.canDiscard
      ? {
          id: 'discard',
          label: `Lock ${selectedDiscards.length}/${roomState.you.pendingDiscardCount} Discards`,
          className: 'control-btn control-btn-blue',
          disabled: selectedDiscards.length !== roomState.you.pendingDiscardCount,
          onClick: onConfirmDiscard,
        }
      : null,
  ].filter(Boolean);
  const canUseFooterActions = canAct || actions.canLook || actions.canDiscard || canToggleOwnReveal || canStartNextRound;

  return (
    <main className="game-main game-main-full">
      <section className={`game-table-shell ${crowdedTable ? 'game-table-shell-crowded' : ''}`}>
        <div className="game-table-glow" />
        <div className="game-table-oval" />

        <div className="game-side-dock">
          <button
            className={`dock-toggle ${showInfoPanel ? 'dock-toggle-active' : ''}`}
            onClick={() => {
              setShowInfoPanel((current) => !current);
              setShowLogPanel(false);
              setShowSetupPanel(false);
            }}
          >
            Info
          </button>
          <button
            className={`dock-toggle ${showLogPanel ? 'dock-toggle-active' : ''}`}
            onClick={() => {
              setShowLogPanel((current) => !current);
              setShowInfoPanel(false);
              setShowSetupPanel(false);
            }}
          >
            Log
          </button>
          {canStartNextRound ? (
            <button
              className={`dock-toggle dock-toggle-accent ${showSetupPanel ? 'dock-toggle-active' : ''}`}
              onClick={() => {
                setShowSetupPanel((current) => !current);
                setShowInfoPanel(false);
                setShowLogPanel(false);
              }}
            >
              Setup
            </button>
          ) : null}
        </div>

        {showInfoPanel ? (
          <aside className="game-flyout game-flyout-info">
            <div className="hud-card">
              <div className="hud-kicker">Table</div>
              <div className="hud-title">#{roomState.id}</div>
              <div className="hud-copy">
                {currentPreset?.name || 'Custom Variation'} • {roomState.players.length}/{roomState.config.maxPlayers} seated
              </div>
            </div>

            <div className="hud-card">
              <div className="hud-kicker">Round</div>
              <div className="hud-stat-grid">
                <div>
                  <span>Boot</span>
                  <strong>{formatChips(roomState.config.bootAmount)}</strong>
                </div>
                <div>
                  <span>Stake</span>
                  <strong>{formatChips(roomState.round?.currentStake)}</strong>
                </div>
                <div>
                  <span>Pot</span>
                  <strong>{formatChips(roomState.round?.pot)}</strong>
                </div>
              </div>
              <div className="hud-copy">
                {isFinished
                  ? `${winnerPlayer?.name || 'Player'} closed the hand.`
                  : `${activeTurnPlayer?.name || 'Waiting'} is on turn.`}
              </div>
            </div>

            {roomState.you?.isHost ? (
              <div className="hud-card host-controls-card">
                <div className="hud-kicker">Host Controls</div>
                <div className="host-control-list">
                  {roomState.players
                    .filter((player) => player.id !== me?.id)
                    .map((player) => (
                      <div key={player.id} className="host-control-row">
                        <span>{player.name}</span>
                        <button
                          className="mini-danger-btn"
                          onClick={() => onKickPlayer(player.id)}
                        >
                          Kick
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}

            {error ? <div className="lounge-error">{error}</div> : null}
          </aside>
        ) : null}

        {showSetupPanel && canStartNextRound ? (
          <aside className="game-flyout game-flyout-setup">
            <NextRoundSettings
              configDraft={configDraft}
              presets={presets}
              draftPreset={draftPreset}
              onSetConfigDraft={onSetConfigDraft}
              onChangeStartingChips={onChangeStartingChips}
              onToggleJokerRank={onToggleJokerRank}
              onToggleJokerSuit={onToggleJokerSuit}
              onSaveRules={onSaveRules}
              onStartRound={onStartRound}
            />
          </aside>
        ) : null}

        {showLogPanel ? (
          <aside className="game-flyout game-flyout-log">
            <div className="hud-card hud-card-log">
              <div className="hud-kicker">Table Log</div>
              <div className="hud-log">
                {activityLog.slice(0, 10).map((event) => (
                  <div key={event.id} className="hud-log-item">
                    {event.message}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        ) : null}

        <div className={`table-stage-status ${canAct ? 'table-stage-status-live' : ''}`}>
          <span>Round {roomState.round?.number || 1}</span>
          <span>{turnBannerText}</span>
        </div>

        <div className="pot-core">
          <span>Current Pot</span>
          <strong>{formatChips(roomState.round?.pot)}</strong>
          <div className="pot-markers">
            <i />
            <i />
            <i />
          </div>
          <div className="pot-badge">{currentPreset?.name || 'Custom'} • Boot {formatChips(roomState.config.bootAmount)}</div>
          <div className="pot-mode">
            {roomState.config.specialHandMode === 'kiss_miss'
              ? 'Kiss Miss: two kiss/miss pairs become jokers, leftover card decides the trail'
              : roomState.config.handRankingMode === 'muflis'
                ? 'Muflis Lowball: Lowest hand wins'
                : 'Standard ranking'}
          </div>
          <div className="pot-jokers">{activeJokerText}</div>
        </div>

        {latestEvent ? (
          <div key={latestEvent.id} className="table-event-banner">
            {latestEvent.message}
          </div>
        ) : null}

        {otherPlayers.map((player, index) => (
          <div
            key={player.id}
            className={`table-seat ${crowdedTable ? 'table-seat-compact' : ''} ${ultraCrowdedTable ? 'table-seat-ultra-compact' : ''} ${player.id === activeTurnPlayer?.id ? 'table-seat-active' : ''} ${player.status === 'packed' ? 'table-seat-folded' : ''} ${player.id === winnerPlayer?.id ? 'table-seat-winner' : ''}`}
            style={seatPositions[index] || TABLE_POSITIONS[index] || TABLE_POSITIONS[0]}
          >
            <div className="table-seat-avatar">
              {initialsFor(player.name)}
              {playerStatusIcon(player) ? (
                <span className="table-seat-avatar-badge material-symbols-outlined">
                  {playerStatusIcon(player)}
                </span>
              ) : null}
            </div>
            <div className="table-seat-name">{player.name}</div>
            <div className="table-seat-meta-row">
              <div className="table-seat-meta">{formatExactChips(player.chips)}</div>
              <div className="table-seat-token">{player.hasSeenCards ? 'Seen' : 'Blind'}</div>
            </div>
            {parsedEvent?.playerId === player.id && parsedEvent.amount ? (
              <div className="table-seat-last-bet">{parsedEvent.tokenText}</div>
            ) : null}
            <SeatCards player={player} />
            {player.cards?.length > 0 && player.handLabel ? (
              <div className="table-seat-hand-label">{player.handLabel}</div>
            ) : null}
            {labelForPlayerState(player) ? <div className="table-seat-state">{labelForPlayerState(player)}</div> : null}
            {player.id === activeTurnPlayer?.id ? (
              <>
                <div className="table-seat-turn-indicator">Turn</div>
                <TurnTimerBar progress={turnProgress} />
              </>
            ) : null}
            {parsedEvent?.playerId === player.id ? (
              <div className={`seat-action-token ${parsedEvent.amount ? 'seat-action-token-money' : ''}`}>
                {parsedEvent.tokenText}
              </div>
            ) : null}
          </div>
        ))}

        <div className="hero-seat">
          <div className="hand-cards">
            {canSeeOwnCards
              ? roomState?.you?.hand?.map((card, index) => (
                  <button
                    key={card.id}
                    className={`hero-card ${selectedDiscards.includes(card.id) ? 'hero-card-selected' : ''}`}
                    style={{ transform: `translateY(${index % 2 === 1 ? heroCardLift : '0'}) rotate(${(index - 1.5) * 5}deg)` }}
                    onClick={() => (actions.canDiscard ? onToggleDiscard(card.id) : null)}
                  >
                    <span className={`hero-card-corner ${isRedSuit(card.suitSymbol) ? 'hero-card-corner-red' : ''}`}>{card.label}</span>
                    <span className={`hero-card-rank ${isRedSuit(card.suitSymbol) ? 'hero-card-rank-red' : ''}`}>{card.label}</span>
                    {selectedDiscards.includes(card.id) ? <span className="hero-card-selected-badge">Selected</span> : null}
                    {card.isJoker ? <span className="hero-card-chip">JOKER</span> : null}
                  </button>
                ))
              : Array.from({ length: roomState?.you?.handCount || 0 }, (_, index) => (
                  <div
                    key={`hidden-${index}`}
                    className="hero-card hero-card-hidden"
                    style={{ transform: `translateY(${index % 2 === 1 ? heroCardLift : '0'}) rotate(${(index - 1.5) * 5}deg)` }}
                  >
                    <span className="hero-card-back-pattern" />
                  </div>
                ))}
          </div>

          <div className={`hero-seat-panel ${canAct ? 'hero-seat-panel-active' : ''}`}>
            <div className="hero-seat-panel-top">
              <div>
                <div className="hero-seat-kicker">Your Seat</div>
                <div className="hero-seat-name">{me?.name || 'Player'}</div>
              </div>
              <div className="hero-seat-stack-group">
                <div className="hero-seat-stack">{formatExactChips(me?.chips)}</div>
                {me?.status === 'packed' ? (
                  <span className="hero-seat-state-icon material-symbols-outlined" title="Folded">
                    do_not_disturb_on
                  </span>
                ) : null}
                {me?.id === winnerPlayer?.id ? (
                  <span className="hero-seat-state-icon material-symbols-outlined" title="Winner">
                    emoji_events
                  </span>
                ) : null}
              </div>
              <div className="hero-seat-statuses">
                <div className="hand-status-chip">{me?.hasSeenCards ? 'Seen' : 'Blind'}</div>
              </div>
            </div>

            {canSeeOwnCards ? (
              <div className="hand-insight">
                <div className="hand-insight-title">{roomState?.you?.bestHandLabel || 'Best Hand'}</div>
                <div className="hand-insight-copy hand-insight-copy-tight">
                  {roomState?.you?.bestHandCards?.length
                    ? `Using ${roomState.you.bestHandCards.map((card) => card.label).join(', ')}`
                    : 'Waiting for cards'}
                </div>
                {roomState?.you?.recommendedDiscardCards?.length || roomState?.you?.resolvedAssumedCards?.length ? (
                  <div
                    className="hand-insight-copy hand-insight-copy-tight accent-copy"
                    title={[
                      roomState?.you?.recommendedDiscardCards?.length
                        ? `Best discard: ${roomState.you.recommendedDiscardCards.map((card) => card.label).join(', ')}`
                        : '',
                      roomState?.you?.resolvedAssumedCards?.length
                        ? `Assume: ${roomState.you.resolvedAssumedCards.map((card) => card.label).join(', ')}`
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' • ')}
                  >
                    {roomState?.you?.recommendedDiscardCards?.length ? (
                      <span>
                        Best discard: {roomState.you.recommendedDiscardCards.map((card) => card.label).join(', ')}
                      </span>
                    ) : null}
                    {roomState?.you?.recommendedDiscardCards?.length && roomState?.you?.resolvedAssumedCards?.length ? (
                      <span className="hand-insight-divider"> • </span>
                    ) : null}
                    {roomState?.you?.resolvedAssumedCards?.length ? (
                      <span>Assume: {roomState.you.resolvedAssumedCards.map((card) => card.label).join(', ')}</span>
                    ) : null}
                  </div>
                ) : null}
                {roomState?.you?.bestHandDetail ? (
                  <div className="hand-insight-copy hand-insight-copy-tight accent-copy">{roomState.you.bestHandDetail}</div>
                ) : null}
              </div>
            ) : (
              <div className="hand-insight hand-insight-hidden">
                <>
                  Cards stay face down while you are blind. You can keep playing blind, or use <strong>See Cards</strong>{' '}
                  when you want to open and discard.
                </>
              </div>
            )}

            {actions.canDiscard ? (
              <div className="discard-prompt discard-prompt-tight">
                Pick {roomState.you.pendingDiscardCount} card(s) to discard.
              </div>
            ) : null}
            {me?.id === activeTurnPlayer?.id ? <TurnTimerBar progress={turnProgress} /> : null}
          </div>

          {parsedEvent?.playerId === me?.id ? (
            <div className={`seat-action-token seat-action-token-hero ${parsedEvent.amount ? 'seat-action-token-money' : ''}`}>
              {parsedEvent.tokenText}
            </div>
          ) : null}
        </div>

        {winnerPlayer ? (
          <div className="winner-toast">
            {winnerDisplayName} won {formatChips(roomState.round?.pot)}. Cards are shown at the seats.
          </div>
        ) : null}

        {sideShowReveal?.visibleToYou ? (
          <div className="side-show-reveal" style={sideShowRevealStyle}>
            <div className="side-show-reveal-kicker">Side Show</div>
            <div className="side-show-reveal-title">
              {sideShowReveal.winnerName} won the side show
            </div>
            <div className="side-show-reveal-copy">
              {sideShowReveal.loserName} packs in {sideShowCountdown}s.
            </div>
            {sideShowReveal.reason ? (
              <div className="side-show-reveal-copy">
                {sideShowReveal.reason}
              </div>
            ) : null}
            <div className="side-show-reveal-cards">
              <div className="side-show-reveal-hand">
                <strong>{sideShowReveal.requestorName}</strong>
                <span>
                  {(sideShowReveal.requestorCards || []).map((card) => card.label).join(' ') || sideShowReveal.requestorHandLabel}
                </span>
              </div>
              <div className="side-show-reveal-hand">
                <strong>{sideShowReveal.targetName}</strong>
                <span>
                  {(sideShowReveal.targetCards || []).map((card) => card.label).join(' ') || sideShowReveal.targetHandLabel}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {roomState?.prompt?.awaitingYou ? (
          <div className="prompt-panel">
            <div className="prompt-panel-title">Side Show Request</div>
            <div className="prompt-panel-copy">
              {roomState.prompt.requestorName} requested a side show for {formatChips(roomState.prompt.stake)}.
            </div>
            <div className="prompt-panel-actions">
              <button className="lounge-cta lounge-cta-ghost" onClick={() => onSubmitCommand('answer_prompt', { accept: false })}>
                Decline
              </button>
              <button className="lounge-cta lounge-cta-primary" onClick={() => onSubmitCommand('answer_prompt', { accept: true })}>
                Accept
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <footer className="game-controls">
        <div className="control-buttons">
          {canUseFooterActions ? (
            <>
              {canToggleOwnReveal ? (
                <button
                  className="control-btn control-btn-dark"
                  onClick={() => onSetCardReveal(!roomState.you.showCardsAfterRound)}
                >
                  {roomState.you.showCardsAfterRound ? 'Hide My Cards' : 'Show My Cards'}
                </button>
              ) : null}

              {canStartNextRound ? (
                <button
                  className="control-btn control-btn-gold"
                  onClick={() => {
                    setShowSetupPanel(true);
                    setShowInfoPanel(false);
                    setShowLogPanel(false);
                  }}
                >
                  Round Setup
                </button>
              ) : null}

              {canAct && actions.canRaise ? (
                <div className="raise-control-inline">
                  <input
                    className="raise-input"
                    type="number"
                    inputMode="numeric"
                    min={actions.minRaiseAmount}
                    max={actions.maxRaiseAmount}
                    step={actions.raiseStep || 1}
                    value={raiseInputValue}
                    onChange={(event) =>
                      setRaiseDraft({
                        key: raiseControlKey,
                        value: sanitizeNumericInput(event.target.value),
                      })
                    }
                    onBlur={() => {
                      if (!String(raiseInputValue).trim()) {
                        return;
                      }
                      setRaiseDraft({
                        key: raiseControlKey,
                        value: String(
                          snapRaiseAmount(
                            parsedRaiseAmount,
                            actions.minRaiseAmount || 0,
                            actions.maxRaiseAmount || 0,
                            actions.raiseStep || 1,
                          ),
                        ),
                      });
                    }}
                    placeholder={String(actions.minRaiseAmount || '')}
                  />
                  <button
                    className="control-btn control-btn-gold"
                    disabled={!isRaiseAmountValid}
                    onClick={() => onSubmitCommand('raise', { amount: parsedRaiseAmount })}
                  >
                    Raise {isRaiseAmountValid ? formatChips(parsedRaiseAmount) : ''}
                  </button>
                </div>
              ) : null}

              {actionButtons.map((action) => (
                <button
                  key={action.id}
                  className={action.className}
                  disabled={Boolean(action.disabled)}
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              ))}
            </>
          ) : (
            <div className="turn-wait">
              {isFinished ? 'Round finished. Host can start the next hand.' : `Waiting for ${activeTurnPlayer?.name || 'player'} to act.`}
            </div>
          )}
        </div>
      </footer>
    </main>
  );
}

function SeatCards({ player }) {
  const visibleCards = player.cards || [];
  if (visibleCards.length > 0) {
    return (
      <div className="table-seat-cards table-seat-cards-visible">
        {visibleCards.map((card) => (
          <span key={card.id} className="table-seat-face-card">
            <span className={isRedSuit(card.suitSymbol) ? 'table-seat-face-card-red' : ''}>{card.label}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="table-seat-cards">
      {Array.from({ length: Math.min(player.handCount || 0, 3) }, (_, cardIndex) => (
        <span key={`${player.id}-card-${cardIndex}`} className="table-seat-cardback" />
      ))}
    </div>
  );
}

function TurnTimerBar({ progress }) {
  return (
    <div className="turn-timer-bar">
      <i style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}

function NextRoundSettings({
  configDraft,
  presets,
  draftPreset,
  onSetConfigDraft,
  onChangeStartingChips,
  onToggleJokerRank,
  onToggleJokerSuit,
  onSaveRules,
  onStartRound,
}) {
  return (
    <div className="hud-card next-round-config next-round-config-panel">
      <div className="next-round-config-head">
        <div className="winner-showcase-kicker">Next Round Setup</div>
        <div className="next-round-config-copy">Change the variation here, then start the next hand.</div>
      </div>

      <div className="next-round-config-grid">
        <label className="lounge-field next-round-field">
          <span>Preset</span>
          <select
            className="lounge-input"
            value={draftPreset?.id || 'classic'}
            onChange={(event) => onSetConfigDraft(buildConfigFromPreset(event.target.value))}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>

        <label className="lounge-field next-round-field">
          <span>Boot</span>
          <input
            className="lounge-input"
            type="number"
            value={configDraft.bootAmount}
            onChange={(event) =>
              onSetConfigDraft(normalizeConfig({ ...configDraft, bootAmount: Number(event.target.value) }))
            }
          />
        </label>

        <label className="lounge-field next-round-field">
          <span>Starting Chips</span>
          <input
            className="lounge-input"
            type="number"
            value={configDraft.startingChips}
            onChange={(event) => onChangeStartingChips(event.target.value)}
          />
        </label>

        <label className="lounge-field next-round-field">
          <span>Cards Dealt</span>
          <input
            className="lounge-input"
            type="number"
            min="1"
            max="10"
            disabled={configDraft.specialHandMode === 'kiss_miss'}
            value={configDraft.cardsDealt}
            onChange={(event) =>
              onSetConfigDraft(normalizeConfig({ ...configDraft, cardsDealt: Number(event.target.value) }))
            }
          />
        </label>

        <label className="lounge-field next-round-field">
          <span>Cards Kept</span>
          <input
            className="lounge-input"
            type="number"
            min="1"
            max={configDraft.specialHandMode === 'kiss_miss' ? '5' : '3'}
            disabled={configDraft.specialHandMode === 'kiss_miss'}
            value={configDraft.cardsToKeep}
            onChange={(event) =>
              onSetConfigDraft(normalizeConfig({ ...configDraft, cardsToKeep: Number(event.target.value) }))
            }
          />
        </label>
      </div>

      <div className="next-round-config-copy">Side show and show stay on for every round.</div>

      <JokerConfigurator
        configDraft={configDraft}
        onSetConfigDraft={onSetConfigDraft}
        onToggleJokerRank={onToggleJokerRank}
        onToggleJokerSuit={onToggleJokerSuit}
      />

      <div className="winner-showcase-actions next-round-config-actions">
        <button className="lounge-cta lounge-cta-secondary" onClick={onSaveRules}>
          Save Rules
        </button>
        <button className="lounge-cta lounge-cta-primary" onClick={onStartRound}>
          Start Next Round
        </button>
      </div>
    </div>
  );
}

function TopBar({ roomId, onLeave, onCopyInvite, inviteCopied }) {
  return (
    <header className="lounge-topbar">
      <div className="lounge-brand">The Grandmaster&apos;s Lounge</div>
      <div className="lounge-top-actions">
        <button className="chip-badge" onClick={onCopyInvite}>
          {inviteCopied ? 'Copied' : roomId}
        </button>
        <button className="recharge-btn" onClick={onCopyInvite}>
          {inviteCopied ? 'Copied' : 'Invite'}
        </button>
        <span className="material-symbols-outlined top-icon" onClick={onLeave}>logout</span>
      </div>
    </header>
  );
}

function JokerConfigurator({ configDraft, onSetConfigDraft, onToggleJokerRank, onToggleJokerSuit }) {
  if (configDraft.specialHandMode === 'kiss_miss') {
    return (
      <div className="lobby-note">
        Kiss Miss always deals 5 cards. Make two kiss/miss pairs like 2-3 or 4-6. Those four cards become jokers,
        and the leftover card decides your trail rank.
      </div>
    );
  }

  return (
    <>
      <label className="lounge-field">
        <span>Joker Number Cards</span>
        <div className="rank-grid">
          {RANK_OPTIONS.map((rank) => (
            <button
              key={rank.value}
              type="button"
              className={`rank-pill ${configDraft.jokerRanks.includes(rank.value) ? 'rank-pill-active' : ''}`}
              onClick={() => onToggleJokerRank(rank.value)}
            >
              {rank.label}
            </button>
          ))}
        </div>
      </label>

      <label className="lounge-field">
        <span>Joker Color Cards</span>
        <div className="rank-grid">
          {SUIT_OPTIONS.map((suit) => (
            <button
              key={suit.value}
              type="button"
              className={`rank-pill ${configDraft.jokerSuits.includes(suit.value) ? 'rank-pill-active' : ''}`}
              onClick={() => onToggleJokerSuit(suit.value)}
            >
              {suit.label}
            </button>
          ))}
        </div>
      </label>

      <div className="lounge-field">
        <span>Random Jokers</span>
        <div className="rank-grid random-joker-grid">
          <div className="random-joker-row">
            <button
              type="button"
              className={`rank-pill ${configDraft.randomJokerRank ? 'rank-pill-active' : ''}`}
              onClick={() =>
                onSetConfigDraft(normalizeConfig({ ...configDraft, randomJokerRank: !configDraft.randomJokerRank }))
              }
            >
              Random Number
            </button>
            {configDraft.randomJokerRank ? (
              <label className="random-joker-count">
                <span>Count</span>
                <input
                  className="lounge-input random-joker-count-input"
                  type="number"
                  min="1"
                  max="13"
                  value={configDraft.randomJokerRankCount}
                  onChange={(event) =>
                    onSetConfigDraft(normalizeConfig({ ...configDraft, randomJokerRankCount: Number(event.target.value) }))
                  }
                />
              </label>
            ) : null}
          </div>

          <div className="random-joker-row">
            <button
              type="button"
              className={`rank-pill ${configDraft.randomJokerSuit ? 'rank-pill-active' : ''}`}
              onClick={() =>
                onSetConfigDraft(normalizeConfig({ ...configDraft, randomJokerSuit: !configDraft.randomJokerSuit }))
              }
            >
              Random Color
            </button>
            {configDraft.randomJokerSuit ? (
              <label className="random-joker-count">
                <span>Count</span>
                <input
                  className="lounge-input random-joker-count-input"
                  type="number"
                  min="1"
                  max="4"
                  value={configDraft.randomJokerSuitCount}
                  onChange={(event) =>
                    onSetConfigDraft(normalizeConfig({ ...configDraft, randomJokerSuitCount: Number(event.target.value) }))
                  }
                />
              </label>
            ) : null}
          </div>
        </div>
        <div className="rank-help">
          Selected ranks and suits stay jokers. Random options add extra random joker numbers or colors at round start.
        </div>
      </div>
    </>
  );
}

function detectPreset(config) {
  if (!config) {
    return null;
  }

  const normalizedConfig = normalizeConfig(config);

  return (
    getPresetList().find(
      (preset) => {
        const presetConfig = normalizeConfig(preset.config);
        return (
          presetConfig.cardsDealt === normalizedConfig.cardsDealt &&
          presetConfig.cardsToKeep === normalizedConfig.cardsToKeep &&
          presetConfig.assumedWildCards === normalizedConfig.assumedWildCards &&
          presetConfig.handRankingMode === normalizedConfig.handRankingMode &&
          presetConfig.specialHandMode === normalizedConfig.specialHandMode &&
          JSON.stringify(presetConfig.jokerRanks || []) === JSON.stringify(normalizedConfig.jokerRanks || []) &&
          JSON.stringify(presetConfig.jokerSuits || []) === JSON.stringify(normalizedConfig.jokerSuits || []) &&
          presetConfig.randomJokerRank === normalizedConfig.randomJokerRank &&
          presetConfig.randomJokerSuit === normalizedConfig.randomJokerSuit &&
          presetConfig.randomJokerRankCount === normalizedConfig.randomJokerRankCount &&
          presetConfig.randomJokerSuitCount === normalizedConfig.randomJokerSuitCount
        );
      },
    ) || { name: 'Custom', id: 'custom' }
  );
}

function renderVariationSummary(config) {
  const lines = [];

  if (config.specialHandMode === 'kiss_miss') {
    lines.push(<div key="shape" className="rules-summary-line">Kiss Miss deals 5 cards and uses all 5.</div>);
    lines.push(
      <div key="kiss-miss" className="rules-summary-line">
        Two kiss/miss pairs become jokers and the leftover card decides the trail.
      </div>,
    );
    return lines;
  }

  lines.push(
    <div key="deal" className="rules-summary-line">
      Deal {config.cardsDealt}, keep {config.cardsToKeep}, assume {config.assumedWildCards}
    </div>,
  );
  lines.push(
    <div key="ranks" className="rules-summary-line">
      Number jokers: {describeJokerRule(config.jokerRanks, config.randomJokerRank, config.randomJokerRankCount)}
    </div>,
  );
  lines.push(
    <div key="suits" className="rules-summary-line">
      Color jokers: {describeJokerRule(config.jokerSuits, config.randomJokerSuit, config.randomJokerSuitCount, true)}
    </div>,
  );

  return lines;
}

function describeActiveJokers(roomState) {
  if (roomState?.config?.specialHandMode === 'kiss_miss') {
    return 'Kiss/Miss jokers: two kiss or miss pairs turn into jokers. The leftover card becomes your trail rank.';
  }

  const activeRanks = roomState?.round?.activeJokerRanks || roomState?.config?.jokerRanks || [];
  const activeSuits = roomState?.round?.activeJokerSuits || roomState?.config?.jokerSuits || [];
  const rankText = formatJokerRanks(activeRanks);
  const suitText = formatJokerSuits(activeSuits);
  const hasRanks = activeRanks.length > 0;
  const hasSuits = activeSuits.length > 0;

  if (!hasRanks && !hasSuits) {
    return 'No Jokers';
  }

  return [
    hasRanks ? `${activeRanks.length === 1 ? 'Number' : 'Numbers'} ${rankText} ${activeRanks.length === 1 ? 'is' : 'are'} joker${activeRanks.length === 1 ? '' : 's'}` : '',
    hasSuits ? `${suitText} ${activeSuits.length === 1 ? 'is' : 'are'} joker color${activeSuits.length === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' • ');
}

function describeJokerRule(values, hasRandom, randomCount, areSuits = false) {
  const baseText = areSuits ? formatJokerSuits(values) : formatJokerRanks(values);
  if (!hasRandom) {
    return baseText;
  }

  const randomText = `${randomCount} random ${areSuits ? 'color' : 'number'} joker${randomCount === 1 ? '' : 's'}`;
  return baseText === 'None' ? randomText : `${baseText} + ${randomText}`;
}

function initialsFor(name) {
  return String(name || 'P')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatChips(value) {
  const amount = Number(value || 0);
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(amount % 1_000 === 0 ? 0 : 1)}K`;
  }
  return `${amount}`;
}

function formatExactChips(value) {
  return `${Number(value || 0)}`;
}

function labelForPlayerState(player) {
  if (player.status === 'waiting') {
    return 'Next Hand';
  }
  if (player.status === 'packed') {
    return 'Folded';
  }
  if (player.status === 'winner') {
    return 'Winner';
  }
  if (!player.connected) {
    return 'Offline';
  }
  return '';
}

function parseTableEvent(event, players) {
  if (!event?.message || !players?.length) {
    return null;
  }

  const matchPlayer = players.find((player) => event.message.startsWith(`${player.name} `));
  if (!matchPlayer) {
    return null;
  }

  const amountMatch = event.message.match(/(\d+) chips/);
  const amount = amountMatch ? Number(amountMatch[1]) : 0;

  if (event.message.includes(' raised for ')) {
    return { playerId: matchPlayer.id, amount, tokenText: `+${amount}` };
  }
  if (event.message.includes(' called for ')) {
    return { playerId: matchPlayer.id, amount, tokenText: `+${amount}` };
  }
  if (event.message.includes(' requested a side show')) {
    return { playerId: matchPlayer.id, tokenText: 'Side Show' };
  }
  if (event.message.includes(' asked for show against ')) {
    return { playerId: matchPlayer.id, tokenText: 'Show' };
  }
  if (event.message.includes(' packed.')) {
    return { playerId: matchPlayer.id, tokenText: 'Fold' };
  }
  if (event.message.includes(' saw their cards')) {
    return { playerId: matchPlayer.id, tokenText: 'Seen' };
  }
  if (event.message.includes(' won ') && amount) {
    return { playerId: matchPlayer.id, amount, tokenText: `Won ${amount}` };
  }

  return null;
}

function isRedSuit(suitSymbol) {
  return suitSymbol === '♥' || suitSymbol === '♦';
}

function getClockwiseOtherPlayers(players, me) {
  if (!me) {
    return players.filter((player) => player.id !== me?.id);
  }

  return players
    .filter((player) => player.id !== me.id)
    .sort((left, right) => {
      const leftDistance = (left.seat - me.seat + players.length) % players.length;
      const rightDistance = (right.seat - me.seat + players.length) % players.length;
      return leftDistance - rightDistance;
    });
}

function getSeatPositions(count, isCompactMobile = false) {
  if (isCompactMobile) {
    return MOBILE_TABLE_LAYOUTS[count] || MOBILE_TABLE_POSITIONS;
  }
  return TABLE_LAYOUTS[count] || TABLE_POSITIONS;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function sanitizeNumericInput(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function snapRaiseAmount(value, min, max, step) {
  const safeMin = Number(min || 0);
  const safeMax = Number(max || safeMin);
  const safeStep = Math.max(1, Number(step || 1));
  const clamped = clampNumber(Number(value), safeMin, safeMax);
  const snapped = safeMin + Math.round((clamped - safeMin) / safeStep) * safeStep;
  return clampNumber(snapped, safeMin, safeMax);
}

function getTurnProgress(round, now) {
  if (!round?.turnEndsAt || !round?.turnStartedAt || !round?.turnDurationMs) {
    return 0;
  }

  const remaining = round.turnEndsAt - now;
  return clampNumber(remaining / round.turnDurationMs, 0, 1);
}

function getSideShowRevealStyle(sideShowReveal, me, otherPlayers, seatPositions) {
  if (!sideShowReveal) {
    return undefined;
  }

  const requestorPoint = getSeatPoint(sideShowReveal.requestorId, me, otherPlayers, seatPositions);
  const targetPoint = getSeatPoint(sideShowReveal.targetId, me, otherPlayers, seatPositions);
  const centerX = (requestorPoint.x + targetPoint.x) / 2;
  const centerY = (requestorPoint.y + targetPoint.y) / 2;

  return {
    left: `${centerX}%`,
    top: `${centerY}%`,
    transform: 'translate(-50%, -50%)',
  };
}

function getSeatPoint(playerId, me, otherPlayers, seatPositions) {
  if (playerId === me?.id) {
    return { x: 50, y: 84 };
  }

  const index = otherPlayers.findIndex((player) => player.id === playerId);
  if (index === -1) {
    return { x: 50, y: 50 };
  }

  const position = seatPositions[index] || TABLE_POSITIONS[index] || TABLE_POSITIONS[0];
  return positionToPercentPoint(position);
}

function positionToPercentPoint(position = {}) {
  const left = parsePercent(position.left);
  const right = parsePercent(position.right);
  const top = parsePercent(position.top);
  const bottom = parsePercent(position.bottom);

  const x = Number.isFinite(left) ? left : Number.isFinite(right) ? 100 - right : 50;
  const y = Number.isFinite(top) ? top : Number.isFinite(bottom) ? 100 - bottom : 50;
  return { x, y };
}

function parsePercent(value) {
  if (typeof value !== 'string' || !value.endsWith('%')) {
    return Number.NaN;
  }
  return Number(value.slice(0, -1));
}

function playerStatusIcon(player) {
  if (player.status === 'packed') {
    return 'do_not_disturb_on';
  }
  if (player.status === 'waiting') {
    return 'hourglass_top';
  }
  if (player.status === 'winner') {
    return 'emoji_events';
  }
  if (!player.connected) {
    return 'wifi_off';
  }
  return '';
}

async function copyInvite(roomId) {
  const inviteUrl = `${window.location.origin}${window.location.pathname}#/?join=${roomId}`;

  try {
    await navigator.clipboard.writeText(inviteUrl);
    return true;
  } catch {
    try {
      const tempInput = document.createElement('textarea');
      tempInput.value = inviteUrl;
      tempInput.setAttribute('readonly', '');
      tempInput.style.position = 'absolute';
      tempInput.style.left = '-9999px';
      document.body.appendChild(tempInput);
      tempInput.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(tempInput);
      if (copied) {
        return true;
      }
    } catch {
      // Fall through to prompt below.
    }

    window.prompt('Copy invite link', inviteUrl);
    return false;
  }
}

export default Table;
