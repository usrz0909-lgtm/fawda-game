
import Phaser from 'phaser'
import type { Socket } from 'socket.io-client'

export type GamePlayer = {
  id: string
  name: string
  ready: boolean
  x?: number
  y?: number
  score?: number
}

type PlayerMoved = {
  id: string
  x: number
  y: number
}

type CoinData = {
  id: string
  x: number
  y: number
}

type CoinCollected = {
  coinId: string
  playerId: string
  score: number
}

type PlayerScore = {
  id: string
  score: number
}

class CoinRushScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys

  private wasd!: {
    W: Phaser.Input.Keyboard.Key
    A: Phaser.Input.Keyboard.Key
    S: Phaser.Input.Keyboard.Key
    D: Phaser.Input.Keyboard.Key
  }

  private socket?: Socket
  private initialPlayers: GamePlayer[]
  private remotePlayers = new Map<string, Phaser.GameObjects.Container>()

  private lastMoveSentAt = 0

  // عصا التحكم للجوال
  private joystickZone!: Phaser.GameObjects.Zone
  private joystickBase!: Phaser.GameObjects.Arc
  private joystickKnob!: Phaser.GameObjects.Arc
  private joystickPointerId: number | null = null
  private joystickX = 0
  private joystickY = 0

  // العملات المشتركة
  private coins = new Map<string, Phaser.GameObjects.Container>()
  private pendingCoins = new Set<string>()

  private score = 0
  private scoreText!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private timerEvent!: Phaser.Time.TimerEvent

  private timeLeft = 60
  private gameOver = false

  private handlePlayerMoved = (data: PlayerMoved) => {
    if (data.id === this.socket?.id) return

    let remotePlayer = this.remotePlayers.get(data.id)

    if (!remotePlayer) {
      const info = this.initialPlayers.find(p => p.id === data.id)

      remotePlayer = this.createCharacter(
        data.x,
        data.y,
        info?.name || 'لاعب',
        0x4D96FF
      )

      this.remotePlayers.set(data.id, remotePlayer)
    }

    remotePlayer.setPosition(data.x, data.y)
  }

  private handleCoinsState = (coins: CoinData[]) => {
    this.coins.forEach(coin => coin.destroy())
    this.coins.clear()
    this.pendingCoins.clear()

    coins.forEach(coin => this.createCoin(coin))
  }

  private handleCoinSpawned = (coin: CoinData) => {
    if (!this.coins.has(coin.id)) {
      this.createCoin(coin)
    }
  }

  private handleCoinCollected = (data: CoinCollected) => {
    const coin = this.coins.get(data.coinId)

    let x = 480
    let y = 270

    if (coin) {
      x = coin.x
      y = coin.y
      coin.destroy()
      this.coins.delete(data.coinId)
    }

    this.pendingCoins.delete(data.coinId)

    this.sound.play('coin', { volume: 0.5 })

    const popup = this.add.text(x, y - 20, '+1', {
      fontSize: '23px',
      color: '#FFD166',
      fontStyle: 'bold',
      stroke: '#80561A',
      strokeThickness: 3
    }).setOrigin(0.5)

    this.tweens.add({
      targets: popup,
      y: y - 65,
      alpha: 0,
      duration: 550,
      onComplete: () => popup.destroy()
    })

    const collector = data.playerId === this.socket?.id
      ? this.player
      : this.remotePlayers.get(data.playerId)

    if (collector) {
      this.tweens.add({
        targets: collector,
        scaleX: 1.2,
        scaleY: 1.2,
        duration: 100,
        yoyo: true
      })
    }
  }

  private handleScoresState = (scores: PlayerScore[]) => {
    const myScore = scores.find(p => p.id === this.socket?.id)

    if (myScore) {
      this.score = myScore.score
      this.scoreText.setText(`🪙 العملات: ${this.score}`)
    }
  }

  constructor(socket?: Socket, players: GamePlayer[] = []) {
    super('CoinRush')

    this.socket = socket
    this.initialPlayers = players
  }

  preload() {
    this.load.audio('coin', '/sounds/coin.mp3')
    this.load.audio('start', '/sounds/start.mp3')
    this.load.audio('countdown', '/sounds/countdown.mp3')
    this.load.audio('gameover', '/sounds/gameover.mp3')
    this.load.audio('click', '/sounds/click.mp3')
  }

  create() {
    this.gameOver = false
    this.score = 0
    this.timeLeft = 60
    this.coins.clear()
    this.pendingCoins.clear()
    this.remotePlayers.clear()
    this.lastMoveSentAt = 0

    this.joystickPointerId = null
    this.joystickX = 0
    this.joystickY = 0

    this.sound.play('start', { volume: 0.5 })

    // خلفية اللعبة
    this.cameras.main.setBackgroundColor('#101526')

    this.add.rectangle(480, 270, 900, 490, 0x18243a)
    this.add.rectangle(480, 270, 850, 450, 0x202f49)

    // تفاصيل الأرضية
    const grid = this.add.graphics()
    grid.lineStyle(1, 0xffffff, 0.045)

    for (let x = 70; x <= 890; x += 40) {
      grid.lineBetween(x, 45, x, 495)
    }

    for (let y = 45; y <= 495; y += 40) {
      grid.lineBetween(55, y, 905, y)
    }

    // حدود الساحة
    this.add.rectangle(480, 270, 850, 450)
      .setStrokeStyle(4, 0x526687)

    // عنوان اللعبة
    this.add.text(480, 25, 'COIN RUSH', {
      fontSize: '34px',
      color: '#FFD166',
      fontStyle: 'bold',
      stroke: '#9B641C',
      strokeThickness: 5
    }).setOrigin(0.5)

    // لوحة النقاط
    this.add.rectangle(150, 95, 180, 52, 0x111d30)
      .setStrokeStyle(2, 0x526687)

    this.scoreText = this.add.text(150, 95, '🪙 العملات: 0', {
      fontSize: '21px',
      color: '#FFD166',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    // لوحة الوقت
    this.add.rectangle(810, 95, 180, 52, 0x111d30)
      .setStrokeStyle(2, 0x526687)

    this.timerText = this.add.text(810, 95, '⏱ الوقت: 60', {
      fontSize: '21px',
      color: '#20D9A0',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    // إنشاء شخصيات اللاعبين
    this.createPlayers()

    // استقبال أحداث السيرفر
    if (this.socket) {
      this.socket.on('player-moved', this.handlePlayerMoved)
      this.socket.on('coins-state', this.handleCoinsState)
      this.socket.on('coin-spawned', this.handleCoinSpawned)
      this.socket.on('coin-collected', this.handleCoinCollected)
      this.socket.on('scores-state', this.handleScoresState)

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.socket?.off('player-moved', this.handlePlayerMoved)
        this.socket?.off('coins-state', this.handleCoinsState)
        this.socket?.off('coin-spawned', this.handleCoinSpawned)
        this.socket?.off('coin-collected', this.handleCoinCollected)
        this.socket?.off('scores-state', this.handleScoresState)
      })

      // طلب العملات والنقاط من السيرفر
      this.socket.emit('get-game-state')
    }
    if (this.socket) {
  if (this.socket.connected) {
    this.socket.emit('get-game-state')
  } else {
    this.socket.once('connect', () => {
      this.socket?.emit('get-game-state')
    })
  }
}

    // تحكم الكمبيوتر
    this.cursors = this.input.keyboard!.createCursorKeys()

    this.wasd = this.input.keyboard!.addKeys(
      'W,A,S,D'
    ) as typeof this.wasd

    // إنشاء عصا التحكم للجوال
    this.createJoystick()

    // المؤقت
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      repeat: 59,
      callback: () => {
        if (this.gameOver) return

        this.timeLeft--
        this.timerText.setText(`⏱ الوقت: ${this.timeLeft}`)

        if (this.timeLeft <= 10) {
          this.timerText.setColor('#FF7043')
        }

        if (this.timeLeft <= 0) {
          this.endGame()
        }
      }
    })
  }

  // إنشاء جميع اللاعبين
  createPlayers() {
    const myId = this.socket?.id
    const me = this.initialPlayers.find(p => p.id === myId)

    this.player = this.createCharacter(
      me?.x ?? 480,
      me?.y ?? 270,
      me?.name ?? 'أنت',
      0x20D9A0
    )

    const colors = [
      0x4D96FF,
      0xFF7043,
      0xB47AFF,
      0xFFD166,
      0xFF6B9A,
      0x55D6BE,
      0xA0C4FF
    ]

    let colorIndex = 0

    this.initialPlayers.forEach(other => {
      if (other.id === myId) return

      const remotePlayer = this.createCharacter(
        other.x ?? 480,
        other.y ?? 270,
        other.name,
        colors[colorIndex % colors.length]
      )

      this.remotePlayers.set(other.id, remotePlayer)
      colorIndex++
    })
  }

  // رسم شخصية لاعب
  createCharacter(
    x: number,
    y: number,
    name: string,
    color: number
  ) {
    const character = this.add.container(x, y)

    const shadow = this.add.ellipse(0, 17, 43, 17, 0x000000, 0.25)
    const body = this.add.circle(0, 0, 21, color)
    const face = this.add.circle(0, -2, 18, color)

    const eye1 = this.add.circle(-7, -5, 3, 0x10243A)
    const eye2 = this.add.circle(7, -5, 3, 0x10243A)

    const mouth = this.add.arc(0, 1, 7, 0, 180, false, 0x10243A)
    mouth.setStrokeStyle(2, 0x10243A)

    const nameText = this.add.text(0, -39, name, {
      fontSize: '15px',
      color: '#FFFFFF',
      fontStyle: 'bold',
      stroke: '#101526',
      strokeThickness: 4
    }).setOrigin(0.5)

    character.add([
      shadow,
      body,
      face,
      eye1,
      eye2,
      mouth,
      nameText
    ])

    character.setSize(42, 42)
    character.setDepth(5)

    return character
  }

  // إنشاء عصا التحكم الافتراضية
  createJoystick() {
    if (!this.sys.game.device.input.touch) return

    const baseX = 105
    const baseY = 430
    const radius = 55

    this.joystickZone = this.add.zone(
      baseX,
      baseY,
      130,
      130
    )

    this.joystickZone
      .setInteractive()
      .setDepth(20)

    this.joystickBase = this.add.circle(
      baseX,
      baseY,
      radius,
      0x263b5c,
      0.85
    )

    this.joystickBase
      .setStrokeStyle(4, 0x6b82a8, 0.9)
      .setDepth(21)

    this.joystickKnob = this.add.circle(
      baseX,
      baseY,
      25,
      0x35a9e0,
      1
    )

    this.joystickKnob
      .setStrokeStyle(3, 0xffffff, 0.8)
      .setDepth(22)

    this.joystickZone.on(
      'pointerdown',
      (pointer: Phaser.Input.Pointer) => {
        if (this.joystickPointerId !== null) return

        this.joystickPointerId = pointer.id
        this.updateJoystick(pointer)
      }
    )

    this.input.on(
      'pointermove',
      (pointer: Phaser.Input.Pointer) => {
        if (pointer.id !== this.joystickPointerId) return

        this.updateJoystick(pointer)
      }
    )

    this.input.on('pointerup', this.releaseJoystick, this)
    this.input.on('pointerupoutside', this.releaseJoystick, this)
  }

  // تحديث اتجاه العصا
  updateJoystick(pointer: Phaser.Input.Pointer) {
    const baseX = 105
    const baseY = 430
    const radius = 48

    let dx = pointer.x - baseX
    let dy = pointer.y - baseY

    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance > radius) {
      dx = (dx / distance) * radius
      dy = (dy / distance) * radius
    }

    this.joystickX = dx / radius
    this.joystickY = dy / radius

    this.joystickKnob.setPosition(
      baseX + dx,
      baseY + dy
    )
  }

  // إعادة العصا إلى المنتصف
  releaseJoystick(pointer: Phaser.Input.Pointer) {
    if (pointer.id !== this.joystickPointerId) return

    this.joystickPointerId = null
    this.joystickX = 0
    this.joystickY = 0

    if (this.joystickKnob) {
      this.joystickKnob.setPosition(105, 430)
    }
  }

  // إنشاء عملة من بيانات السيرفر
  createCoin(data: CoinData) {
    if (this.coins.has(data.id)) return

    const coin = this.add.container(data.x, data.y)

    const shadow = this.add.ellipse(0, 12, 27, 10, 0x000000, 0.2)
    const outer = this.add.circle(0, 0, 15, 0xD89524)
    const body = this.add.circle(0, 0, 12, 0xFFD166)
    const shine = this.add.circle(-4, -4, 4, 0xFFF2B0)

    const star = this.add.text(0, 1, '★', {
      fontSize: '14px',
      color: '#A66B16',
      fontStyle: 'bold'
    }).setOrigin(0.5)

    coin.add([shadow, outer, body, shine, star])
    coin.setSize(30, 30)

    this.coins.set(data.id, coin)

    this.tweens.add({
      targets: coin,
      y: data.y - 7,
      duration: Phaser.Math.Between(650, 950),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    })

    this.tweens.add({
      targets: coin,
      angle: 12,
      duration: 900,
      yoyo: true,
      repeat: -1
    })
  }

  update(_time: number, delta: number) {
    if (this.gameOver || !this.player) return

    const speed = 240
    let moveX = 0
    let moveY = 0

    // تحكم الكمبيوتر
    if (this.cursors.left.isDown || this.wasd.A.isDown) {
      moveX -= 1
    }

    if (this.cursors.right.isDown || this.wasd.D.isDown) {
      moveX += 1
    }

    if (this.cursors.up.isDown || this.wasd.W.isDown) {
      moveY -= 1
    }

    if (this.cursors.down.isDown || this.wasd.S.isDown) {
      moveY += 1
    }

    // تحكم الجوال
    moveX += this.joystickX
    moveY += this.joystickY

    // منع زيادة السرعة عند الحركة القطرية
    const length = Math.sqrt(moveX * moveX + moveY * moveY)

    if (length > 1) {
      moveX /= length
      moveY /= length
    }

    const movement = speed * delta / 1000

    this.player.x += moveX * movement
    this.player.y += moveY * movement

    // حدود الساحة
    this.player.x = Phaser.Math.Clamp(this.player.x, 78, 882)
    this.player.y = Phaser.Math.Clamp(this.player.y, 125, 462)

    // تغيير اتجاه الشخصية
    if (moveX !== 0) {
      this.player.scaleX = moveX < 0 ? -1 : 1
    }

    // إرسال الحركة للسيرفر
    if (
      this.socket?.connected &&
      length > 0 &&
      this.time.now - this.lastMoveSentAt >= 50
    ) {
      this.lastMoveSentAt = this.time.now

      this.socket.emit('player-move', {
        x: this.player.x,
        y: this.player.y
      })
    }

    // طلب جمع العملة من السيرفر
    this.coins.forEach((coin, coinId) => {
      if (this.pendingCoins.has(coinId)) return

      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        coin.x,
        coin.y
      )

      if (distance < 35 && this.socket?.connected) {
        this.pendingCoins.add(coinId)

        this.socket.emit('collect-coin', {
          coinId
        })
      }
    })
  }

  // نهاية الجولة
  endGame() {
    if (this.gameOver) return

    this.gameOver = true
    this.timerEvent.remove()

    this.joystickX = 0
    this.joystickY = 0
    this.joystickPointerId = null

    this.sound.play('gameover', { volume: 0.6 })

    this.tweens.killAll()

    const overlay = this.add.rectangle(
      480, 270, 960, 540, 0x080D19, 0.85
    )

    overlay.setDepth(10)

    const panel = this.add.rectangle(
      480, 270, 470, 290, 0x202F49
    )

    panel.setStrokeStyle(3, 0xFFD166)
    panel.setDepth(11)

    this.add.text(480, 185, 'انتهى الوقت!', {
      fontSize: '38px',
      color: '#FFD166',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(12)

    this.add.text(480, 245, `جمعت ${this.score} عملة 🪙`, {
      fontSize: '27px',
      color: '#FFFFFF',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(12)

    this.add.text(480, 300, 'هل تستطيع تحقيق نتيجة أفضل؟', {
      fontSize: '17px',
      color: '#AAB5CB'
    }).setOrigin(0.5).setDepth(12)

    const restart = this.add.text(480, 365, 'العب مرة أخرى ↻', {
      fontSize: '23px',
      color: '#FFFFFF',
      backgroundColor: '#FF7043',
      padding: {
        x: 25,
        y: 12
      },
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(12)

    restart.setInteractive({ useHandCursor: true })

    restart.on('pointerover', () => {
      restart.setScale(1.08)
    })

    restart.on('pointerout', () => {
      restart.setScale(1)
    })

    restart.on('pointerdown', () => {
      this.sound.play('click', { volume: 0.5 })
      this.scene.restart()
    })
  }
}

export function startGame(
  parent: HTMLElement,
  socket?: Socket,
  players: GamePlayer[] = []
) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    width: 960,
    height: 540,
    parent,
    backgroundColor: '#101526',
    scene: new CoinRushScene(socket, players),
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    }
  })
}
