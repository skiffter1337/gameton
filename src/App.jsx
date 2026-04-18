import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getArena, getLogs, sendCommand, SERVERS } from './api.js';
import { ArenaCanvas } from './ArenaCanvas.jsx';
import { coordKey, isBoostCell } from './arenaMath.js';

const DEFAULT_TOKEN = import.meta.env.VITE_DEFAULT_TOKEN ?? '';
const DEFAULT_REFRESH_SECONDS = 1;
const MIN_REFRESH_SECONDS = 0.5;
const MAX_REFRESH_SECONDS = 60;

const UPGRADE_LABELS = {
  repair_power: 'Repair + build',
  max_hp: 'Max HP',
  settlement_limit: 'Plant limit',
  signal_range: 'Signal range',
  vision_range: 'Vision range',
  decay_mitigation: 'Decay shield',
  earthquake_mitigation: 'Quake shield',
  beaver_damage_mitigation: 'Beaver shield',
};

function readStorage(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows can block localStorage. The app still works for the session.
  }
}

function normalizeRefreshSeconds(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return DEFAULT_REFRESH_SECONDS;
  }

  const clamped = Math.min(MAX_REFRESH_SECONDS, Math.max(MIN_REFRESH_SECONDS, numeric));
  return Math.round(clamped * 10) / 10;
}

function readRefreshSeconds() {
  return normalizeRefreshSeconds(readStorage('datsol.refreshSeconds', String(DEFAULT_REFRESH_SECONDS)));
}

function refreshMs(seconds) {
  return Math.round(normalizeRefreshSeconds(seconds) * 1000);
}

function formatCoord(position) {
  return Array.isArray(position) ? `[${position[0]}, ${position[1]}]` : '-';
}

function formatTime(date) {
  return date
    ? new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(date)
    : '-';
}

function safePercent(value, max = 50) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, (value / max) * 100));
}

function selectCellDetails(arena, position) {
  if (!arena || !position) {
    return null;
  }

  const key = coordKey(position);
  const own = arena.plantations?.find((item) => coordKey(item.position) === key);
  const enemy = arena.enemy?.find((item) => coordKey(item.position) === key);
  const cell = arena.cells?.find((item) => coordKey(item.position) === key);
  const construction = arena.construction?.find((item) => coordKey(item.position) === key);
  const beaver = arena.beavers?.find((item) => coordKey(item.position) === key);
  const mountain = arena.mountains?.some((item) => coordKey(item) === key);

  return {
    position,
    own,
    enemy,
    cell,
    construction,
    beaver,
    mountain,
    boosted: isBoostCell(position),
  };
}

function buildStats(arena, logs) {
  const terraformed = arena?.cells?.reduce(
    (sum, cell) => sum + (Number(cell.terraformationProgress) || 0),
    0,
  );
  const hp = arena?.plantations?.reduce((sum, item) => sum + (Number(item.hp) || 0), 0);
  const deathCount = logs?.filter((log) => /Death penalty applied/i.test(log.message)).length ?? 0;
  const earthquakeForecast = arena?.meteoForecasts?.find((item) => item.kind === 'earthquake');
  const storm = arena?.meteoForecasts?.find((item) => item.kind === 'sandstorm');

  return {
    plants: arena?.plantations?.length ?? 0,
    enemies: arena?.enemy?.length ?? 0,
    beavers: arena?.beavers?.length ?? 0,
    construction: arena?.construction?.length ?? 0,
    mountains: arena?.mountains?.length ?? 0,
    terraformed: Math.round(terraformed ?? 0),
    hp,
    deathCount,
    earthquakeForecast,
    storm,
  };
}

export default function App() {
  const [serverKey, setServerKey] = useState(() => readStorage('datsol.server', 'test'));
  const [token, setToken] = useState(() => readStorage('datsol.token', DEFAULT_TOKEN));
  const [refreshSeconds, setRefreshSeconds] = useState(readRefreshSeconds);
  const [arena, setArena] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState('');
  const [commandResult, setCommandResult] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [hoverCell, setHoverCell] = useState(null);
  const [plannerMode, setPlannerMode] = useState('inspect');
  const [draftPath, setDraftPath] = useState([]);
  const [cameraSignal, setCameraSignal] = useState(0);
  const requestCounter = useRef(0);

  const stats = useMemo(() => buildStats(arena, logs), [arena, logs]);
  const selectedDetails = useMemo(
    () => selectCellDetails(arena, selectedCell),
    [arena, selectedCell],
  );
  const mainPlantation = arena?.plantations?.find((item) => item.isMain);
  const tokenReady = token.trim().length > 0;
  const pollMs = useMemo(() => refreshMs(refreshSeconds), [refreshSeconds]);

  const loadArena = useCallback(
    async (signal) => {
      if (!tokenReady) {
        setError('Enter a token to sync the arena.');
        return;
      }

      const id = requestCounter.current + 1;
      requestCounter.current = id;
      setLoading(true);

      try {
        const [arenaPayload, logsPayload] = await Promise.allSettled([
          getArena(serverKey, token.trim(), signal),
          getLogs(serverKey, token.trim(), signal),
        ]);

        if (requestCounter.current !== id) {
          return;
        }

        if (arenaPayload.status === 'rejected') {
          throw arenaPayload.reason;
        }

        setArena(arenaPayload.value);
        setLastUpdated(new Date());
        setError('');

        if (logsPayload.status === 'fulfilled' && Array.isArray(logsPayload.value)) {
          setLogs(logsPayload.value.slice(-80).reverse());
        }
      } catch (caught) {
        if (caught?.name !== 'AbortError') {
          setError(caught?.message ?? 'Arena sync failed.');
        }
      } finally {
        if (requestCounter.current === id) {
          setLoading(false);
        }
      }
    },
    [serverKey, token, tokenReady],
  );

  useEffect(() => {
    writeStorage('datsol.server', serverKey);
  }, [serverKey]);

  useEffect(() => {
    writeStorage('datsol.token', token);
  }, [token]);

  useEffect(() => {
    writeStorage('datsol.refreshSeconds', String(refreshSeconds));
  }, [refreshSeconds]);

  useEffect(() => {
    if (paused) {
      return undefined;
    }

    const controller = new AbortController();
    loadArena(controller.signal);
    const timer = window.setInterval(() => loadArena(controller.signal), pollMs);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [loadArena, paused, pollMs]);

  const onCanvasCellClick = useCallback(
    (position) => {
      setSelectedCell(position);

      if (plannerMode === 'inspect') {
        return;
      }

      const maxPoints = plannerMode === 'relocate' ? 2 : 3;
      setDraftPath((current) => [...current, position].slice(0, maxPoints));
    },
    [plannerMode],
  );

  const setPlanner = (mode) => {
    setPlannerMode(mode);
    setDraftPath([]);
    setCommandResult(null);
  };

  const quickMainPath = () => {
    if (!mainPlantation) {
      return;
    }

    setPlannerMode('command');
    setDraftPath([mainPlantation.position, mainPlantation.position]);
  };

  const submitDraft = async () => {
    const expected = plannerMode === 'relocate' ? 2 : 3;

    if (draftPath.length !== expected) {
      setCommandResult({
        type: 'error',
        text: `Pick ${expected} coordinates.`,
      });
      return;
    }

    const body =
      plannerMode === 'relocate'
        ? { relocateMain: draftPath }
        : { command: [{ path: draftPath }] };

    try {
      const result = await sendCommand(serverKey, token.trim(), body);
      const errors = result?.errors ?? [];
      setCommandResult({
        type: errors.length ? 'warn' : 'ok',
        text: errors.length ? errors.join('; ') : 'Command accepted.',
      });
      setDraftPath([]);
      await loadArena();
    } catch (caught) {
      setCommandResult({
        type: 'error',
        text: caught?.message ?? 'Command failed.',
      });
    }
  };

  const submitUpgrade = async (name) => {
    try {
      const result = await sendCommand(serverKey, token.trim(), { plantationUpgrade: name });
      const errors = result?.errors ?? [];
      setCommandResult({
        type: errors.length ? 'warn' : 'ok',
        text: errors.length
          ? errors.join('; ')
          : `Upgrade ${UPGRADE_LABELS[name] ?? name} sent.`,
      });
      await loadArena();
    } catch (caught) {
      setCommandResult({
        type: 'error',
        text: caught?.message ?? 'Upgrade failed.',
      });
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">DS</div>
          <div>
            <h1>DatsSol Control</h1>
            <p>Live oasis network, storms, beavers and commands</p>
          </div>
        </div>

        <div className="status-strip" aria-live="polite">
          <div>
            <span>Turn</span>
            <strong>{arena?.turnNo ?? '-'}</strong>
          </div>
          <div>
            <span>Next</span>
            <strong>{arena?.nextTurnIn?.toFixed?.(2) ?? '-'}s</strong>
          </div>
          <div>
            <span>Updated</span>
            <strong>{formatTime(lastUpdated)}</strong>
          </div>
          <div className={loading ? 'pulse-dot is-live' : 'pulse-dot'}>
            {paused ? 'Paused' : loading ? 'Sync' : 'Live'}
          </div>
        </div>
      </header>

      <section className="control-band">
        <label>
          <span>Server</span>
          <select value={serverKey} onChange={(event) => setServerKey(event.target.value)}>
            {Object.values(SERVERS).map((server) => (
              <option key={server.key} value={server.key}>
                {server.label} · {server.origin.replace('https://', '')}
              </option>
            ))}
          </select>
        </label>

        <label className="token-field">
          <span>Token</span>
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="X-Auth-Token"
            spellCheck="false"
          />
        </label>

        <label className="refresh-field">
          <span>Sync, sec</span>
          <input
            type="number"
            min={MIN_REFRESH_SECONDS}
            max={MAX_REFRESH_SECONDS}
            step="0.5"
            value={refreshSeconds}
            onChange={(event) => setRefreshSeconds(normalizeRefreshSeconds(event.target.value))}
            aria-label="Arena and logs refresh interval in seconds"
          />
        </label>

        <button type="button" onClick={() => loadArena()}>
          Refresh
        </button>
        <button type="button" className="secondary" onClick={() => setPaused((value) => !value)}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setCameraSignal((value) => value + 1)}
        >
          Center
        </button>
      </section>

      {error && <div className="alert danger">ALERT {error}</div>}

      <section className="dashboard">
        <aside className="side-panel">
          <div className="panel-block">
            <h2>Network</h2>
            <div className="metric-grid">
              <Metric label="Plants" value={stats.plants} />
              <Metric label="Builds" value={stats.construction} />
              <Metric label="Enemies" value={stats.enemies} />
              <Metric label="Beavers" value={stats.beavers} />
              <Metric label="Mountains" value={stats.mountains} />
              <Metric label="HQ losses" value={stats.deathCount} />
            </div>
          </div>

          <div className="panel-block">
            <h2>HQ</h2>
            {mainPlantation ? (
              <div className="main-base">
                <div className="hp-ring" style={{ '--hp': `${safePercent(mainPlantation.hp)}%` }}>
                  HQ
                </div>
                <div>
                  <strong>{formatCoord(mainPlantation.position)}</strong>
                  <span>{mainPlantation.hp} HP · AR {arena?.actionRange ?? '-'}</span>
                  <span>Immune until turn {mainPlantation.immunityUntilTurn ?? '-'}</span>
                </div>
              </div>
            ) : (
              <p className="muted">HQ is not visible yet.</p>
            )}
          </div>

          <div className="panel-block">
            <h2>Weather</h2>
            <WeatherLine storm={stats.storm} earthquake={stats.earthquakeForecast} />
          </div>
        </aside>

        <section className="map-stage">
          <ArenaCanvas
            arena={arena}
            selectedCell={selectedCell}
            hoverCell={hoverCell}
            draftPath={draftPath}
            cameraSignal={cameraSignal}
            onCellClick={onCanvasCellClick}
            onHoverCell={setHoverCell}
          />

          <div className="map-overlay top-left">
            <span>XY Plane</span>
            <strong>{arena?.size ? `${arena.size[0]} x ${arena.size[1]}` : '-'}</strong>
          </div>
          <div className="map-overlay top-right">
            <span>Navigation</span>
            <strong>wheel · drag · click</strong>
          </div>
          <div className="map-key-overlay" aria-label="Map key">
            <div><span className="key-badge hq">HQ</span>control</div>
            <div><span className="key-badge plant">PL</span>plant</div>
            <div><span className="key-badge build">BLD</span>build</div>
            <div><span className="key-badge enemy">EN</span>enemy</div>
            <div><span className="key-badge beaver">BEV</span>beaver</div>
            <div><span className="key-badge mountain">MT</span>mountain</div>
            <div><span className="key-badge storm">STORM</span>storm</div>
          </div>
          <div className="map-overlay bottom-left">
            <span>Cursor</span>
            <strong>{formatCoord(hoverCell)}</strong>
          </div>
        </section>

        <aside className="side-panel">
          <div className="panel-block">
            <h2>Cell</h2>
            <CellInspector details={selectedDetails} />
          </div>

          <div className="panel-block">
            <h2>Command</h2>
            <div className="planner-tabs">
              <button
                type="button"
                className={plannerMode === 'inspect' ? 'active' : ''}
                onClick={() => setPlanner('inspect')}
              >
                Inspect
              </button>
              <button
                type="button"
                className={plannerMode === 'command' ? 'active' : ''}
                onClick={() => setPlanner('command')}
              >
                Path 3
              </button>
              <button
                type="button"
                className={plannerMode === 'relocate' ? 'active' : ''}
                onClick={() => setPlanner('relocate')}
              >
                HQ
              </button>
            </div>

            <p className="hint">
              {plannerMode === 'command'
                ? 'Pick actor, outlet and target. The server chooses action type.'
                : plannerMode === 'relocate'
                  ? 'Pick old and new HQ positions.'
                  : 'Click the map to inspect a cell.'}
            </p>

            {plannerMode === 'command' && (
              <button type="button" className="wide secondary" onClick={quickMainPath}>
                Use current HQ as actor + outlet
              </button>
            )}

            <ol className="path-list">
              {draftPath.map((position, index) => (
                <li key={`${coordKey(position)}-${index}`}>
                  <span>{index + 1}</span>
                  {formatCoord(position)}
                </li>
              ))}
              {!draftPath.length && <li className="empty-path">Path is empty</li>}
            </ol>

            <div className="button-row">
              <button type="button" onClick={submitDraft} disabled={plannerMode === 'inspect'}>
                Send
              </button>
              <button type="button" className="secondary" onClick={() => setDraftPath([])}>
                Reset
              </button>
            </div>

            {commandResult && (
              <div className={`command-result ${commandResult.type}`}>{commandResult.text}</div>
            )}
          </div>

          <div className="panel-block">
            <h2>Upgrades</h2>
            <div className="upgrade-head">
              <span>Points</span>
              <strong>{arena?.plantationUpgrades?.points ?? 0}</strong>
              <span>next in {arena?.plantationUpgrades?.turnsUntilPoints ?? '-'}</span>
            </div>
            <div className="upgrade-list">
              {arena?.plantationUpgrades?.tiers?.map((tier) => (
                <button
                  type="button"
                  key={tier.name}
                  disabled={!arena?.plantationUpgrades?.points || tier.current >= tier.max}
                  onClick={() => submitUpgrade(tier.name)}
                >
                  <span>{UPGRADE_LABELS[tier.name] ?? tier.name}</span>
                  <strong>
                    {tier.current}/{tier.max}
                  </strong>
                </button>
              )) ?? <p className="muted">Arena data will appear after sync.</p>}
            </div>
          </div>
        </aside>
      </section>

      <section className="lower-grid">
        <div className="panel-block">
          <h2>Events</h2>
          <div className="log-list">
            {logs.length ? (
              logs.map((log, index) => (
                <article key={`${log.time}-${index}`}>
                  <time>{formatTime(new Date(log.time))}</time>
                  <p>{log.message}</p>
                </article>
              ))
            ) : (
              <p className="muted">Logs are empty.</p>
            )}
          </div>
        </div>

        <div className="panel-block legend-panel">
          <h2>Legend</h2>
          <div className="legend-grid">
            <LegendItem icon="HQ" label="Control hub" />
            <LegendItem icon="PL" label="Plantation" />
            <LegendItem icon="BLD" label="Build site" />
            <LegendItem icon="BEV" label="Beaver lair" />
            <LegendItem icon="MT" label="Mountain" />
            <LegendItem icon="ST" label="Sandstorm" />
            <LegendItem icon="EN" label="Enemy" />
            <LegendItem icon="X7" label="Boost cell" />
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function WeatherLine({ storm, earthquake }) {
  if (!storm && !earthquake) {
    return <p className="muted">No visible hazards.</p>;
  }

  return (
    <div className="weather-lines">
      {storm && (
        <div className="weather-line storm">
          <strong>STORM {storm.forming ? 'forming' : 'moving'}</strong>
          <span>
            {formatCoord(storm.position)} → {formatCoord(storm.nextPosition)}
          </span>
          <span>Radius {storm.radius ?? '-'}</span>
        </div>
      )}
      {earthquake && (
        <div className="weather-line quake">
          <strong>QUAKE</strong>
          <span>in {earthquake.turnsUntil ?? 0} turns</span>
        </div>
      )}
    </div>
  );
}

function CellInspector({ details }) {
  if (!details) {
    return <p className="muted">Select a map cell.</p>;
  }

  return (
    <div className="cell-inspector">
      <div className="coord-title">
        <strong>{formatCoord(details.position)}</strong>
        {details.boosted && <span>X7 boost</span>}
      </div>

      {details.own && (
        <InfoLine
          label={details.own.isMain ? 'HQ' : 'Plant'}
          value={`${details.own.hp} HP${details.own.isIsolated ? ' · isolated' : ''}`}
        />
      )}
      {details.enemy && <InfoLine label="Enemy" value={`${details.enemy.hp} HP`} />}
      {details.beaver && <InfoLine label="Beavers" value={`${details.beaver.hp} HP`} />}
      {details.construction && (
        <InfoLine label="Build" value={`${details.construction.progress}/50`} />
      )}
      {details.cell && (
        <InfoLine
          label="Terraform"
          value={`${details.cell.terraformationProgress}% · decay ${details.cell.turnsUntilDegradation}`}
        />
      )}
      {details.mountain && <InfoLine label="Terrain" value="mountain" />}
      {!details.own &&
        !details.enemy &&
        !details.beaver &&
        !details.construction &&
        !details.cell &&
        !details.mountain && <p className="muted">No known objects.</p>}
    </div>
  );
}

function InfoLine({ label, value }) {
  return (
    <div className="info-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LegendItem({ icon, label }) {
  return (
    <div className="legend-item">
      <span>{icon}</span>
      {label}
    </div>
  );
}
