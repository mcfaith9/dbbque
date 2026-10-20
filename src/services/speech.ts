import { ref } from 'vue'

export const isAudioUnlocked = ref(false)
export const isVoiceEnabled = ref(true)

class SpeechService {
  private queue: string[] = []
  private isSpeaking = false
  private audioCtx: AudioContext | null = null

  unlockAudio() {
    if (typeof window === 'undefined') return
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass()
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume()
        }
      }
      // Speak silent utterance to prime synthesis
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const silent = new SpeechSynthesisUtterance('')
        window.speechSynthesis.speak(silent)
      }
      isAudioUnlocked.value = true
    } catch (err) {
      console.warn('Audio unlock warning:', err)
      isAudioUnlocked.value = true
    }
  }

  playChime(): Promise<void> {
    return new Promise((resolve) => {
      try {
        if (!this.audioCtx) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
          if (AudioContextClass) this.audioCtx = new AudioContextClass()
        }
        if (!this.audioCtx) return resolve()
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume()
        }

        const now = this.audioCtx.currentTime
        // Note 1: E5 (659.25 Hz)
        const osc1 = this.audioCtx.createOscillator()
        const gain1 = this.audioCtx.createGain()
        osc1.type = 'sine'
        osc1.frequency.setValueAtTime(659.25, now)
        gain1.gain.setValueAtTime(0, now)
        gain1.gain.linearRampToValueAtTime(0.3, now + 0.05)
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45)
        osc1.connect(gain1)
        gain1.connect(this.audioCtx.destination)
        osc1.start(now)
        osc1.stop(now + 0.5)

        // Note 2: A5 (880.00 Hz)
        const osc2 = this.audioCtx.createOscillator()
        const gain2 = this.audioCtx.createGain()
        osc2.type = 'sine'
        osc2.frequency.setValueAtTime(880.00, now + 0.25)
        gain2.gain.setValueAtTime(0, now + 0.25)
        gain2.gain.linearRampToValueAtTime(0.35, now + 0.3)
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85)
        osc2.connect(gain2)
        gain2.connect(this.audioCtx.destination)
        osc2.start(now + 0.25)
        osc2.stop(now + 0.9)

        setTimeout(resolve, 600)
      } catch (err) {
        resolve()
      }
    })
  }

  announce(ticketNumber: string, counterName: string, queueType: string, isRecall = false) {
    if (!isVoiceEnabled.value) return

    // Convert ticket format like "P-005" to spoken format "P, 0, 0, 5" for clarity
    const parts = ticketNumber.split('-')
    const prefix = parts[0] || ''
    const numberDigits = (parts[1] || '').split('').join(' ')
    const spokenTicket = `${prefix}, ${numberDigits}`

    let text = ''
    if (isRecall) {
      text = `Attention please. Repeating call for ticket number ${spokenTicket}, please proceed to ${counterName}.`
    } else if (queueType === 'priority') {
      text = `Priority ticket ${spokenTicket}, please proceed to ${counterName}.`
    } else {
      text = `Ticket number ${spokenTicket}, please proceed to ${counterName}.`
    }

    this.queue.push(text)
    this.processQueue()
  }

  private async processQueue() {
    if (this.isSpeaking || this.queue.length === 0) return
    this.isSpeaking = true

    const textToSpeak = this.queue.shift()!

    // Play chime first
    await this.playChime()

    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(textToSpeak)
      utterance.rate = 0.9
      utterance.pitch = 1.05
      utterance.volume = 1

      // Select natural English voice if available
      const voices = window.speechSynthesis.getVoices()
      const preferred = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha')))
      if (preferred) utterance.voice = preferred

      utterance.onend = () => {
        this.isSpeaking = false
        setTimeout(() => this.processQueue(), 200)
      }

      utterance.onerror = () => {
        this.isSpeaking = false
        setTimeout(() => this.processQueue(), 200)
      }

      window.speechSynthesis.speak(utterance)
    } else {
      this.isSpeaking = false
    }
  }
}

export const speechService = new SpeechService()
