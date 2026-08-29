/**
 * Simple Canvas Fingerprint Generator
 * Generates a unique device signature based on browser canvas rendering artifacts.
 * Zero external dependencies. Safe to run in browser client.
 */
export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "server"

  try {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) return "no-canvas"

    // Draw text with multiple fonts, colors, and shadows to create unique rendering artifacts
    ctx.textBaseline = "top"
    ctx.font = "14px 'Arial', 'Times New Roman', sans-serif"
    ctx.textBaseline = "alphabetic"
    
    // Draw rectangles
    ctx.fillStyle = "#f60"
    ctx.fillRect(125, 1, 62, 20)
    
    // Draw texts
    ctx.fillStyle = "#069"
    ctx.fillText("FTTH-Tool, Fingerprint!", 2, 15)
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)"
    ctx.fillText("Device_Lock_Security", 4, 17)

    // Shadow effects
    ctx.shadowBlur = 10
    ctx.shadowColor = "blue"
    ctx.fillStyle = "red"
    ctx.fillRect(20, 20, 10, 10)

    const dataUrl = canvas.toDataURL()

    // Fast hashing function for canvas data URL (DJB2a-like)
    let hash = 0
    if (dataUrl.length === 0) return "empty"
    for (let i = 0; i < dataUrl.length; i++) {
      const char = dataUrl.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash |= 0 // Convert to 32bit integer
    }
    return "dr_" + Math.abs(hash).toString(16)
  } catch (e) {
    // Fallback based on user agent and screen metrics if canvas throws an error
    let fallbackStr = ""
    if (typeof navigator !== "undefined") {
      fallbackStr += navigator.userAgent || ""
      fallbackStr += navigator.language || ""
    }
    if (typeof window !== "undefined" && window.screen) {
      fallbackStr += `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`
    }
    
    let hash = 0
    for (let i = 0; i < fallbackStr.length; i++) {
      const char = fallbackStr.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash |= 0
    }
    return "fallback_" + Math.abs(hash).toString(16)
  }
}

export function getDeviceTypeInfo(): { type: "mobile" | "desktop"; name: string } {
  if (typeof window === "undefined") return { type: "desktop", name: "Server" }
  const ua = navigator.userAgent
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  if (isMobile) {
    if (/iPhone|iPad|iPod/i.test(ua)) return { type: "mobile", name: "iOS Device (iPhone/iPad)" }
    if (/Android/i.test(ua)) return { type: "mobile", name: "Android Smartphone" }
    return { type: "mobile", name: "Mobile Device" }
  }
  if (/Macintosh/i.test(ua)) return { type: "desktop", name: "Mac (Laptop/PC)" }
  if (/Windows/i.test(ua)) return { type: "desktop", name: "Windows (Laptop/PC)" }
  if (/Linux/i.test(ua)) return { type: "desktop", name: "Linux (Laptop/PC)" }
  return { type: "desktop", name: "Desktop Computer" }
}
