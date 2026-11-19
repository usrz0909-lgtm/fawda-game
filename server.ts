
import { createServer } from 'node:http'
import { Server } from 'socket.io'

const httpServer = createServer()

const io = new Server(httpServer, {
  cors: { origin: true }
})

type Player = {
  id: string
  name: string
  ready: boolean
  x: number
  y: number
  score: number
}

type Coin = {
  id: string
  x: number
  y: number
}

type Bomb = {
  id: string
  x: number
  y: number
}

type Room = {
  code: string
  hostId: string
  started: boolean
  players: Player[]
  coins: Coin[]
  bombs: Bomb[]
}

const rooms = new Map<string, Room>()
const bombIntervals = new Map<string, ReturnType<typeof setInterval>>()

function generateId() {
  return Math.random().toString(36).slice(2, 12)
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''

  do {
    code = Array.from(
      { length: 6 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join('')
  } while (rooms.has(code))

  return code
}

function createCoin(): Coin {
  return {
    id: generateId(),
    x: Math.floor(Math.random() * 780) + 90,
    y: Math.floor(Math.random() * 310) + 145
  }
}

function createBomb(): Bomb {
  return {
    id: generateId(),
    x: Math.floor(Math.random() * 780) + 90,
    y: Math.floor(Math.random() * 310) + 145
  }
}

function sendRoomUpdate(code: string) {
  const room = rooms.get(code)
  if (room) io.to(code).emit('room-updated', room)
}

function stopBombs(code: string) {
  const interval = bombIntervals.get(code)

  if (interval) {
    clearInterval(interval)
    bombIntervals.delete(code)
  }
}

function explodeBomb(code: string, bomb: Bomb) {
  const room = rooms.get(code)
  if (!room || !room.started) return

  const exists = room.bombs.some(b => b.id === bomb.id)
  if (!exists) return

  room.bombs = room.bombs.filter(b => b.id !== bomb.id)

  const affectedPlayers: {
    id: string
    x: number
    y: number
  }[] = []

  // تأثير الانفجار على اللاعبين القريبين
  room.players.forEach(player => {
    const dx = player.x - bomb.x
    const dy = player.y - bomb.y
    const distance = Math.hypot(dx, dy)

    const explosionRadius = 115

    if (distance <= explosionRadius) {
      // تحديد اتجاه الدفع
      const safeDistance = Math.max(distance, 1)
      const pushDistance = 100

      player.x = Math.max(
        78,
        Math.min(882, player.x + (dx / safeDistance) * pushDistance)
      )

      player.y = Math.max(
        125,
        Math.min(462, player.y + (dy / safeDistance) * pushDistance)
      )

      affectedPlayers.push({
        id: player.id,
        x: player.x,
        y: player.y
      })
    }
  })

  io.to(code).emit('bomb-exploded', {
    bombId: bomb.id,
    players: affectedPlayers
  })
}

function spawnBomb(code: string) {
  const room = rooms.get(code)

  if (!room || !room.started) return
  if (room.bombs.length >= 3) return

  const bomb = createBomb()
  room.bombs.push(bomb)

  io.to(code).emit('bomb-spawned', bomb)

  // انفجار القنبلة بعد 3 ثوانٍ
  setTimeout(() => {
    explodeBomb(code, bomb)
  }, 3000)
}

function startBombSystem(code: string) {
  stopBombs(code)

  const room = rooms.get(code)
  if (!room || !room.started) return

  // ظهور أول قنبلة
  spawnBomb(code)

  // قنابل جديدة كل 7 ثوانٍ
  const interval = setInterval(() => {
    spawnBomb(code)
  }, 7000)

  bombIntervals.set(code, interval)
}

function leaveRoom(socketId: string) {
  const socket = io.sockets.sockets.get(socketId)
  const code = socket?.data.roomCode as string | undefined

  if (!code) return

  const room = rooms.get(code)
  if (!room) return

  room.players = room.players.filter(p => p.id !== socketId)

  if (room.players.length === 0) {
    stopBombs(code)
    rooms.delete(code)
  } else {
    if (room.hostId === socketId) {
      room.hostId = room.players[0].id
    }

    sendRoomUpdate(code)
  }

  socket?.leave(code)
  if (socket) delete socket.data.roomCode
}

io.on('connection', socket => {
  console.log('Player connected:', socket.id)

  socket.on('create-room', (playerName: string, callback) => {
    leaveRoom(socket.id)

    const name = String(playerName || '').trim().slice(0, 16)

    if (!name) {
      callback?.({ ok: false, message: 'اكتب اسمك أولاً' })
      return
    }

    const code = generateCode()

    const room: Room = {
      code,
      hostId: socket.id,
      started: false,
      players: [{
        id: socket.id,
        name,
        ready: false,
        x: 480,
        y: 270,
        score: 0
      }],
      coins: [],
      bombs: []
    }

    rooms.set(code, room)
    socket.join(code)
    socket.data.roomCode = code

    callback?.({ ok: true, room })
    sendRoomUpdate(code)

    console.log('Room created:', code)
  })

  socket.on('join-room', (data, callback) => {
    const name = String(data?.name || '').trim().slice(0, 16)
    const code = String(data?.code || '').trim().toUpperCase()

    if (!name) {
      callback?.({ ok: false, message: 'اكتب اسمك أولاً' })
      return
    }

    const room = rooms.get(code)

    if (!room) {
      callback?.({ ok: false, message: 'رمز الغرفة غير صحيح' })
      return
    }

    if (room.started) {
      callback?.({ ok: false, message: 'المباراة بدأت بالفعل' })
      return
    }

    if (room.players.length >= 8) {
      callback?.({ ok: false, message: 'الغرفة ممتلئة!' })
      return
    }

    leaveRoom(socket.id)

    room.players.push({
      id: socket.id,
      name,
      ready: false,
      x: 480,
      y: 270,
      score: 0
    })

    socket.join(code)
    socket.data.roomCode = code

    callback?.({ ok: true, room })
    sendRoomUpdate(code)

    console.log(`${name} joined room: ${code}`)
  })

  socket.on('toggle-ready', callback => {
    const code = socket.data.roomCode as string | undefined
    if (!code) {
      callback?.({ ok: false, message: 'أنت لست داخل غرفة' })
      return
    }

    const room = rooms.get(code)
    if (!room) return

    const player = room.players.find(p => p.id === socket.id)
    if (!player) return

    player.ready = !player.ready

    callback?.({ ok: true, ready: player.ready })
    sendRoomUpdate(code)
  })

  socket.on('start-game', callback => {
    const code = socket.data.roomCode as string | undefined

    if (!code) {
      callback?.({ ok: false, message: 'أنت لست داخل غرفة' })
      return
    }

    const room = rooms.get(code)

    if (!room) {
      callback?.({ ok: false, message: 'الغرفة غير موجودة' })
      return
    }

    if (room.hostId !== socket.id) {
      callback?.({ ok: false, message: 'فقط صاحب الغرفة يستطيع بدء اللعب' })
      return
    }

    if (room.started) {
      callback?.({ ok: false, message: 'المباراة بدأت بالفعل' })
      return
    }

    if (!room.players.every(player => player.ready)) {
      callback?.({ ok: false, message: 'لازم كل اللاعبين يكونون جاهزين' })
      return
    }

    room.started = true
    room.coins = []
    room.bombs = []

    room.players.forEach((player, index) => {
      player.x = 160 + index * 90
      player.y = 270
      player.score = 0
    })

    // إنشاء 15 عملة
    for (let i = 0; i < 15; i++) {
      room.coins.push(createCoin())
    }

    io.to(code).emit('coins-state', room.coins)
    io.to(code).emit('bombs-state', room.bombs)

    io.to(code).emit('game-started', {
      countdown: 3,
      players: room.players
    })

    // تشغيل نظام القنابل
    startBombSystem(code)

    callback?.({ ok: true })
  })

  // إرسال حالة اللعبة للاعب
  socket.on('get-game-state', () => {
    const code = socket.data.roomCode as string | undefined
    if (!code) return

    const room = rooms.get(code)
    if (!room || !room.started) return

    socket.emit('coins-state', room.coins)

    socket.emit('bombs-state', room.bombs)

    socket.emit('scores-state', room.players.map(p => ({
      id: p.id,
      score: p.score
    })))
  })

  // حركة اللاعبين
  socket.on('player-move', data => {
    const code = socket.data.roomCode as string | undefined
    if (!code) return

    const room = rooms.get(code)
    if (!room || !room.started) return

    const player = room.players.find(p => p.id === socket.id)
    if (!player) return

    const x = Number(data?.x)
    const y = Number(data?.y)

    if (!Number.isFinite(x) || !Number.isFinite(y)) return

    player.x = Math.max(78, Math.min(882, x))
    player.y = Math.max(125, Math.min(462, y))

    socket.to(code).emit('player-moved', {
      id: player.id,
      x: player.x,
      y: player.y
    })
  })

  // جمع العملات
  socket.on('collect-coin', data => {
    const code = socket.data.roomCode as string | undefined
    if (!code) return

    const room = rooms.get(code)
    if (!room || !room.started) return

    const player = room.players.find(p => p.id === socket.id)
    if (!player) return

    const coin = room.coins.find(c => c.id === data?.coinId)
    if (!coin) return

    const distance = Math.hypot(
      player.x - coin.x,
      player.y - coin.y
    )

    if (distance > 65) return

    room.coins = room.coins.filter(c => c.id !== coin.id)
    player.score++

    io.to(code).emit('coin-collected', {
      coinId: coin.id,
      playerId: player.id,
      score: player.score
    })

    io.to(code).emit('scores-state', room.players.map(p => ({
      id: p.id,
      score: p.score
    })))

    setTimeout(() => {
      const currentRoom = rooms.get(code)

      if (!currentRoom || !currentRoom.started) return
      if (currentRoom.coins.length >= 15) return

      const newCoin = createCoin()
      currentRoom.coins.push(newCoin)

      io.to(code).emit('coin-spawned', newCoin)
    }, 600)
  })

  socket.on('disconnect', () => {
    leaveRoom(socket.id)
    console.log('Player disconnected:', socket.id)
  })
})

const PORT = process.env.PORT || 3001

httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Fawda server running on port ${PORT}`)
})
