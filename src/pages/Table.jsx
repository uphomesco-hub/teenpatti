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
  { top: '8%', left: '18%' },
  { top: '8%', right: '18%' },
  { top: '30%', left: '10%' },
  { top: '30%', right: '10%' },
  { bottom: '28%', left: '10%' },
  { bottom: '28%', right: '10%' },
  { bottom: '12%', left: '20%' },
  { bottom: '12%', right: '20%' },
  { top: '50%', left: '10%' },
  { top: '50%', right: '10%' },
];

const TABLE_LAYOUTS = {
  1: [{ top: '18%', left: '18%' }],
  2: [
    { top: '8%', left: '18%' },
    { top: '8%', right: '18%' },
  ],
  3: [
    { top: '8%', left: '18%' },
    { top: '8%', right: '18%' },
    { top: '30%', left: '10%' },
  ],
  4: [
    { top: '8%', left: '18%' },
    { top: '8%', right: '18%' },
    { top: '30%', left: '10%' },
    { top: '30%', right: '10%' },
  ],
  5: [
    { top: '8%', left: '18%' },
    { top: '8%', right: '18%' },
    { top: '28%', left: '10%' },
    { top: '28%', right: '10%' },
    { bottom: '22%', left: '10%' },
  ],
  6: [
    { top: '8%', left: '18%' },
    { top: '8%', right: '18%' },
    { top: '26%', left: '10%' },
    { top: '26%', right: '10%' },
    { bottom: '22%', left: '10%' },
    { bottom: '22%', right: '10%' },
  ],
  7: [
    { top: '8%', left: '18%' },
    { top: '8%', right: '18%' },
    { top: '22%', left: '10%' },
    { top: '22%', right: '10%' },
    { top: '38%', left: '10%' },
    { top: '38%', right: '10%' },
    { bottom: '12%', left: '18%' },
  ],
  8: [
    { top: '8%', left: '18%' },
    { top: '8%', right: '18%' },
    { top: '21%', left: '10%' },
    { top: '21%', right: '10%' },
    { top: '35%', left: '10%' },
    { top: '35%', right: '10%' },
    { bottom: '12%', left: '18%' },
    { bottom: '12%', right: '18%' },
  ],
  9: [
    { top: '8%', left: '18%' },
    { top: '8%', right: '18%' },
    { top: '19%', left: '10%' },
    { top: '19%', right: '10%' },
    { top: '31%', left: '10%' },
    { top: '31%', right: '10%' },
    { bottom: '22%', left: '10%' },
    { bottom: '22%', right: '10%' },
    { bottom: '10%', left: '50%', transform: 'translateX(-50%)' },
  ],
  10: [
    { top: '8%', left: '18%' },
    { top: '8%', right: '18%' },
    { top: '18%', left: '10%' },
    { top: '18%', right: '10%' },
    { top: '30%', left: '10%' },
    { top: '30%', right: '10%' },
    { bottom: '24%', left: '10%' },
    { bottom: '24%', right: '10%' },
    { bottom: '12%', left: '18%' },
    { bottom: '12%', right: '18%' },
  ],
};

const MOBILE_TABLE_POSITIONS = [
  { top: '18%', left: '3%' },
  { top: '18%', right: '3%' },
  { top: '32%', left: '1%' },
  { top: '32%', right: '1%' },
  { top: '46%', left: '1%' },
  { top: '46%', right: '1%' },
  { bottom: '28%', left: '4%' },
  { bottom: '28%', right: '4%' },
  { bottom: '14%', left: '10%' },
  { bottom: '14%', right: '10%' },
];

const MOBILE_TABLE_LAYOUTS = {
  1: [{ top: '18%', left: '3%' }],
  2: [
    { top: '18%', left: '3%' },
    { top: '18%', right: '3%' },
  ],
  3: [
    { top: '18%', left: '3%' },
    { top: '18%', right: '3%' },
    { top: '32%', left: '1%' },
  ],
  4: [
    { top: '18%', left: '3%' },
    { top: '18%', right: '3%' },
    { top: '32%', left: '1%' },
    { top: '32%', right: '1%' },
  ],
  5: [
    { top: '18%', left: '3%' },
    { top: '18%', right: '3%' },
    { top: '30%', left: '1%' },
    { top: '30%', right: '1%' },
    { top: '44%', left: '1%' },
  ],
  6: [
    { top: '18%', left: '3%' },
    { top: '18%', right: '3%' },
    { top: '30%', left: '1%' },
    { top: '30%', right: '1%' },
    { top: '44%', left: '1%' },
    { top: '44%', right: '1%' },
  ],
  7: [
    { top: '16%', left: '3%' },
    { top: '16%', right: '3%' },
    { top: '27%', left: '1%' },
    { top: '27%', right: '1%' },
    { top: '39%', left: '1%' },
    { top: '39%', right: '1%' },
    { bottom: '28%', left: '4%' },
  ],
  8: [
    { top: '16%', left: '3%' },
    { top: '16%', right: '3%' },
    { top: '27%', left: '1%' },
    { top: '27%', right: '1%' },
    { top: '39%', left: '1%' },
    { top: '39%', right: '1%' },
    { bottom: '28%', left: '4%' },
    { bottom: '28%', right: '4%' },
  ],
  9: [
    { top: '14%', left: '3%' },
    { top: '14%', right: '3%' },
    { top: '24%', left: '1%' },
    { top: '24%', right: '1%' },
    { top: '34%', left: '1%' },
    { top: '34%', right: '1%' },
    { bottom: '32%', left: '2%' },
    { bottom: '32%', right: '2%' },
    { bottom: '16%', left: '10%' },
  ],
  10: [
    { top: '14%', left: '3%' },
    { top: '14%', right: '3%' },
    { top: '24%', left: '1%' },
    { top: '24%', right: '1%' },
    { top: '34%', left: '1%' },
    { top: '34%', right: '1%' },
    { bottom: '32%', left: '2%' },
    { bottom: '32%', right: '2%' },
    { bottom: '16%', left: '10%' },
    { bottom: '16%', right: '10%' },
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

    socket.on('room_state', handleRoomState);
    socket.on('room_joined', handleJoinLike);
    socket.on('room_reconnected', handleJoinLike);
    socket.on('game_error', handleError);
    socket.on('connect_error', handleError);

    return () => {
      socket.off('room_state', handleRoomState);
      socket.off('room_joined', handleJoinLike);
      socket.off('room_reconnected', handleJoinLike);
      socket.off('game_error', handleError);
      socket.off('connect_error', handleError);
    };
  }, [normalizedRoomId, playerToken]);

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

  const players = roomState?.players || [];
  const me = players.find((player) => player.id === roomState?.you?.playerId) || null;
  const activeTurnPlayer = players.find((player) => player.id === roomState?.round?.actionPlayerId) || null;
  const winnerPlayer = players.find((player) => player.id === roomState?.winnerId) || null;
  const otherPlayers = players.filter((player) => player.id !== me?.id);
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
          configDraft={configDraft}
          presets={presets}
          chipDrafts={chipDrafts}
          currentPreset={currentPreset}
          onSetConfigDraft={setConfigDraft}
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
          onSetConfigDraft={setConfigDraft}
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
  configDraft,
  presets,
  chipDrafts,
  onSetConfigDraft,
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
                    onChange={(event) =>
                      onSetConfigDraft(normalizeConfig({ ...configDraft, startingChips: Number(event.target.value) }))
                    }
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

              <div className="rules-summary-card">
                <div className="rules-summary-kicker">Current table shape</div>
                {renderVariationSummary(configDraft)}
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
            {roomState.players.map((player) => (
              <div key={player.id} className={`guest-row ${player.id === roomState.hostPlayerId ? 'guest-row-host' : ''}`}>
                <div className="guest-avatar">{initialsFor(player.name)}</div>
                <div className="guest-copy">
                  <div className="guest-name">
                    {player.name}
                    {player.id === roomState.hostPlayerId ? <span>(Host)</span> : null}
                  </div>
                  <div className="guest-meta">{player.connected ? 'Connected' : 'Disconnected'} • {player.chips} chips</div>
                </div>
                {canEdit ? (
                  <div className="guest-stack-editor">
                    <input
                      className="lounge-input compact-input"
                      type="number"
                      value={chipDrafts[player.id] || ''}
                      onChange={(event) => onChangeChipDraft(player.id, event.target.value)}
                    />
                    <button className="lounge-cta lounge-cta-ghost" onClick={() => onUpdatePlayerStack(player.id)}>
                      Set
                    </button>
                  </div>
                ) : (
                  <div className="guest-chip">{player.chips}</div>
                )}
              </div>
            ))}
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
  onSetConfigDraft,
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
  const crowdedTable = otherPlayers.length >= 5;
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
  const [sideShowNow, setSideShowNow] = useState(0);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [showLogPanel, setShowLogPanel] = useState(false);
  const [raiseDraft, setRaiseDraft] = useState({ key: '', value: '' });
  const raiseControlKey = `${roomState.round?.number || 0}:${roomState.round?.currentStake || 0}:${actions.minRaiseAmount || 0}:${actions.maxRaiseAmount || 0}:${me?.hasSeenCards ? 'seen' : 'blind'}`;
  const raiseInputValue = raiseDraft.key === raiseControlKey
    ? raiseDraft.value
    : String(actions.raiseAmount || actions.minRaiseAmount || '');
  const parsedRaiseAmount = Number(raiseInputValue);
  const isRaiseAmountValid =
    Boolean(String(raiseInputValue).trim()) &&
    Number.isInteger(parsedRaiseAmount) &&
    parsedRaiseAmount >= (actions.minRaiseAmount || 0) &&
    parsedRaiseAmount <= (actions.maxRaiseAmount || 0) &&
    parsedRaiseAmount % (actions.raiseStep || 1) === 0;
  const sideShowCountdown =
    sideShowReveal?.visibleToYou && sideShowReveal?.endsAt
      ? Math.max(
          0,
          Math.ceil((sideShowReveal.endsAt - (sideShowNow || sideShowReveal.endsAt - 10_000)) / 1000),
        )
      : 0;

  useEffect(() => {
    if (!sideShowReveal?.visibleToYou || !sideShowReveal?.endsAt) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setSideShowNow(Date.now());
    }, 250);
    return () => window.clearInterval(intervalId);
  }, [sideShowReveal?.endsAt, sideShowReveal?.visibleToYou]);

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
  const canUseFooterActions = canAct || actions.canLook || actions.canDiscard;

  return (
    <main className="game-main game-main-full">
      <section className={`game-table-shell ${crowdedTable ? 'game-table-shell-crowded' : ''}`}>
        <div className="game-table-glow" />
        <div className="game-table-oval" />

        <div className="game-side-dock">
          <button
            className={`dock-toggle ${showInfoPanel ? 'dock-toggle-active' : ''}`}
            onClick={() => setShowInfoPanel((current) => !current)}
          >
            Info
          </button>
          <button
            className={`dock-toggle ${showLogPanel ? 'dock-toggle-active' : ''}`}
            onClick={() => setShowLogPanel((current) => !current)}
          >
            Log
          </button>
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

            {canStartNextRound ? (
              <button className="lounge-cta lounge-cta-primary rail-next-button" onClick={onStartRound}>
                Start Next Round
              </button>
            ) : null}

            {error ? <div className="lounge-error">{error}</div> : null}
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
            className={`table-seat ${isTopCenterSeat(seatPositions[index]) ? 'table-seat-top' : ''} ${crowdedTable ? 'table-seat-compact' : ''} ${player.id === activeTurnPlayer?.id ? 'table-seat-active' : ''} ${player.status === 'packed' ? 'table-seat-folded' : ''}`}
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
            <div className="table-seat-cards">
              {Array.from({ length: Math.min(player.handCount || 0, 3) }, (_, cardIndex) => (
                <span key={`${player.id}-card-${cardIndex}`} className="table-seat-cardback" />
              ))}
            </div>
            {labelForPlayerState(player) ? <div className="table-seat-state">{labelForPlayerState(player)}</div> : null}
            {player.id === activeTurnPlayer?.id ? <div className="table-seat-turn-indicator">Turn</div> : null}
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
                    style={{ transform: `translateY(${index % 2 === 1 ? '-10px' : '0'}) rotate(${(index - 1.5) * 5}deg)` }}
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
                    style={{ transform: `translateY(${index % 2 === 1 ? '-10px' : '0'}) rotate(${(index - 1.5) * 5}deg)` }}
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
              <div className="hero-seat-stack">{formatExactChips(me?.chips)}</div>
              <div className="hand-status-chip">{me?.hasSeenCards ? 'Seen' : 'Blind'}</div>
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
          </div>

          {parsedEvent?.playerId === me?.id ? (
            <div className={`seat-action-token seat-action-token-hero ${parsedEvent.amount ? 'seat-action-token-money' : ''}`}>
              {parsedEvent.tokenText}
            </div>
          ) : null}
        </div>

        {winnerPlayer ? (
          <>
            <div className="winner-toast">
              {winnerDisplayName} won {formatChips(roomState.round?.pot)} with {winnerPlayer.handLabel || 'the best hand'}. Bank {formatExactChips(winnerPlayer.chips)}.
            </div>
            <div className="winner-showcase">
              <div className="winner-showcase-kicker">Winning Hand</div>
              <div className="winner-showcase-title">
                {winnerDisplayName} won {formatChips(roomState.round?.pot)}
              </div>
              <div className="winner-showcase-copy">
                {winnerPlayer.handLabel || 'Winning hand revealed'} • Bank {formatExactChips(winnerPlayer.chips)}
              </div>
              <div className="winner-showcase-cards">
                {(winnerPlayer.cards || []).map((card, index) => (
                  <div
                    key={card.id}
                    className="winner-card"
                    style={{ animationDelay: `${index * 90}ms` }}
                  >
                    <span className={`winner-card-corner ${isRedSuit(card.suitSymbol) ? 'winner-card-corner-red' : ''}`}>{card.label}</span>
                    <span className={`winner-card-rank ${isRedSuit(card.suitSymbol) ? 'winner-card-rank-red' : ''}`}>{card.label}</span>
                  </div>
                ))}
              </div>
              {canStartNextRound ? (
                <>
                  <div className="next-round-config">
                    <div className="next-round-config-head">
                      <div className="winner-showcase-kicker">Next Round Setup</div>
                      <div className="next-round-config-copy">Host can change the variation before starting the next hand.</div>
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
                  </div>

                  <div className="winner-showcase-actions">
                    <button className="lounge-cta lounge-cta-secondary" onClick={onSaveRules}>
                      Save Rules
                    </button>
                    <button className="lounge-cta lounge-cta-primary" onClick={onStartRound}>
                      Start Next Round
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </>
        ) : null}

        {sideShowReveal?.visibleToYou ? (
          <div className="side-show-reveal">
            <div className="side-show-reveal-kicker">Side Show</div>
            <div className="side-show-reveal-title">
              {sideShowReveal.winnerName} wins the comparison
            </div>
            <div className="side-show-reveal-copy">
              Showing both hands for {sideShowCountdown}s before {sideShowReveal.loserName} packs.
            </div>

            <div className="side-show-reveal-grid">
              <div className={`side-show-seat ${sideShowReveal.winnerId === sideShowReveal.requestorId ? 'side-show-seat-winner' : ''}`}>
                <div className="side-show-seat-name">{sideShowReveal.requestorName}</div>
                <div className="side-show-seat-hand">{sideShowReveal.requestorHandLabel}</div>
                <div className="side-show-seat-cards">
                  {sideShowReveal.requestorCards.map((card, index) => (
                    <div key={card.id} className="winner-card" style={{ animationDelay: `${index * 80}ms` }}>
                      <span className={`winner-card-corner ${isRedSuit(card.suitSymbol) ? 'winner-card-corner-red' : ''}`}>{card.label}</span>
                      <span className={`winner-card-rank ${isRedSuit(card.suitSymbol) ? 'winner-card-rank-red' : ''}`}>{card.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`side-show-seat ${sideShowReveal.winnerId === sideShowReveal.targetId ? 'side-show-seat-winner' : ''}`}>
                <div className="side-show-seat-name">{sideShowReveal.targetName}</div>
                <div className="side-show-seat-hand">{sideShowReveal.targetHandLabel}</div>
                <div className="side-show-seat-cards">
                  {sideShowReveal.targetCards.map((card, index) => (
                    <div key={card.id} className="winner-card" style={{ animationDelay: `${index * 80}ms` }}>
                      <span className={`winner-card-corner ${isRedSuit(card.suitSymbol) ? 'winner-card-corner-red' : ''}`}>{card.label}</span>
                      <span className={`winner-card-rank ${isRedSuit(card.suitSymbol) ? 'winner-card-rank-red' : ''}`}>{card.label}</span>
                    </div>
                  ))}
                </div>
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
          ) : canStartNextRound ? (
            <button className="control-btn control-btn-gold" onClick={onStartRound}>
              Start Next Round
            </button>
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

function getSeatPositions(count, isCompactMobile = false) {
  if (isCompactMobile) {
    return MOBILE_TABLE_LAYOUTS[count] || MOBILE_TABLE_POSITIONS;
  }
  return TABLE_LAYOUTS[count] || TABLE_POSITIONS;
}

function isTopCenterSeat(position) {
  return Boolean(position?.top) && !position?.bottom && (position?.left === '18%' || position?.right === '18%');
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
