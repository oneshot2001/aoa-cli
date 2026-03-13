#!/usr/bin/env bun
/**
 * @axctl/mcp — MCP server exposing Axis camera management tools.
 * Transport: stdio (for Claude Code / Cursor integration).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  discoverAll,
  VapixClient,
  AoaClient,
  PtzClient,
  FirmwareClient,
  appsClient,
  credentialStore,
  fleetExec,
  deviceRegistry,
} from '@axctl/core'

const server = new McpServer({
  name: 'axis',
  version: '0.1.0',
})

// --- Helper ---

function getAuth(ip: string): { username: string; password: string } {
  const cred = credentialStore.get(ip)
  if (!cred) throw new Error(`No credentials stored for ${ip}. Run: axctl auth add ${ip}`)
  return { username: cred.username, password: cred.password }
}

// --- Tools ---

server.tool(
  'axis_discover_devices',
  'Discover Axis cameras on the local network via mDNS + SSDP',
  { timeout_seconds: z.number().optional().describe('Scan duration in seconds (default 5)') },
  async ({ timeout_seconds }) => {
    const devices = await discoverAll((timeout_seconds ?? 5) * 1000)
    // Also register discovered devices
    for (const d of devices) {
      deviceRegistry.upsert(d.ip, d.model, d.serial, d.firmwareVersion, d.macAddress)
    }
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(devices, null, 2),
      }],
    }
  }
)

server.tool(
  'axis_list_devices',
  'List all known Axis cameras from the device registry',
  {},
  async () => {
    const devices = deviceRegistry.list()
    const creds = credentialStore.list()
    const credMap = new Map(creds.map(c => [c.ip, true]))
    const rows = devices.map(d => ({
      ...d,
      has_credentials: credMap.has(d.ip),
    }))
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(rows, null, 2),
      }],
    }
  }
)

server.tool(
  'axis_device_info',
  'Get detailed device info (model, serial, firmware, etc.) from an Axis camera',
  { ip: z.string().describe('Camera IP address') },
  async ({ ip }) => {
    const auth = getAuth(ip)
    const client = new VapixClient(ip, auth.username, auth.password)
    const info = await client.getDeviceInfo()
    deviceRegistry.upsert(ip, info.ProdFullName, info.SerialNumber, info.Version)
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(info, null, 2),
      }],
    }
  }
)

server.tool(
  'axis_capture_snapshot',
  'Capture a JPEG snapshot from an Axis camera',
  {
    ip: z.string().describe('Camera IP address'),
    resolution: z.string().optional().describe('Resolution (e.g. "1920x1080")'),
    channel: z.number().optional().describe('Video channel (default 1)'),
  },
  async ({ ip, resolution, channel }) => {
    const auth = getAuth(ip)
    const params = new URLSearchParams()
    if (resolution) params.set('resolution', resolution)
    if (channel) params.set('camera', String(channel))
    const url = `http://${ip}/axis-cgi/jpg/image.cgi${params.toString() ? '?' + params.toString() : ''}`

    const { digestFetch } = await import('@axctl/core')
    const response = await digestFetch(url, auth.username, auth.password)
    if (!response.ok) throw new Error(`Snapshot failed: ${response.status}`)

    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    return {
      content: [{
        type: 'image' as const,
        data: base64,
        mimeType: 'image/jpeg',
      }],
    }
  }
)

server.tool(
  'axis_list_scenarios',
  'List AOA (AXIS Object Analytics) scenarios configured on a camera',
  { ip: z.string().describe('Camera IP address') },
  async ({ ip }) => {
    const auth = getAuth(ip)
    const client = new AoaClient(ip, auth.username, auth.password)
    const scenarios = await client.getScenarios()
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(scenarios, null, 2),
      }],
    }
  }
)

server.tool(
  'axis_create_scenario',
  'Create a new AOA scenario on an Axis camera',
  {
    ip: z.string().describe('Camera IP address'),
    name: z.string().describe('Scenario name'),
    type: z.string().describe('Scenario type (e.g. "motion_in_area", "line_crossing", "object_in_area")'),
    device: z.number().optional().describe('Analytics device index (default 1)'),
  },
  async ({ ip, name, type, device }) => {
    const auth = getAuth(ip)
    const client = new AoaClient(ip, auth.username, auth.password)
    await client.addScenario(name, type, device ?? 1)
    return {
      content: [{
        type: 'text' as const,
        text: `Created scenario "${name}" (type: ${type}) on ${ip}`,
      }],
    }
  }
)

server.tool(
  'axis_fleet_status',
  'Get status of all cameras in a named fleet',
  { fleet_name: z.string().describe('Fleet name') },
  async ({ fleet_name }) => {
    const results = await fleetExec(fleet_name, async (ip, user, pass) => {
      const client = new VapixClient(ip, user, pass)
      const info = await client.getDeviceInfo()
      return { ip, model: info.ProdFullName, serial: info.SerialNumber, firmware: info.Version }
    })
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(results, null, 2),
      }],
    }
  }
)

server.tool(
  'axis_firmware_status',
  'Check firmware version and upgrade availability on an Axis camera',
  { ip: z.string().describe('Camera IP address') },
  async ({ ip }) => {
    const auth = getAuth(ip)
    const client = new FirmwareClient(ip, auth.username, auth.password)
    const status = await client.getStatus()
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(status, null, 2),
      }],
    }
  }
)

server.tool(
  'axis_list_apps',
  'List installed ACAP applications on an Axis camera',
  { ip: z.string().describe('Camera IP address') },
  async ({ ip }) => {
    const auth = getAuth(ip)
    const apps = await appsClient.list(ip, auth.username, auth.password)
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(apps, null, 2),
      }],
    }
  }
)

server.tool(
  'axis_ptz_control',
  'Control PTZ (Pan-Tilt-Zoom) on an Axis camera',
  {
    ip: z.string().describe('Camera IP address'),
    action: z.enum(['home', 'goto', 'move', 'zoom', 'presets', 'goto_preset']).describe('PTZ action'),
    pan: z.number().optional().describe('Pan value (-180 to 180)'),
    tilt: z.number().optional().describe('Tilt value (-90 to 90)'),
    zoom: z.number().optional().describe('Zoom value'),
    preset: z.string().optional().describe('Preset name (for goto_preset)'),
  },
  async ({ ip, action, pan, tilt, zoom, preset }) => {
    const auth = getAuth(ip)
    const client = new PtzClient(ip, auth.username, auth.password)

    switch (action) {
      case 'home':
        await client.goHome()
        return { content: [{ type: 'text' as const, text: `PTZ moved to home on ${ip}` }] }
      case 'goto':
        await client.absoluteMove(pan ?? 0, tilt ?? 0, zoom ?? 1)
        return { content: [{ type: 'text' as const, text: `PTZ moved to pan=${pan} tilt=${tilt} zoom=${zoom} on ${ip}` }] }
      case 'presets': {
        const presets = await client.listPresets()
        return { content: [{ type: 'text' as const, text: JSON.stringify(presets, null, 2) }] }
      }
      case 'goto_preset':
        if (!preset) throw new Error('preset name required for goto_preset action')
        await client.gotoPreset(preset)
        return { content: [{ type: 'text' as const, text: `PTZ moved to preset "${preset}" on ${ip}` }] }
      case 'move':
        await client.continuousMove(pan ?? 0, tilt ?? 0, zoom ?? 0)
        return { content: [{ type: 'text' as const, text: `PTZ continuous move started on ${ip}` }] }
      case 'zoom':
        await client.absoluteMove(0, 0, zoom ?? 1)
        return { content: [{ type: 'text' as const, text: `PTZ zoom set to ${zoom} on ${ip}` }] }
    }
  }
)

server.tool(
  'axis_check_health',
  'Ping an Axis camera to check if it is reachable',
  { ip: z.string().describe('Camera IP address') },
  async ({ ip }) => {
    const auth = getAuth(ip)
    const client = new VapixClient(ip, auth.username, auth.password)
    const reachable = await client.ping()
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ ip, reachable }, null, 2),
      }],
    }
  }
)

// --- Start server ---
const transport = new StdioServerTransport()
await server.connect(transport)
