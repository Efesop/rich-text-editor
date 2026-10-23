// Adds the minimum macOS to latest-mac.yml so electron-updater doesn't offer
// a release to Macs that can't run it. electron-builder only writes the
// minimum into the app's Info.plist, not into the update feed.
//
// electron-updater compares the value with os.release(), which on macOS is
// the Darwin version, not the marketing one: macOS 13 Ventura is Darwin 22.
//
// Usage: node scripts/mark-min-macos.js dist/latest-mac.yml

const fs = require('fs')

// Electron 44 needs macOS 13 (electron-builder.yml mac.minimumSystemVersion)
const MIN_DARWIN = '22.0.0'

function markMinimumMacOS (yml, minimum = MIN_DARWIN) {
  const line = `minimumSystemVersion: ${minimum}`
  if (/^minimumSystemVersion:.*$/m.test(yml)) return yml.replace(/^minimumSystemVersion:.*$/m, line)
  return yml.replace(/\n*$/, '\n') + line + '\n'
}

if (require.main === module) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: node scripts/mark-min-macos.js <latest-mac.yml>')
    process.exit(1)
  }
  const before = fs.readFileSync(file, 'utf8')
  if (!/^version:/m.test(before)) {
    console.error(`${file} doesn't look like an update feed`)
    process.exit(1)
  }
  fs.writeFileSync(file, markMinimumMacOS(before))
  console.log(`${file}: minimumSystemVersion ${MIN_DARWIN} (macOS 13)`)
}

module.exports = { markMinimumMacOS, MIN_DARWIN }
