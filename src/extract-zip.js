const AdmZip = require('adm-zip')
const fs = require('fs-extra')
const path = require('path')

// using 'this' here is weird, TODO: improve
function extractZip (zipFile, outputDir, callback) {
  const zip = new AdmZip(zipFile)
  const entries = zip.getEntries()
  let pending = entries.length
  const _this = this
  const folderName = path.basename(entries[0].entryName)

  function checkDone (err) {
    if (err) _this.emit('error', err)
    pending -= 1
    if (pending === 0) callback(folderName)
  }

  entries.forEach(function (entry) {
    if (entry.isDirectory) return checkDone()

    const file = path.resolve(outputDir, entry.entryName)
    fs.outputFile(file, entry.getData(), checkDone)
  })
}

module.exports = {
  extractZip
}
