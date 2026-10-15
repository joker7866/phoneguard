import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { signOut, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import {
  CommandType,
  type CommandTypeValue,
  type Device,
  type Geofence,
  type LocationPoint,
} from "../types";
import {
  RANGES,
  pathDistance,
  detectStops,
  formatDistance,
  formatDuration,
  formatTime,
  formatSpeed,
  formatAltitude,
} from "../lib/geo";
import {
  subscribeGeofences,
  addGeofence,
  deleteGeofence,
  isInside,
  requestNotify,
  notify,
} from "../lib/geofences";
import DeviceMap from "./DeviceMap";

type Mode = "live" | "history" | "zones" | "notify" | "report";

function displayName(d: Device): string {
  return d.label?.trim() || d.name || d.model || d.id;
}

export default function Dashboard({ user }: { user: User }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [liveTrack, setLiveTrack] = useState<LocationPoint[]>([]);
  const [history, setHistory] = useState<LocationPoint[]>([]);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [lastCmd, setLastCmd] = useState<{ type: string; status: string; error?: string } | null>(null);
  const [mode, setMode] = useState<Mode>("live");
  const [rangeKey, setRangeKey] = useState<string>("24h");
  const [highlightIdx, setHighlightIdx] = useState<number>(-1);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [, setNow] = useState(Date.now());

  const insideRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    requestNotify();
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Owner's devices (live).
  useEffect(() => {
    const q = query(collection(db, "devices"), where("ownerUid", "==", user.uid));
    return onSnapshot(
      q,
      (snap) => {
        setDevices(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Device));
        setSelectedId((cur) => cur ?? snap.docs[0]?.id ?? null);
        setError(null);
      },
      (err) => setError(`Devices: ${err.message}`)
    );
  }, [user.uid]);

  // Live recent track.
  useEffect(() => {
    if (!selectedId || mode !== "live") {
      setLiveTrack([]);
      return;
    }
    const q = query(
      collection(db, "devices", selectedId, "locations"),
      orderBy("timestamp", "desc"),
      limit(50)
    );
    return onSnapshot(
      q,
      (snap) => setLiveTrack(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LocationPoint).reverse()),
      (err) => setError(`Location: ${err.message}`)
    );
  }, [selectedId, mode]);

  // History for the chosen range.
  useEffect(() => {
    if (!selectedId || mode !== "history") {
      setHistory([]);
      return;
    }
    const windowMs = RANGES.find((r) => r.key === rangeKey)?.ms ?? RANGES[2].ms;
    const since = Date.now() - windowMs;
    const q = query(
      collection(db, "devices", selectedId, "locations"),
      where("timestamp", ">=", since),
      orderBy("timestamp", "asc"),
      limit(2000)
    );
    setHighlightIdx(-1);
    return onSnapshot(
      q,
      (snap) => setHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LocationPoint)),
      (err) => setError(`History: ${err.message}`)
    );
  }, [selectedId, mode, rangeKey]);

  // Geofences for the selected device.
  useEffect(() => {
    if (!selectedId) {
      setGeofences([]);
      return;
    }
    insideRef.current = {};
    return subscribeGeofences(selectedId, setGeofences, (e) => setError(`Zones: ${e.message}`));
  }, [selectedId]);

  // Most recent command's live status (pending -> done/failed) for feedback.
  useEffect(() => {
    if (!selectedId) {
      setLastCmd(null);
      return;
    }
    const q = query(
      collection(db, "devices", selectedId, "commands"),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    return onSnapshot(
      q,
      (snap) => {
        const d = snap.docs[0];
        setLastCmd(d ? (d.data() as { type: string; status: string; error?: string }) : null);
      },
      () => {}
    );
  }, [selectedId]);

  const selected = useMemo(
    () => devices.find((d) => d.id === selectedId) ?? null,
    [devices, selectedId]
  );

  // Geofence monitoring: alert on enter/exit as the live position changes.
  useEffect(() => {
    if (!selected || typeof selected.lat !== "number" || typeof selected.lng !== "number") return;
    for (const z of geofences) {
      const now = isInside(z, selected.lat, selected.lng);
      const prev = insideRef.current[z.id];
      if (prev !== undefined && prev !== now) {
        const msg = `${selected.name ?? "Device"} ${now ? "entered" : "left"} "${z.name}" at ${formatTime(Date.now())}`;
        setAlerts((a) => [msg, ...a].slice(0, 6));
        notify("PhoneGuard geofence", msg);
      }
      insideRef.current[z.id] = now;
    }
  }, [selected, geofences]);

  const stops = useMemo(() => (mode === "history" ? detectStops(history) : []), [history, mode]);
  const highlight = mode === "history" && highlightIdx >= 0 ? history[highlightIdx] ?? null : null;

  async function run(type: CommandTypeValue) {
    if (!selected) return;
    setSending(type);
    setStatus(null);
    try {
      await addDoc(collection(db, "devices", selected.id, "commands"), {
        type,
        status: "pending",
        issuedBy: user.uid,
        createdAt: serverTimestamp(),
      });
      setStatus(`Sent "${labelFor(type)}" — waiting for the phone to run it.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Command failed.");
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <img src="/favicon.svg" className="logo-sm" alt="" width={26} height={26} />
          PhoneGuard
        </span>
        <div className="spacer" />
        <span className="muted">{user.email}</span>
        <button className="link" onClick={() => signOut(auth)}>Sign out</button>
      </header>

      {error && <div className="banner error">{error}</div>}
      {alerts.map((a, i) => (
        <div key={i} className="banner alert" onClick={() => setAlerts((xs) => xs.filter((_, j) => j !== i))}>
          📍 {a}
        </div>
      ))}

      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-head">
            <h2>Devices</h2>
            {devices.length > 1 && (
              <label className="all-toggle">
                <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                All on map
              </label>
            )}
          </div>
          {devices.length === 0 && (
            <p className="muted">
              No devices yet. Install the app on your phone, sign in with this same
              account, and tap “Start protection”.
            </p>
          )}
          <ul className="device-list">
            {devices.map((d) => (
              <li
                key={d.id}
                className={d.id === selectedId ? "selected" : ""}
                onClick={() => {
                  setSelectedId(d.id);
                  setShowAll(false);
                }}
              >
                <div className="device-name">{displayName(d)}</div>
                <div className="device-meta muted">
                  {d.label ? `${d.model ?? d.name ?? d.id} · ` : ""}
                  {deviceSummary(d)}
                </div>
              </li>
            ))}
          </ul>

          {selected && !showAll && (
            <>
              <LabelEditor device={selected} onError={setError} />

              <div className="tabs">
                <button className={mode === "live" ? "tab active" : "tab"} onClick={() => setMode("live")}>Live</button>
                <button className={mode === "history" ? "tab active" : "tab"} onClick={() => setMode("history")}>History</button>
                <button className={mode === "zones" ? "tab active" : "tab"} onClick={() => setMode("zones")}>Zones</button>
                <button className={mode === "notify" ? "tab active" : "tab"} onClick={() => setMode("notify")}>Notify</button>
                <button className={mode === "report" ? "tab active" : "tab"} onClick={() => setMode("report")}>Report</button>
              </div>

              {mode === "live" && (
                <>
                  <DeviceDetail device={selected} />

                  <TrackingToggle
                    tracking={!!selected.tracking}
                    busy={sending === CommandType.START_TRACKING || sending === CommandType.STOP_TRACKING}
                    onStart={() => run(CommandType.START_TRACKING)}
                    onStop={() => run(CommandType.STOP_TRACKING)}
                  />

                  <div className="commands">
                    <h3>Commands</h3>
                    <div className="cmd-grid">
                      <CmdButton label="Locate now" onClick={() => run(CommandType.LOCATE)} busy={sending === CommandType.LOCATE} />
                      <CmdButton label="Ring" onClick={() => run(CommandType.RING)} busy={sending === CommandType.RING} />
                      <CmdButton label="Stop ring" onClick={() => run(CommandType.STOP_RING)} busy={sending === CommandType.STOP_RING} />
                      <CmdButton label="Lock" onClick={() => run(CommandType.LOCK)} busy={sending === CommandType.LOCK} />
                    </div>
                    {status && <div className="status muted">{status}</div>}
                    {lastCmd && (
                      <div className={`cmd-status ${lastCmd.status}`}>
                        Last: {labelFor(lastCmd.type as CommandTypeValue)} —{" "}
                        <strong>{lastCmd.status}</strong>
                        {lastCmd.error ? ` (${lastCmd.error})` : ""}
                      </div>
                    )}
                  </div>
                </>
              )}

              {mode === "history" && (
                <HistoryPanel
                  points={history}
                  stops={stops}
                  rangeKey={rangeKey}
                  setRangeKey={setRangeKey}
                  highlightIdx={highlightIdx}
                  setHighlightIdx={setHighlightIdx}
                />
              )}

              {mode === "zones" && (
                <ZonesPanel device={selected} zones={geofences} onError={setError} />
              )}

              {mode === "notify" && <NotifyPanel deviceId={selected.id} onError={setError} />}

              {mode === "report" && <ReportPanel deviceId={selected.id} onError={setError} />}
            </>
          )}
        </aside>

        <main className="map-pane">
          {selected && mode === "live" && !showAll && (
            <label className="follow-toggle">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
              Follow device
            </label>
          )}
          <DeviceMap
            device={selected}
            track={mode === "history" ? history : liveTrack}
            follow={follow}
            showRoute={!showAll && mode === "history"}
            highlight={highlight}
            allDevices={showAll ? devices : null}
            geofences={!showAll && mode !== "history" ? geofences : []}
            stops={!showAll && mode === "history" ? stops : []}
            onSelectDevice={(id) => {
              setSelectedId(id);
              setShowAll(false);
            }}
          />
        </main>
      </div>
    </div>
  );
}

function HistoryPanel({
  points,
  stops,
  rangeKey,
  setRangeKey,
  highlightIdx,
  setHighlightIdx,
}: {
  points: LocationPoint[];
  stops: { lat: number; lng: number; start: number; end: number; durationMs: number }[];
  rangeKey: string;
  setRangeKey: (k: string) => void;
  highlightIdx: number;
  setHighlightIdx: Dispatch<SetStateAction<number>>;
}) {
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const distance = useMemo(() => pathDistance(points), [points]);
  const duration = points.length > 1 ? points[points.length - 1].timestamp - points[0].timestamp : 0;

  useEffect(() => {
    if (!playing) {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    timer.current = setInterval(() => {
      setHighlightIdx((i: number) => {
        const next = i + 1;
        if (next >= points.length) {
          setPlaying(false);
          return points.length - 1;
        }
        return next;
      });
    }, 500);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, points.length]);

  return (
    <div className="history">
      <label className="field">
        Time range
        <select value={rangeKey} onChange={(e) => setRangeKey(e.target.value)}>
          {RANGES.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
      </label>

      <div className="stats">
        <Stat label="Distance" value={formatDistance(distance)} />
        <Stat label="Duration" value={points.length > 1 ? formatDuration(duration) : "—"} />
        <Stat label="Stops" value={String(stops.length)} />
      </div>

      {points.length > 0 && (
        <div className="playback">
          <button className="cmd" onClick={() => setPlaying((p) => !p)}>
            {playing ? "Pause" : "▶ Play route"}
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0, points.length - 1)}
            value={highlightIdx < 0 ? 0 : highlightIdx}
            onChange={(e) => {
              setPlaying(false);
              setHighlightIdx(Number(e.target.value));
            }}
          />
          <span className="muted">
            {highlightIdx >= 0 && points[highlightIdx] ? formatTime(points[highlightIdx].timestamp) : ""}
          </span>
        </div>
      )}

      {stops.length > 0 && (
        <div className="stops">
          <h3>Stops</h3>
          {stops.map((s, i) => (
            <div key={i} className="stop-item">
              <span>🅟 {formatDuration(s.durationMs)}</span>
              <span className="muted">{formatTime(s.start)}–{formatTime(s.end)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="timeline">
        {points.length === 0 && <p className="muted">No points in this range.</p>}
        {points
          .slice()
          .reverse()
          .map((p, revIdx) => {
            const idx = points.length - 1 - revIdx;
            return (
              <div
                key={p.id}
                className={idx === highlightIdx ? "tl-item active" : "tl-item"}
                onClick={() => setHighlightIdx(idx)}
              >
                <span className="tl-time">{formatTime(p.timestamp)}</span>
                <span className="tl-speed muted">{formatSpeed(p.speed)}</span>
                <a
                  className="tl-coord"
                  href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                </a>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function ZonesPanel({
  device,
  zones,
  onError,
}: {
  device: Device;
  zones: Geofence[];
  onError: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [radius, setRadius] = useState(150);
  const canUseCurrent = typeof device.lat === "number" && typeof device.lng === "number";

  async function add() {
    if (!name.trim() || !canUseCurrent) return;
    try {
      await addGeofence(device.id, {
        name: name.trim(),
        lat: device.lat as number,
        lng: device.lng as number,
        radius,
      });
      setName("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not add zone");
    }
  }

  return (
    <div className="zones">
      <p className="muted">
        A zone alerts you when the phone enters or leaves it (while this dashboard is open).
      </p>
      <label className="field">
        Zone name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Home, School…" />
      </label>
      <label className="field">
        Radius: {radius} m
        <input type="range" min={50} max={1000} step={10} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
      </label>
      <button className="cmd" onClick={add} disabled={!name.trim() || !canUseCurrent}>
        Add zone at current location
      </button>
      {!canUseCurrent && <div className="status muted">Needs a location fix first.</div>}

      <div className="zone-list">
        {zones.length === 0 && <p className="muted">No zones yet.</p>}
        {zones.map((z) => (
          <div key={z.id} className="zone-item">
            <div>
              <div className="device-name">{z.name}</div>
              <div className="muted">{Math.round(z.radius)} m radius</div>
            </div>
            <button className="link" onClick={() => deleteGeofence(device.id, z.id).catch(() => {})}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotifyPanel({ deviceId, onError }: { deviceId: string; onError: (m: string) => void }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<
    { id: string; title?: string; body?: string; createdAt?: number; delivered?: boolean }[]
  >([]);

  useEffect(() => {
    const q = query(
      collection(db, "devices", deviceId, "notifications"),
      orderBy("createdAt", "desc"),
      limit(30)
    );
    return onSnapshot(
      q,
      (snap) => setSent(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }))),
      () => {}
    );
  }, [deviceId]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await addDoc(collection(db, "devices", deviceId, "notifications"), {
        title: "PhoneGuard",
        body: body.trim(),
        createdAt: Date.now(),
        delivered: false,
      });
      setBody("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not send notification");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="notify">
      <p className="muted">Send a message — it pops up on the phone as a notification.</p>
      <label className="field">
        Message
        <textarea
          className="notify-input"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="e.g. Come home for dinner 🍽️"
        />
      </label>
      <button className="track-btn start" onClick={send} disabled={busy || !body.trim()}>
        {busy ? "Sending…" : "Send notification"}
      </button>

      <div className="sent-list">
        {sent.length === 0 && <p className="muted">No messages sent yet.</p>}
        {sent.map((n) => (
          <div key={n.id} className="sent-item">
            <div>{n.body}</div>
            <div className="muted sent-meta">
              {n.createdAt ? formatTime(n.createdAt) : ""} · {n.delivered ? "delivered" : "pending"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LabelEditor({ device, onError }: { device: Device; onError: (m: string) => void }) {
  const [val, setVal] = useState(device.label ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => setVal(device.label ?? ""), [device.id, device.label]);

  const changed = (device.label ?? "").trim() !== val.trim();
  async function save() {
    setBusy(true);
    try {
      await updateDoc(doc(db, "devices", device.id), { label: val.trim() });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save label");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="label-editor">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Label (e.g. Dad's phone)"
      />
      <button className="cmd" onClick={save} disabled={busy || !changed}>Save</button>
    </div>
  );
}

function ReportPanel({ deviceId, onError }: { deviceId: string; onError: (m: string) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [points, setPoints] = useState<LocationPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const start = new Date(`${date}T00:00:00`).getTime();
    const end = start + 24 * 3600 * 1000;
    setLoading(true);
    const q = query(
      collection(db, "devices", deviceId, "locations"),
      where("timestamp", ">=", start),
      where("timestamp", "<", end),
      orderBy("timestamp", "asc"),
      limit(5000)
    );
    getDocs(q)
      .then((snap) => setPoints(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LocationPoint)))
      .catch((e) => onError(e instanceof Error ? e.message : "Report failed"))
      .finally(() => setLoading(false));
  }, [deviceId, date, onError]);

  const distance = pathDistance(points);
  const stops = detectStops(points);
  const total = points.length > 1 ? points[points.length - 1].timestamp - points[0].timestamp : 0;
  const stopped = stops.reduce((a, s) => a + s.durationMs, 0);
  const moving = Math.max(0, total - stopped);
  const batteries = points.map((p) => p.battery).filter((b) => b >= 0);
  const batMin = batteries.length ? Math.min(...batteries) : null;
  const batMax = batteries.length ? Math.max(...batteries) : null;

  return (
    <div className="report">
      <label className="field">
        Day
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </label>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : points.length === 0 ? (
        <p className="muted">No activity recorded on this day.</p>
      ) : (
        <>
          <div className="stats">
            <Stat label="Distance" value={formatDistance(distance)} />
            <Stat label="Moving" value={formatDuration(moving)} />
            <Stat label="Stopped" value={formatDuration(stopped)} />
          </div>
          <div className="stats">
            <Stat label="Stops" value={String(stops.length)} />
            <Stat label="Points" value={String(points.length)} />
            <Stat label="Battery" value={batMin != null ? `${batMin}–${batMax}%` : "—"} />
          </div>
          <div className="detail-grid" style={{ marginTop: 14 }}>
            <dt>First seen</dt>
            <dd>{formatTime(points[0].timestamp)}</dd>
            <dt>Last seen</dt>
            <dd>{formatTime(points[points.length - 1].timestamp)}</dd>
          </div>
          {stops.length > 0 && (
            <div className="stops">
              <h3>Places visited</h3>
              {stops.map((s, i) => (
                <div key={i} className="stop-item">
                  <a
                    href={`https://www.google.com/maps?q=${s.lat},${s.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="tl-coord"
                  >
                    {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                  </a>
                  <span className="muted">{formatDuration(s.durationMs)} · {formatTime(s.start)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label muted">{label}</div>
    </div>
  );
}

function DeviceDetail({ device }: { device: Device }) {
  const hasFix = typeof device.lat === "number" && typeof device.lng === "number";
  return (
    <div className="detail">
      <h3>Status</h3>
      <dl className="detail-grid">
        <dt>Tracking</dt>
        <dd>{device.tracking ? "On" : "Off"}</dd>
        <dt>Battery</dt>
        <dd>{typeof device.battery === "number" && device.battery >= 0 ? `${device.battery}%` : "—"}</dd>
        <dt>Speed</dt>
        <dd>{formatSpeed(device.speed)}</dd>
        <dt>Altitude</dt>
        <dd>{formatAltitude(device.altitude)}</dd>
        <dt>Last seen</dt>
        <dd>{device.lastSeen ? timeAgo(device.lastSeen.toMillis()) : "never"}</dd>
        <dt>Accuracy</dt>
        <dd>{typeof device.accuracy === "number" ? `±${Math.round(device.accuracy)} m` : "—"}</dd>
        <dt>Position</dt>
        <dd>
          {hasFix ? (
            <a href={`https://www.google.com/maps?q=${device.lat},${device.lng}`} target="_blank" rel="noreferrer">
              {device.lat!.toFixed(5)}, {device.lng!.toFixed(5)}
            </a>
          ) : (
            "no fix yet"
          )}
        </dd>
      </dl>
    </div>
  );
}

function TrackingToggle({
  tracking,
  busy,
  onStart,
  onStop,
}: {
  tracking: boolean;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  return tracking ? (
    <button className="track-btn stop" onClick={onStop} disabled={busy}>
      {busy ? "…" : "⏹ Stop tracking"}
    </button>
  ) : (
    <button className="track-btn start" onClick={onStart} disabled={busy}>
      {busy ? "…" : "▶ Start tracking"}
    </button>
  );
}

function CmdButton({ label, onClick, busy }: { label: string; onClick: () => void; busy: boolean }) {
  return (
    <button className="cmd" onClick={onClick} disabled={busy}>
      {busy ? "…" : label}
    </button>
  );
}

function deviceSummary(d: Device): string {
  const parts: string[] = [];
  if (typeof d.battery === "number" && d.battery >= 0) parts.push(`${d.battery}%`);
  parts.push(d.tracking ? "tracking" : "idle");
  if (d.lastSeen) parts.push(timeAgo(d.lastSeen.toMillis()));
  return parts.join(" · ");
}

function labelFor(type: CommandTypeValue): string {
  return type.toLowerCase().replace(/_/g, " ");
}

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
