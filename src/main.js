var EventEmitter = require('events').EventEmitter
var vcsurl = require('vcsurl')
var path = require('path')
var fs = require('fs-extra')
var fsPromises = require('fs/promises')
var util = require('util')
var extractZip = require('./extract-zip').extractZip
var cwd = process.cwd()

function GithubDownloader (user, repo, ref, dir) {
  this.user = user
  this.repo = repo
  this.ref = ref || 'master'
  this.dir = dir
  this._log = []
  this._getZip = false
}
util.inherits(GithubDownloader, EventEmitter)

GithubDownloader.prototype.start = function () {
  var _this = this
  var initialUrl = 'https://api.github.com/repos/' + this.user + '/' + this.repo + '/contents/'
  var initialUrlRef = this.ref ? '?ref=' + this.ref : ''
  var rawUrl = 'https://raw.github.com/' + this.user + '/' + this.repo + '/' + this.ref + '/'
  var pending = 0
  var gonnaProcess = 0

  gonnaProcess += 1
  requestJSON.call(this, initialUrl + initialUrlRef, processItems)

  function processItems (items) {
    pending += items.length
    gonnaProcess -= 1
    items.forEach(handleItem)
    checkDone()
  }

  function handleItem (item) {
    if (item.type === 'dir') {
      var dir = path.join(_this.dir, item.path)
      fs.mkdirs(dir, function (err) {
        if (err) _this.emit('error', err)
        _this._log.push(dir)
        gonnaProcess += 1
        requestJSON.call(_this, initialUrl + item.path + initialUrlRef, processItems)
        _this.emit('dir', item.path)
        pending -= 1
        checkDone()
      })
    } else if (item.type === 'file') {
      var file = path.join(_this.dir, item.path)
      fs.createFile(file, function (err) {
        if (err) _this.emit('error', err)

        fetch(rawUrl + item.path)
          .then(async ({ body }) => {
            await fsPromises.writeFile(file, body)

            _this._log.push(file)
            _this.emit('file', item.path)
            pending -= 1
            checkDone()
          })
          .catch((err) => {
            _this.emit('error', err)
          })
      })
    } else {
      _this.emit('Error', new Error(JSON.stringify(item, null, 2) + '\n does not have type.'))
    }
  }

  function checkDone () {
    // console.log('PENDING: ' + pending + ' gonnaProcess: ' + gonnaProcess)
    if (pending === 0 && gonnaProcess === 0 && !this._getZip) {
      _this.emit('end')
    }
  }

  return this
}

module.exports = function GithubDownload (params, dir) {
  if (typeof params === 'string') {
    var pieces = params.split('#')
    var ref = pieces[1]
    var url = (vcsurl(pieces[0]) || pieces[0]).split('/')
    params = {user: url[url.length - 2], repo: url[url.length - 1], ref: ref}
  }

  if (typeof params !== 'object') {
    throw new Error('Invalid parameter type. Should be repo URL string or object containing repo and user.')
  }

  // console.dir(params)

  dir = dir || process.cwd()
  var gh = new GithubDownloader(params.user, params.repo, params.ref, dir)
  return gh.start()
}

// PRIVATE METHODS

function requestJSON (url, callback) {
  const _this = this

  fetch(url)
    .then(async (res) => {
      const resBody = await res.text()

      if (res.status === 403) {
        downloadZip.call(_this)
        return
      } else if (res.status !== 200) {
        throw Error(`${url}: returned ${res.status}\n\nbody:\n${resBody}`)
      }

      callback(JSON.parse(resBody))
    })
    .catch((err) => this.emit('error', err))
}

function downloadZip () {
  var _this = this
  if (_this._getZip) return
  _this._getZip = true

  _this._log.forEach(function (file) {
    fs.remove(file)
  })

  var tmpdir = generateTempDir()
  var zipBaseDir = _this.repo + '-' + _this.ref
  var zipFile = path.join(tmpdir, zipBaseDir + '.zip')

  var zipUrl = 'https://nodeload.github.com/' + _this.user + '/' + _this.repo + '/zip/' + _this.ref
  _this.emit('zip', zipUrl)

  // console.log(zipUrl)
  fs.mkdir(tmpdir, function (err) {
    if (err) _this.emit('error', err)

    fetch(zipUrl)
      .then(async ({ body }) => {
        await fsPromises.writeFile(zipFile, body)

        extractZip.call(_this, zipFile, tmpdir, function (extractedFolderName) {
          var oldPath = path.join(tmpdir, extractedFolderName)
          fs.rename(oldPath, _this.dir, function (err) {
            if (err) _this.emit('error', err)
            fs.remove(tmpdir, function (err) {
              if (err) _this.emit('error', err)
              _this.emit('end')
            })
          })
        })
      })
  })
}

function generateTempDir () {
  return path.join(cwd, Date.now().toString() + '-' + Math.random().toString().substring(2))
}
