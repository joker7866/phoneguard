import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import type { Device, Geofence, LocationPoint, Stop } from "../types";
import { formatTime, formatDuration } from "../lib/geo";

const pinIcon = L.icon({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const dot = (color: string, size = 14) =>
  L.divIcon({
    className: "pg-dot",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.5)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
const startIcon = dot("#2e7d32");
const endIcon = dot("#c62828");
const stopIcon = dot("#ef6c00", 16);
const deviceDot = dot("#1565C0", 16);

function MapController({
  lat,
  lng,
  follow,
  selectKey,
  fitPoints,
}: {
  lat: number | null;
  lng: number | null;
  follow: boolean;
  selectKey: string | null;
  fitPoints: [number, number][] | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (fitPoints && fitPoints.length > 0) {
      map.fitBounds(L.latLngBounds(fitPoints), { padding: [40, 40], maxZoom: 17 });
    } else if (lat != null && lng != null) {
      map.setView([lat, lng], 16);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectKey, fitPoints]);
  useEffect(() => {
    if (!fitPoints && follow && lat != null && lng != null) map.panTo([lat, lng]);
  }, [lat, lng, follow, fitPoints, map]);
  return null;
}

export default function DeviceMap({
  device,
  track,
  follow,
  showRoute = false,
  highlight = null,
  allDevices = null,
  geofences = [],
  stops = [],
  onSelectDevice,
}: {
  device: Device | null;
  track: LocationPoint[];
  follow: boolean;
  showRoute?: boolean;
  highlight?: LocationPoint | null;
  allDevices?: Device[] | null;
  geofences?: Geofence[];
  stops?: Stop[];
  onSelectDevice?: (id: string) => void;
}) {
  const hasFix = !!device && typeof device.lat === "number" && typeof device.lng === "number";
  const lat = hasFix ? (device!.lat as number) : null;
  const lng = hasFix ? (device!.lng as number) : null;
  const accuracy = hasFix && typeof device!.accuracy === "number" ? device!.accuracy : null;
  const line = track.map((p) => [p.lat, p.lng] as [number, number]);
  const start = track[0];
  const end = track[track.length - 1];

  const allFixed = (allDevices ?? []).filter(
    (d) => typeof d.lat === "number" && typeof d.lng === "number"
  );
  const fitPoints: [number, number][] | null = allDevices
    ? allFixed.length > 0
      ? allFixed.map((d) => [d.lat as number, d.lng as number])
      : null
    : showRoute && line.length > 0
    ? line
    : null;

  return (
    <div className="map-wrap">
      <MapContainer center={[lat ?? 20, lng ?? 0]} zoom={hasFix ? 16 : 2} className="map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {allDevices ? (
          allFixed.map((d) => (
            <Marker
              key={d.id}
              position={[d.lat as number, d.lng as number]}
              icon={deviceDot}
              eventHandlers={{ click: () => onSelectDevice?.(d.id) }}
            >
              <Popup>
                <strong>{d.label ?? d.name ?? d.model ?? d.id}</strong>
                <br />
                {typeof d.battery === "number" && d.battery >= 0 ? `Battery ${d.battery}%` : ""}
                <br />
                {d.tracking ? "tracking" : "idle"}
              </Popup>
            </Marker>
          ))
        ) : (
          <>
            {line.length > 1 && <Polyline positions={line} color="#1565C0" weight={3} opacity={0.75} />}

            {/* Geofence zones (live mode) */}
            {!showRoute &&
              geofences.map((z) => (
                <Circle
                  key={z.id}
                  center={[z.lat, z.lng]}
                  radius={z.radius}
                  pathOptions={{ color: "#2e7d32", fillColor: "#2e7d32", fillOpacity: 0.08, weight: 1.5 }}
                >
                  <Popup>{z.name} · {Math.round(z.radius)} m</Popup>
                </Circle>
              ))}

            {showRoute ? (
              <>
                {stops.map((s, i) => (
                  <Marker key={`stop-${i}`} position={[s.lat, s.lng]} icon={stopIcon}>
                    <Popup>
                      Stopped {formatDuration(s.durationMs)}
                      <br />
                      {formatTime(s.start)}–{formatTime(s.end)}
                    </Popup>
                  </Marker>
                ))}
                {start && (
                  <Marker position={[start.lat, start.lng]} icon={startIcon}>
                    <Popup>Start · {formatTime(start.timestamp)}</Popup>
                  </Marker>
                )}
                {end && track.length > 1 && (
                  <Marker position={[end.lat, end.lng]} icon={endIcon}>
                    <Popup>End · {formatTime(end.timestamp)}</Popup>
                  </Marker>
                )}
                {highlight && (
                  <Marker position={[highlight.lat, highlight.lng]} icon={pinIcon}>
                    <Popup>{formatTime(highlight.timestamp)}</Popup>
                  </Marker>
                )}
              </>
            ) : (
              hasFix && (
                <>
                  {accuracy != null && accuracy > 0 && (
                    <Circle
                      center={[lat!, lng!]}
                      radius={accuracy}
                      pathOptions={{ color: "#1565C0", fillColor: "#1565C0", fillOpacity: 0.12, weight: 1 }}
                    />
                  )}
                  <Marker position={[lat!, lng!]} icon={pinIcon}>
                    <Popup>
                      <strong>{device!.label ?? device!.name ?? device!.id}</strong>
                      <br />
                      {typeof device!.battery === "number" && device!.battery >= 0
                        ? `Battery ${device!.battery}%`
                        : "Battery unknown"}
                      {accuracy != null ? <><br />±{Math.round(accuracy)} m</> : null}
                      <br />
                      {device!.lastSeen ? device!.lastSeen.toDate().toLocaleString() : ""}
                    </Popup>
                  </Marker>
                </>
              )
            )}
          </>
        )}

        <MapController
          lat={allDevices ? null : lat}
          lng={allDevices ? null : lng}
          follow={follow}
          selectKey={allDevices ? `all-${allFixed.length}` : device?.id ?? null}
          fitPoints={fitPoints}
        />
      </MapContainer>

      {allDevices && allFixed.length === 0 && (
        <div className="map-overlay">No devices have a location fix yet.</div>
      )}
      {!allDevices && !showRoute && !hasFix && (
        <div className="map-overlay">
          {device
            ? "Waiting for the first location fix from this device…"
            : "Select a device, or register one from the phone app."}
        </div>
      )}
      {!allDevices && showRoute && track.length === 0 && (
        <div className="map-overlay">No location history in this time range.</div>
      )}
    </div>
  );
}
