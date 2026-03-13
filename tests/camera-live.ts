import { VapixClient } from '@axctl/core'

const client = new VapixClient('192.168.1.33', 'root', 'pass')

console.log('Testing connection to Q6358-LE at 192.168.1.33...\n')

try {
  const info = await client.getDeviceInfo()
  console.log('✓ basicdeviceinfo.cgi:')
  console.log(JSON.stringify(info, null, 2))
} catch (e) {
  console.error('✗ failed:', e)
}
