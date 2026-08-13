"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "../ui/button"
import {
  discoverBrowserHelper,
  listBrowserHelperDevices,
  pairBrowserHelper,
  revokeBrowserHelperDevice,
} from "@/lib/browser-helper-client"

type DeviceRow = {
  id: string
  deviceId: string
  deviceName: string | null
  platform: string | null
  helperVersion: string | null
  pairedAt: string
  lastSeenAt: string
  revoked: boolean
  revokedAt: string | null
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  const delta = Date.now() - t
  if (delta < 60_000) return "now"
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`
  return new Date(t).toLocaleDateString()
}

export function BrowserHelperDevicesSettings() {
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [helperState, setHelperState] = useState<string>("checking")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [list, discovery] = await Promise.all([
        listBrowserHelperDevices(),
        discoverBrowserHelper(),
      ])
      setDevices(list)
      setHelperState(discovery.state)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load devices")
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const connect = async () => {
    setBusyId("connect")
    setError(null)
    setNote(null)
    try {
      await pairBrowserHelper()
      setNote("Connected ✓")
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect")
    } finally {
      setBusyId(null)
    }
  }

  const disconnect = async (deviceId: string) => {
    setBusyId(deviceId)
    setError(null)
    try {
      await revokeBrowserHelperDevice(deviceId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect")
    } finally {
      setBusyId(null)
    }
  }

  const active = devices.filter((d) => !d.revoked)

  return (
    <div className="space-y-3 border-b border-gray-100 py-3">
      <div>
        <div className="text-sm font-medium text-gray-900">Local Browser Devices</div>
        <p className="text-sm text-gray-500">
          Paired Articulate Browser Helpers on your computers. Disconnect to revoke access.
        </p>
      </div>

      {helperState === "missing" ? (
        <p className="text-xs text-gray-500">
          Articulate Browser Helper is not installed or running on this computer.
        </p>
      ) : helperState === "unpaired" || helperState === "revoked" ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-700">Browser Helper detected on this computer.</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busyId === "connect"}
            onClick={() => void connect()}
          >
            Connect
          </Button>
        </div>
      ) : helperState === "paired" ? (
        <p className="text-xs text-emerald-700">This computer is connected.</p>
      ) : null}

      {active.length === 0 ? (
        <p className="text-xs text-gray-500">No paired devices yet.</p>
      ) : (
        <ul className="space-y-2">
          {active.map((device) => (
            <li
              key={device.id}
              className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-900">
                  {device.deviceName || "Browser Helper"}
                </div>
                <div className="text-[11px] text-gray-500">
                  {[device.platform, device.helperVersion ? `v${device.helperVersion}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                  {" · "}
                  Last seen: {formatRelative(device.lastSeenAt)}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="shrink-0 text-red-700"
                disabled={busyId === device.deviceId}
                onClick={() => void disconnect(device.deviceId)}
              >
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      )}

      {note ? <p className="text-xs text-emerald-700">{note}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
