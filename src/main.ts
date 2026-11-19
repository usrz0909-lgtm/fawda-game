
import './style.css'
import { io } from 'socket.io-client'
import { startGame, type GamePlayer } from './game'

const socket = io(`http://${window.location.hostname}:3001`)

type Player = GamePlayer

type Room = {
  code: string
  hostId: string
  players: Player[]
}

type ServerResponse = {
  ok: boolean
  message?: string
  room?: Room
  ready?: boolean
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="game">

    <header class="topbar">
      <a class="logo" href="#">فوضى<span>!</span></a>
      <div class="online" id="connection">
        <span class="status-dot"></span>
        جاري الاتصال...
      </div>
    </header>

    <section class="hero" id="homePanel">
      <div class="hero-content">
        <div class="tag">✦ PARTY GAME ✦</div>

        <h1>
          جهّز نفسك...
          <span>الفوضى بدأت!</span>
        </h1>

        <p>
          اجمع أصحابك، ادخل التحدي، واجمع أكبر عدد من العملات!
          هل أنت مستعد للفوز؟
        </p>

        <div class="player-box">
          <label for="playerName">اسم اللاعب</label>
          <input
            id="playerName"
            maxlength="16"
            placeholder="اكتب اسمك هنا..."
            autocomplete="off"
          />
        </div>

        <div class="actions">
          <button id="createRoom" class="primary">
            إنشاء غرفة 🚀
          </button>

          <button id="joinRoom" class="secondary">
            دخول غرفة 🎯
          </button>
        </div>

        <div id="message" class="message">
          ✨ اختر طريقة اللعب وابدأ المغامرة!
        </div>
      </div>

      <div class="hero-decoration">
        <div class="floating-coin coin-one">★</div>
        <div class="floating-coin coin-two">★</div>
        <div class="floating-coin coin-three">★</div>
        <div class="decoration-circle"></div>
        <div class="decoration-text">FAWDA!</div>
      </div>
    </section>

    <section id="roomPanel" class="room-panel" hidden>
      <div class="room-heading">
        <div>
          <div class="tag">✦ PRIVATE ROOM ✦</div>
          <h2>غرفتك جاهزة!</h2>
          <p>انتظر أصحابك واستعدوا للتحدي.</p>
        </div>
      </div>

      <div class="room-grid">
        <article class="room-card">
          <div class="card-icon">🔐</div>
          <h3>رمز الغرفة</h3>
          <p id="roomCode" class="room-code">------</p>
          <button id="copyCode" class="secondary">
            نسخ الرمز 📋
          </button>
        </article>

        <article class="room-card">
          <div class="card-icon">👥</div>
          <h3>اللاعبون</h3>
          <p id="playerCount" class="player-count">0/8</p>
          <ul id="playersList" class="players-list"></ul>
        </article>

        <article class="room-card">
          <div class="card-icon">⚡</div>
          <h3>حالة الاستعداد</h3>
          <p id="readyStatus">غير جاهز ❌</p>

          <button id="readyButton" class="primary">
            أنا جاهز! 🚀
          </button>

          <button id="startButton" class="start-button" hidden>
            ابدأ اللعب 🎮
          </button>
        </article>
      </div>
    </section>

    <div id="countdownOverlay" class="countdown-overlay" hidden>
      <div class="countdown-content">
        <div class="tag">✦ GET READY ✦</div>
        <h2 id="countdownNumber">3</h2>
        <p>استعد... التحدي على وشك البدء!</p>
      </div>
    </div>

    <section id="game-container" hidden></section>

    <footer>
      <span>فوضى! © 2026</span>
      <span>اصنع الفوضى مع أصحابك ✦</span>
    </footer>

  </main>
`

// عناصر الواجهة
const nameInput = document.querySelector<HTMLInputElement>('#playerName')!
const message = document.querySelector<HTMLDivElement>('#message')!
const connection = document.querySelector<HTMLDivElement>('#connection')!
const homePanel = document.querySelector<HTMLElement>('#homePanel')!
const roomPanel = document.querySelector<HTMLElement>('#roomPanel')!

const roomCode = document.querySelector<HTMLParagraphElement>('#roomCode')!
const playerCount = document.querySelector<HTMLParagraphElement>('#playerCount')!
const playersList = document.querySelector<HTMLUListElement>('#playersList')!

const readyStatus = document.querySelector<HTMLParagraphElement>('#readyStatus')!
const readyButton = document.querySelector<HTMLButtonElement>('#readyButton')!
const startButton = document.querySelector<HTMLButtonElement>('#startButton')!
const copyCodeButton = document.querySelector<HTMLButtonElement>('#copyCode')!

const gameContainer = document.querySelector<HTMLDivElement>('#game-container')!
const countdownOverlay = document.querySelector<HTMLDivElement>('#countdownOverlay')!
const countdownNumber = document.querySelector<HTMLHeadingElement>('#countdownNumber')!

let currentRoom: Room | null = null
let gameInstance: ReturnType<typeof startGame> | null = null
let countdownTimer: ReturnType<typeof setInterval> | null = null

// الاتصال بالسيرفر
socket.on('connect', () => {
  connection.innerHTML = '<span class="status-dot"></span> متصل بالسيرفر'
  connection.classList.add('connected')
})

socket.on('disconnect', () => {
  connection.innerHTML = '<span class="status-dot"></span> انقطع الاتصال'
  connection.classList.remove('connected')
  message.textContent = 'انقطع الاتصال بالسيرفر، حاول تحديث الصفحة.'
})

// عرض الغرفة
function showRoom(room: Room) {
  currentRoom = room

  homePanel.hidden = true
  roomPanel.hidden = false

  roomCode.textContent = room.code
  playerCount.textContent = `${room.players.length}/8`

  playersList.innerHTML = ''

  room.players.forEach((player, index) => {
    const item = document.createElement('li')
    const isHost = player.id === room.hostId

    item.innerHTML = `
      <span class="player-number">${index + 1}</span>
      <span class="player-name"></span>
      <span class="player-ready">
        ${player.ready ? '🟢' : '⚪'}
      </span>
      ${isHost ? '<span class="host-label">HOST</span>' : ''}
    `

    item.querySelector('.player-name')!.textContent = player.name
    playersList.appendChild(item)
  })

  const me = room.players.find(player => player.id === socket.id)
  const isReady = me?.ready ?? false

  readyStatus.textContent = isReady ? 'جاهز 🟢' : 'غير جاهز ❌'
  readyButton.textContent = isReady ? 'إلغاء الجاهزية' : 'أنا جاهز! 🚀'

  startButton.hidden = room.hostId !== socket.id
  startButton.disabled = false

  message.textContent = 'أنت داخل الغرفة! أرسل الرمز لأصحابك 🎉'
}

// إنشاء غرفة
document.querySelector('#createRoom')!.addEventListener('click', () => {
  const name = nameInput.value.trim()

  if (!name) {
    message.textContent = 'اكتب اسمك أولاً!'
    nameInput.focus()
    return
  }

  socket.emit('create-room', name, (response: ServerResponse) => {
    if (!response.ok || !response.room) {
      message.textContent = response.message || 'تعذر إنشاء الغرفة'
      return
    }

    showRoom(response.room)
  })
})

// دخول غرفة
document.querySelector('#joinRoom')!.addEventListener('click', () => {
  const name = nameInput.value.trim()

  if (!name) {
    message.textContent = 'اكتب اسمك أولاً!'
    nameInput.focus()
    return
  }

  const code = prompt('اكتب رمز الغرفة المكوّن من 6 أحرف أو أرقام:')

  if (!code) return

  socket.emit(
    'join-room',
    { name, code: code.trim().toUpperCase() },
    (response: ServerResponse) => {
      if (!response.ok || !response.room) {
        message.textContent = response.message || 'تعذر دخول الغرفة'
        return
      }

      showRoom(response.room)
    }
  )
})

// نسخ رمز الغرفة
copyCodeButton.addEventListener('click', async () => {
  if (!currentRoom) return

  try {
    await navigator.clipboard.writeText(currentRoom.code)
    copyCodeButton.textContent = 'تم النسخ! ✓'

    setTimeout(() => {
      copyCodeButton.textContent = 'نسخ الرمز 📋'
    }, 1500)
  } catch {
    message.textContent = `رمز الغرفة: ${currentRoom.code}`
  }
})

// الجاهزية
readyButton.addEventListener('click', () => {
  socket.emit('toggle-ready', (response: ServerResponse) => {
    if (!response.ok) {
      message.textContent = response.message || 'حدث خطأ'
    }
  })
})

// بدء المباراة
startButton.addEventListener('click', () => {
  startButton.disabled = true

  socket.emit('start-game', (response: ServerResponse) => {
    if (!response.ok) {
      message.textContent = response.message || 'تعذر بدء المباراة'
      startButton.disabled = false
    }
  })
})

// تحديث الغرفة عند تغير اللاعبين
socket.on('room-updated', (room: Room) => {
  showRoom(room)
})

// بدء العد التنازلي
socket.on('game-started', (data: {
  countdown: number
  players: Player[]
}) => {
  if (data.players && currentRoom) {
    currentRoom.players = data.players
  }

  readyButton.hidden = true
  startButton.hidden = true

  let count = data.countdown

  countdownOverlay.hidden = false
  countdownNumber.textContent = String(count)

  if (countdownTimer) {
    clearInterval(countdownTimer)
  }

  countdownTimer = setInterval(() => {
    count--

    if (count > 0) {
      countdownNumber.textContent = String(count)
    } else {
      if (countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }

      countdownOverlay.hidden = true
      launchCoinRush(data.players || currentRoom?.players || [])
    }
  }, 1000)
})

// تشغيل Coin Rush
function launchCoinRush(players: Player[]) {
  homePanel.hidden = true
  roomPanel.hidden = true
  gameContainer.hidden = false

  if (gameInstance) {
    gameInstance.destroy(true)
    gameInstance = null
  }

  gameContainer.innerHTML = ''

  gameInstance = startGame(
    gameContainer,
    socket,
    players
  )
}
