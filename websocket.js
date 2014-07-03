function createWs(options) {

  var WebSocketClass = window.WebSocket || window.MozWebSocket,
      socket,
      connected = false,
      closedByMe = false,
      closeWhenConnected = false,
      reconnectTimer, idleTimer,
      reconnectTime = 1000,
      initialReconnectTime = 1000,
      maxReconnectTime = 60000,
      messageQueue = []

  options = _.extend({
    url: null,
    connectionTimeout: 1000,
    idleTimeout: 5 * 60000
  }, options)

  var ws = emitter({
    connect: connect,

    send: function(message) {
      var strMessage = JSON.stringify(message)
      messageQueue.push(strMessage)
      dequeue()
    },

    close: function() {
      closedByMe = true
      log('explicit close requested')
      if(!connected) { return closeWhenConnected = true  }//when closing before connection established
      try {
        socket && socket.close()
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
      } catch (e) {
        logError("socket closing bug", e.stack || e)
      }
      connected = false
    },

    reconnect: function() {
      ws.close()
      ws.connect()
    },

    release: function() {
      clearTimeout(reconnectTimer)
    },
    toString: function() {
      return "[object WebSocket]"
    }
  })



  return ws

  // private stuff

  function connect(re) {

    log("connect to url: " + options.url)

    socket = new WebSocketClass(options.url)
    closedByMe = false
    connected = false
    socket.onopen = function(){  
      //log('Socket Status: ', socket.readyState, ' (open)')
      reconnectTime = initialReconnectTime
      connected = true
      if(closeWhenConnected) {
        closeWhenConnected = false
        ws.close()
      }
      dequeue()
      ws.emit('connect')
      re && ws.emit('reconnect')
    }  

    socket.onmessage = function(msg){  
      console.log('%c Received: %s', "color: #46af91;", msg.data)
      handleMessage(msg.data)
    }  

    socket.onclose = function(){  
      //log('Socket Status: ', socket.readyState, ' (Closed)')
      connected = false
      ws.emit('disconnect')
      if (!closedByMe) {
        handleError('disconnected')
      }
    }

    socket.onerror = handleError

    window.app && app.one('offline', function(){
      if (!connected) return
      ws.close()
      app.one('online', function(){
        ws.connect()
      })
    })
  }

  function dequeue() {
    while (socket.readyState == WebSocketClass.OPEN && messageQueue.length) {
      send(messageQueue.shift())
    }
  }

  function send(message) {
    console.log('%c Sending %s', "color:rgba(10, 10, 10, 0.6); font-size: 10px", message)
    socket.send(message)
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(ping, options.idleTimeout)
  }

  function ping() {
    idleTimer = null
    ws.send('ping')
  }

  function handleMessage(msg) {
    try {
      msg = JSON.parse(msg)
    }
    catch (e) {
      logError(e.stack || e, msg)
    }
    ws.emit('message', msg)
  }

  function handleError(data) {
    logError('websocket error', data)
    ws.emit('error', data)
    if (data && data.target
      && [WebSocketClass.CLOSING, WebSocketClass.CLOSED].indexOf(data.target.readyState) > -1) {
      return
    }
    if (reconnectTimer) {
      return
    }
    if (connected) {
      ws.close()
    }

    log("try to reconnect in " + (reconnectTime / 1000) + "s")
    reconnectTimer = setTimeout(function () {
      reconnectTime = Math.min(maxReconnectTime, reconnectTime * 1.5)
      reconnectTimer = null
      connect(true)
    }, reconnectTime)
  }

  function log() {
    console.log.apply(console, arguments)
  }

  function logError() {
    console.error.apply(console, arguments)
  }
}
